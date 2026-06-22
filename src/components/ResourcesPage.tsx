import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Puzzle,
  Bot,
  Plug,
  Zap,
  Search,
  FileText,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface ClaudeSkill {
  name: string;
  path: string;
}
interface ClaudeAgent {
  name: string;
  path: string;
}
interface ClaudeHook {
  name: string;
  path: string;
}
interface ClaudeMcp {
  name: string;
  command: string;
  description: string;
}
interface ClaudeResources {
  skills: ClaudeSkill[];
  agents: ClaudeAgent[];
  hooks: ClaudeHook[];
  mcps: ClaudeMcp[];
}

type ResourceTab = "skills" | "agents" | "hooks" | "mcps";

const TABS: { id: ResourceTab; label: string; icon: React.ReactNode }[] = [
  { id: "skills", label: "Skills", icon: <Puzzle className="w-4 h-4" /> },
  { id: "agents", label: "Agents", icon: <Bot className="w-4 h-4" /> },
  { id: "hooks", label: "Hooks", icon: <Zap className="w-4 h-4" /> },
  { id: "mcps", label: "MCPs", icon: <Plug className="w-4 h-4" /> },
];

export default function ResourcesPage() {
  const [resources, setResources] = useState<ClaudeResources | null>(null);
  const [tab, setTab] = useState<ResourceTab>("skills");
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<ClaudeResources>("list_claude_resources")
      .then(setResources)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const openFile = async (path: string) => {
    setSelectedPath(path);
    setFileContent(null);
    setFileError(null);
    setFileLoading(true);
    try {
      const content = await invoke<string>("read_file", { path });
      setFileContent(content);
    } catch {
      setFileError("Dosya okunamadı.");
    } finally {
      setFileLoading(false);
    }
  };

  const openSkill = async (skill: ClaudeSkill) => {
    const candidates = [
      `${skill.path}/README.md`,
      `${skill.path}/skill.md`,
      `${skill.path}/${skill.name}.md`,
    ];
    setSelectedPath(skill.path);
    setFileContent(null);
    setFileError(null);
    setFileLoading(true);
    for (const candidate of candidates) {
      try {
        const content = await invoke<string>("read_file", { path: candidate });
        setFileContent(content);
        setSelectedPath(candidate);
        setFileLoading(false);
        return;
      } catch {
        // try next
      }
    }
    try {
      const entries = await invoke<{ name: string; path: string; isDirectory: boolean }[]>(
        "list_dir",
        { path: skill.path }
      );
      const firstMd = entries.find((e) => !e.isDirectory && e.name.endsWith(".md"));
      if (firstMd) {
        const content = await invoke<string>("read_file", { path: firstMd.path });
        setFileContent(content);
        setSelectedPath(firstMd.path);
      } else {
        setFileError("Okunabilir içerik bulunamadı.");
      }
    } catch {
      setFileError("Dosya okunamadı.");
    }
    setFileLoading(false);
  };

  const q = query.toLowerCase();

  const filteredSkills = resources?.skills.filter((s) => s.name.toLowerCase().includes(q)) ?? [];
  const filteredAgents = resources?.agents.filter((a) => a.name.toLowerCase().includes(q)) ?? [];
  const filteredHooks  = resources?.hooks.filter((h)  => h.name.toLowerCase().includes(q)) ?? [];
  const filteredMcps   = resources?.mcps.filter((m) =>
    m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
  ) ?? [];

  const counts: Record<ResourceTab, number> = {
    skills: filteredSkills.length,
    agents: filteredAgents.length,
    hooks:  filteredHooks.length,
    mcps:   filteredMcps.length,
  };

  const selectedFileName = selectedPath ? selectedPath.split("/").pop() : null;

  // ── shared class helpers ────────────────────────────────────────────────────
  const tabActive   = "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800";
  const tabInactive = "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-transparent";
  const badgeActive   = "bg-indigo-100 dark:bg-indigo-800/40 text-indigo-700 dark:text-indigo-300";
  const badgeInactive = "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400";
  const rowActive   = "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300";
  const rowInactive = "text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-neutral-900">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mr-2">
          Claude Resources
        </h2>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-indigo-500"
            placeholder="Ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer ${
              tab === t.id ? tabActive : tabInactive
            }`}
          >
            {t.icon}
            {t.label}
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
              tab === t.id ? badgeActive : badgeInactive
            }`}>
              {counts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left list */}
        <div className="w-72 shrink-0 border-r border-neutral-200 dark:border-neutral-700 overflow-y-auto bg-neutral-50/50 dark:bg-neutral-900">
          {loading && (
            <div className="flex items-center justify-center py-12 text-neutral-400 dark:text-neutral-500">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-xs">Yükleniyor…</span>
            </div>
          )}
          {error && (
            <div className="px-4 py-4 text-xs text-rose-600 dark:text-rose-400">{error}</div>
          )}

          {/* Skills */}
          {!loading && tab === "skills" && (
            <ul>
              {filteredSkills.length === 0 && (
                <li className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500">Sonuç yok</li>
              )}
              {filteredSkills.map((s) => (
                <li key={s.path}>
                  <button
                    onClick={() => openSkill(s)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors ${
                      selectedPath?.startsWith(s.path) ? rowActive : rowInactive
                    }`}
                  >
                    <Puzzle className="w-3.5 h-3.5 shrink-0 text-purple-500 dark:text-purple-400" />
                    <span className="text-xs truncate">{s.name}</span>
                    <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-neutral-400 dark:text-neutral-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Agents */}
          {!loading && tab === "agents" && (
            <ul>
              {filteredAgents.length === 0 && (
                <li className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500">Sonuç yok</li>
              )}
              {filteredAgents.map((a) => (
                <li key={a.path}>
                  <button
                    onClick={() => openFile(a.path)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors ${
                      selectedPath === a.path ? rowActive : rowInactive
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs truncate">{a.name}</span>
                    <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-neutral-400 dark:text-neutral-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Hooks */}
          {!loading && tab === "hooks" && (
            <ul>
              {filteredHooks.length === 0 && (
                <li className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500">Sonuç yok</li>
              )}
              {filteredHooks.map((h) => (
                <li key={h.path}>
                  <button
                    onClick={() => openFile(h.path)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors ${
                      selectedPath === h.path ? rowActive : rowInactive
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 shrink-0 text-amber-500 dark:text-yellow-400" />
                    <span className="text-xs truncate">{h.name}</span>
                    <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-neutral-400 dark:text-neutral-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* MCPs */}
          {!loading && tab === "mcps" && (
            <ul>
              {filteredMcps.length === 0 && (
                <li className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500">Sonuç yok</li>
              )}
              {filteredMcps.map((m) => (
                <li key={m.name}>
                  <button
                    onClick={() => {
                      setSelectedPath(m.name);
                      setFileContent(null);
                      setFileError(null);
                    }}
                    className={`w-full flex flex-col gap-0.5 px-4 py-2.5 text-left border-b border-neutral-100 dark:border-neutral-800 transition-colors ${
                      selectedPath === m.name ? rowActive : rowInactive
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Plug className="w-3.5 h-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
                      <span className="text-xs font-medium truncate">{m.name}</span>
                    </div>
                    {m.description && (
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate pl-5">
                        {m.description}
                      </p>
                    )}
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate pl-5 font-mono">
                      {m.command}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right content panel */}
        <div className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-neutral-900">
          {!selectedPath && (
            <div className="flex flex-col items-center justify-center h-full text-neutral-400 dark:text-neutral-600 gap-2">
              <FileText className="w-8 h-8 opacity-40" />
              <span className="text-xs">Bir öğe seçin</span>
            </div>
          )}

          {/* MCP detail panel */}
          {selectedPath && tab === "mcps" && (
            <div className="p-5">
              {filteredMcps
                .filter((m) => m.name === selectedPath)
                .map((m) => (
                  <div key={m.name} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Plug className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                      <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                        {m.name}
                      </span>
                    </div>
                    {m.description && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">{m.description}</p>
                    )}
                    <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3">
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">
                        Command / URL
                      </p>
                      <p className="text-xs font-mono text-neutral-800 dark:text-neutral-200 break-all">
                        {m.command}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* File content panel */}
          {selectedPath && tab !== "mcps" && (
            <>
              <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 dark:border-neutral-700 shrink-0 bg-neutral-50 dark:bg-neutral-800/50">
                <FileText className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate">
                  {selectedFileName}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {fileLoading && (
                  <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-xs">Yükleniyor…</span>
                  </div>
                )}
                {fileError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{fileError}</p>
                )}
                {fileContent !== null && !fileLoading && (
                  <pre className="text-xs font-mono text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap leading-relaxed">
                    {fileContent}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
