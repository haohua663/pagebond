"use client";

import type { PaperRecord } from "@/lib/storage/types";

/** Best-effort mirror to Postgres. Never throws into the desk flow. */
export async function syncPaperToServer(record: PaperRecord): Promise<void> {
  try {
    await fetch("/api/archives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record }),
    });
  } catch {
    /* offline / no DB — IndexedDB already saved */
  }
}

export async function syncPaperDeleteToServer(id: string): Promise<void> {
  try {
    await fetch(`/api/archives/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
}
