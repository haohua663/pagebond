import { findProtections } from "@/lib/document/protect";
import { countText } from "@/lib/document/stats";
import type {
  BlockKind,
  DocumentBlock,
  ParsedDocument,
  ParseWarning,
} from "@/lib/document/types";

const HEADING_LINE =
  /^(?:第[一二三四五六七八九十百0-9]+[章节部分篇]|[一二三四五六七八九十]+、.{1,30}|(?:摘要|引言|绪论|文献综述|相关研究|研究方法|研究设计|研究问题|结果与分析|研究结果|分析与讨论|讨论|结论|参考文献|致谢|附录|Abstract|Introduction|Related Work|Literature Review|Methods|Materials and Methods|Results|Discussion|Conclusion|References|Bibliography))$/;

const REFERENCE_HEADING = /^(参考文献|引用文献|References|Bibliography)$/i;

interface RawBlock {
  kind: BlockKind;
  level: number;
  text: string;
  listOrdered?: boolean;
}

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function htmlToPlainish(html: string): string {
  return html
    .replace(/\r\n/g, "\n")
    .replace(/<h([1-6])[^>]*>/gi, (_, level: string) => `\n${"#".repeat(Number(level))} `)
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<blockquote[^>]*>/gi, "\n> ")
    .replace(/<\/blockquote>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "\n[图片：$1]\n")
    .replace(/<img[^>]*>/gi, "\n[图片]\n")
    .replace(/<table[\s\S]*?<\/table>/gi, (table) => `\n${decodeHtml(table).replace(/\s+/g, " ").trim()}\n`)
    .replace(/<\/(div|tr|ul|ol)>/gi, "\n");
}

function pushParagraph(blocks: RawBlock[], buffer: string[]) {
  const text = buffer.join(" ").replace(/\s+/g, " ").trim();
  buffer.length = 0;
  if (!text) return;
  if (/^\[图片(:.*)?\]$/.test(text)) {
    blocks.push({ kind: "caption", level: 0, text });
    return;
  }
  if (text.includes("|") && (text.match(/\|/g)?.length ?? 0) >= 2) {
    blocks.push({ kind: "table", level: 0, text });
    return;
  }
  blocks.push({ kind: "paragraph", level: 0, text });
}

function parseLines(text: string): RawBlock[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks: RawBlock[] = [];
  const buffer: string[] = [];
  let quoteBuffer: string[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushQuote = () => {
    if (!quoteBuffer.length) return;
    const value = quoteBuffer.join(" ").replace(/\s+/g, " ").trim();
    quoteBuffer = [];
    if (value) blocks.push({ kind: "quote", level: 0, text: value });
  };
  const flushList = () => {
    if (!listBuffer) return;
    for (const item of listBuffer.items) {
      blocks.push({ kind: "list", level: 0, text: item, listOrdered: listBuffer.ordered });
    }
    listBuffer = null;
  };
  const flush = () => {
    flushQuote();
    flushList();
    pushParagraph(blocks, buffer);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const markdownHeading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (markdownHeading) {
      flush();
      blocks.push({
        kind: "heading",
        level: markdownHeading[1].length,
        text: markdownHeading[2].trim(),
      });
      continue;
    }
    if (line.startsWith(">")) {
      flushList();
      pushParagraph(blocks, buffer);
      quoteBuffer.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (quoteBuffer.length) flushQuote();

    const formula =
      /^\$\$[\s\S]*\$\$$/.test(line) || /^\\\[[\s\S]*\\\]$/.test(line) || /^\\begin\{/.test(line);
    if (formula) {
      flush();
      blocks.push({ kind: "formula", level: 0, text: line });
      continue;
    }

    const list = /^(?:[-*•]|\d+[\.、])\s+(.+)$/.exec(line);
    const looksLikeHeading =
      HEADING_LINE.test(line) ||
      (/^\d+(?:\.\d+){1,3}\s+\S+/.test(line) && line.length <= 40 && !/[。！？.!?]$/.test(line));
    if (list && !looksLikeHeading) {
      pushParagraph(blocks, buffer);
      const ordered = /^\d+/.test(line);
      if (!listBuffer || listBuffer.ordered !== ordered) {
        flushList();
        listBuffer = { ordered, items: [] };
      }
      listBuffer.items.push(list[1].trim());
      continue;
    }
    if (listBuffer) flushList();

    if (looksLikeHeading && line.length <= 40) {
      flush();
      const level = /^第.+[章节]/.test(line) || /^[一二三四五六七八九十]+、/.test(line) ? 1 : 2;
      blocks.push({ kind: "heading", level, text: line });
      continue;
    }

    if (/^\[\^[^\]]+\]:/.test(line)) {
      flush();
      blocks.push({ kind: "paragraph", level: 0, text: line });
      continue;
    }

    buffer.push(line);
  }
  flush();
  return blocks;
}

function shortLinesSuggestColumns(text: string): boolean {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 12) return false;
  const short = lines.filter((line) => [...line].length < 18).length;
  return short / lines.length > 0.7;
}

export function parseProse(text: string): ParsedDocument {
  const warnings: ParseWarning[] = [];
  const unsupported: string[] = [];
  const source = text ?? "";

  if (!source.trim()) {
    warnings.push({ code: "empty", message: "没有读到正文。换一份有文字的文件，或直接粘贴。" });
    return {
      blocks: [],
      warnings,
      unsupported,
      outline: [],
      stats: { chars: 0, words: 0 },
      title: "",
    };
  }

  if (/<script[\s>]|javascript:|onerror\s*=/i.test(source)) {
    warnings.push({
      code: "dangerous-html",
      message: "文本里有疑似页面代码。已按纯文本保存，不会在页面里执行。",
    });
  }
  if (
    /ignore (all |any |previous )?instructions|系统提示|你现在是|忽略(以上|前面|此前)(的)?(所有)?指令/i.test(
      source,
    )
  ) {
    warnings.push({
      code: "pseudo-instruction",
      message: "正文里有看起来像指令的句子。它们只作为正文保存，不会当成系统指令。",
    });
  }
  const replacement = source.match(/\uFFFD/g)?.length ?? 0;
  if (replacement >= 4) {
    warnings.push({
      code: "garbled",
      message: "有较多无法识别的字符。请对照原文件复核，确认后再继续。",
    });
  }
  if (shortLinesSuggestColumns(source)) {
    warnings.push({
      code: "double-column",
      message: "换行很碎，像双栏或被拆开的行。请核对段落是否完整。",
    });
  }

  const plain = /<\s*\/?\s*[a-z][^>]*>/i.test(source) ? decodeHtml(htmlToPlainish(source)) : source;
  const raw = parseLines(plain);
  if (!raw.length) {
    warnings.push({ code: "empty", message: "去掉空白后没有正文。" });
  }

  let inReferences = false;
  const blocks: DocumentBlock[] = raw.map((block, index) => {
    if (block.kind === "heading" && REFERENCE_HEADING.test(block.text.trim())) {
      inReferences = true;
    } else if (block.kind === "heading" && block.level <= 1) {
      inReferences = false;
    }
    let kind = block.kind;
    let locked = false;
    if (inReferences && kind !== "heading") {
      kind = "reference";
      locked = true;
    }
    if (kind === "heading" || kind === "formula" || kind === "quote" || kind === "table") locked = true;
    if (/^\[\^[^\]]+\]:/.test(block.text) || /\[\^[^\]]+\]/.test(block.text)) {
      locked = true;
      unsupported.push(`脚注未按脚注处理：${block.text.slice(0, 40)}`);
    }
    if (kind === "table") unsupported.push(`表格按纯文本保留：${block.text.slice(0, 40)}`);
    if (kind === "caption" && block.text.startsWith("[图片")) {
      unsupported.push(block.text);
      locked = true;
    }
    const protections = findProtections(block.text);
    if (kind === "reference") {
      protections.push({ kind: "reference", text: block.text });
    }
    if (kind === "formula") protections.push({ kind: "formula", text: block.text });
    if (kind === "quote" && !protections.some((item) => item.kind === "quote")) {
      protections.push({ kind: "quote", text: block.text });
    }
    return {
      id: `p-${String(index + 1).padStart(3, "0")}`,
      order: index,
      kind,
      level: block.level,
      text: block.text,
      locked,
      protections,
      listOrdered: block.listOrdered,
    };
  });

  const outline = blocks
    .filter((block) => block.kind === "heading")
    .map((block) => ({ id: block.id, level: block.level, text: block.text }));
  const title = outline[0]?.text || blocks[0]?.text.slice(0, 32) || "未命名稿件";

  return {
    blocks,
    warnings,
    unsupported: [...new Set(unsupported)],
    outline,
    stats: countText(blocks.map((block) => block.text).join("\n")),
    title,
  };
}

export function blocksToPlain(blocks: DocumentBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === "heading") return `${"#".repeat(Math.max(block.level, 1))} ${block.text}`;
      if (block.kind === "list") return `${block.listOrdered ? "1." : "-"} ${block.text}`;
      if (block.kind === "quote") return `> ${block.text}`;
      return block.text;
    })
    .join("\n\n");
}
