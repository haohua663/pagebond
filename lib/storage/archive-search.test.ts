import { describe, expect, it } from "vitest";
import { emptyOptions } from "@/lib/document/types";
import { filterPapersByQuery, paperSearchText } from "./archive-search";
import type { PaperRecord } from "./types";

function stub(partial: Partial<PaperRecord> & Pick<PaperRecord, "id" | "title" | "mode">): PaperRecord {
  return {
    createdAt: 1,
    updatedAt: 2,
    status: "pending",
    configVersion: "1",
    model: "x",
    promptVersion: "1",
    rawExtractedText: "",
    confirmed: null,
    options: emptyOptions(),
    suggestions: [],
    accept: {},
    checks: [],
    currentBlocks: null,
    analysisOriginal: null,
    analysisCurrent: null,
    checkpoints: [],
    taskId: "t",
    generation: 1,
    conceive: null,
    ...partial,
  };
}

describe("archive search", () => {
  it("filters by title and raw text without touching unrelated rows", () => {
    const rows = [
      stub({ id: "1", title: "量子纠缠综述", mode: "revise", rawExtractedText: "贝尔不等式" }),
      stub({ id: "2", title: "城市更新", mode: "conceive", rawExtractedText: "住区更新" }),
    ];
    expect(filterPapersByQuery(rows, "纠缠").map((r) => r.id)).toEqual(["1"]);
    expect(filterPapersByQuery(rows, "住区").map((r) => r.id)).toEqual(["2"]);
    expect(filterPapersByQuery(rows, "").length).toBe(2);
    expect(paperSearchText(rows[0])).toContain("量子纠缠综述");
  });
});
