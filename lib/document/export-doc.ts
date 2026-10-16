import type { DocumentBlock } from "@/lib/document/types";

export type ExportKind = "suggestion" | "confirmed";

export function exportMarkdown(
  blocks: DocumentBlock[],
  options: {
    kind: ExportKind;
    unsupported?: string[];
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

async function packDocx(title: string, children: unknown[]): Promise<Blob> {
  const { Document, Packer } = await import("docx");
  const doc = new Document({
    title,
    sections: [{ children: children as never[] }],
  });
  return Packer.toBlob(doc);
}

export async function exportDocxBlob(blocks: DocumentBlock[], title: string): Promise<Blob> {
  const { HeadingLevel, Paragraph, TextRun } = await import("docx");
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
  return packDocx(title, children);
}

/** Plain-paragraph Word export for diagnosis / analysis text. */
export async function exportAnalysisDocxBlob(
  title: string,
  paragraphs: string[],
): Promise<Blob> {
  const { Paragraph, HeadingLevel } = await import("docx");
  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    ...paragraphs.filter((line) => line.trim()).map((line) => new Paragraph({ text: line })),
    new Paragraph({ text: "未进行外部查重／AI 检测。" }),
  ];
  return packDocx(title, children);
}
