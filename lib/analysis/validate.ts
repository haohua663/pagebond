import { missingProtections } from "@/lib/document/protect";
import type { DocumentBlock } from "@/lib/document/types";

export type CheckStatus = "passed" | "reverted" | "needs-review";

export interface ParagraphRewrite {
  id: string;
  text: string;
  reason?: string;
}

export interface BlockCheck {
  id: string;
  status: CheckStatus;
  reasons: string[];
  text: string;
  suggestedText: string;
  changed: boolean;
}

export interface RewriteCheck {
  blocks: BlockCheck[];
  integrity: "passed" | "failed";
  issues: string[];
}

function semanticFlags(original: string, rewritten: string): string[] {
  const flags: string[] = [];
  if (original.includes("未显著") && !rewritten.includes("未显著") && rewritten.includes("显著")) {
    flags.push("「未显著」没有保持");
  }
  if (original.includes("没有显著") && !rewritten.includes("没有显著") && rewritten.includes("显著")) {
    flags.push("「没有显著」没有保持");
  }
  const originalCause = /导致|引起/.test(original);
  if (original.includes("相关") && !originalCause && /导致|引起/.test(rewritten)) {
    flags.push("「相关」被写成了因果");
  }
  if (/从\s*\d+(?:\.\d+)?\s*%\s*上升到\s*\d+(?:\.\d+)?\s*%/.test(original) && /增长\s*\d+(?:\.\d+)?\s*%/.test(rewritten)) {
    flags.push("「从…上升到…」被写成了「增长」");
  }
  const negation = (value: string) => value.match(/不|未|没有|并非/g)?.length ?? 0;
  if (negation(original) > negation(rewritten)) {
    flags.push("否定或限定变少了");
  }
  return flags;
}

export function checkRewrite(original: DocumentBlock[], output: ParagraphRewrite[]): RewriteCheck {
  const issues: string[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, ParagraphRewrite>();
  for (const item of output) {
    if (seen.has(item.id)) issues.push(`段落 ${item.id} 重复出现`);
    seen.add(item.id);
    byId.set(item.id, item);
  }
  const originalIds = original.map((block) => block.id);
  const outputIds = output.map((item) => item.id);
  if (outputIds.join("|") !== originalIds.join("|")) {
    issues.push("返回的段落编号或顺序与原文不一致");
  }
  for (const id of outputIds) {
    if (!originalIds.includes(id)) issues.push(`出现了原文没有的段落 ${id}`);
  }
  for (const id of originalIds) {
    if (!outputIds.includes(id)) issues.push(`缺少段落 ${id}`);
  }

  const blocks: BlockCheck[] = original.map((block) => {
    const item = byId.get(block.id);
    const reasons: string[] = [];
    // Headings and structure markers are never rewritten: always keep the original text.
    if (block.kind === "heading") {
      return {
        id: block.id,
        status: "passed" as const,
        reasons: [],
        text: block.text,
        suggestedText: block.text,
        changed: false,
      };
    }
    if (!item || !item.text.trim()) {
      reasons.push(item ? "这一段的输出是空的" : "这一段没有返回");
      return {
        id: block.id,
        status: "reverted" as const,
        reasons,
        text: block.text,
        suggestedText: block.text,
        changed: false,
      };
    }
    const other = original.find(
      (candidate) =>
        candidate.id !== block.id &&
        candidate.text.length > 20 &&
        item.text.includes(candidate.text),
    );
    if (other) reasons.push(`疑似把 ${other.id} 拼进了这一段`);

    const lost = missingProtections(block.protections, item.text);
    if (lost.length) {
      reasons.push(`保护项被改动：${lost.map((part) => part.text).join("、")}`);
    }
    const marker = leadingMarker(block.text);
    if (marker && !item.text.trimStart().startsWith(marker)) {
      reasons.push(`段首结构标记被改动：${marker}`);
    }
    if (block.locked && item.text !== block.text) {
      reasons.push("这一段已锁定，不能改写");
    }
    for (const term of [] as string[]) {
      if (!item.text.includes(term)) reasons.push(`锁定术语缺失：${term}`);
    }

    const ruleFailed = reasons.length > 0;
    if (ruleFailed) {
      return {
        id: block.id,
        status: "reverted" as const,
        reasons,
        text: block.text,
        suggestedText: block.text,
        changed: false,
      };
    }

    const flags = semanticFlags(block.text, item.text);
    const changed = item.text !== block.text;
    if (flags.length) {
      return {
        id: block.id,
        status: "needs-review" as const,
        reasons: flags,
        text: block.text,
        suggestedText: item.text,
        changed,
      };
    }
    return {
      id: block.id,
      status: "passed" as const,
      reasons: item.reason ? [item.reason] : [],
      text: changed ? item.text : block.text,
      suggestedText: item.text,
      changed,
    };
  });

  return {
    blocks,
    integrity: issues.length ? "failed" : "passed",
    issues,
  };
}

const MARKER_PATTERN =
  /^\s*((?:第[一二三四五六七八九十百零〇\d]+[章节部分条篇]|[（(][一二三四五六七八九十\d]+[)）]|[一二三四五六七八九十]+[、.．]|\d+(?:\.\d+)+[、.．)）]?|\d+[、.．)）]|[A-Za-z][.)]|[IVXLC]+\.|[-*•·●▪◦]|#{1,6})(?=\s|[\u4e00-\u9fff]|$))/;

/** Leading structure marker such as "1.2", "（一）", "第三章", "-", "#". */
export function leadingMarker(text: string): string {
  const match = MARKER_PATTERN.exec(text);
  return match ? match[1] : "";
}

export function applyLockedTerms(blocks: DocumentBlock[], terms: string[]): DocumentBlock[] {
  const cleaned = terms.map((term) => term.trim()).filter(Boolean);
  if (!cleaned.length) return blocks;
  return blocks.map((block) => {
    const hit = cleaned.filter((term) => block.text.includes(term));
    if (!hit.length) return block;
    return { ...block, locked: true };
  });
}


/** Fill missing ids from original and restore original order (low-risk integrity repair). */
export function alignParagraphs(
  original: DocumentBlock[],
  output: ParagraphRewrite[],
): ParagraphRewrite[] {
  const byId = new Map(output.map((item) => [item.id, item]));
  return original.map((block) => {
    const hit = byId.get(block.id);
    if (hit && hit.text.trim()) return { id: block.id, text: hit.text, reason: hit.reason };
    return { id: block.id, text: block.text, reason: hit?.reason || "未返回，保留原文" };
  });
}

export function checkRewriteWithTerms(
  original: DocumentBlock[],
  output: ParagraphRewrite[],
  terms: string[],
): RewriteCheck {
  const result = checkRewrite(original, output);
  const cleaned = terms.map((term) => term.trim()).filter(Boolean);
  if (!cleaned.length) return result;
  const blocks = result.blocks.map((check) => {
    const source = original.find((block) => block.id === check.id);
    const item = output.find((row) => row.id === check.id);
    if (!source || !item) return check;
    const lost = cleaned.filter((term) => source.text.includes(term) && !item.text.includes(term));
    if (!lost.length || check.status === "reverted") return check;
    return {
      ...check,
      status: "reverted" as const,
      reasons: [...check.reasons, `锁定术语被改掉：${lost.join("、")}`],
      text: source.text,
      suggestedText: source.text,
      changed: false,
    };
  });
  return { ...result, blocks };
}
