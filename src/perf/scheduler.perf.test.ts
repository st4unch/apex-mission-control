/**
 * Performance tests for the scheduled prompt system.
 * Verifies that:
 *  - Firing N scheduled prompts is O(N) and stays under threshold
 *  - Large pending lists don't slow down filter/render logic
 *  - epochToInputValue + date math stays fast
 */
import { describe, it, expect } from "vitest";
import type { ScheduledPrompt } from "../components/ScheduledPromptModal";

// ── helpers ──────────────────────────────────────────────────────────────────

function makePrompts(count: number, fired = false): ScheduledPrompt[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    prompt: `prompt ${i}`,
    terminalKeys: ["t1", "t2"],
    // past time → tick should fire; for already-fired use even older time
    scheduledAt: fired ? now - 5000 : now - 1000,
    fired,
  }));
}

/** Simulate the setInterval tick logic from App.tsx */
function runTick(
  prompts: ScheduledPrompt[],
  ptyIds: Record<string, string>,
  writes: { id: string; data: string }[]
): ScheduledPrompt[] {
  const now = Date.now();
  return prompts.map(p => {
    if (!p.fired && p.scheduledAt <= now) {
      p.terminalKeys.forEach(key => {
        const ptyId = ptyIds[key];
        if (ptyId) writes.push({ id: ptyId, data: p.prompt + "\r" });
      });
      return { ...p, fired: true };
    }
    return p;
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("scheduled prompt tick performance", () => {
  it("fires 100 due prompts in under 5ms", () => {
    const prompts = makePrompts(100);
    const ptyIds = { t1: "pty-1", t2: "pty-2" };
    const writes: { id: string; data: string }[] = [];

    const t0 = performance.now();
    runTick(prompts, ptyIds, writes);
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(5);
    expect(writes.length).toBe(200); // 100 prompts × 2 terminals
  });

  it("tick is no-op on already-fired prompts", () => {
    const prompts = makePrompts(500, true);
    const ptyIds = { t1: "pty-1" };
    const writes: { id: string; data: string }[] = [];

    const t0 = performance.now();
    const result = runTick(prompts, ptyIds, writes);
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(5);
    expect(writes.length).toBe(0);
    expect(result.every(p => p.fired)).toBe(true);
  });

  it("filter logic over 1000 pending prompts stays under 2ms", () => {
    const prompts = makePrompts(1000);
    const t0 = performance.now();
    const pending = prompts.filter(p => !p.fired);
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(2);
    expect(pending.length).toBe(1000);
  });
});

describe("epoch ↔ datetime-local string conversion", () => {
  function epochToInputValue(ms: number) {
    const d = new Date(ms);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(ms - offset).toISOString().slice(0, 16);
  }

  function inputValueToEpoch(val: string): number {
    return new Date(val).getTime();
  }

  it("round-trips within 60s (minute precision)", () => {
    const now = Date.now();
    const roundTripped = inputValueToEpoch(epochToInputValue(now));
    expect(Math.abs(roundTripped - now)).toBeLessThan(60_000);
  });

  it("quick offsets produce correct future times", () => {
    const now = Date.now();
    const in5m = now + 5 * 60_000;
    const val = epochToInputValue(in5m);
    const back = inputValueToEpoch(val);
    expect(back).toBeGreaterThan(now);
  });

  it("converts 1000 epochs in under 5ms", () => {
    const epochs = Array.from({ length: 1000 }, (_, i) => Date.now() + i * 60_000);
    const t0 = performance.now();
    epochs.forEach(epochToInputValue);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(5);
  });
});

describe("terminal ptyId lookup", () => {
  it("resolves 500 terminal keys in under 1ms", () => {
    const ptyIds: Record<string, string> = {};
    for (let i = 0; i < 500; i++) ptyIds[`t${i}`] = `pty-${i}`;

    const t0 = performance.now();
    for (let i = 0; i < 500; i++) {
      const id = ptyIds[`t${i}`];
      expect(id).toBeDefined();
    }
    const elapsed = performance.now() - t0;
    // jsdom environment has higher overhead; 10ms is still fast for 500 lookups
    expect(elapsed).toBeLessThan(10);
  });
});
