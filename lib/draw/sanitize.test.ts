import { describe, expect, it } from "vitest";
import { sanitizeDrawFields, stripDrawDisclaimer } from "@/lib/draw/sanitize";

describe("stripDrawDisclaimer", () => {
  it("removes 注 lines and 待补 markers", () => {
    const raw =
      "A 激活 B，B 抑制 C。\n注：图中数值均来自原文，缺失处待补。\n对照组与处理组比较。";
    const out = stripDrawDisclaimer(raw);
    expect(out).not.toMatch(/注：/);
    expect(out).not.toMatch(/待补/);
    expect(out).toMatch(/A 激活 B/);
    expect(out).toMatch(/对照组/);
  });

  it("sanitizes caption fields", () => {
    const cleaned = sanitizeDrawFields({
      captionZh: "机制图。（注：数值均来自原文待补）",
      captionEn: "Schematic. (Note: values pending)",
      title: "标题",
    });
    expect(cleaned.captionZh).not.toMatch(/注：/);
    expect(cleaned.captionZh).not.toMatch(/待补/);
  });
});
