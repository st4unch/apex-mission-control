import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Channel, invoke } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";

type PtyEvent =
  | { type: "data"; bytes: number[] }
  | { type: "exit"; code: number | null };

/**
 * Real interactive terminal: an xterm.js view wired to a PTY-backed login shell in
 * the Rust backend (commands pty_spawn / pty_write / pty_resize / pty_kill). Opens
 * in `cwd`; respawns when `cwd` changes. From here the user can run `claude`,
 * `claude attach <id>`, `claude --resume <id>`, git, etc.
 */
export default function Terminal({
  cwd,
  initialCommand,
}: {
  cwd?: string;
  /** If set, auto-run this command once the shell is ready (e.g. `claude attach <id>`). */
  initialCommand?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 12,
      cursorBlink: true,
      theme: {
        background: "#0a0a0a",
        foreground: "#e5e5e5",
        cursor: "#818cf8",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    // GPU-accelerated renderer — the default DOM renderer adds visible input-echo
    // latency. Fall back silently to DOM if WebGL is unavailable / context is lost.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      /* WebGL unavailable — DOM renderer */
    }
    try {
      fit.fit();
    } catch {
      /* element not laid out yet */
    }

    let ptyId: string | null = null;
    let disposed = false;

    const channel = new Channel<PtyEvent>();
    channel.onmessage = (ev) => {
      // Output can still arrive after the component unmounts (StrictMode double-mount
      // in dev, or a fast close). Writing to a disposed xterm throws — guard it.
      if (disposed) return;
      try {
        if (ev.type === "data") term.write(new Uint8Array(ev.bytes));
        else if (ev.type === "exit")
          term.write("\r\n\x1b[2m[process exited — close or reselect a session]\x1b[0m\r\n");
      } catch {
        /* terminal disposed mid-write */
      }
    };

    invoke<string>("pty_spawn", {
      onEvent: channel,
      cwd,
      cols: term.cols,
      rows: term.rows,
    })
      .then((id) => {
        if (disposed) {
          void invoke("pty_kill", { id });
          return;
        }
        ptyId = id;
        term.onData((d) => void invoke("pty_write", { id, data: d }));
        // Auto-run the initial command (e.g. attach/resume) once the prompt is ready.
        if (initialCommand) {
          setTimeout(() => {
            if (!disposed && ptyId)
              void invoke("pty_write", {
                id: ptyId,
                data: `${initialCommand}\r`,
              });
          }, 600);
        }
      })
      .catch((e) =>
        term.write(`\r\n\x1b[31mpty spawn failed: ${String(e)}\x1b[0m\r\n`)
      );

    const onResize = () => {
      // When the tab is hidden (display:none) the element is 0×0. Fitting then would
      // shrink the PTY to ~0 rows/cols and corrupt a full-screen TUI like
      // `claude attach`. Skip while hidden; the observer fires again on re-show.
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      if (ptyId)
        void invoke("pty_resize", { id: ptyId, cols: term.cols, rows: term.rows });
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      disposed = true;
      ro.disconnect();
      if (ptyId) void invoke("pty_kill", { id: ptyId });
      term.dispose();
    };
  }, [cwd]);

  return <div ref={ref} className="h-full w-full overflow-hidden" />;
}
