import { LIMITS } from "@/lib/limits";
import { parseProse } from "@/lib/document/structure";
import type { ParsedDocument, ParseWarning } from "@/lib/document/types";

export interface ParseFileResult {
  document: ParsedDocument;
  rawText: string;
  fileName: string;
}

const ALLOWED = new Set(["docx", "pdf", "txt", "md"]);

export function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match ? match[1].toLowerCase() : "";
}

export function assertAcceptedFile(fileName: string, size: number): void {
  const ext = extensionOf(fileName);
  if (!ALLOWED.has(ext)) {
    throw new Error("只接受 .docx、有文字层的 .pdf、.txt 和 .md。");
  }
  if (size > LIMITS.maxFileBytes) {
    throw new Error("文件超过 15 MB。请先拆开，页面不会截断后继续。");
  }
  if (size <= 0) {
    throw new Error("文件是空的。");
  }
}

function withWarning(document: ParsedDocument, warning: ParseWarning): ParsedDocument {
  return { ...document, warnings: [...document.warnings, warning] };
}

export async function parseDocx(data: ArrayBuffer | Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const input: { buffer?: Buffer; arrayBuffer: ArrayBuffer } = { arrayBuffer: arrayBuffer as ArrayBuffer };
  if (typeof Buffer !== "undefined") input.buffer = Buffer.from(bytes);
  try {
    const result = await mammoth.convertToHtml(input);
    return result.value || "";
  } catch {
    throw new Error("这份 Word 无法打开。它可能已损坏或被加密。请另存为新的 .docx，或改成粘贴。");
  }
}

export async function parsePdf(data: ArrayBuffer | Uint8Array): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  try {
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: false });
    const pages = extracted.totalPages;
    const pageTexts = Array.isArray(extracted.text) ? extracted.text : [String(extracted.text ?? "")];
    const emptyPages = pageTexts.filter((page) => page.trim().length < 15).length;
    const text = pageTexts.join("\n\n");
    if (pages > 1 && emptyPages >= Math.ceil(pages / 2)) {
      return { text: `${text}\n\n[[pagebond:missing-pages:${emptyPages}/${pages}]]`, pages };
    }
    return { text, pages };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/password|encrypt/i.test(message)) {
      throw new Error("这份 PDF 有密码或被加密。请换成无密码的文字版，或改成粘贴。");
    }
    throw new Error("这份 PDF 无法读取。它可能已损坏、加密，或不是有文字层的 PDF。");
  }
}

export function classifyExtractedPdf(text: string, pages: number): ParsedDocument {
  const missing = /\[\[(?:pagebond|yeyuan):missing-pages:(\d+)\/(\d+)\]\]/.exec(text);
  const clean = text.replace(/\[\[(?:pagebond|yeyuan):missing-pages:\d+\/\d+\]\]/g, "").trim();
  const chars = [...clean.replace(/\s/g, "")].length;
  let document = parseProse(clean);
  if (pages >= 1 && chars < Math.max(20, pages * 15)) {
    document = withWarning(document, {
      code: "scan-pdf",
      message: "几乎没有文字层，像扫描件。本版不做 OCR。请换 Word、文字版 PDF，或粘贴文本。",
    });
  }
  if (missing) {
    document = withWarning(document, {
      code: "missing-pages",
      message: `${missing[2]} 页里有 ${missing[1]} 页几乎没有文字。请核对是不是缺页或扫描页。`,
    });
  }
  return document;
}

export async function parseUploadedFile(
  fileName: string,
  data: ArrayBuffer | Uint8Array,
  size = data.byteLength,
): Promise<ParseFileResult> {
  assertAcceptedFile(fileName, size);
  const ext = extensionOf(fileName);
  try {
    if (ext === "txt" || ext === "md") {
      const rawText = new TextDecoder("utf-8", { fatal: false }).decode(data instanceof Uint8Array ? data : new Uint8Array(data));
      return { document: parseProse(rawText), rawText, fileName };
    }
    if (ext === "docx") {
      const rawText = await parseDocx(data);
      if (!rawText.trim()) {
        const document = parseProse("");
        return { document, rawText, fileName };
      }
      return { document: parseProse(rawText), rawText, fileName };
    }
    const pdf = await parsePdf(data);
    return {
      document: classifyExtractedPdf(pdf.text, pdf.pages),
      rawText: pdf.text,
      fileName,
    };
  } catch (error) {
    if (error instanceof Error && /Word|PDF|空的|15 MB|只接受/.test(error.message)) throw error;
    const document = parseProse("");
    document.warnings.push({
      code: "encrypted-or-corrupt",
      message: "文件无法解析。请确认它没有加密、没有损坏。",
    });
    return { document, rawText: "", fileName };
  }
}
