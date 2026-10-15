import { describe, expect, it } from "vitest";
import { compareExpressions, overlapHasScore } from "@/lib/analysis/overlap";

describe("compareExpressions", () => {
  it("lists changed expressions and does not invent a detection rate", () => {
    const change = compareExpressions(
      "p-001",
      "课堂反馈与学习投入相关。差异未显著。",
      "课堂反馈和学习投入有关。差异未显著。",
      [{ kind: "number-unit", text: "未显著" }],
    );
    expect(change.changed.length).toBeGreaterThan(0);
    expect(change.unchanged.join("")).toContain("未显著");
    expect(overlapHasScore(change)).toBe(false);
    expect(JSON.stringify(change)).not.toMatch(/查重率|检测率/);
  });
});
