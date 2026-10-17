import { NextResponse } from "next/server";
import { deletePaperFromDb, getPaperContentFromDb, isArchiveDbConfigured } from "@/lib/storage/archive-server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isArchiveDbConfigured()) {
    return NextResponse.json({ ok: false, source: "unavailable" }, { status: 503 });
  }
  const { id } = await context.params;
  try {
    const record = await getPaperContentFromDb(id);
    if (!record) return NextResponse.json({ ok: false, message: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, source: "postgres", record });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "get failed" },
      { status: 503 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isArchiveDbConfigured()) {
    return NextResponse.json({ ok: false, source: "unavailable" }, { status: 503 });
  }
  const { id } = await context.params;
  try {
    await deletePaperFromDb(id);
    return NextResponse.json({ ok: true, source: "postgres", id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "delete failed" },
      { status: 503 },
    );
  }
}
