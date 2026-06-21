// Dev-only performance stress harness (v2). Activated only with VITE_APEX_PERF=1.
//
// Goal: settle "is the freezing / terminal input lag the framework
// (Tauri/WKWebView/IPC/PTY) or our own React render/paint work?" with numbers.
//
// v2 closes v1's two blind spots:
//   1. Records document.hidden / hasFocus per sample — a backgrounded WKWebView
//      throttles requestAnimationFrame and fakes ~250ms "jank" frames. We now
//      know whether a result is valid or just an unfocused-window artifact.
//   2. Spawns a real PTY and measures keystroke-echo latency (the literal
//      typing-lag number) at idle vs. under heavy render + live-terminal load,
//      and opens real WebGL xterm terminals.

import { invoke, Channel } from "@tauri-apps/api/core";

type Sample = { ts: number; lag: number; hidden: boolean; focus: boolean };
const commits: { ts: number; dur: number }[] = [];
const longtasks: { ts: number; dur: number }[] = [];
const loopLag: Sample[] = [];
const frames: { ts: number; dt: number }[] = [];

let active = false;

/** Called from the React <Profiler> in main.tsx on every App commit. */
export function recordCommit(dur: number) {
  if (active) commits.push({ ts: performance.now(), dur });
}

const round = (n: number) => Math.round(n * 100) / 100;
const max = (xs: number[]) => (xs.length ? round(Math.max(...xs)) : 0);
const avg = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
}
const within = <T extends { ts: number }>(rows: T[], a: number, b: number) =>
  rows.filter((r) => r.ts >= a && r.ts <= b);

function summarize(label: string, start: number, end: number) {
  const c = within(commits, start, end);
  const ll = within(loopLag, start, end);
  const fr = within(frames, start, end);
  const lt = within(longtasks, start, end);
  return {
    phase: label,
    windowMs: Math.round(end - start),
    // Validity flags: if the window was mostly hidden/unfocused, frame numbers are suspect.
    pctSamplesHidden: ll.length ? round((ll.filter((s) => s.hidden).length / ll.length) * 100) : 0,
    pctSamplesUnfocused: ll.length ? round((ll.filter((s) => !s.focus).length / ll.length) * 100) : 0,
    reactCommits: c.length,
    commitMsAvg: avg(c.map((r) => r.dur)),
    commitMsMax: max(c.map((r) => r.dur)),
    eventLoopLagP50: pct(ll.map((r) => r.lag), 50),
    eventLoopLagP95: pct(ll.map((r) => r.lag), 95),
    eventLoopLagMaxMs: max(ll.map((r) => r.lag)),
    longTasks: lt.length,
    jankFrames32ms: fr.filter((r) => r.dt > 32).length,
    worstFrameMs: max(fr.map((r) => r.dt)),
  };
}

async function ipcProbe(n: number) {
  const s: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    try { await invoke("app_metrics"); } catch { /* ignore */ }
    s.push(performance.now() - t0);
  }
  return { samples: n, avgMs: avg(s), maxMs: max(s) };
}

// Spawn our own interactive PTY and measure how long the typed char takes to echo
// back. This is the real "typing lag" metric, isolated from xterm rendering.
async function ptyEchoProbe(label: string, samples: number, gapMs: number) {
  const lats: number[] = [];
  let resolveEcho: ((lat: number) => void) | null = null;
  let writeAt = 0;
  const ch = new Channel<ArrayBuffer | { type: string }>();
  ch.onmessage = (msg) => {
    if (msg instanceof ArrayBuffer && resolveEcho) {
      resolveEcho(performance.now() - writeAt);
      resolveEcho = null;
    }
  };
  let id: string;
  try {
    id = await invoke<string>("pty_spawn", { onEvent: ch, cols: 80, rows: 24 });
  } catch (e) {
    return { phase: label, error: `pty_spawn failed: ${String(e)}` };
  }
  await sleep(900); // let the login shell come up and drain its prompt
  for (let i = 0; i < samples; i++) {
    const p = new Promise<number>((r) => { resolveEcho = r; });
    writeAt = performance.now();
    try { await invoke("pty_write", { id, data: "a" }); } catch { /* ignore */ }
    const lat = await Promise.race([p, sleep(600).then(() => -1)]);
    if (lat >= 0) lats.push(lat);
    resolveEcho = null;
    await sleep(gapMs);
  }
  try { await invoke("pty_kill", { id }); } catch { /* ignore */ }
  return {
    phase: label,
    keystrokes: samples,
    echoesReceived: lats.length,
    echoMsAvg: avg(lats),
    echoMsP50: pct(lats, 50),
    echoMsP95: pct(lats, 95),
    echoMsMax: max(lats),
  };
}

// Measure keystroke echo on one PTY while a SECOND PTY floods output through its
// own Channel — the real "typing while `claude` redraws its TUI" scenario. If echo
// spikes here, the bottleneck is native->webview event delivery saturated by output.
async function floodAndEcho(label: string, samples: number, gapMs: number) {
  let floodBytes = 0;
  const floodCh = new Channel<ArrayBuffer | { type: string }>();
  floodCh.onmessage = (msg) => { if (msg instanceof ArrayBuffer) floodBytes += msg.byteLength; };
  let floodId: string;
  try {
    floodId = await invoke<string>("pty_spawn", { onEvent: floodCh, cols: 200, rows: 50 });
  } catch (e) {
    return { phase: label, error: `flood pty_spawn failed: ${String(e)}` };
  }
  await sleep(800);
  // Start an unbounded fast output stream (a ~160-char line repeated forever).
  try { await invoke("pty_write", { id: floodId, data: "yes \"$(printf 'x%.0s' {1..160})\"\r" }); } catch { /* ignore */ }
  await sleep(500); // let the flood ramp up
  const bytesBefore = floodBytes;
  const t0 = performance.now();
  const res = await ptyEchoProbe(label, samples, gapMs); // spawns its own separate PTY
  const kb = Math.round((floodBytes - bytesBefore) / 1024);
  const secs = (performance.now() - t0) / 1000;
  try { await invoke("pty_write", { id: floodId, data: "" }); } catch { /* ctrl-c */ }
  try { await invoke("pty_kill", { id: floodId }); } catch { /* ignore */ }
  return { ...res, floodKBduringProbe: kb, floodKBps: Math.round(kb / secs) };
}

export function startPerfHarness() {
  if (import.meta.env.VITE_APEX_PERF !== "1") return;
  active = true;
  // eslint-disable-next-line no-console
  console.log("[apex-perf] v2 armed (VITE_APEX_PERF=1); settling…");

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longtasks.push({ ts: performance.now(), dur: e.duration });
    }).observe({ entryTypes: ["longtask"] });
  } catch { /* WKWebView may not expose longtask */ }

  const STEP = 50;
  let expected = performance.now() + STEP;
  setInterval(() => {
    const now = performance.now();
    loopLag.push({
      ts: now,
      lag: Math.max(0, now - expected),
      hidden: document.hidden,
      focus: document.hasFocus(),
    });
    expected = now + STEP;
  }, STEP);

  let last = performance.now();
  const onFrame = () => {
    const now = performance.now();
    frames.push({ ts: now, dt: now - last });
    last = now;
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  void run();
}

async function observe(label: string, ms: number) {
  const start = performance.now();
  await sleep(ms);
  return summarize(label, start, performance.now());
}

async function run() {
  await sleep(4000);
  const ipc = await ipcProbe(50);
  // eslint-disable-next-line no-console
  console.log("[apex-perf] IPC round-trip:", ipc);

  const renderPhases = [];
  const echoPhases = [];

  // 1. Idle baseline (no extra load).
  renderPhases.push(await observe("idle_baseline", 6000));

  // 2. Keystroke echo at idle — the reference typing-lag number.
  echoPhases.push(await ptyEchoProbe("echo_idle", 40, 80));

  // 3. Heavy render load: 500 synthetic branches, re-asserted vs the 5s poll.
  const reassert = setInterval(() => window.__apexPerf?.inflateBranches?.(500), 1000);
  window.__apexPerf?.inflateBranches?.(500);
  await sleep(600);
  renderPhases.push(await observe("load_500_branches", 6000));

  // 4. Live load: 4 real WebGL xterm terminals (4 spawned shells) on top.
  window.__apexPerf?.openTerminals?.(4);
  await sleep(1500); // let terminals mount + PTYs spawn
  renderPhases.push(await observe("branches500_plus_4_terminals", 6000));

  // 5. Keystroke echo UNDER load — the decisive comparison vs echo_idle.
  echoPhases.push(await ptyEchoProbe("echo_under_load", 40, 80));

  // 6. Keystroke echo while a sibling PTY floods output — the real "typing while
  //    claude redraws" case. THE decisive test for output-event saturation.
  echoPhases.push(await floodAndEcho("echo_during_output_flood", 40, 80));

  clearInterval(reassert);
  window.__apexPerf?.resetBranches?.();
  window.__apexPerf?.closeTerminals?.();

  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Tauri v2 / WKWebView. echoMs = real keystroke->echo latency from a live PTY. " +
      "If echo stays low (<~20ms) under load => typing path is fine. " +
      "pctSamplesHidden/Unfocused>0 means the window lost focus during that window and its " +
      "frame numbers (worstFrameMs/jankFrames) are unreliable (WKWebView throttles rAF when unfocused). " +
      "Low+flat eventLoopLag + low IPC + low echo == NOT framework/render bound.",
    userAgent: navigator.userAgent,
    ipcRoundTripMs: ipc,
    keystrokeEcho: echoPhases,
    renderPhases,
  };
  try {
    await invoke("write_file", { path: "/tmp/apex-perf-report.json", content: JSON.stringify(report, null, 2) });
    // eslint-disable-next-line no-console
    console.log("[apex-perf] __APEX_PERF_DONE__ -> /tmp/apex-perf-report.json");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log("[apex-perf] __APEX_PERF_DONE__ (write failed)", e, JSON.stringify(report));
  }
}

declare global {
  interface Window {
    __apexPerf?: {
      inflateBranches?: (n: number) => void;
      resetBranches?: () => void;
      openTerminals?: (n: number) => void;
      closeTerminals?: () => void;
    };
  }
}
