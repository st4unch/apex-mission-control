import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
} from "lucide-react";

export interface Entry {
  name: string;
  path: string;
  isDirectory: boolean;
}

function TreeNode({
  entry,
  depth,
  onOpenFile,
  refreshSignal,
}: {
  entry: Entry;
  depth: number;
  onOpenFile?: (path: string) => void;
  refreshSignal?: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [children, setChildren] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const first = useRef(true);

  // Live refresh: re-read an open, already-loaded directory on a filesystem change.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (entry.isDirectory && open && children !== null) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const load = async () => {
    setLoading(true);
    try {
      setChildren(await invoke<Entry[]>("list_dir", { path: entry.path }));
    } catch {
      setChildren([]);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (!entry.isDirectory) {
      onOpenFile?.(entry.path);
      return;
    }
    const next = !open;
    setOpen(next);
    if (next && children === null) void load();
  };

  // Root nodes auto-expand once on mount.
  if (depth === 0 && open && children === null && !loading) void load();

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        style={{ paddingLeft: depth * 12 + 8 }}
        className="w-full flex items-center gap-1 py-0.5 pr-2 text-left hover:bg-neutral-100 rounded transition-colors"
      >
        {entry.isDirectory ? (
          open ? (
            <ChevronDown className="h-3 w-3 text-neutral-400 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-neutral-400 shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {entry.isDirectory ? (
          open ? (
            <FolderOpen className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          )
        ) : (
          <FileText className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
        )}
        <span className="truncate text-neutral-700">{entry.name}</span>
      </button>
      {open && children?.map((c) => (
        <TreeNode
          key={c.path}
          entry={c}
          depth={depth + 1}
          onOpenFile={onOpenFile}
          refreshSignal={refreshSignal}
        />
      ))}
      {open && loading && (
        <div
          style={{ paddingLeft: (depth + 1) * 12 + 8 }}
          className="text-[10px] text-neutral-400 py-0.5"
        >
          …
        </div>
      )}
      {open && children?.length === 0 && !loading && (
        <div
          style={{ paddingLeft: (depth + 1) * 12 + 8 }}
          className="text-[10px] text-neutral-300 py-0.5 italic"
        >
          empty
        </div>
      )}
    </div>
  );
}

/** Lazy, real file tree over user-picked workspace roots (backend `list_dir`). */
export default function FileTree({
  roots,
  onOpenFile,
  refreshSignal,
}: {
  roots: string[];
  onOpenFile?: (path: string) => void;
  refreshSignal?: number;
}) {
  if (!roots.length)
    return (
      <div className="p-3 text-[11px] text-neutral-400 font-mono leading-relaxed">
        No workspace yet. Add a project folder with{" "}
        <span className="font-bold">+ Workspace</span> above.
      </div>
    );
  return (
    <div className="font-mono text-xs py-1">
      {roots.map((r) => {
        const name = r.split("/").filter(Boolean).pop() || r;
        return (
          <TreeNode
            key={r}
            entry={{ name, path: r, isDirectory: true }}
            depth={0}
            onOpenFile={onOpenFile}
            refreshSignal={refreshSignal}
          />
        );
      })}
    </div>
  );
}
