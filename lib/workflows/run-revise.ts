import type { BlockCheck } from "@/lib/analysis/validate";
import type { ChunkPlan } from "@/lib/document/chunk";
import type { Checkpoint, TaskIdentity, TaskStatus } from "@/lib/workflows/task";
import { acceptIncoming } from "@/lib/workflows/task";

export async function runRewriteChunks(input: {
  plan: ChunkPlan;
  identity: TaskIdentity;
  current: () => TaskIdentity;
  cancelled: () => boolean;
  rewriteChunk: (chunkIndex: number) => Promise<{ checks: BlockCheck[]; integrity: "passed" | "failed" }>;
  onCheckpoint: (checkpoint: Checkpoint, checks: BlockCheck[]) => Promise<void>;
}): Promise<{ checks: BlockCheck[]; status: TaskStatus }> {
  const checks: BlockCheck[] = [];
  let failed = 0;
  let finished = 0;
  for (const chunk of input.plan.chunks) {
    if (input.cancelled()) {
      return { checks, status: finished ? "partial" : "cancelled" };
    }
    if (!acceptIncoming(input.current(), input.identity)) {
      return { checks, status: "cancelled" };
    }
    try {
      const result = await input.rewriteChunk(chunk.index);
      if (!acceptIncoming(input.current(), input.identity)) return { checks, status: "cancelled" };
      checks.push(...result.checks);
      const chunkFailed = result.integrity === "failed";
      if (chunkFailed) failed += 1;
      finished += 1;
      await input.onCheckpoint(
        {
          paperId: input.identity.paperId,
          taskId: input.identity.taskId,
          generation: input.identity.generation,
          chunkIndex: chunk.index,
          blockIds: chunk.blocks.map((block) => block.id),
          status: chunkFailed ? "failed" : "done",
          updatedAt: Date.now(),
        },
        result.checks,
      );
    } catch {
      failed += 1;
      const reverted: BlockCheck[] = chunk.blocks.map((block) => ({
        id: block.id,
        status: "reverted",
        reasons: ["这一块请求失败，已保留原段。"],
        text: block.text,
        suggestedText: block.text,
        changed: false,
      }));
      checks.push(...reverted);
      if (acceptIncoming(input.current(), input.identity)) {
        await input.onCheckpoint(
          {
            paperId: input.identity.paperId,
            taskId: input.identity.taskId,
            generation: input.identity.generation,
            chunkIndex: chunk.index,
            blockIds: chunk.blocks.map((block) => block.id),
            status: "failed",
            updatedAt: Date.now(),
          },
          reverted,
        );
      }
    }
  }
  if (input.plan.unsplittable.length) {
    checks.push(
      ...input.plan.unsplittable.map((block) => ({
        id: block.id,
        status: "needs-review" as const,
        reasons: ["这一段超过单块预算，没有截断，也没有送去改写。"],
        text: block.text,
        suggestedText: block.text,
        changed: false,
      })),
    );
    failed += 1;
  }
  if (!finished && failed) return { checks, status: "failed" };
  if (failed) return { checks, status: "partial" };
  return { checks, status: "review" };
}
