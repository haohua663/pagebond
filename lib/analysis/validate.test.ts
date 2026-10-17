import { describe, expect, it } from "vitest";
import { locateSuggestion } from "@/lib/analysis/suggestions";
import {
  checkRewrite,
  flagLostTerms,
  HUMANIZE_MIN_LENGTH_RATIO,
  humanizeSoftChecks,
  technicalTerms,
} from "@/lib/analysis/validate";
import { parseProse } from "@/lib/document/structure";
import { idsPreserved } from "@/lib/workflows/revise";

const source = parseProse(
  "满意度从 10% 上升到 15%，差异未显著。作者写道：“这不是工具，而是一面镜子。”公式 $E=mc^2$ 不改。",
);

describe("checkRewrite", () => {
  it("reverts a paragraph when a protected number, quote or formula changes", () => {
    const [block] = source.blocks;
    const checked = checkRewrite(source.blocks, [
      {
        id: block.id,
        text: "满意度增长 15%，差异显著。作者写道：“这是一面镜子。”公式 E=mc2 不改。",
      },
    ]);
    expect(checked.blocks[0].status).toBe("reverted");
    expect(checked.blocks[0].text).toBe(block.text);
    expect(checked.blocks[0].reasons.join("")).toMatch(/保护项|未显著|增长/);
  });

  it("keeps every original paragraph when the model drops one", () => {
    const doc = parseProse("第一段有 40 人。\n\n第二段差异未显著。\n\n第三段只是相关。");
    const checked = checkRewrite(doc.blocks, [
      { id: doc.blocks[0].id, text: doc.blocks[0].text },
      { id: doc.blocks[2].id, text: doc.blocks[2].text },
    ]);
    expect(checked.integrity).toBe("failed");
    expect(checked.blocks.map((block) => block.id)).toEqual(doc.blocks.map((block) => block.id));
    expect(checked.blocks[1].text).toBe(doc.blocks[1].text);
    expect(checked.blocks[1].status).toBe("reverted");
    expect(idsPreserved(doc.blocks, checked.blocks.map((block, index) => ({ ...doc.blocks[index], text: block.text })))).toBe(true);
  });

  it("passes a conservative edit that keeps protections", () => {
    const doc = parseProse("本研究调查了 128 名学生，结果未显著。");
    const checked = checkRewrite(doc.blocks, [
      { id: doc.blocks[0].id, text: "这项研究询问了 128 名学生，结果未显著。", reason: "只调整了动词" },
    ]);
    expect(checked.integrity).toBe("passed");
    expect(checked.blocks[0].status).toBe("passed");
    expect(checked.blocks[0].text).toContain("128 名");
  });

  it("does not locate a fabricated annotation", () => {
    const doc = parseProse("这里只有一句真实的话。");
    expect(locateSuggestion(doc.blocks, { blockId: doc.blocks[0].id, quote: "这句摘录并不存在" })).toBeNull();
    expect(locateSuggestion(doc.blocks, { blockId: "p-999", quote: "这里只有一句真实的话。" })).toBeNull();
  });
});

describe("humanize soft checks", () => {
  const method = parseProse(
    "为了确保研究结果的科学性、准确性与可靠性，本研究采用了问卷调查与半结构化访谈相结合的混合研究方法，问卷采用李克特5点量表，共回收有效问卷538份。",
  );

  it("extracts method and theory names as term candidates", () => {
    expect(technicalTerms(method.blocks[0].text)).toEqual(
      expect.arrayContaining(["混合研究方法", "半结构化访谈", "李克特5点量表"]),
    );
    expect(technicalTerms("本研究采用结构方程模型与扎根理论，并做了回归分析。")).toEqual(
      expect.arrayContaining(["结构方程模型", "扎根理论", "回归分析"]),
    );
    expect(technicalTerms("We used thematic analysis and a mixed-methods design.")).toEqual(
      expect.arrayContaining(["thematic analysis", "mixed-methods design"]),
    );
    expect(technicalTerms("数据整理后效果良好，结论的推广性有待验证。")).toEqual([]);
  });

  it("asks for one retry when a paragraph shrinks below the ratio or drops a term", () => {
    const [block] = method.blocks;
    const short = checkRewrite(method.blocks, [{ id: block.id, text: "本研究用问卷和访谈，回收有效问卷538份。" }]);
    const soft = humanizeSoftChecks(method.blocks, short.blocks);
    expect(soft.blocks[0].shrunk).toBe(true);
    expect(soft.blocks[0].ratio).toBeLessThan(HUMANIZE_MIN_LENGTH_RATIO);
    expect(soft.blocks[0].lostTerms).toContain("混合研究方法");
    expect(soft.notes.join("")).toMatch(/人话化删减过多/);
    expect(soft.notes.join("")).toMatch(/请保留信息只改表达/);
    expect(soft.notes.join("")).toMatch(/混合研究方法/);
    const flagged = flagLostTerms(method.blocks, short, soft.blocks);
    expect(flagged.blocks[0].status).toBe("needs-review");
    expect(flagged.blocks[0].suggestedText).toBe("本研究用问卷和访谈，回收有效问卷538份。");
  });

  it("does not flag a filler trim that keeps terms and most of the length", () => {
    const [block] = method.blocks;
    const trimmed = checkRewrite(method.blocks, [
      {
        id: block.id,
        text: "为保证结果可靠，本研究采用问卷调查与半结构化访谈相结合的混合研究方法，问卷采用李克特5点量表，共回收有效问卷538份。",
      },
    ]);
    const soft = humanizeSoftChecks(method.blocks, trimmed.blocks);
    expect(soft.notes).toEqual([]);
    expect(flagLostTerms(method.blocks, trimmed, soft.blocks).blocks[0].status).toBe("passed");
  });
});

describe("negation flag", () => {
  it("does not treat 不仅/不断/未来 as negation when humanize drops them", () => {
    const doc = parseProse("现有研究不仅关注生成能力，而且不断重视可靠性，未来仍需验证，样本没有覆盖西部。");
    const checked = checkRewrite(doc.blocks, [{ id: doc.blocks[0].id, text: "现有研究关注生成能力，也越来越重视可靠性，后续仍需验证，样本没有覆盖西部。" }]);
    expect(checked.blocks[0].status).toBe("passed");
    const dropped = checkRewrite(doc.blocks, [{ id: doc.blocks[0].id, text: "现有研究关注生成能力，也越来越重视可靠性，后续仍需验证，样本覆盖西部。" }]);
    expect(dropped.blocks[0].status).toBe("needs-review");
  });
});
