import type { Protection } from "@/lib/document/types";

export interface ExpressionChange {
  blockId: string;
  unchanged: string[];
  changed: { before: string; after: string }[];
  held: { kind: Protection["kind"]; text: string }[];
}

function clauses(text: string): string[] {
  return text
    .split(/(?<=[。！？!?；;])\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Which expressions moved, without turning the difference into a detection score. */
export function compareExpressions(
  blockId: string,
  original: string,
  revised: string,
  protections: Protection[],
): ExpressionChange {
  const before = clauses(original);
  const after = clauses(revised);
  const afterSet = new Set(after);
  const beforeSet = new Set(before);
  const unchanged = before.filter((part) => afterSet.has(part));
  const changed: { before: string; after: string }[] = [];
  const removed = before.filter((part) => !afterSet.has(part));
  const added = after.filter((part) => !beforeSet.has(part));
  const pairs = Math.max(removed.length, added.length);
  for (let index = 0; index < pairs; index += 1) {
    changed.push({
      before: removed[index] ?? "",
      after: added[index] ?? "",
    });
  }
  const held = protections
    .filter((item) => revised.includes(item.text))
    .map((item) => ({ kind: item.kind, text: item.text }));
  return { blockId, unchanged, changed, held };
}

export function overlapHasScore(value: ExpressionChange): boolean {
  return Object.keys(value).some((key) => /rate|score|similarity|查重|检测率/i.test(key));
}
