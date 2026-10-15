import { describe, expect, it } from "vitest";
import { locateSuggestion } from "@/lib/analysis/suggestions";
import { checkRewrite } from "@/lib/analysis/validate";
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
