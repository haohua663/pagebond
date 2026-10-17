import { describe, expect, it } from "vitest";
import { changedSentencePairs } from "@/lib/analysis/sentence-diff";

describe("changedSentencePairs", () => {
  it("returns only changed Chinese sentences", () => {
    const pairs = changedSentencePairs("第一句不变。第二句很差。第三句不变。", "第一句不变。第二句改好了。第三句不变。");
    expect(pairs).toEqual([{ before: "第二句很差。", after: "第二句改好了。" }]);
  });
  it("returns only changed English sentences", () => {
    const pairs = changedSentencePairs(
      "We train a model. It is big. Results are good.",
      "We train a model. It is large. Results are good.",
    );
    expect(pairs).toEqual([{ before: "It is big.", after: "It is large." }]);
  });
  it("is empty when unchanged", () => {
    expect(changedSentencePairs("同一句。", "同一句。")).toEqual([]);
  });
});
