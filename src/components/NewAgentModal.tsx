import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { X, Plus, FileText } from "lucide-react";

export interface NewAgentSpec {
  workspace: string;
  branch: string;
  title: string;
  command: string;
  prompt: string;
  files: string[];
}

const DEFAULT_COMMAND = "claude --dangerously-skip-permissions";

export default function NewAgentModal({
  open,
  onClose,
  workspaces,
  onLaunch,
}: {
  open: boolean;
  onClose: () => void;
  workspaces: string[];
  onLaunch: (spec: NewAgentSpec) => Promise<void>;
}) {
  const [workspace, setWorkspace] = useState("");
  const [branch, setBranch] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [command, setCommand] = useState(DEFAULT_COMMAND);
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const addFiles = async () => {
    const sel = await openDialog({ multiple: true, title: "Select file(s)" });
    if (Array.isArray(sel)) setFiles((p) => [...new Set([...p, ...sel])]);
    else if (typeof sel === "string") setFiles((p) => [...new Set([...p, sel])]);
  };

  const launch = async () => {
    setBusy(true);
    setError("");
    try {
      await onLaunch({ workspace, branch, title, command, prompt, files });
      // reset transient fields, keep workspace/command defaults
      setBranch("");
      setTitle("");
      setPrompt("");
      setFiles([]);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full text-xs font-mono px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-indigo-400 dark:focus:border-indigo-400";
  const label = "text-[10px] font-mono uppercase tracking-wider font-bold text-neutral-500 dark:text-neutral-400";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="w-[460px] max-h-[85vh] overflow-y-auto bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-sm font-display font-bold text-neutral-800 dark:text-neutral-200">New agent</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="space-y-1">
            <span className={label}>Workspace</span>
            <select
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className={field}
            >
              <option value="">
                {workspaces.length ? "Select workspace…" : "Add a workspace first (+ Workspace)"}
              </option>
              {workspaces.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <span className={label}>Branch (optional → isolated worktree)</span>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature/my-task"
              className={field}
            />
          </div>

          <div className="space-y-1">
            <span className={label}>Title (optional)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tab name"
              className={field}
            />
          </div>

          <div className="space-y-1">
            <span className={label}>Prompt (optional)</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Initial prompt sent to the agent"
              rows={3}
              className={`${field} resize-y`}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className={label}>Files (optional — paths only)</span>
              <button
                type="button"
                onClick={() => void addFiles()}
                className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3 w-3" /> Add file
              </button>
            </div>
            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f) => (
                  <div
                    key={f}
                    className="flex items-center justify-between gap-2 text-[10px] font-mono bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1"
                  >
                    <span className="flex items-center gap-1 truncate text-neutral-700 dark:text-neutral-300">
                      <FileText className="h-3 w-3 shrink-0 text-neutral-400 dark:text-neutral-500" />
                      {f}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((p) => p.filter((x) => x !== f))}
                      className="text-neutral-400 dark:text-neutral-500 hover:text-rose-600 dark:hover:text-rose-300 shrink-0 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <span className={label}>Command</span>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className={field}
            />
          </div>

          {error && <div className="text-[11px] font-mono text-rose-600 dark:text-rose-300 break-words">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200 dark:border-neutral-700">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-mono px-3 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void launch()}
            disabled={busy}
            className="text-xs font-mono font-bold px-3 py-1.5 rounded border border-indigo-200 dark:border-indigo-800 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Launching…" : "Launch"}
          </button>
        </div>
      </div>
    </div>
  );
}
