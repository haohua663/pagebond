import { documentChars } from "@/lib/document/stats";
import { KNOWN_MODEL, LIMITS } from "@/lib/limits";
import type { DocumentBlock } from "@/lib/document/types";

export interface Chunk {
  index: number;
  blocks: DocumentBlock[];
  chars: number;
  neighborIds: string[];
}

export interface ChunkPlan {
  chunks: Chunk[];
  overTarget: boolean;
  overVerified: boolean;
  /** A single block is larger than the output budget. Nothing is sliced apart. */
  unsplittable: DocumentBlock[];
}

function estimateTokens(chars: number): number {
  return Math.ceil(chars / 1.4);
}

export function planChunks(blocks: DocumentBlock[], modelId: string = KNOWN_MODEL.id): ChunkPlan {
  const known = modelId === KNOWN_MODEL.id ? KNOWN_MODEL : null;
  const context = known?.contextLength ?? 32_000;
  const maxOut = known?.maxCompletionTokens ?? 4_000;
  const instructionAndMargin = Math.floor(context * 0.2) + 2_500;
  const tokenBudget = Math.max(400, context - instructionAndMargin - Math.min(maxOut, 8_000));
  const charBudget = Math.min(LIMITS.chunkSourceChars, Math.floor(tokenBudget * 1.4));

  const chunks: Chunk[] = [];
  const unsplittable: DocumentBlock[] = [];
  let current: DocumentBlock[] = [];
  let currentChars = 0;

  const flush = () => {
    if (!current.length) return;
    const previous = blocks[current[0].order - 1];
    const next = blocks[current[current.length - 1].order + 1];
    chunks.push({
      index: chunks.length,
      blocks: current,
      chars: currentChars,
      neighborIds: [previous?.id, next?.id].filter((id): id is string => Boolean(id)),
    });
    current = [];
    currentChars = 0;
  };

  for (const block of blocks) {
    const size = documentChars([block]);
    if (size > charBudget) {
      flush();
      unsplittable.push(block);
      continue;
    }
    const headingBreak = block.kind === "heading" && currentChars > charBudget * 0.45;
    if (current.length && (currentChars + size > charBudget || headingBreak)) flush();
    current.push(block);
    currentChars += size;
  }
  flush();

  const total = documentChars(blocks);
  return {
    chunks,
    overTarget: total > LIMITS.targetChars,
    overVerified: total > LIMITS.verifiedChars,
    unsplittable,
  };
}
