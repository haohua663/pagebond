import { describe, expect, it } from "vitest";
import {
  batchTranslateSegments,
  bodySegments,
  buildDisplayUnits,
  filterDisplayUnits,
  isSelectableTranslateBlock,
  isTranslateHeadingText,
  listTranslateSections,
  mergeSegmentTranslations,
  normalizeTranslateBlocks,
  parseTranslateSource,
} from "@/lib/translate/segments";

describe("translate segments", () => {
  it("treats bare 引言 as heading text", () => {
    expect(isTranslateHeadingText("引言")).toBe(true);
    expect(isTranslateHeadingText("第一段正文。")).toBe(false);
  });

  it("promotes mis-parsed 引言 paragraph to heading", () => {
    const raw = [
      {
        id: "p-001",
        order: 0,
        kind: "paragraph" as const,
        level: 0,
        text: "引言",
        locked: false,
        protections: [],
      },
      {
        id: "p-002",
        order: 1,
        kind: "paragraph" as const,
        level: 0,
        text: "第一段正文。",
        locked: false,
        protections: [],
      },
    ];
    const blocks = normalizeTranslateBlocks(raw);
    expect(blocks[0].kind).toBe("heading");
    expect(isSelectableTranslateBlock(blocks[0])).toBe(false);
    expect(bodySegments(blocks)).toHaveLength(1);
  });

  it("buildDisplayUnits never emits 引言-only card", () => {
    const source = parseTranslateSource("引言\n\n第一段正文。\n\n第二段。");
    const body = bodySegments(source);
    expect(body.every((b) => b.text !== "引言")).toBe(true);
    const result = mergeSegmentTranslations(
      source,
      body.map((b) => ({ id: b.id, translation: "译：" + b.text })),
    );
    const units = buildDisplayUnits(source, result);
    expect(units.length).toBeGreaterThanOrEqual(1);
    for (const u of units) {
      expect(u.bodySource.trim().length).toBeGreaterThan(0);
      expect(u.bodyTranslation.trim()).not.toBe("引言");
      // title may appear bold in headingLines, never as sole body
      if (u.headingLines.includes("引言")) {
        expect(u.bodyTranslation.includes("译：") || u.bodySource.includes("第一段") || u.bodySource.includes("第二段")).toBe(
          true,
        );
      }
    }
    expect(listTranslateSections(source).some((s) => s.title.includes("引言"))).toBe(true);
  });

  it("folds markdown heading into following body", () => {
    const source = parseTranslateSource("# 引言\n\n第一段正文。");
    const body = bodySegments(source);
    const result = mergeSegmentTranslations(source, [{ id: body[0].id, translation: "Para." }]);
    const units = buildDisplayUnits(source, result);
    expect(units).toHaveLength(1);
    expect(units[0].headingLines.join("")).toMatch(/引言/);
    expect(units[0].bodyTranslation).toBe("Para.");
  });

  it("batches long segment lists by char budget", () => {
    const segs = Array.from({ length: 10 }, (_, i) => ({
      id: `p-${i}`,
      text: "字".repeat(800),
    }));
    expect(batchTranslateSegments(segs, 2_500).flat()).toHaveLength(10);
  });

  it("filters by section id", () => {
    const source = parseTranslateSource("# 引言\n\nA。\n\n# 方法\n\nB。");
    const body = bodySegments(source);
    const result = mergeSegmentTranslations(
      source,
      body.map((b) => ({ id: b.id, translation: b.text })),
    );
    const units = buildDisplayUnits(source, result);
    const sections = listTranslateSections(source);
    const filtered = filterDisplayUnits(units, new Set([sections[0].id]));
    expect(filtered.every((u) => u.sectionId === sections[0].id)).toBe(true);
  });
});
