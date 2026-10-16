import { filterRealQuotes } from "@/lib/analysis/suggestions";
import type { Suggestion } from "@/lib/analysis/suggestions";
import { asBlocks, asOptions, credentialOrNull, noKeyBody, tooLong, tooLongMessage } from "@/lib/api/respond";
import { DEFAULT_MODEL } from "@/lib/limits";
import { analyzeMessages } from "@/lib/prompts/revise";
import { completeJson } from "@/lib/providers/openrouter";
import { analyzeSchema } from "@/lib/schemas/outputs";

const analyzeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "dimensions", "suggestions"],
  properties: {
    summary: { type: "string" },
    dimensions: { type: "array", items: { type: "object" } },
    suggestions: { type: "array", items: { type: "object" } },
  },
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    original?: unknown;
    current?: unknown;
    options?: unknown;
    model?: unknown;
  } | null;
  const original = asBlocks(body?.original);
  const current = asBlocks(body?.current);
  if (!original || !current) {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "分析需要原稿和当前稿。" }, { status: 400 });
  }
  if (tooLong(original) || tooLong(current)) {
    return Response.json({ ok: false, code: "TOO_LONG", message: tooLongMessage() }, { status: 413 });
  }
  const credential = credentialOrNull(request);
  if (!credential.key) return Response.json(noKeyBody(), { status: 401 });
  const options = asOptions(body?.options);
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
  const messages = analyzeMessages(original, current, options);
  const result = await completeJson({
    model,
    key: credential.key,
    schemaName: "pagebond_analyze",
    schema: analyzeJsonSchema,
    system: messages.system,
    user: messages.user,
  });
  if (!result.ok) return Response.json(result, { status: result.code === "TIMEOUT" ? 504 : 502 });
  const parsed = analyzeSchema.safeParse(result.json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, code: "BAD_RESPONSE", message: "当前稿分析没有通过校验，没有写入正式结果。" },
      { status: 502 },
    );
  }
  const suggestions: Suggestion[] = filterRealQuotes(
    current,
    parsed.data.suggestions
      .filter((item) => item.version === "current-draft")
      .map((item) => ({ ...item, origin: "model" as const })),
  );
  return Response.json({
    ok: true,
    keySource: credential.source,
    model: result.model,
    usage: result.usage,
    summary: parsed.data.summary,
    dimensions: parsed.data.dimensions,
    suggestions,
  });
}
