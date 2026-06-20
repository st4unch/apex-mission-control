import React, { useState, useEffect, useRef } from "react";
import {
  Folder,
  FileCode,
  Terminal,
  Layers,
  Sparkles,
  GitBranch,
  Settings,
  Cpu,
  Search,
  ChevronDown,
  ChevronRight,
  Database,
  Play,
  Pause,
  RefreshCw,
  X,
  Plus,
  GitCommit,
  GitPullRequest,
  CheckCircle2,
  AlertTriangle,
  TerminalSquare,
  Network,
  Users,
  HardDrive,
  Clock,
  ArrowRight,
  Info,
  ShieldCheck,
  Zap,
  Tag,
  Bookmark,
  Share2,
  Trash2,
  ExternalLink,
  Code2
} from "lucide-react";
import BranchDAG from "./components/BranchDAG";

// Types matching the user's workflow model
interface AgentSession {
  id: string;
  name: string;
  branch: string;
  worktree: string;
  status: "working" | "waiting-for-input" | "idle" | "stopped";
  activeTask: string;
  activeFile: string;
  tokensUsed: number;
  modelsUsed: string;
  quotaBurn: number; // in $
  duration: string;
  createdAt: string;
}

interface GitBranchState {
  name: string;
  type: "PRD" | "WIP" | "OPEN";
  lastCommit: string;
  author: string;
  associatedAgent?: string;
  status: "synced" | "ahead" | "diverged" | "conflict";
}

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isModified?: boolean;
  hasConflict?: boolean;
  content?: string;
  lockedByAgentId?: string; // Tracks which agent is active on this file
}

export default function App() {
  // Navigation & UI Panels
  const [activeTab, setActiveTab] = useState<"terminal" | "supervisor" | "history">("terminal");
  const [selectedFile, setSelectedFile] = useState<string>("src/api/stripe.ts");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Simulated metrics
  const [cpuUsage, setCpuUsage] = useState(42);
  const [ramUsage, setRamUsage] = useState(5.8);
  const [localTime, setLocalTime] = useState("");

  // Claude Agent Sessions (kapanmamış background session list)
  const [agents, setAgents] = useState<AgentSession[]>([
    {
      id: "agent-jwt",
      name: "apex-auth-jwt",
      branch: "feature/auth-jwt",
      worktree: "~/apex-wt/auth-jwt",
      status: "waiting-for-input",
      activeTask: "Add RS256 token rollover in login handlers",
      activeFile: "src/api/auth.ts",
      tokensUsed: 142050,
      modelsUsed: "Claude 3.7 Sonnet",
      quotaBurn: 4.26,
      duration: "14m 20s",
      createdAt: "10:14:02 UTC"
    },
    {
      id: "agent-stripe",
      name: "apex-stripe-hooks",
      branch: "feature/stripe-webhooks",
      worktree: "~/apex-wt/stripe-webhooks",
      status: "working",
      activeTask: "Set up Stripe tax calculation router hooks",
      activeFile: "src/api/stripe.ts",
      tokensUsed: 89300,
      modelsUsed: "Claude 3.7 Sonnet",
      quotaBurn: 2.68,
      duration: "08m 12s",
      createdAt: "10:20:15 UTC"
    },
    {
      id: "agent-checkout",
      name: "apex-checkout-v2",
      branch: "feature/checkout-flow",
      worktree: "~/apex-wt/checkout-flow",
      status: "working",
      activeTask: "Review shopping cart calculation total layout",
      activeFile: "src/api/stripe.ts",
      tokensUsed: 65120,
      modelsUsed: "Claude 3.5 Sonnet",
      quotaBurn: 1.95,
      duration: "05m 40s",
      createdAt: "10:22:50 UTC"
    },
    {
      id: "agent-eslint",
      name: "apex-eslint-fix",
      branch: "fix/eslint-warnings",
      worktree: "~/apex-wt/eslint-warnings",
      status: "idle",
      activeTask: "Clean unused react dependencies & imports",
      activeFile: "src/main.tsx",
      tokensUsed: 231400,
      modelsUsed: "Claude 3.5 Haiku",
      quotaBurn: 1.15,
      duration: "21m 15s",
      createdAt: "09:55:00 UTC"
    }
  ]);

  // Selected Active Agent context
  const [selectedAgentId, setSelectedAgentId] = useState<string>("agent-stripe");

  // Open Branches / WIP / PRD listing
  const [branchList, setBranchList] = useState<GitBranchState[]>([
    {
      name: "main",
      type: "PRD",
      lastCommit: "Merge pull request #452 from feature/checkout-flow",
      author: "Senior Dev",
      status: "synced"
    },
    {
      name: "release/v1.4",
      type: "PRD",
      lastCommit: "Bump node workspace schema versions to 2026",
      author: "ReleaseBot",
      status: "synced"
    },
    {
      name: "feature/stripe-webhooks",
      type: "WIP",
      lastCommit: "Implement domestic VAT calculator integration",
      author: "Claude Agent (stripe)",
      associatedAgent: "agent-stripe",
      status: "ahead"
    },
    {
      name: "feature/auth-jwt",
      type: "WIP",
      lastCommit: "Draft JWT middleware handler endpoints",
      author: "Claude Agent (jwt)",
      associatedAgent: "agent-jwt",
      status: "diverged"
    },
    {
      name: "feature/checkout-flow",
      type: "WIP",
      lastCommit: "Refactor total container layout coordinates",
      author: "Claude Agent (checkout)",
      associatedAgent: "agent-checkout",
      status: "ahead"
    },
    {
      name: "fix/eslint-warnings",
      type: "WIP",
      lastCommit: "Remove legacy unused framework indicators",
      author: "Claude Agent (eslint)",
      associatedAgent: "agent-eslint",
      status: "synced"
    },
    {
      name: "feature/redis-telemetry",
      type: "OPEN",
      lastCommit: "Setup redis pub/sub test scripts",
      author: "Developer (Local)",
      status: "diverged"
    },
    {
      name: "feature/docker-supervisor-image",
      type: "OPEN",
      lastCommit: "Standardize Caddy proxy configurations",
      author: "DevOps Lead",
      status: "synced"
    }
  ]);

  // File explorer definitions
  const files: FileItem[] = [
    {
      name: "src/api/stripe.ts",
      path: "src/api/stripe.ts",
      isDirectory: false,
      isModified: true,
      hasConflict: true,
      lockedByAgentId: "agent-stripe", // Locked by Stripe Agent!
      content: `// Stripe Integration Controller - CONCURRENT FILE ACCESS ALERT!
import Stripe from 'stripe';

export async function processCharge(amount: number) {
  if (amount <= 0) throw new Error('Invalid price');
  console.log('Processed static payment request');
  return { success: true };
}`
    },
    {
      name: "src/api/auth.ts",
      path: "src/api/auth.ts",
      isDirectory: false,
      isModified: true,
      hasConflict: false,
      lockedByAgentId: "agent-jwt", // Locked by JWT rollover Agent!
      content: `// Auth Gateway Middleware
import jwt from 'jsonwebtoken';
export const loginHandler = async (req, res) => {
  // Locked by apex-auth-jwt session
};`
    },
    {
      name: "src/main.tsx",
      path: "src/main.tsx",
      isDirectory: false,
      isModified: false,
      lockedByAgentId: "agent-eslint",
      content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';`
    },
    {
      name: "src/types.ts",
      path: "src/types.ts",
      isDirectory: false,
      isModified: false,
      content: `export interface User { id: string; name: string; email: string; }`
    },
    {
      name: "vite.config.ts",
      path: "vite.config.ts",
      isDirectory: false,
      isModified: false,
      content: `export default defineConfig({ server: { port: 3000 } });`
    },
    {
      name: "package.json",
      path: "package.json",
      isDirectory: false,
      isModified: false,
      content: `{\n  "dependencies": {\n    "stripe": "^14.0.0"\n  }\n}`
    }
  ];

  // Shell Console state
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalHistory, setTerminalHistory] = useState<string[]>([
    "=== Claude Code Daemon Multiplexer Console v2.1.1 ===",
    "[Supervisor] Scanning ~/.claude/projects/ list of running daemons...",
    "[Supervisor] Loaded worktree database. Connected on port 3000.",
    "[Warp-Bridge] Warp detected: Tab auto-configs synced. 4 active worktree routes available.",
    "Type 'help' list commands or click command templates below to dispatch.",
    ""
  ]);

  // Handle local simulation commands
  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;

    const command = terminalInput.trim();
    let responseLines: string[] = [`$ ${command}`];

    if (command === "claude agents" || command === "claude agents --json") {
      responseLines = [
        ...responseLines,
        `ID              SESSION-NAME        BRANCH                       STATE            LOCK-FILE`,
        `-------------------------------------------------------------------------------------------------------`,
        `agent-jwt       apex-auth-jwt       feature/auth-jwt             Blocked (黃)     src/api/auth.ts`,
        `agent-stripe    apex-stripe-hooks   feature/stripe-webhooks      Working (綠)     src/api/stripe.ts`,
        `agent-checkout  apex-checkout-v2    feature/checkout-flow        Working (綠)     src/api/stripe.ts <CONFLICT>`,
        `agent-eslint    apex-eslint-fix     fix/eslint-warnings          Idle (藍)        src/main.tsx`,
        ``,
        `💡 Running background supervisor monitor via standard "~/.claude/jobs/state.json" file stream.`
      ];
    } else if (command === "help") {
      responseLines = [
        ...responseLines,
        "Simulated Control Commands:",
        "  claude agents      Fetch running backgrounds unclosed server-side container states",
        "  git worktree list  Show current isolated workspaces directory structures mapped",
        "  clear              Clear terminal logs text panels",
        "  resolve            Clear worktree lock/overlap file collision simulation flags"
      ];
    } else if (command === "git worktree list") {
      responseLines = [
        ...responseLines,
        "Git Worktree Isolation Folders:",
        "  ~/apex-parent-dir (main repo path)         -> main [PRD synced]",
        "  ~/apex-wt/auth-jwt                         -> feature/auth-jwt [WIP divergent]",
        "  ~/apex-wt/stripe-webhooks                  -> feature/stripe-webhooks [WIP ahead]",
        "  ~/apex-wt/checkout-flow                    -> feature/checkout-flow [WIP ahead]",
        "  ~/apex-wt/eslint-warnings                  -> fix/eslint-warnings [WIP synced]"
      ];
    } else if (command === "resolve") {
      // Clear conflicts
      responseLines = [
        ...responseLines,
        "[Supervisor] Recalculating workspace collisions locks...",
        "[Status] Collision on src/api/stripe.ts resolved automatically!"
      ];
    } else if (command === "clear") {
      setTerminalHistory([]);
      setTerminalInput("");
      return;
    } else {
      responseLines = [
        ...responseLines,
        `Executing generic PTY command: "${command}"...`,
        "Success."
      ];
    }

    setTerminalHistory((prev) => [...prev, ...responseLines, ""]);
    setTerminalInput("");
  };

  const handleCreateBranchAndAgent = () => {
    // Spawn custom demo branch
    const demoBranchName = `feature/redis-${Math.floor(Math.random() * 900) + 100}`;
    const agentId = `agent-redis-${Date.now().toString().slice(-4)}`;
    
    // Add to WIP list
    const newWip: GitBranchState = {
      name: demoBranchName,
      type: "WIP",
      lastCommit: "Supervisor initial workspace checkout setup",
      author: "System Auto-Dispatch",
      associatedAgent: agentId,
      status: "synced"
    };
    
    // Add to Active Agents
    const newAgent: AgentSession = {
      id: agentId,
      name: `apex-${demoBranchName.split("/")[1]}`,
      branch: demoBranchName,
      worktree: `~/apex-wt/${demoBranchName.split("/")[1]}`,
      status: "working",
      activeTask: "Configure high speed key invalidation strategies",
      activeFile: "src/main.tsx",
      tokensUsed: 0,
      modelsUsed: "Claude 3.7 Sonnet",
      quotaBurn: 0.0,
      duration: "00m 01s",
      createdAt: new Date().toTimeString().split(" ")[0]
    };

    setBranchList((prev) => [newWip, ...prev]);
    setAgents((prev) => [newAgent, ...prev]);
    setSelectedAgentId(agentId);

    setTerminalHistory((prev) => [
      ...prev,
      `$ git worktree add ${newAgent.worktree} -b ${newAgent.branch}`,
      `[Supervisor] Spawned fresh Claude Code session inside isolating worktree.`,
      `[Daemon] Session ID: ${agentId} registered. Tracking ~/.claude/tasks board list.`,
      ""
    ]);
  };

  // Clock Update
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setLocalTime(now.toTimeString().split(" ")[0] + " UTC");
    }, 1000);

    const cpuTimer = setInterval(() => {
      setCpuUsage((prev) => Math.max(15, Math.min(85, prev + Math.floor(Math.random() * 11) - 5)));
    }, 2500);

    return () => {
      clearInterval(timer);
      clearInterval(cpuTimer);
    };
  }, []);

  // Find info about active agent working on selected file
  const activeFileObject = files.find((f) => f.path === selectedFile);
  const lockAgent = activeFileObject?.lockedByAgentId 
    ? agents.find((a) => a.id === activeFileObject.lockedByAgentId)
    : null;

  const renderSyncStatusBadge = (status: "synced" | "ahead" | "diverged" | "conflict" | string) => {
    switch (status) {
      case "synced":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-250 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>SYNCED</span>
          </span>
        );
      case "ahead":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            <span>AHEAD</span>
          </span>
        );
      case "diverged":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-250 shrink-0 animate-pulse">
            <AlertTriangle className="h-2.5 w-2.5 text-amber-500 shrink-0" />
            <span>DIVERGED</span>
          </span>
        );
      case "conflict":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-rose-50 text-rose-750 border border-rose-250 shrink-0 animate-bounce">
            <AlertTriangle className="h-2.5 w-2.5 text-rose-500 shrink-0" />
            <span>CONFLICT</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-neutral-55 bg-neutral-100 text-neutral-600 border border-neutral-250 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 shrink-0" />
            <span>{status.toUpperCase()}</span>
          </span>
        );
    }
  };

  return (
    <div id="vs-ctrl-plane" className="min-h-screen bg-neutral-50 text-neutral-800 flex flex-col font-sans select-none overflow-hidden h-screen text-xs">
      
      {/* ================= TOP CUSTOM VS CODE STATUS BRANDING BAR ================= */}
      <header className="h-10 border-b border-neutral-200 bg-white px-3 flex items-center justify-between shrink-0 select-none shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="h-5 w-5 bg-indigo-600 rounded flex items-center justify-center text-white font-bold text-xs select-none shadow animate-pulse">
            ⚡
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-semibold text-neutral-900 font-display">Apex Agent Control IDE</span>
            <span className="text-neutral-600 font-mono text-[9px] bg-neutral-100 border border-neutral-205 px-1 py-0.2 rounded">
              v2.1.1-daemon
            </span>
          </div>
        </div>

        {/* Global Toolbar simulation */}
        <div className="hidden md:flex items-center space-x-5 text-[11px] text-neutral-600 font-mono">
          <span className="hover:text-neutral-900 cursor-pointer transition-colors">File</span>
          <span className="hover:text-neutral-900 cursor-pointer transition-colors">Edit</span>
          <span className="hover:text-neutral-900 cursor-pointer transition-colors">Selection</span>
          <span className="hover:text-neutral-900 cursor-pointer transition-colors">Go</span>
          <span className="hover:text-neutral-900 cursor-pointer text-indigo-600 font-bold transition-colors">
            Worktrees (4)
          </span>
        </div>

        {/* System telemetry ticks right side */}
        <div className="flex items-center space-x-4 font-mono text-[10px] text-neutral-600">
          <div className="flex items-center space-x-1.5">
            <Cpu className="h-3 w-3 text-emerald-600" />
            <span>CPU:</span>
            <span className={cpuUsage > 75 ? "text-rose-600" : "text-emerald-600 font-bold"}>
              {cpuUsage}%
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <HardDrive className="h-3 w-3 text-indigo-500" />
            <span>RAM:</span>
            <span className="text-neutral-800 font-medium">{ramUsage}GB</span>
          </div>
          <span className="border-l border-neutral-200 pl-3 text-neutral-700 font-bold bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
            {localTime}
          </span>
        </div>
      </header>

      {/* ================= MAIN THREE PANEL LAYOUT GRID ================= */}
      <div className="flex-1 flex overflow-hidden">

        {/* ----------------- Panel 1: LEFT SIDEBAR (File Tree Explorer & Workspace Locker) ----------------- */}
        <aside id="tree-explorer-sidebar" className="w-72 border-r border-neutral-200 bg-white flex flex-col shrink-0 overflow-hidden">
          
          {/* Header Title bar */}
          <div className="p-3 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/50">
            <h2 className="text-[10px] font-mono tracking-widest uppercase font-bold text-neutral-500 flex items-center gap-1.5">
              <Folder className="h-3.5 w-3.5 text-indigo-500" /> Workspace Files ({files.length})
            </h2>
            <span className="text-[9px] font-mono bg-neutral-100 text-neutral-600 px-1 rounded border border-neutral-200">
              apex-local
            </span>
          </div>

          {/* List items tree mock */}
          <div className="flex-1 p-2 overflow-y-auto space-y-1">
            <div className="flex items-center space-x-1 px-1 py-1 text-neutral-500 font-semibold font-mono">
              <ChevronDown className="h-3.5 w-3.5" />
              <span>root</span>
            </div>
            
            <div className="pl-4 space-y-0.5">
              {files.map((file) => {
                const isSelected = file.path === selectedFile;
                return (
                  <div
                    id={`file-row-${file.name.replace(/\//g, "-")}`}
                    key={file.path}
                    onClick={() => setSelectedFile(file.path)}
                    className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-all ${
                      isSelected
                        ? "bg-indigo-50/80 border border-indigo-100 text-indigo-950 font-medium"
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <FileCode className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-indigo-600" : "text-neutral-450"}`} />
                      <span className="font-mono text-xs truncate">{file.name}</span>
                    </div>

                    {/* Agent lock indicator badges beside filename */}
                    {file.lockedByAgentId && (
                      <span 
                        className="text-[8px] font-mono scale-90 px-1.5 py-0.5 rounded text-right shrink-0 font-bold uppercase transition-all"
                        style={{
                          backgroundColor: file.hasConflict ? "rgba(220, 38, 38, 0.08)" : "rgba(79, 70, 229, 0.08)",
                          color: file.hasConflict ? "#dc2626" : "#4f46e5",
                          border: file.hasConflict ? "1px solid rgba(220, 38, 38, 0.18)" : "1px solid rgba(79, 70, 229, 0.18)"
                        }}
                        title={`Locked by ${file.lockedByAgentId}`}
                      >
                        {file.hasConflict ? "Conflict Lock" : "Locked"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* BOTTOM ATTACHMENT: ACTIVE CLAUDE AGENT FILE-WATCHER */}
          <div className="border-t border-neutral-200 bg-neutral-50/50 p-3 select-none">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider font-bold">
                Lock/Edit File Telemetry
              </h3>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>

            {lockAgent ? (
              <div className="bg-white p-2.5 rounded border border-neutral-200 text-[11px] space-y-2 shadow-sm">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-1.5">
                  <span className="font-mono text-xs font-bold text-indigo-650 truncate">
                    🤖 {lockAgent.name}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200 font-semibold uppercase">
                    {lockAgent.status}
                  </span>
                </div>

                <div className="space-y-1 font-mono text-[10px] text-neutral-600">
                  <div className="flex justify-between">
                    <span>Task Scope:</span>
                    <span className="text-neutral-900 font-semibold truncate max-w-[120px]">{lockAgent.activeTask}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Target Folder:</span>
                    <span className="text-neutral-800 truncate max-w-[120px]">{lockAgent.worktree}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Session ID:</span>
                    <span className="text-indigo-600 font-semibold">{lockAgent.id}</span>
                  </div>
                  <div className="flex justify-between border-t border-neutral-100 pt-1.5 text-[9px]">
                    <span>Burn Price:</span>
                    <span className="text-rose-600 font-bold">${lockAgent.quotaBurn.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedAgentId(lockAgent.id)}
                  className="w-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 py-1 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer text-center block"
                >
                  Focus Active Session Details
                </button>
              </div>
            ) : (
              <div className="p-3 bg-white rounded border border-neutral-200 text-center text-neutral-400 shadow-sm">
                <Info className="h-4 w-4 mx-auto mb-1 text-neutral-400" />
                <p className="text-[10px] font-mono leading-tight text-neutral-500">
                  Selected path holds no concurrent lock write locks. Clean workspaces.
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* ----------------- Panel 2: CENTER WORKSPACE (Sessions Agent Board + Multi-Console PTY) ----------------- */}
        <section className="flex-1 flex flex-col overflow-hidden bg-neutral-50/50">
          
          {/* CENTER TOP: Active/Unclosed Background Claude Code Sessions & Board */}
          <div className="h-[130px] shrink-0 border-b border-neutral-200 flex flex-col overflow-hidden bg-white">
            <header className="h-9 px-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between shrink-0">
              <span className="text-xs font-display text-neutral-800 font-semibold flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-indigo-550" /> Active Supervisor Sessions Monitor
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-mono text-neutral-500">
                  Daemon index: ~/.claude/daemon/roster.json
                </span>
                <button
                  type="button"
                  onClick={handleCreateBranchAndAgent}
                  className="px-2 py-0.5 bg-indigo-650 hover:bg-indigo-700 text-white font-mono text-[10px] font-semibold rounded flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                >
                  <Plus className="h-3 w-3" /> Auto-Start (WIP)
                </button>
              </div>
            </header>

            {/* Grid list of unclosed background sessions - Compact 2-line layout showing name and status */}
            <div className="flex-1 p-2 px-3 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 bg-neutral-50/30">
              {agents.map((ag) => {
                const isSelectedFocus = ag.id === selectedAgentId;
                return (
                  <button
                    type="button"
                    id={`session-card-${ag.id}`}
                    key={ag.id}
                    onClick={() => {
                      setSelectedAgentId(ag.id);
                      setTerminalHistory((prev) => [
                        ...prev,
                        `[Monitor] Focused background process thread ${ag.id} (${ag.name}).`,
                        `[Monitor] Target worktree: ${ag.worktree} | Task scope: ${ag.activeTask}`,
                        ""
                      ]);
                    }}
                    className={`px-3 py-2 rounded-lg border transition-all text-left flex items-center justify-between gap-2 w-full cursor-pointer ${
                      isSelectedFocus
                        ? "bg-indigo-50/40 border-indigo-600 shadow-sm ring-1 ring-indigo-100"
                        : "bg-white border-neutral-200 hover:border-neutral-300 hover:shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="text-xs font-mono font-bold text-neutral-900 truncate">
                        🤖 {ag.name}
                      </span>
                      {isSelectedFocus && (
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-600"></span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${
                          ag.status === "working"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-250 animate-pulse"
                            : ag.status === "waiting-for-input"
                            ? "bg-amber-50 text-amber-700 border-amber-250 animate-pulse"
                            : "bg-blue-50 text-blue-700 border-blue-250"
                        }`}
                      >
                        {ag.status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CENTER BOTTOM: Large Terminal (orta alt ise büyük terminal ekranı) */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            
            {/* Header Tabs bar */}
            <header className="h-9 px-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-1 h-full">
                <button
                  type="button"
                  onClick={() => setActiveTab("terminal")}
                  className={`px-3 py-1 text-xs font-display font-medium rounded-t border-b-2 flex items-center gap-1.5 h-full transition-colors ${
                    activeTab === "terminal" ? "border-indigo-600 bg-white text-indigo-950 font-semibold" : "border-transparent text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5 text-indigo-500" /> Embedded Multiplex Terminal ({agents.find(a => a.id === selectedAgentId)?.name || "Main"})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("supervisor")}
                  className={`px-3 py-1 text-xs font-display font-medium rounded-t border-b-2 flex items-center gap-1.5 h-full transition-colors ${
                    activeTab === "supervisor" ? "border-indigo-600 bg-white text-indigo-950 font-semibold" : "border-transparent text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  <Database className="h-3.5 w-3.5 text-indigo-505" /> background state.json Output
                </button>
              </div>

              {/* Console Badge metrics */}
              <div className="flex items-center space-x-2 text-[10px] font-mono text-neutral-500">
                <span>DAEMON:</span>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold uppercase shadow-sm">
                  Connected
                </span>
              </div>
            </header>

            {/* Terminal Main Output screen area */}
            <div className="flex-1 p-3 overflow-hidden flex flex-col">
              
              {activeTab === "terminal" && (
                <div className="flex-1 flex flex-col overflow-hidden bg-white">
                  <div className="flex-1 bg-neutral-50 border border-neutral-200 rounded-lg p-4 font-mono text-xs overflow-y-auto space-y-2 leading-relaxed text-neutral-800 shadow-inner">
                    {terminalHistory.map((line, idx) => (
                      <p
                        key={idx}
                        className={
                          line.startsWith("$")
                            ? "text-indigo-905 font-bold border-l-2 border-indigo-500 pl-1.5 mt-1"
                            : line.includes("[Supervisor]")
                            ? "text-indigo-600 font-semibold"
                            : line.includes("Lock") || line.includes("CONFLICT")
                            ? "text-amber-705 font-semibold"
                            : line.includes("Error")
                            ? "text-rose-600 font-semibold"
                            : "text-neutral-700"
                        }
                      >
                        {line}
                      </p>
                    ))}
                  </div>

                  {/* Preset quick command buttons list */}
                  <div className="py-2 flex items-center space-x-2 overflow-x-auto select-none shrink-0 mb-2 border-b border-neutral-100">
                    <span className="text-[10px] font-mono text-neutral-450 font-bold uppercase">Shortcut Seeds:</span>
                    <button
                      type="button"
                      onClick={() => setTerminalInput("claude agents")}
                      className="px-2 py-0.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded font-mono text-[10px] text-neutral-700 cursor-pointer transition-colors"
                    >
                      claude agents
                    </button>
                    <button
                      type="button"
                      onClick={() => setTerminalInput("git worktree list")}
                      className="px-2 py-0.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded font-mono text-[10px] text-neutral-700 cursor-pointer transition-colors"
                    >
                      git worktree list
                    </button>
                    <button
                      type="button"
                      onClick={() => setTerminalInput("resolve")}
                      className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded font-mono text-[10px] text-amber-750 font-semibold cursor-pointer transition-colors"
                    >
                      resolve collisions
                    </button>
                    <button
                      type="button"
                      onClick={() => setTerminalInput("help")}
                      className="px-2 py-0.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded font-mono text-[10px] text-neutral-700 cursor-pointer transition-colors"
                    >
                      help
                    </button>
                  </div>

                  {/* Input PTY Shell Bar */}
                  <form onSubmit={handleTerminalSubmit} className="flex items-center space-x-2 shrink-0">
                    <span className="font-mono text-xs text-neutral-400 font-bold">$</span>
                    <input
                      type="text"
                      value={terminalInput}
                      onChange={(e) => setTerminalInput(e.target.value)}
                      placeholder="Input generic Unix orchestration command..."
                      className="flex-1 bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 font-mono text-xs text-neutral-800 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100 shadow-sm"
                    />
                    <button
                      type="submit"
                      className="bg-indigo-650 hover:bg-indigo-700 text-white font-mono text-xs px-3.5 py-1.5 rounded-lg cursor-pointer transition-colors font-semibold shadow-sm"
                    >
                      Dispatch
                    </button>
                  </form>
                </div>
              )}

              {activeTab === "supervisor" && (
                <div className="flex-1 bg-white border border-neutral-200 rounded-lg p-4 font-mono text-xs text-indigo-900 overflow-y-auto leading-relaxed shadow-sm">
                  <header className="border-b border-neutral-100 pb-2 mb-3">
                    <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                      DAEMON MEMORY SCHEMA
                    </span>
                    <span className="text-[10px] text-neutral-400 ml-2">
                      ~/.claude/jobs/{selectedAgentId}/state.json
                    </span>
                  </header>

                  <pre className="text-[11px] text-neutral-700 bg-neutral-50 p-3 rounded-lg border border-neutral-200 overflow-x-auto shadow-inner">
{`{
  "sessionId": "${selectedAgentId}",
  "state": "active",
  "tempo": "parallel",
  "cwd": "${agents.find(a => a.id === selectedAgentId)?.worktree || "~/apex-wt"}  ",
  "cliVersion": "2.1.142",
  "roster": {
    "locks": ["${files.find(f => f.lockedByAgentId === selectedAgentId)?.name || "none"}"],
    "gitBranch": "${agents.find(a => a.id === selectedAgentId)?.branch || "none"}",
    "subagentParentUuid": "a549db92-fa90-21cd"
  },
  "backgroundProcesses": {
    "activeTmuxSession": "apex-${agents.find(a => a.id === selectedAgentId)?.name || "undefined"}",
    "terminalWebSocketStream": "ws://127.0.0.1:3000/stream/pty"
  }
}`}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ----------------- Panel 3: RIGHT SIDEBAR (Open Branch / WIP / PRD Release Tracker) ----------------- */}
        <aside id="branch-wip-prd-tracker" className="w-80 border-l border-neutral-200 bg-white flex flex-col shrink-0 overflow-y-auto">
          
          {/* Header Title Section */}
          <div className="p-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
            <h2 className="text-[10px] font-mono tracking-widest uppercase font-bold text-neutral-500 flex items-center gap-1.5">
              <GitBranch className="h-4 w-4 text-indigo-500" /> Branch & WIP Matrix
            </h2>
            <span className="text-[9px] font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 font-bold">
              GIT SYNC
            </span>
          </div>

          <div className="p-3 space-y-4">
            
            {/* Visual DAG Representation showing commit lineage / status mapping */}
            <BranchDAG
              branchList={branchList}
              agents={agents}
              selectedAgentId={selectedAgentId}
              setSelectedAgentId={setSelectedAgentId}
              setTerminalHistory={setTerminalHistory}
            />
            
            {/* CATEGORY 1: PRODUCTION / RELEASE ENVS (PRD) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-emerald-600 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Production Branches (PRD)
                </span>
                <span className="text-[9px] font-mono bg-neutral-100 text-emerald-700 px-1 border border-neutral-250 rounded font-semibold">
                  {branchList.filter(b => b.type === "PRD").length}
                </span>
              </div>

              <div className="space-y-1.5">
                {branchList
                  .filter((b) => b.type === "PRD")
                  .map((branch) => (
                    <div
                      key={branch.name}
                      onClick={() => {
                        setTerminalHistory((prev) => [
                          ...prev,
                          `$ git checkout ${branch.name}`,
                          `[System] Warning: Branch '${branch.name}' is registered as active PRD core. Skipping automatic agent overrides.`,
                          ""
                        ]);
                      }}
                      className="p-2 border border-emerald-100 bg-emerald-50/10 hover:border-emerald-200 rounded cursor-pointer transition-colors shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="font-mono text-xs font-bold text-emerald-800 truncate max-w-[140px]">
                          {branch.name}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {renderSyncStatusBadge(branch.status || "synced")}
                          <span className="text-[9px] font-mono text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-250 font-medium whitespace-nowrap">
                            Locked
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-[10px] text-neutral-600 truncate">
                        {branch.lastCommit}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-neutral-500">
                        <span>Deploy: Ready</span>
                        <span>Auto-Release Hook: Active</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* CATEGORY 2: WORK-IN-PROGRESS (WIP) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest font-semibold text-amber-600 flex items-center gap-1">
                  <Zap className="h-3 w-3 animate-pulse" /> Active Workspace WIP
                </span>
                <span className="text-[9px] font-mono bg-neutral-100 text-amber-700 px-1 border border-neutral-250 rounded font-semibold">
                  {branchList.filter(b => b.type === "WIP").length}
                </span>
              </div>

              <div className="space-y-1.5">
                {branchList
                  .filter((b) => b.type === "WIP")
                  .map((branch) => {
                    const agentObj = agents.find((a) => a.id === branch.associatedAgent);
                    return (
                      <div
                        id={`branch-row-${branch.name.replace(/\//g, "-")}`}
                        key={branch.name}
                        onClick={() => {
                          if (agentObj) {
                            setSelectedAgentId(agentObj.id);
                          }
                        }}
                        className={`p-2 border rounded cursor-pointer transition-colors shadow-sm ${
                          agentObj?.id === selectedAgentId
                            ? "bg-amber-50/40 border-amber-500"
                            : "border-neutral-200 hover:border-neutral-300 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-mono text-xs font-bold text-neutral-800 truncate max-w-[150px]">
                            {branch.name}
                          </span>
                          {renderSyncStatusBadge(branch.status)}
                        </div>
                        
                        <p className="mt-1 text-[10px] text-neutral-650 truncate">
                          {branch.lastCommit}
                        </p>

                        {agentObj && (
                          <div className="mt-2 p-1 bg-neutral-50 rounded border border-neutral-200 flex items-center justify-between text-[9px] font-mono text-neutral-600">
                            <span className="text-indigo-650 font-bold">
                              🤖 {agentObj.name}
                            </span>
                            <span className="text-[8px] uppercase font-bold text-neutral-550">{agentObj.status}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* CATEGORY 3: OPEN PENDING / STALE BRANCHES */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-indigo-550 flex items-center gap-1">
                  <GitPullRequest className="h-3 w-3" /> Open Pending (PR/stale)
                </span>
                <span className="text-[9px] font-mono bg-neutral-100 text-indigo-700 px-1 border border-neutral-250 rounded font-semibold">
                  {branchList.filter(b => b.type === "OPEN").length}
                </span>
              </div>

              <div className="space-y-1.5">
                {branchList
                  .filter((b) => b.type === "OPEN")
                  .map((branch) => (
                    <div
                      key={branch.name}
                      onClick={() => {
                        setTerminalHistory((prev) => [
                          ...prev,
                          `$ git checkout ${branch.name}`,
                          `[System] Switch checkout worktree root index to ${branch.name}.`,
                          ""
                        ]);
                      }}
                      className="p-2 border border-neutral-200 bg-white hover:border-neutral-300 rounded cursor-pointer transition-colors shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="font-mono text-xs text-neutral-700 truncate max-w-[140px]">
                          {branch.name}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {renderSyncStatusBadge(branch.status || "synced")}
                          <span className="text-[8px] font-mono bg-neutral-100 text-neutral-550 px-1 rounded border border-neutral-200 whitespace-nowrap">
                            Stale
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-[10px] text-neutral-500 truncate">
                        {branch.lastCommit}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-neutral-500">
                        <span>Lead: {branch.author}</span>
                        <span className="text-indigo-600 underline hover:text-indigo-850 font-semibold">Spin Agent</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

          </div>
        </aside>

      </div>

      {/* ================= FOOTER / STATUS TRAY BAR ================= */}
      <footer className="h-7 border-t border-neutral-200 bg-white px-3 flex items-center justify-between z-10 shrink-0 text-[10px] font-mono text-neutral-500 select-none shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 text-neutral-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Local Supervisor Socket API: Live</span>
          </div>
          <span>|</span>
          <span>Workspace root: <strong className="text-neutral-700">~/apex</strong></span>
          <span>|</span>
          <span>Active worktree locks: <strong className="text-neutral-700">2</strong></span>
        </div>

        <div className="flex items-center space-x-4 text-neutral-600">
          <span>Schema Model: <strong className="text-indigo-600 font-semibold">Claude 3.7 Core</strong></span>
          <span className="text-neutral-300">|</span>
          <span>UTF-8</span>
          <span className="text-neutral-350">|</span>
          <span>Port: 3000</span>
        </div>
      </footer>

    </div>
  );
}
