import type { PaperRecord } from "@/lib/storage/types";

const SECRET_KEYS = ["key", "apiKey", "api_key", "OPENROUTER_API_KEY", "authorization", "sessionKey"];

export interface BackupFile {
  app: "yeyuan";
  version: 1;
  exportedAt: string;
  records: PaperRecord[];
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => scrub(item));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEYS.includes(key)) continue;
    output[key] = scrub(item);
  }
  return output;
}

export function toBackup(records: PaperRecord[], now = new Date()): BackupFile {
  return {
    app: "yeyuan",
    version: 1,
    exportedAt: now.toISOString(),
    records: scrub(records) as PaperRecord[],
  };
}

export function fromBackup(input: unknown): { records: PaperRecord[]; error: string | null } {
  if (!input || typeof input !== "object") return { records: [], error: "备份不是可识别的文件。" };
  const file = input as Partial<BackupFile>;
  if (file.app !== "yeyuan" || file.version !== 1 || !Array.isArray(file.records)) {
    return { records: [], error: "备份版本无法读取。" };
  }
  const records = file.records.filter((record) => record && typeof record.id === "string" && record.mode);
  return { records: scrub(records) as PaperRecord[], error: null };
}
