import { describe, expect, it } from "vitest";
import { planChunks } from "@/lib/document/chunk";
import { parseProse } from "@/lib/document/structure";
import { MemoryArchive } from "@/lib/storage/memory";
import { toBackup, fromBackup } from "@/lib/storage/backup";
import type { PaperRecord } from "@/lib/storage/types";
import { acceptIncoming, nextRetryDelay, taskFingerprint } from "@/lib/workflows/task";
import { runRewriteChunks } from "@/lib/workflows/run-revise";
import { localOutline, localRequirements } from "@/lib/workflows/conceive";
import { LIMITS } from "@/lib/limits";

function record(partial: Partial<PaperRecord>): PaperRecord {
  return {
    id: "paper-a",
    createdAt: 1,
    updatedAt: 1,
    mode: "revise",
    title: "稿",
    status: "partial",
    configVersion: "1",
    model: "~openai/gpt-sol-latest",
    promptVersion: "2026-10-15.1",
    rawExtractedText: "原文",
    confirmed: null,
    options: {
      articleType: "other",
      purpose: "",
      language: "zh",
      level: "conservative",
      scopeNote: "",
      lockedBlockIds: [],
      lockedTerms: [],
    },
    suggestions: [],
    accept: {},
    checks: [],
    currentBlocks: null,
    analysisOriginal: null,
    analysisCurrent: null,
    checkpoints: [],
    taskId: "task-1",
    generation: 1,
    conceive: null,
    ...partial,
  };
}

describe("tasks and checkpoints", () => {
  it("rejects a late response from another paper or generation", () => {
    const current = { paperId: "paper-b", taskId: "task-2", generation: 2 };
    expect(acceptIncoming(current, { paperId: "paper-a", taskId: "task-1", generation: 1 })).toBe(false);
    expect(acceptIncoming(current, { paperId: "paper-b", taskId: "task-2", generation: 1 })).toBe(false);
    expect(acceptIncoming(current, current)).toBe(true);
  });

  it("starts a new fingerprint when the model or confirmed text changes", () => {
    const base = {
      confirmedText: "甲",
      model: "~openai/gpt-sol-latest",
      promptVersion: "2026-10-15.1",
      level: "conservative",
      language: "zh",
    };
    expect(taskFingerprint(base)).not.toBe(taskFingerprint({ ...base, model: "other/model" }));
    expect(taskFingerprint(base)).not.toBe(taskFingerprint({ ...base, confirmedText: "乙" }));
  });

  it("backs off at most twice", () => {
    expect(nextRetryDelay(0, 429)).toBe(1000);
    expect(nextRetryDelay(1, 429)).toBe(2000);
    expect(nextRetryDelay(2, 429)).toBeNull();
  });

  it("does not write a cancelled generation into the new paper", async () => {
    const store = new MemoryArchive();
    const paragraph = "段落".repeat(300);
    const doc = parseProse(Array.from({ length: 6 }, (_, index) => `${paragraph}${index}。`).join("\n\n"));
    const plan = planChunks(doc.blocks);
    expect(plan.chunks.length).toBeGreaterThan(1);
    const identity = { paperId: "paper-a", taskId: "task-1", generation: 1 };
    let current = { ...identity };
    const saved: string[] = [];
    await runRewriteChunks({
      plan,
      identity,
      current: () => current,
      cancelled: () => false,
      rewriteChunk: async () => {
        current = { paperId: "paper-b", taskId: "task-2", generation: 2 };
        return { checks: [], integrity: "passed" };
      },
      onCheckpoint: async (checkpoint) => {
        saved.push(checkpoint.paperId);
      },
    });
    expect(saved).toEqual([]);
    await store.put(record({ id: "paper-b", generation: 2, checkpoints: [] }));
    const stored = await store.get("paper-b");
    expect(stored?.checkpoints).toEqual([]);
  });

  it("keeps an outline when literature would fail", () => {
    const brief = localRequirements("题目：课堂反馈\n字数不少于 8000 字。\n不得编造访谈。", "只用课程发的 12 份稿件。");
    const outline = localOutline(brief, { directionTitle: brief.directions[0]?.title });
    expect(outline.sections.length).toBeGreaterThan(0);
    expect(JSON.stringify(outline)).not.toMatch(/10\.\d{4}\//);
    expect(outline.literatureQueries.length).toBeGreaterThan(0);
    expect(outline.literatureQueries.join(" ").length).toBeLessThan(LIMITS.targetChars);
  });
});

describe("backup", () => {
  it("strips secrets and round-trips records", () => {
    const dirty = record({ id: "paper-a" }) as PaperRecord & { key?: string };
    dirty.key = "sk-secret";
    const backup = toBackup([dirty], new Date("2026-10-15T00:00:00.000Z"));
    expect(JSON.stringify(backup)).not.toContain("sk-secret");
    const restored = fromBackup(backup);
    expect(restored.error).toBeNull();
    expect(restored.records[0].id).toBe("paper-a");
    expect(restored.records[0].rawExtractedText).toBe("原文");
  });
});
