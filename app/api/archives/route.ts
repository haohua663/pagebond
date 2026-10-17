import { NextResponse } from "next/server";
import {
  isArchiveDbConfigured,
  listPapersFromDb,
  upsertPaperToDb,
} from "@/lib/storage/archive-server";
import type { PaperRecord } from "@/lib/storage/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isArchiveDbConfigured()) {
    return NextResponse.json({
      ok: true,
      source: "unavailable",
      records: [] as unknown[],
      message: "DATABASE_URL 未配置；存档搜索使用本机 IndexedDB。",
    });
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  try {
    const records = await listPapersFromDb(q);
    if (records === null) {
      return NextResponse.json({
        ok: true,
        source: "unavailable",
        records: [],
        message: "数据库不可用；请检查 Postgres。",
      });
    }
    return NextResponse.json({ ok: true, source: "postgres", records, query: q });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        source: "error",
        records: [],
        message: error instanceof Error ? error.message : "archives list failed",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (!isArchiveDbConfigured()) {
    return NextResponse.json(
      { ok: false, source: "unavailable", message: "DATABASE_URL 未配置" },
      { status: 503 },
    );
  }
  try {
    const body = (await request.json()) as { record?: PaperRecord; userId?: string | null };
    if (!body.record?.id || (body.record.mode !== "revise" && body.record.mode !== "conceive")) {
      return NextResponse.json({ ok: false, message: "invalid record" }, { status: 400 });
    }
    await upsertPaperToDb(body.record, body.userId ?? null);
    return NextResponse.json({ ok: true, source: "postgres", id: body.record.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "save failed" },
      { status: 503 },
    );
  }
}
