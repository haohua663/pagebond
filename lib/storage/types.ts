import type { Suggestion } from "@/lib/analysis/suggestions";
import type { BlockCheck } from "@/lib/analysis/validate";
import type { LiteratureQueryResult } from "@/lib/providers/openalex";
import type { DocumentBlock, IntakeOptions, ParsedDocument } from "@/lib/document/types";
import type { OutlineDraft, RequirementsBrief } from "@/lib/workflows/conceive";
import type { AcceptState } from "@/lib/workflows/revise";
import type { Checkpoint, TaskStatus } from "@/lib/workflows/task";

export interface AnalysisSnapshot {
  version: string;
  summary: string;
  dimensions: {
    id: string;
    conclusion: string;
    resolved: string[];
    remaining: string[];
    needsMaterial: string[];
  }[];
  suggestions: Suggestion[];
  origin: "local" | "model";
  model?: string;
  promptVersion?: string;
}

export interface PaperRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  mode: "revise" | "conceive";
  title: string;
  status: TaskStatus;
  configVersion: string;
  model: string;
  promptVersion: string;
  rawExtractedText: string;
  confirmed: ParsedDocument | null;
  options: IntakeOptions;
  suggestions: Suggestion[];
  accept: Record<string, AcceptState>;
  checks: BlockCheck[];
  currentBlocks: DocumentBlock[] | null;
  analysisOriginal: AnalysisSnapshot | null;
  analysisCurrent: AnalysisSnapshot | null;
  checkpoints: Checkpoint[];
  taskId: string;
  generation: number;
  conceive: {
    requirementText: string;
    notes: string;
    brief: RequirementsBrief | null;
    outline: OutlineDraft | null;
    literature: LiteratureQueryResult[];
    drafts?: Record<
      string,
      { heading: string; markdown: string; openGaps: string[]; citedIds: string[]; origin: "local" | "model" }
    >;
  } | null;
}

export function reminderForCount(count: number): string | null {
  if (count < 30) return null;
  return `存档已经有 ${count} 条。这只是整理提醒，不会阻止新的论文。`;
}
