import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("phase F skill entrypoints", () => {
  it("does not write a revision when the key is missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pagebond-skill-"));
    const input = path.join(dir, "paper.md");
    const output = path.join(dir, "out.md");
    writeFileSync(input, "样本为 40 人，差异未显著。\n\n作者写道：“这不是工具，而是一面镜子。”\n");
    let stderr = "";
    try {
      execFileSync("node", ["skills/pagebond-revise/scripts/revise.mjs", "--input", input, "--output", output, "--language", "zh"], {
        encoding: "utf8",
        env: { ...process.env, OPENROUTER_API_KEY: "" },
      });
    } catch (error) {
      stderr = String((error as { stderr?: string }).stderr || "");
      expect((error as { status?: number }).status).toBe(2);
    }
    expect(stderr).toMatch(/未调用模型/);
    expect(() => execFileSync("test", ["-f", output])).toThrow();
  });
});
