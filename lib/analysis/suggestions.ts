import type { ArticleType, DocumentBlock, ParsedDocument } from "@/lib/document/types";

export type SuggestionDimension =
  | "structure"
  | "argument"
  | "evidence"
  | "method"
  | "expression"
  | "fact";

export interface Suggestion {
  id: string;
  priority: "high" | "medium" | "low";
  dimension: SuggestionDimension;
  version: "confirmed-input" | "current-draft";
  blockId: string;
  quote: string;
  problem: string;
  change: string;
  verify: string;
  origin: "local" | "model";
}

const SECTION_EXPECTATION: Record<ArticleType, { label: string; pattern: RegExp }[]> = {
  empirical: [
    { label: "引言或问题", pattern: /引言|绪论|问题|Introduction/i },
    { label: "方法或材料", pattern: /方法|材料|设计|Methods/i },
    { label: "结果", pattern: /结果|发现|Results/i },
    { label: "讨论或结论", pattern: /讨论|结论|Discussion|Conclusion/i },
  ],
  review: [
    { label: "问题或范围", pattern: /引言|绪论|范围|问题|Introduction/i },
    { label: "文献或主题", pattern: /文献|综述|主题|Related Work|Review/i },
  ],
  theory: [
    { label: "问题", pattern: /问题|引言|绪论|Introduction/i },
    { label: "论证", pattern: /论证|讨论|概念|Discussion/i },
  ],
  course: [],
  other: [],
};

const CLICHE = ["充分彰显", "值得注意的是", "综上所述，本文具有重要意义", "不可否认的是", "在当今社会"];

function quoteFrom(block: DocumentBlock, snippet?: string): string | null {
  if (snippet && block.text.includes(snippet)) return snippet;
  const slice = block.text.slice(0, 42).trim();
  return slice && block.text.includes(slice) ? slice : null;
}

export function locateSuggestion(
  blocks: DocumentBlock[],
  suggestion: Pick<Suggestion, "blockId" | "quote">,
): DocumentBlock | null {
  const block = blocks.find((item) => item.id === suggestion.blockId);
  if (!block) return null;
  if (!suggestion.quote || !block.text.includes(suggestion.quote)) return null;
  return block;
}

export function localStructureNotes(document: ParsedDocument, articleType: ArticleType): Suggestion[] {
  const notes: Suggestion[] = [];
  const headings = document.blocks.filter((block) => block.kind === "heading").map((block) => block.text).join("\n");
  const expectations = SECTION_EXPECTATION[articleType];
  expectations.forEach((item, index) => {
    if (item.pattern.test(headings) || item.pattern.test(document.blocks.map((block) => block.text).join("\n").slice(0, 400))) {
      return;
    }
    const anchor = document.blocks.find((block) => block.kind === "heading") ?? document.blocks[0];
    if (!anchor) return;
    const quote = quoteFrom(anchor);
    if (!quote) return;
    notes.push({
      id: `local-structure-${index + 1}`,
      priority: "medium",
      dimension: "structure",
      version: "confirmed-input",
      blockId: anchor.id,
      quote,
      problem:
        articleType === "review" || articleType === "theory"
          ? `按${articleType === "review" ? "综述" : "理论"}来看，还看不到「${item.label}」。这里不套实验论文的结构。`
          : `按文章类型，还看不到「${item.label}」。`,
      change: "如果原稿里用了别的标题，改一下标题或在确认稿里标出对应段落。不要为了凑结构补写方法或结果。",
      verify: "对照任务书或期刊要求。",
      origin: "local",
    });
  });

  if (articleType === "review" || articleType === "theory") {
    const methodHeading = document.blocks.find(
      (block) => block.kind === "heading" && /实验结果|随机对照|样本量表/.test(block.text),
    );
    if (methodHeading) {
      const quote = quoteFrom(methodHeading, methodHeading.text);
      if (quote) {
        notes.push({
          id: "local-structure-imrad",
          priority: "low",
          dimension: "structure",
          version: "confirmed-input",
          blockId: methodHeading.id,
          quote,
          problem: "这类文章不必套实验结构。若这里不是已完成的实验，就不要写成结果。",
          change: "保留为计划或论证，并标明尚未完成。",
          verify: "确认本节是不是真有已完成的材料。",
          origin: "local",
        });
      }
    }
  }

  document.blocks.forEach((block) => {
    const cliche = CLICHE.find((phrase) => block.text.includes(phrase));
    if (!cliche) return;
    notes.push({
      id: `local-expression-${block.id}`,
      priority: "low",
      dimension: "expression",
      version: "confirmed-input",
      blockId: block.id,
      quote: cliche,
      problem: "这是套话，删掉它通常不损失事实。",
      change: "改成这句话实际要说的事实；没有事实就整句去掉。",
      verify: "确认删去后没有丢掉限定或数字。",
      origin: "local",
    });
    for (const protection of block.protections) {
      if (protection.kind !== "number-unit" && protection.kind !== "quote") continue;
      if (!/导致|引起/.test(block.text) || !block.text.includes("相关")) continue;
    }
    if (block.text.includes("相关") && /导致|引起/.test(block.text)) {
      const quote = quoteFrom(block, block.text.includes("导致") ? "导致" : "引起");
      if (quote && block.text.includes(quote)) {
        notes.push({
          id: `local-fact-${block.id}`,
          priority: "high",
          dimension: "fact",
          version: "confirmed-input",
          blockId: block.id,
          quote: block.text.includes("导致") ? "导致" : "引起",
          problem: "同一段里既写相关又写因果。若材料只支持相关，不能升成导致。",
          change: "只保留材料能够支持的关系，并写明依据。",
          verify: "回到数据或引用，确认有没有因果设计。",
          origin: "local",
        });
      }
    }
  });

  return notes.filter((note, index, list) => list.findIndex((item) => item.id === note.id) === index);
}

export function filterRealQuotes(blocks: DocumentBlock[], suggestions: Suggestion[]): Suggestion[] {
  return suggestions.filter((suggestion) => locateSuggestion(blocks, suggestion));
}
