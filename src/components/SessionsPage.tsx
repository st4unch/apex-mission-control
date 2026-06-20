import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { relTime, shortCwd } from "../lib/format";
import { RefreshCw, Play, Plug, FolderGit2, Clock, Square } from "lucide-react";

interface AgentSession {
  id: string;
  name: string;
  branch: string;
  worktree: string;
  status: string;
  duration: string;
  modelsUsed: string;
  attachable?: boolean;
  attachId?: string;
}

interface HistoryEntry {
  sessionId: string;
  cwd: string;
  lastModified: number;
  sizeBytes: number;
}

export interface OpenTerminalSpec {
  key: string;
  name: string;
  cwd?: string;
  initialCommand?: string;
}

function statusColor(s: string) {
  if (s === "working") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "waiting-for-input") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "stopped") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

/** Full session view: live sessions (claude agents --json --all) + transcript history. */
export default function SessionsPage({
  onOpen,
}: {
  onOpen: (spec: OpenTerminalSpec) => void;
}) {
  const [live, setLive] = useState<AgentSession[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [l, h] = await Promise.all([
        invoke<AgentSession[]>("list_agent_sessions", { includeAll: true }),
        invoke<HistoryEntry[]>("list_session_history"),
      ]);
      setLive(l);
      setHistory(h);
    } catch (e) {
      console.warn("[apex] sessions refresh failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const stop = async (s: AgentSession) => {
    try {
      await invoke("stop_agent", { id: s.attachId ?? s.id });
      void refresh();
    } catch (e) {
      console.warn("[apex] stop_agent failed:", e);
    }
  };

  const liveIds = new Set(live.map((s) => s.id));

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-sm font-display font-bold text-neutral-800 flex items-center gap-2">
          <Plug className="h-4 w-4 text-indigo-500" /> Claude Sessions
        </h1>
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-600 cursor-pointer transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* LIVE */}
      <section className="mb-6">
        <h2 className="text-[10px] font-mono uppercase tracking-widest font-bold text-emerald-600 mb-2">
          Live sessions ({live.length})
        </h2>
        <div className="space-y-1.5">
          {live.length === 0 && (
            <div className="text-[11px] font-mono text-neutral-400 py-2">
              No live sessions.
            </div>
          )}
          {live.map((s) => (
            <div
              key={s.id}
              className="bg-white border border-neutral-200 rounded-lg p-3 flex items-center justify-between gap-3 shadow-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-neutral-900 truncate max-w-[260px]">
                    {s.name}
                  </span>
                  <span
                    className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${statusColor(
                      s.status
                    )}`}
                  >
                    {s.status}
                  </span>
                  <span className="text-[9px] font-mono text-neutral-400">{s.modelsUsed}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-neutral-500">
                  <span className="flex items-center gap-1 truncate max-w-[280px]">
                    <FolderGit2 className="h-3 w-3" /> {shortCwd(s.worktree)}
                  </span>
                  <span>{s.branch}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {s.duration}
                  </span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onOpen({
                      key: s.id,
                      name: s.name,
                      cwd: s.worktree.startsWith("/") ? s.worktree : undefined,
                      initialCommand:
                        s.attachable && s.attachId
                          ? `claude attach ${s.attachId}`
                          : undefined,
                    })
                  }
                  className="flex items-center gap-1.5 text-[11px] font-mono font-semibold px-2.5 py-1 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer transition-colors"
                >
                  <Plug className="h-3 w-3" /> {s.attachable ? "Attach" : "Aç"}
                </button>
                {s.attachable && (
                  <button
                    type="button"
                    onClick={() => void stop(s)}
                    className="flex items-center gap-1.5 text-[11px] font-mono font-semibold px-2.5 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer transition-colors"
                    title="Stop background session (claude stop)"
                  >
                    <Square className="h-3 w-3" /> Stop
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HISTORY */}
      <section>
        <h2 className="text-[10px] font-mono uppercase tracking-widest font-bold text-neutral-500 mb-2">
          Past sessions ({history.length})
        </h2>
        <div className="space-y-1.5">
          {history.length === 0 && (
            <div className="text-[11px] font-mono text-neutral-400 py-2">
              No transcript history.
            </div>
          )}
          {history.map((h) => {
            const isLive = liveIds.has(h.sessionId);
            const name = h.cwd.split("/").filter(Boolean).pop() || h.sessionId.slice(0, 8);
            return (
              <div
                key={h.sessionId}
                className="bg-white border border-neutral-200 rounded-lg p-3 flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-neutral-800 truncate max-w-[240px]">
                      {name}
                    </span>
                    {isLive && (
                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase bg-emerald-50 text-emerald-700 border-emerald-200">
                        live
                      </span>
                    )}
                    <span className="text-[9px] font-mono text-neutral-400">
                      {(h.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-neutral-500">
                    <span className="truncate max-w-[300px]">{shortCwd(h.cwd)}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {relTime(h.lastModified)}
                    </span>
                    <span className="text-neutral-300">{h.sessionId.slice(0, 8)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onOpen({
                      key: `resume:${h.sessionId}`,
                      name: `↻ ${name}`,
                      cwd: h.cwd.startsWith("/") ? h.cwd : undefined,
                      initialCommand: `claude --resume ${h.sessionId}`,
                    })
                  }
                  className="shrink-0 flex items-center gap-1.5 text-[11px] font-mono font-semibold px-2.5 py-1 rounded border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 cursor-pointer transition-colors"
                  title="Resume this session in a new terminal"
                >
                  <Play className="h-3 w-3" /> Resume
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
