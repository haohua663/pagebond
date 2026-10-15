import type { BlockCheck } from "@/lib/analysis/validate";
import { contentVersion } from "@/lib/analysis/version";
import type { DocumentBlock } from "@/lib/document/types";

export type AcceptState = "pending" | "accepted" | "reverted" | "manual";

export function currentFromChecks(
  original: DocumentBlock[],
  checks: BlockCheck[],
  accept: Record<string, AcceptState>,
): DocumentBlock[] {
  const byId = new Map(checks.map((check) => [check.id, check]));
  return original.map((block) => {
    const check = byId.get(block.id);
    const state = accept[block.id] ?? "pending";
    if (!check) return block;
    if (state === "reverted") return { ...block, text: block.text };
    if (state === "accepted" && check.status !== "reverted") {
      return { ...block, text: check.suggestedText };
    }
    if (state === "manual") return block;
    if (check.status === "passed" && state === "accepted") {
      return { ...block, text: check.suggestedText };
    }
    return block;
  });
}

export function acceptPassed(
  checks: BlockCheck[],
  accept: Record<string, AcceptState>,
): Record<string, AcceptState> {
  const next = { ...accept };
  for (const check of checks) {
    if (check.status === "passed" && check.changed && next[check.id] !== "manual" && next[check.id] !== "reverted") {
      next[check.id] = "accepted";
    }
  }
  return next;
}

export function draftBlocks(
  original: DocumentBlock[],
  checks: BlockCheck[],
  accept: Record<string, AcceptState>,
  manual: Record<string, string>,
): DocumentBlock[] {
  const byId = new Map(checks.map((check) => [check.id, check]));
  return original.map((block) => {
    const state = accept[block.id] ?? "pending";
    if (state === "manual" && manual[block.id] !== undefined) {
      return { ...block, text: manual[block.id] };
    }
    if (state === "accepted") {
      const check = byId.get(block.id);
      if (check && check.status !== "reverted") return { ...block, text: check.suggestedText };
    }
    return block;
  });
}

export function analysisBinding(blocks: DocumentBlock[], versionAtAnalysis: string): { stale: boolean; version: string } {
  const version = contentVersion(blocks);
  return { version, stale: version !== versionAtAnalysis };
}

export function idsPreserved(original: DocumentBlock[], draft: DocumentBlock[]): boolean {
  if (original.length !== draft.length) return false;
  return original.every((block, index) => block.id === draft[index]?.id);
}
