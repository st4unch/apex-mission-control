import { Square, Plug, Clock } from "lucide-react";

interface AgentSession {
  id: string;
  name: string;
  branch: string;
  worktree: string;
  status: string;
  duration: string;
  attachable?: boolean;
  attachId?: string;
  pid?: number;
}

function statusDot(s: string) {
  if (s === "working") return "bg-emerald-500";
  if (s === "waiting-for-input") return "bg-amber-500";
  if (s === "stopped") return "bg-rose-500";
  return "bg-blue-400";
}

/** Compact live-session monitor for the right panel: click to open a terminal,
 *  Stop to kill (background → claude stop, interactive → kill pid). */
export default function SessionMonitor({
  agents,
  selectedAgentId,
  onOpen,
  onKill,
}: {
  agents: AgentSession[];
  selectedAgentId: string;
  onOpen: (a: AgentSession) => void;
  onKill: (a: AgentSession) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-neutral-500">
          Active sessions ({agents.length})
        </span>
        <span className="text-[9px] font-mono bg-neutral-100 text-neutral-600 px-1 rounded border border-neutral-200">
          ~/.claude
        </span>
      </div>
      {agents.length === 0 && (
        <div className="text-[11px] font-mono text-neutral-400 py-2">
          No live sessions.
        </div>
      )}
      {agents.map((a) => {
        const isSel = a.id === selectedAgentId;
        return (
          <div
            key={a.id}
            onClick={() => onOpen(a)}
            className={`group p-2 rounded border cursor-pointer transition-colors shadow-sm ${
              isSel
                ? "bg-indigo-50/70 border-indigo-200"
                : "bg-white border-neutral-200 hover:border-neutral-300"
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot(a.status)}`} />
                <span className="font-mono text-xs font-bold text-neutral-900 truncate">
                  {a.name}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {a.attachable && (
                  <span title="attachable">
                    <Plug className="h-3 w-3 text-indigo-400" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onKill(a);
                  }}
                  className="text-neutral-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Stop session"
                >
                  <Square className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-neutral-400">
              <span className="uppercase">{a.status}</span>
              <span>·</span>
              <span className="truncate">{a.branch}</span>
              <span className="flex items-center gap-0.5 ml-auto shrink-0">
                <Clock className="h-2.5 w-2.5" /> {a.duration}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
