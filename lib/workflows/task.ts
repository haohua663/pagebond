export type TaskStatus =
  | "pending"
  | "running"
  | "review"
  | "partial"
  | "done"
  | "failed"
  | "cancelled";

export interface TaskIdentity {
  paperId: string;
  taskId: string;
  generation: number;
}

export interface Checkpoint {
  paperId: string;
  taskId: string;
  generation: number;
  chunkIndex: number;
  blockIds: string[];
  status: TaskStatus;
  updatedAt: number;
}

export interface IncomingWork {
  paperId: string;
  taskId: string;
  generation: number;
}

/** A late response from a previous paper or generation must not land. */
export function acceptIncoming(current: TaskIdentity, incoming: IncomingWork): boolean {
  return (
    current.paperId === incoming.paperId &&
    current.taskId === incoming.taskId &&
    current.generation === incoming.generation
  );
}

export function taskFingerprint(input: {
  confirmedText: string;
  model: string;
  promptVersion: string;
  level: string;
  language: string;
}): string {
  return [input.model, input.promptVersion, input.level, input.language, input.confirmedText].join("\u0001");
}

export function nextRetryDelay(attempt: number, status: number): number | null {
  if (status !== 429 && status !== 503 && status !== 502) return null;
  if (attempt >= 2) return null;
  return 1000 * 2 ** attempt;
}

export const TIMEOUT_BILLING_NOTE = "这次超时。如果重试，可能重复计费。";
