import { describe, expect, it } from "vitest";
import { planChunks } from "@/lib/document/chunk";
import { parseProse } from "@/lib/document/structure";
import { documentChars } from "@/lib/document/stats";
import { LIMITS } from "@/lib/limits";
import { runRewriteChunks } from "@/lib/workflows/run-revise";

function paragraph(chapter: number, index: number): string {
  const base = `第${chapter}章第${index}段说明课堂反馈与学习投入相关，样本为 128 名学生，满意度从 10% 上升到 15%，差异未显著。作者写道：“这不是工具，而是一面镜子。”公式 $E=mc^2$ 保持不变。范围限于课程论文，不把相关写成导致。`;
  return `${base}${base}`;
}

function manuscript(chapters: number): string {
  const parts: string[] = [];
  for (let chapter = 1; chapter <= chapters; chapter += 1) {
    parts.push(`# 第${chapter}章 讨论`, "");
    for (let index = 1; index <= 6; index += 1) {
      parts.push(paragraph(chapter, index), "");
    }
  }
  parts.push("# 参考文献", "", "张三. 课堂反馈[J]. 教育学报, 2020.");
  return parts.join("\n");
}

function sizedManuscript(minChars: number): string {
  let chapters = 8;
  let text = manuscript(chapters);
  while (documentChars(parseProse(text).blocks) < minChars && chapters < 40) {
    chapters += 2;
    text = manuscript(chapters);
  }
  return text;
}

describe("long manuscript", () => {
  it("keeps a 40,000-character manuscript intact through chunking and checkpoints", async () => {
    const doc = parseProse(sizedManuscript(LIMITS.targetChars));
    const total = documentChars(doc.blocks);
    expect(total).toBeGreaterThanOrEqual(LIMITS.targetChars);
    expect(doc.blocks.length).toBeGreaterThan(20);
    expect(new Set(doc.blocks.map((block) => block.id)).size).toBe(doc.blocks.length);
    expect(doc.blocks.map((block) => block.text).join("")).toContain("128 名");
    expect(doc.blocks.map((block) => block.text).join("")).toContain("这不是工具，而是一面镜子。");
    expect(doc.outline.length).toBeGreaterThan(2);

    const plan = planChunks(doc.blocks);
    expect(plan.unsplittable).toEqual([]);
    expect(plan.overTarget).toBe(total > LIMITS.targetChars);
    const covered = plan.chunks.flatMap((chunk) => chunk.blocks.map((block) => block.id));
    expect(covered).toEqual(doc.blocks.map((block) => block.id));
    expect(plan.chunks.length).toBeGreaterThan(1);
    expect(plan.chunks.every((chunk) => chunk.chars <= LIMITS.chunkSourceChars)).toBe(true);

    const identity = { paperId: "long-paper", taskId: "long-task", generation: 1 };
    const saved: number[] = [];
    const result = await runRewriteChunks({
      plan,
      identity,
      current: () => identity,
      cancelled: () => false,
      rewriteChunk: async (index) => ({
        integrity: "passed",
        checks: plan.chunks[index].blocks.map((block) => ({
          id: block.id,
          status: "passed" as const,
          reasons: [],
          text: block.text,
          suggestedText: block.text,
          changed: false,
        })),
      }),
      onCheckpoint: async (checkpoint) => {
        saved.push(checkpoint.chunkIndex);
      },
    });

    expect(result.status).toBe("review");
    expect(saved).toEqual(plan.chunks.map((chunk) => chunk.index));
    expect(result.checks.map((check) => check.id)).toEqual(doc.blocks.map((block) => block.id));
    expect(result.checks.every((check) => check.text === check.suggestedText)).toBe(true);
  });

  it("does not treat text past 40,000 characters as inside the target", () => {
    const doc = parseProse(`${sizedManuscript(LIMITS.targetChars)}\n\n${paragraph(99, 1)}`);
    expect(documentChars(doc.blocks)).toBeGreaterThan(LIMITS.targetChars);
    expect(planChunks(doc.blocks).overTarget).toBe(true);
    expect(planChunks(doc.blocks).chunks.flatMap((chunk) => chunk.blocks).length + planChunks(doc.blocks).unsplittable.length).toBe(
      doc.blocks.length,
    );
  });
});
