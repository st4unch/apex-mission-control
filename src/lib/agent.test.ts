import { describe, it, expect } from "vitest";
import { buildAgentCommand, singleQuote } from "./agent";

describe("buildAgentCommand", () => {
  it("defaults to claude --dangerously-skip-permissions", () => {
    expect(buildAgentCommand({ command: "", prompt: "", files: [] })).toBe(
      "claude --dangerously-skip-permissions"
    );
  });

  it("uses a custom command", () => {
    expect(buildAgentCommand({ command: "claude --foo", prompt: "", files: [] })).toBe(
      "claude --foo"
    );
  });

  it("appends a quoted prompt", () => {
    expect(buildAgentCommand({ command: "claude", prompt: "fix bug", files: [] })).toBe(
      "claude 'fix bug'"
    );
  });

  it("prepends files as @refs before the prompt", () => {
    expect(
      buildAgentCommand({ command: "claude", prompt: "do it", files: ["/a.ts", "/b.ts"] })
    ).toBe("claude '@/a.ts @/b.ts do it'");
  });

  it("escapes single quotes in the prompt", () => {
    expect(buildAgentCommand({ command: "claude", prompt: "it's broken", files: [] })).toBe(
      "claude 'it'\\''s broken'"
    );
  });
});

describe("singleQuote", () => {
  it("wraps and escapes", () => {
    expect(singleQuote("a'b")).toBe("'a'\\''b'");
  });
});
