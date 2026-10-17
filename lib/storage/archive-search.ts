import type { PaperRecord } from "@/lib/storage/types";

/** Build denormalized search haystack for Postgres ILIKE + client filter. */
export function paperSearchText(record: PaperRecord): string {
  const parts = [
    record.title,
    record.status,
    record.mode,
    record.rawExtractedText?.slice(0, 8000) || "",
    record.confirmed?.title || "",
    record.conceive?.requirementText || "",
    record.conceive?.notes || "",
  ];
  return parts.filter(Boolean).join("\n").toLowerCase();
}

export function filterPapersByQuery(records: PaperRecord[], query: string): PaperRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return records;
  return records.filter((record) => paperSearchText(record).includes(q));
}

export type ArchiveListItem = {
  id: string;
  title: string;
  kind: "revise" | "conceive";
  status: string;
  updatedAt: number;
  createdAt: number;
};

export function paperToListItem(record: PaperRecord): ArchiveListItem {
  return {
    id: record.id,
    title: record.title || "未命名",
    kind: record.mode,
    status: record.status,
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
  };
}
