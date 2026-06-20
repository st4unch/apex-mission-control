/** Pure logic for building the shell command a new agent terminal runs. */

export interface AgentCommandSpec {
  command: string;
  prompt: string;
  files: string[];
}

/** POSIX single-quote a string (safe for arbitrary content). */
export function singleQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Build the initial command for a new agent. Files become `@path` references,
 * combined with the prompt and passed as one quoted positional arg to the base
 * command (default `claude --dangerously-skip-permissions`).
 */
export function buildAgentCommand(spec: AgentCommandSpec): string {
  const refs = spec.files.map((f) => `@${f}`).join(" ");
  const promptArg = [refs, spec.prompt.trim()].filter(Boolean).join(" ");
  const base = spec.command.trim() || "claude --dangerously-skip-permissions";
  return promptArg ? `${base} ${singleQuote(promptArg)}` : base;
}
