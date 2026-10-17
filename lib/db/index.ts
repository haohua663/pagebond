import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type PagebondDb = PostgresJsDatabase<typeof schema>;

let cached: { url: string; sql: ReturnType<typeof postgres>; db: PagebondDb } | null = null;

export function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : null;
}

/** Returns null when DATABASE_URL is unset — callers must fall back to IndexedDB. */
export function getDb(): PagebondDb | null {
  const url = getDatabaseUrl();
  if (!url) return null;
  if (cached?.url === url) return cached.db;
  const sql = postgres(url, { max: 4, idle_timeout: 20, connect_timeout: 5 });
  const db = drizzle(sql, { schema });
  cached = { url, sql, db };
  return db;
}

export { schema };
