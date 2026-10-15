import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(tsx|ts)$/.test(name) ? [full] : [];
  });
}

describe("interface copy", () => {
  it("does not call literal overlap a detection rate", () => {
    const sources = [...files("components"), ...files("app")].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(sources).not.toMatch(/查重率|AI\s*检测率|GPTZero|知网|Turnitin/);
    expect(sources).toMatch(/未进行外部查重／AI 检测/);
  });
});
