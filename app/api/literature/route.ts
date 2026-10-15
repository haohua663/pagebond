import { LIMITS } from "@/lib/limits";
import { searchOpenAlex } from "@/lib/providers/openalex";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { queries?: unknown; document?: unknown; text?: unknown } | null;
  if (!body || "document" in body || "text" in body || "blocks" in body) {
    return Response.json({ ok: false, message: "文献检索只接受检索词，不接受正文。" }, { status: 400 });
  }
  if (!Array.isArray(body.queries) || body.queries.some((item) => typeof item !== "string")) {
    return Response.json({ ok: false, message: "需要检索词数组。" }, { status: 400 });
  }
  const queries = body.queries.map((item) => item.trim()).filter(Boolean).slice(0, LIMITS.maxLiteratureQueries);
  if (!queries.length) return Response.json({ ok: false, message: "检索词是空的。" }, { status: 400 });
  if (queries.some((item) => item.length > 180)) {
    return Response.json({ ok: false, message: "检索词过长。请改成关键词，不要粘贴正文。" }, { status: 400 });
  }
  const results = [];
  for (const query of queries) {
    results.push(
      await searchOpenAlex(query, {
        apiKey: process.env.OPENALEX_API_KEY,
        perPage: LIMITS.literaturePerQuery,
      }),
    );
  }
  return Response.json({ ok: true, results });
}
