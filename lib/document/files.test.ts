import { describe, expect, it } from "vitest";
import { Document, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { exportMarkdown, textsInOrder } from "@/lib/document/export-doc";
import { assertAcceptedFile, classifyExtractedPdf, parseUploadedFile } from "@/lib/document/parse-source";
import { parseProse } from "@/lib/document/structure";

describe("files and export", () => {
  it("rejects an empty name and an oversized file without truncating", () => {
    expect(() => assertAcceptedFile("notes.exe", 10)).toThrow(/只接受/);
    expect(() => assertAcceptedFile("notes.docx", 16 * 1024 * 1024)).toThrow(/15 MB/);
  });

  it("reads a docx without dropping the paragraph", async () => {
    const doc = new Document({ sections: [{ children: [new Paragraph("样本为 40 人，差异未显著。")] }] });
    const buffer = await Packer.toBuffer(doc);
    const parsed = await parseUploadedFile("paper.docx", new Uint8Array(buffer));
    expect(parsed.document.blocks.map((block) => block.text).join("")).toContain("40 人");
    expect(parsed.document.blocks.map((block) => block.text).join("")).toContain("未显著");
  });

  it("reads a text-layer pdf and flags a page with no text", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("Sample of 40 students.", { x: 50, y: 700, size: 12, font });
    const bytes = await pdf.save();
    const parsed = await parseUploadedFile("paper.pdf", new Uint8Array(bytes));
    expect(parsed.rawText.toLowerCase()).toContain("sample");
    const scan = classifyExtractedPdf("", 2);
    expect(scan.warnings.some((item) => item.code === "scan-pdf")).toBe(true);
  });

  it("explains a corrupt pdf", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(parseUploadedFile("broken.pdf", bytes)).rejects.toThrow(/PDF/);
  });

  it("exports every block in order and names the draft kind", () => {
    const doc = parseProse("# 引言\n\n第一段。\n\n第二段。");
    const markdown = exportMarkdown(doc.blocks, { kind: "confirmed", unsupported: ["表格按纯文本保留"] });
    expect(markdown).toContain("已确认稿");
    expect(markdown).toContain("正文修改稿");
    expect(markdown).toContain("未进行外部查重／AI 检测");
    expect(textsInOrder(markdown, doc.blocks)).toBe(true);
    expect(markdown).not.toMatch(/查重率|检测率/);
  });
});
