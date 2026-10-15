import { LIMITS } from "@/lib/limits";
import { resolveCredential, readSessionKey } from "@/lib/providers/credentials";
import type { DocumentBlock, IntakeOptions } from "@/lib/document/types";
import { emptyOptions } from "@/lib/document/types";

export function noKeyBody() {
  return {
    ok: false as const,
    code: "NO_KEY" as const,
    message: "没有可用密钥。未调用模型。可以继续使用本地解析、对照和存档。",
  };
}

export function credentialOrNull(request: Request) {
  return resolveCredential(readSessionKey(request));
}

export function asBlocks(value: unknown): DocumentBlock[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const blocks: DocumentBlock[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const block = item as DocumentBlock;
    if (typeof block.id !== "string" || typeof block.text !== "string" || typeof block.kind !== "string") return null;
    blocks.push(block);
  }
  return blocks;
}

export function asOptions(value: unknown): IntakeOptions {
  const base = emptyOptions();
  if (!value || typeof value !== "object") return base;
  const options = value as Partial<IntakeOptions>;
  return {
    ...base,
    ...options,
    lockedBlockIds: Array.isArray(options.lockedBlockIds) ? options.lockedBlockIds.map(String) : [],
    lockedTerms: Array.isArray(options.lockedTerms) ? options.lockedTerms.map(String) : [],
  };
}

export function tooLong(blocks: { text: string }[]): boolean {
  const chars = blocks.reduce((sum, block) => sum + [...block.text.replace(/\s/g, "")].length, 0);
  return chars > LIMITS.targetChars;
}

export function tooLongMessage() {
  return "超过 4 万字的目标上限。页面没有截断，也没有送去改写。请先按章拆开。";
}
