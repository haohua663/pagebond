import { describe, expect, it } from "vitest";
import { removeEmptyOutlook, stripEmptyOutlook } from "@/lib/analysis/empty-outlook";
import { parseProse } from "@/lib/document/structure";

const LEAD = "有学者指出其存在事实性错误风险[5,7]。";

describe("removeEmptyOutlook (Chinese)", () => {
  it("drops generic future-research sentences and empty balance summaries", () => {
    for (const tail of [
      "后续研究仍需讨论理论、方法与实践层面的问题。",
      "这一问题有待进一步探讨。",
      "这仍是值得关注的问题。",
      "这也将成为未来研究的重要方向。",
      "大语言模型在教育中的应用既带来机遇，也伴随挑战。",
    ]) {
      const result = removeEmptyOutlook(LEAD + tail);
      expect(result.text).toBe(LEAD);
      expect(result.removed.length).toBeGreaterThan(0);
    }
  });

  it("drops an outlook clause after 「；」 and hands over the full stop", () => {
    const result = removeEmptyOutlook(`${LEAD}这类风险需要防范；后续研究仍需讨论理论、方法与实践层面的问题。`);
    expect(result.text).toBe(`${LEAD}这类风险需要防范。`);
  });

  it("drops trailing outlook and 「以推进……转型」 clauses, then an empty balance left over", () => {
    const result = removeEmptyOutlook(
      `${LEAD}可见，大语言模型在教育中的应用同时带来机会和风险，未来研究仍需在理论、方法和实践层面继续讨论，以推进教育数字化转型。`,
    );
    expect(result.text).toBe(LEAD);
  });

  it("trims an additive outlook tail but keeps the author's judgment", () => {
    const result = removeEmptyOutlook(
      `${LEAD}如何在拥抱技术的同时守住学术的本真，是教育工作者需要面对的问题，也是后续研究可以继续讨论的方向。`,
    );
    expect(result.text).toBe(`${LEAD}如何在拥抱技术的同时守住学术的本真，是教育工作者需要面对的问题。`);
  });

  it("keeps concrete limitations, named future work and judgment sentences", () => {
    for (const text of [
      `${LEAD}本研究样本仅限于华东地区，结论的推广性有待进一步验证。`,
      `${LEAD}后续研究将扩大到西部高校。`,
      `${LEAD}未来研究需要在西部高校检验上述结论。`,
      `${LEAD}后续研究将把样本扩大到 12 所高校。`,
      `${LEAD}如何在利用技术的同时守住学术本真，仍是教育工作者需要面对的问题。`,
      `${LEAD}未来研究可采用扎根理论进一步讨论。`,
      `${LEAD}AI工具降低了写作门槛，也带来了依赖风险。`,
    ]) {
      expect(removeEmptyOutlook(text).text).toBe(text);
    }
  });

  it("never empties a paragraph and never touches a leading marker sentence", () => {
    const only = "后续研究仍需讨论理论、方法与实践层面的问题。";
    expect(removeEmptyOutlook(only).text).toBe(only);
    const marked = "1. 后续研究仍需深入探讨。数据来自 3 所高校。";
    expect(removeEmptyOutlook(marked).text).toBe(marked);
  });
});

describe("removeEmptyOutlook (English)", () => {
  const lead = "Students scored 6.4 points higher (p = 0.03) [14]. ";
  it("drops generic future-research sentences", () => {
    for (const tail of [
      "Future research should further explore this topic.",
      "This question warrants further investigation.",
      "More research is needed.",
      "These results provide a basis for further research.",
    ]) {
      expect(removeEmptyOutlook(lead + tail).text).toBe(lead.trim());
    }
  });

  it("keeps future work that names an object and real limitations", () => {
    for (const tail of [
      "Future research should examine whether the effect holds for older learners.",
      "The sample was limited to 86 undergraduates at a single university.",
      "Future work should test the effect in secondary schools.",
    ]) {
      expect(removeEmptyOutlook(lead + tail).text).toBe(lead + tail);
    }
  });
});

describe("stripEmptyOutlook", () => {
  it("leaves headings untouched and in rewrite mode keeps sentences the source already had", () => {
    const doc = parseProse(`# 后续研究仍需深入探讨。\n\n${LEAD}后续研究仍需深入探讨。`);
    const [heading, paragraph] = doc.blocks;
    const output = [
      { id: heading.id, text: heading.text },
      { id: paragraph.id, text: `${LEAD}后续研究仍需深入探讨。` },
    ];
    const humanized = stripEmptyOutlook(doc.blocks, output, [], "humanize");
    expect(humanized[0].text).toBe(heading.text);
    expect(humanized[1].text).toBe(LEAD);
    const rewritten = stripEmptyOutlook(doc.blocks, output, [], "rewrite");
    expect(rewritten[1].text).toBe(`${LEAD}后续研究仍需深入探讨。`);
    const introduced = stripEmptyOutlook(
      doc.blocks,
      [output[0], { id: paragraph.id, text: `${LEAD}后续研究仍需深入探讨。这也将成为未来研究的重要方向。` }],
      [],
      "rewrite",
    );
    expect(introduced[1].text).toBe(`${LEAD}后续研究仍需深入探讨。`);
  });

  it("skips locked blocks and respects locked terms", () => {
    const doc = parseProse(`${LEAD}后续研究仍需深入探讨数字素养问题。`);
    const locked = [{ ...doc.blocks[0], locked: true }];
    const output = [{ id: doc.blocks[0].id, text: `${LEAD}后续研究仍需深入探讨。` }];
    expect(stripEmptyOutlook(locked, output, [], "humanize")[0].text).toBe(output[0].text);
    const withTerm = [{ id: doc.blocks[0].id, text: `${LEAD}后续研究仍需深入探讨数字素养问题。` }];
    expect(stripEmptyOutlook(doc.blocks, withTerm, ["数字素养"], "humanize")[0].text).toBe(withTerm[0].text);
  });
});
