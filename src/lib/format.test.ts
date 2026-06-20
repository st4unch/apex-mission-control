import { describe, it, expect } from "vitest";
import { relTime, shortCwd, langFromPath } from "./format";

describe("relTime", () => {
  const now = 1_000_000_000_000;
  it("handles missing and recent", () => {
    expect(relTime(0, now)).toBe("—");
    expect(relTime(now, now)).toBe("just now");
    expect(relTime(now - 30_000, now)).toBe("just now");
  });
  it("formats minutes/hours/days", () => {
    expect(relTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(relTime(now - 2 * 3_600_000, now)).toBe("2h ago");
    expect(relTime(now - 3 * 86_400_000, now)).toBe("3d ago");
  });
});

describe("shortCwd", () => {
  it("collapses home prefix", () => {
    expect(shortCwd("/Users/staunch/Documents/x")).toBe("~/Documents/x");
  });
  it("leaves other paths untouched", () => {
    expect(shortCwd("/opt/data")).toBe("/opt/data");
  });
});

describe("langFromPath", () => {
  it("maps known extensions", () => {
    expect(langFromPath("a/b.tsx")).toBe("typescript");
    expect(langFromPath("Cargo.toml")).toBe("ini");
    expect(langFromPath("main.rs")).toBe("rust");
  });
  it("returns undefined for unknown", () => {
    expect(langFromPath("file.xyz")).toBeUndefined();
    expect(langFromPath("noext")).toBeUndefined();
  });
});
