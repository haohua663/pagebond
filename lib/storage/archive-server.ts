/**
 * Optional Postgres mirror for archives.
 *
 * Choice (Phase Postgres+搜索):
 * - IndexedDB remains the offline source of truth for revise/conceive/desk.
 * - When DATABASE_URL is set and healthy, we dual-write PaperRecord JSON to `papers`
 *   and allow server search via /api/archives.
 * - Guest rows keep userId null; demo-login email can later map to `users`.
 * - If Postgres is down/missing, UI search still filters IndexedDB locally.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { paperSearchText, type ArchiveListItem } from "@/lib/storage/archive-search";
import type { PaperRecord } from "@/lib/storage/types";

export function isArchiveDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export async function upsertPaperToDb(record: PaperRecord, userId?: string | null): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const now = new Date(record.updatedAt || Date.now());
  const created = new Date(record.createdAt || Date.now());
  await db
    .insert(schema.papers)
    .values({
      id: record.id,
      userId: userId || null,
      title: record.title || "",
      kind: record.mode,
      status: String(record.status || ""),
      content: record,
      searchText: paperSearchText(record),
      createdAt: created,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.papers.id,
      set: {
        title: record.title || "",
        kind: record.mode,
        status: String(record.status || ""),
        content: record,
        searchText: paperSearchText(record),
        updatedAt: now,
        userId: userId || null,
      },
    });
  return true;
}

export async function deletePaperFromDb(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  await db.delete(schema.papers).where(eq(schema.papers.id, id));
  return true;
}

export async function listPapersFromDb(query = ""): Promise<ArchiveListItem[] | null> {
  const db = getDb();
  if (!db) return null;
  const q = query.trim().toLowerCase();
  const rows = q
    ? await db
        .select({
          id: schema.papers.id,
          title: schema.papers.title,
          kind: schema.papers.kind,
          status: schema.papers.status,
          updatedAt: schema.papers.updatedAt,
          createdAt: schema.papers.createdAt,
        })
        .from(schema.papers)
        .where(sql`${schema.papers.searchText} ILIKE ${"%" + q + "%"}`)
        .orderBy(desc(schema.papers.updatedAt))
        .limit(100)
    : await db
        .select({
          id: schema.papers.id,
          title: schema.papers.title,
          kind: schema.papers.kind,
          status: schema.papers.status,
          updatedAt: schema.papers.updatedAt,
          createdAt: schema.papers.createdAt,
        })
        .from(schema.papers)
        .orderBy(desc(schema.papers.updatedAt))
        .limit(100);

  return rows.map((row) => ({
    id: row.id,
    title: row.title || "未命名",
    kind: row.kind,
    status: row.status,
    updatedAt: row.updatedAt.getTime(),
    createdAt: row.createdAt.getTime(),
  }));
}

export async function getPaperContentFromDb(id: string): Promise<PaperRecord | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(schema.papers).where(eq(schema.papers.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return row.content as PaperRecord;
}
