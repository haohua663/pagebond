import type { PaperRecord } from "@/lib/storage/types";

export class MemoryArchive {
  private records = new Map<string, PaperRecord>();
  failWrites = false;

  async list(): Promise<PaperRecord[]> {
    return [...this.records.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<PaperRecord | null> {
    return this.records.get(id) ?? null;
  }

  async put(record: PaperRecord): Promise<void> {
    if (this.failWrites) throw new Error("写入失败");
    this.records.set(record.id, structuredClone(record));
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }
}

export async function saveCheckpoint(store: MemoryArchive, record: PaperRecord): Promise<PaperRecord> {
  const existing = await store.get(record.id);
  if (existing && existing.generation !== record.generation && existing.id === record.id) {
    const foreign = record.checkpoints.filter((item) => item.generation !== record.generation || item.paperId !== record.id);
    if (foreign.length) {
      throw new Error("检查点与当前稿不一致");
    }
  }
  await store.put(record);
  return record;
}
