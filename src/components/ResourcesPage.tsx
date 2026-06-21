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
    // Try README.md first, then skill.md, then any first .md in the directory
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
    // Fallback: list dir and pick first .md
    try {
      const entries = await invoke<{ name: string; path: string; isDirectory: boolean }[]>(
        "list_dir",
        { path: skill.path }
      );
      const firstMd = entries.find(
        (e) => !e.isDirectory && e.name.endsWith(".md")
      );
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

  const filteredSkills = resources?.skills.filter((s) =>
    s.name.toLowerCase().includes(q)
  ) ?? [];
  const filteredAgents = resources?.agents.filter((a) =>
    a.name.toLowerCase().includes(q)
  ) ?? [];
  const filteredHooks = resources?.hooks.filter((h) =>
    h.name.toLowerCase().includes(q)
  ) ?? [];
  const filteredMcps = resources?.mcps.filter((m) =>
    m.name.toLowerCase().includes(q) ||
    m.description.toLowerCase().includes(q)
  ) ?? [];

  const counts: Record<ResourceTab, number> = {
    skills: filteredSkills.length,
    agents: filteredAgents.length,
    hooks: filteredHooks.length,
    mcps: filteredMcps.length,
  };

  const selectedFileName = selectedPath
    ? selectedPath.split("/").pop()
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] shrink-0">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mr-2">
          Claude Resources
        </h2>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-[var(--border)] shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-blue-600/20 text-blue-400"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
            }`}
          >
            {t.icon}
            {t.label}
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                tab === t.id
                  ? "bg-blue-600/30 text-blue-300"
                  : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
              }`}
            >
              {counts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left list */}
        <div className="w-72 shrink-0 border-r border-[var(--border)] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-xs">Yükleniyor…</span>
            </div>
          )}
          {error && (
            <div className="px-4 py-4 text-xs text-red-400">{error}</div>
          )}

          {/* Skills */}
          {!loading && tab === "skills" && (
            <ul>
              {filteredSkills.length === 0 && (
                <li className="px-4 py-3 text-xs text-[var(--text-muted)]">
                  Sonuç yok
                </li>
              )}
              {filteredSkills.map((s) => (
                <li key={s.path}>
                  <button
                    onClick={() => openSkill(s)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--bg-secondary)] transition-colors ${
                      selectedPath?.startsWith(s.path)
                        ? "bg-blue-600/10 text-blue-400"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    <Puzzle className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                    <span className="text-xs truncate">{s.name}</span>
                    <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-[var(--text-muted)]" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Agents */}
          {!loading && tab === "agents" && (
            <ul>
              {filteredAgents.length === 0 && (
                <li className="px-4 py-3 text-xs text-[var(--text-muted)]">
                  Sonuç yok
                </li>
              )}
              {filteredAgents.map((a) => (
                <li key={a.path}>
                  <button
                    onClick={() => openFile(a.path)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--bg-secondary)] transition-colors ${
                      selectedPath === a.path
                        ? "bg-blue-600/10 text-blue-400"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5 shrink-0 text-green-400" />
                    <span className="text-xs truncate">{a.name}</span>
                    <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-[var(--text-muted)]" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Hooks */}
          {!loading && tab === "hooks" && (
            <ul>
              {filteredHooks.length === 0 && (
                <li className="px-4 py-3 text-xs text-[var(--text-muted)]">
                  Sonuç yok
                </li>
              )}
              {filteredHooks.map((h) => (
                <li key={h.path}>
                  <button
                    onClick={() => openFile(h.path)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--bg-secondary)] transition-colors ${
                      selectedPath === h.path
                        ? "bg-blue-600/10 text-blue-400"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 shrink-0 text-yellow-400" />
                    <span className="text-xs truncate">{h.name}</span>
                    <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-[var(--text-muted)]" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* MCPs */}
          {!loading && tab === "mcps" && (
            <ul>
              {filteredMcps.length === 0 && (
                <li className="px-4 py-3 text-xs text-[var(--text-muted)]">
                  Sonuç yok
                </li>
              )}
              {filteredMcps.map((m) => (
                <li key={m.name}>
                  <div
                    className={`flex flex-col gap-0.5 px-4 py-2.5 border-b border-[var(--border)] cursor-default ${
                      selectedPath === m.name
                        ? "bg-blue-600/10"
                        : "hover:bg-[var(--bg-secondary)]"
                    }`}
                    onClick={() => {
                      setSelectedPath(m.name);
                      setFileContent(null);
                      setFileError(null);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Plug className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                      <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {m.name}
                      </span>
                    </div>
                    {m.description && (
                      <p className="text-[11px] text-[var(--text-muted)] truncate pl-5">
                        {m.description}
                      </p>
                    )}
                    <p className="text-[10px] text-[var(--text-muted)] truncate pl-5 font-mono">
                      {m.command}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right content panel */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedPath && (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-2">
              <FileText className="w-8 h-8 opacity-30" />
              <span className="text-xs">Bir öğe seçin</span>
            </div>
          )}

          {/* MCP detail panel (no file content) */}
          {selectedPath && tab === "mcps" && (
            <div className="p-5">
              {filteredMcps
                .filter((m) => m.name === selectedPath)
                .map((m) => (
                  <div key={m.name} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Plug className="w-5 h-5 text-cyan-400" />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {m.name}
                      </span>
                    </div>
                    {m.description && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {m.description}
                      </p>
                    )}
                    <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Command / URL
                      </p>
                      <p className="text-xs font-mono text-[var(--text-primary)] break-all">
                        {m.command}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* File content panel (skills / agents / hooks) */}
          {selectedPath && tab !== "mcps" && (
            <>
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] shrink-0">
                <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span className="text-xs text-[var(--text-muted)] font-mono truncate">
                  {selectedFileName}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {fileLoading && (
                  <div className="flex items-center gap-2 text-[var(--text-muted)]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-xs">Yükleniyor…</span>
                  </div>
                )}
                {fileError && (
                  <p className="text-xs text-red-400">{fileError}</p>
                )}
                {fileContent !== null && !fileLoading && (
                  <pre className="text-xs font-mono text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
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
