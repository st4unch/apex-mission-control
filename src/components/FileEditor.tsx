import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor, { DiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { langFromPath } from "../lib/format";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

// Use the locally-bundled Monaco (no CDN fetch — matters for an offline, security-
// conscious desktop app) and wire its web workers through Vite.
self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor")
      return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};
loader.config({ monaco });

/** Monaco-backed file editor. Loads via the backend `read_file`; Cmd/Ctrl+S saves
 *  via `write_file`. Language is inferred from the file path. */
export default function FileEditor({ path }: { path: string }) {
  const [value, setValue] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"edit" | "diff">("edit");
  const [head, setHead] = useState<string | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const toggleDiff = async () => {
    if (mode === "diff") {
      setMode("edit");
      return;
    }
    if (head === null) {
      try {
        setHead(await invoke<string>("read_head_file", { path }));
      } catch {
        setHead(""); // untracked/new → diff against empty
      }
    }
    setMode("diff");
  };

  useEffect(() => {
    let active = true;
    setStatus("loading");
    invoke<string>("read_file", { path })
      .then((c) => {
        if (!active) return;
        setValue(c);
        setDirty(false);
        setStatus("ready");
      })
      .catch((e) => {
        if (!active) return;
        setError(String(e));
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [path]);

  const save = async () => {
    setSaving(true);
    try {
      await invoke("write_file", { path, content: valueRef.current });
      setDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const fileName = path.split("/").pop() || path;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="px-3 py-1 border-b border-neutral-200 bg-neutral-50 text-[10px] font-mono text-neutral-500 shrink-0 flex items-center justify-between">
        <span className="truncate">{path}</span>
        <span className="flex items-center gap-2 shrink-0">
          {dirty && <span className="text-amber-600">● unsaved</span>}
          <button
            type="button"
            onClick={() => void toggleDiff()}
            className={`px-2 py-0.5 rounded border cursor-pointer transition-colors ${
              mode === "diff"
                ? "border-amber-300 bg-amber-50 text-amber-700 font-bold"
                : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100"
            }`}
            title="Show diff against HEAD"
          >
            Diff
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold disabled:opacity-40 disabled:cursor-default cursor-pointer hover:bg-indigo-100 transition-colors"
            title="Save (Cmd/Ctrl+S)"
          >
            {saving ? "…" : "Save"}
          </button>
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        {status === "error" ? (
          <div className="p-4 text-xs font-mono text-rose-600">{error}</div>
        ) : mode === "diff" ? (
          <DiffEditor
            original={head ?? ""}
            modified={value}
            language={langFromPath(path)}
            loading={<div className="p-4 text-xs font-mono text-neutral-400">diff…</div>}
            options={{
              fontSize: 12,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              renderSideBySide: true,
              readOnly: true,
              minimap: { enabled: false },
              automaticLayout: true,
            }}
          />
        ) : (
          <Editor
            key={path}
            path={fileName}
            value={value}
            loading={<div className="p-4 text-xs font-mono text-neutral-400">loading…</div>}
            onChange={(v) => {
              setValue(v ?? "");
              setDirty(true);
            }}
            onMount={(editor) => {
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                () => void save()
              );
            }}
            options={{
              fontSize: 12,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
