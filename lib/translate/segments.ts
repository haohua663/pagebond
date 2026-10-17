import type { DocumentBlock } from "@/lib/document/types";
import { parseProse, blocksToPlain } from "@/lib/document/structure";

/** Known academic section titles (aligned with lib/document/structure HEADING_LINE names). */
const TITLE_NAME =
  /^(?:第[一二三四五六七八九十百0-9]+[章节部分篇]|[一二三四五六七八九十]+、.{1,30}|摘要|引言|绪论|文献综述|相关研究|研究方法|研究设计|研究问题|结果与分析|研究结果|分析与讨论|讨论|结论|参考文献|致谢|附录|Abstract|Introduction|Related Work|Literature Review|Methods|Materials and Methods|Results|Discussion|Conclusion|References|Bibliography)$/i;

/** True when text is a section title, not body prose. */
export function isTranslateHeadingText(text: string): boolean {
  const t = text.trim().replace(/^#{1,6}\s+/, "").trim();
  if (!t || [...t].length > 40) return false;
  if (/[。！？!?；;]/.test(t)) return false;
  return TITLE_NAME.test(t);
}

/** Body segments eligible for translation — headings are never body targets. */
export function isSelectableTranslateBlock(block: DocumentBlock): boolean {
  if (block.kind === "heading") return false;
  if (block.kind === "formula" || block.kind === "reference") return false;
  if (isTranslateHeadingText(block.text)) return false;
  return true;
}

/**
 * Promote title-like paragraphs to heading kind so display/API stay consistent.
 * Does not invent titles; only rewrites kind/text when the line is title-like.
 */
export function normalizeTranslateBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  return blocks.map((block) => {
    if (block.kind === "heading") {
      return { ...block, text: block.text.trim().replace(/^#{1,6}\s+/, "").trim() };
    }
    if (block.kind === "paragraph" && isTranslateHeadingText(block.text)) {
      return {
        ...block,
        kind: "heading" as const,
        level: block.level || 2,
        text: block.text.trim().replace(/^#{1,6}\s+/, "").trim(),
      };
    }
    return block;
  });
}

export function bodySegments(blocks: DocumentBlock[]): DocumentBlock[] {
  return normalizeTranslateBlocks(blocks).filter(isSelectableTranslateBlock);
}

export function parseTranslateSource(text: string): DocumentBlock[] {
  return normalizeTranslateBlocks(parseProse(text).blocks);
}

export type SegmentTranslation = { id: string; translation: string };
export type TranslateSegmentInput = { id: string; text: string };

/** Merge translations into source blocks; headings and untouched body keep original text. */
export function mergeSegmentTranslations(
  blocks: DocumentBlock[],
  translations: SegmentTranslation[],
): DocumentBlock[] {
  const byId = new Map(translations.map((item) => [item.id, item.translation]));
  return normalizeTranslateBlocks(blocks).map((block) => {
    const next = byId.get(block.id);
    if (next === undefined) return block;
    return { ...block, text: next };
  });
}

export function plainFromBlocks(blocks: DocumentBlock[]): string {
  return blocksToPlain(blocks);
}

function segmentChars(text: string): number {
  return [...text.replace(/\s/g, "")].length;
}

export function batchTranslateSegments(
  segments: TranslateSegmentInput[],
  maxChars = 2_500,
): TranslateSegmentInput[][] {
  if (!segments.length) return [];
  const batches: TranslateSegmentInput[][] = [];
  let current: TranslateSegmentInput[] = [];
  let used = 0;
  for (const seg of segments) {
    const size = Math.max(1, segmentChars(seg.text));
    if (current.length && used + size > maxChars) {
      batches.push(current);
      current = [];
      used = 0;
    }
    current.push(seg);
    used += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

export type TranslateSection = {
  id: string;
  title: string;
};

/** Clickable result unit: preceding heading(s) folded into the body card. */
export type TranslateDisplayUnit = {
  id: string;
  sectionId: string | null;
  headingLines: string[];
  bodySource: string;
  bodyTranslation: string;
};

function isHeadingBlock(block: DocumentBlock): boolean {
  return block.kind === "heading" || isTranslateHeadingText(block.text);
}

/**
 * Fold consecutive headings into the following body segment.
 * Never emits a heading-only unit. Title-like mis-parsed paragraphs are treated as headings.
 * Trailing headings attach to the previous unit when possible.
 */
export function buildDisplayUnits(
  sourceBlocks: DocumentBlock[],
  resultBlocks: DocumentBlock[],
): TranslateDisplayUnit[] {
  const source = normalizeTranslateBlocks(sourceBlocks);
  const result = normalizeTranslateBlocks(resultBlocks);
  const translated = new Map(result.map((b) => [b.id, b.text]));
  const units: TranslateDisplayUnit[] = [];
  let pendingHeadings: { id: string; text: string }[] = [];
  let currentSectionId: string | null = null;

  const flushPendingOntoPrevious = () => {
    if (!pendingHeadings.length || !units.length) {
      pendingHeadings = [];
      return;
    }
    const prev = units[units.length - 1];
    prev.headingLines = [...prev.headingLines, ...pendingHeadings.map((h) => h.text)];
    if (!prev.sectionId) prev.sectionId = pendingHeadings[pendingHeadings.length - 1].id;
    pendingHeadings = [];
  };

  for (const block of source) {
    if (isHeadingBlock(block)) {
      const title = block.text.trim().replace(/^#{1,6}\s+/, "").trim();
      if (!title) continue;
      pendingHeadings.push({ id: block.id, text: title });
      currentSectionId = block.id;
      continue;
    }
    if (block.kind === "formula" || block.kind === "reference") {
      continue;
    }
    const bodySource = block.text.trim();
    if (!bodySource) continue;

    // Title-like body with no real prose: keep as pending heading, never a card.
    if (isTranslateHeadingText(bodySource)) {
      pendingHeadings.push({ id: block.id, text: bodySource.replace(/^#{1,6}\s+/, "").trim() });
      currentSectionId = block.id;
      continue;
    }

    const headingLines = pendingHeadings.map((h) => h.text);
    const sectionId =
      pendingHeadings.length > 0 ? pendingHeadings[pendingHeadings.length - 1].id : currentSectionId;
    let bodyTranslation = (translated.get(block.id) ?? bodySource).trim();
    // If model echoed only the title, don't leave a title-only card — fold and wait for next body.
    if (bodyTranslation && isTranslateHeadingText(bodyTranslation) && headingLines.includes(bodyTranslation)) {
      pendingHeadings.push({ id: block.id, text: bodyTranslation });
      currentSectionId = block.id;
      continue;
    }
    if (!bodyTranslation) {
      // Empty translation: still show source body under headings rather than a title-only card.
      bodyTranslation = bodySource;
    }

    units.push({
      id: block.id,
      sectionId,
      headingLines,
      bodySource,
      bodyTranslation,
    });
    pendingHeadings = [];
  }

  flushPendingOntoPrevious();
  // Drop any residual empty/title-only units (defensive).
  return units.filter((u) => {
    const body = u.bodyTranslation.trim() || u.bodySource.trim();
    if (!body) return false;
    if (isTranslateHeadingText(body) && u.headingLines.some((h) => h === body)) return false;
    return true;
  });
}

export function listTranslateSections(sourceBlocks: DocumentBlock[]): TranslateSection[] {
  const seen = new Set<string>();
  const out: TranslateSection[] = [];
  for (const block of normalizeTranslateBlocks(sourceBlocks)) {
    if (!isHeadingBlock(block)) continue;
    const title = block.text.trim().replace(/^#{1,6}\s+/, "").trim();
    if (!title || seen.has(block.id)) continue;
    seen.add(block.id);
    out.push({ id: block.id, title });
  }
  return out;
}

export function filterDisplayUnits(
  units: TranslateDisplayUnit[],
  selectedSectionIds: Set<string> | null,
): TranslateDisplayUnit[] {
  if (!selectedSectionIds || selectedSectionIds.size === 0) return units;
  return units.filter((u) => u.sectionId !== null && selectedSectionIds.has(u.sectionId));
}
