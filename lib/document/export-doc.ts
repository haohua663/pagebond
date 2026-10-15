import type { DocumentBlock } from "@/lib/document/types";

export type ExportKind = "suggestion" | "confirmed";

export function exportMarkdown(
  blocks: DocumentBlock[],
  options: {
    kind: ExportKind;
    unsupported?: string[];
    includeAiNote?: boolean;
  },
): string {
  const banner =
    options.kind === "suggestion"
      ? "这是建议修改稿，未经逐段确认。"
      : "这是已确认稿。未接受的段落仍是确认输入版。";
  const body = blocks
    .map((block) => {
      if (block.kind === "heading") return `${"#".repeat(Math.min(Math.max(block.level, 1), 6))} ${block.text}`;
      if (block.kind === "list") return `- ${block.text}`;
      if (block.kind === "quote") return `> ${block.text}`;
      return block.text;
    })
    .join("\n\n");
  const parts = [`> ${banner}`, "", body];
  if (options.unsupported?.length) {
    parts.push("", "## 未处理清单", "", ...options.unsupported.map((item) => `- ${item}`));
    parts.unshift("> 导出称为正文修改稿。下面这些对象没有按原格式处理。", "");
  }
  if (options.includeAiNote) {
    parts.push(
      "",
      "## 人工智能使用说明",
      "",
      "作者确认：表达层面的建议来自页缘调用的模型。研究事实、文献和最终措辞由作者负责。这一节是附页，不自动进入正文。",
    );
  }
  parts.push("", "未进行外部查重／AI 检测。");
  return parts.join("\n");
}

export function textsInOrder(markdown: string, blocks: DocumentBlock[]): boolean {
  let cursor = 0;
  for (const block of blocks) {
    const at = markdown.indexOf(block.text, cursor);
    if (at < 0) return false;
    cursor = at + block.text.length;
  }
  return true;
}

export async function exportDocxBlob(blocks: DocumentBlock[], title: string): Promise<Blob> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
  const children = blocks.map((block) => {
    if (block.kind === "heading") {
      const level =
        block.level <= 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      return new Paragraph({ text: block.text, heading: level });
    }
    if (block.kind === "quote") {
      return new Paragraph({
        children: [new TextRun({ text: block.text, italics: true })],
      });
    }
    return new Paragraph({
      text: block.text,
      bullet: block.kind === "list" ? { level: 0 } : undefined,
    });
  });
  const doc = new Document({
    title,
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}
