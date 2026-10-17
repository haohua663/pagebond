import { jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const paperKindEnum = pgEnum("paper_kind", ["revise", "conceive"]);

/** Demo / future auth users. Guest papers keep userId null. */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Server-side archive copy of PaperRecord JSON.
 * IndexedDB remains the offline source of truth; Postgres enables search when available.
 */
export const papers = pgTable("papers", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull().default(""),
  kind: paperKindEnum("kind").notNull(),
  status: varchar("status", { length: 64 }).notNull().default(""),
  /** Full PaperRecord blob for open/restore */
  content: jsonb("content").notNull(),
  /** Denormalized haystack for ILIKE search (title + raw text + status) */
  searchText: text("search_text").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbPaper = typeof papers.$inferSelect;
export type DbUser = typeof users.$inferSelect;
