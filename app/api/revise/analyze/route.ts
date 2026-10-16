import { filterRealQuotes } from "@/lib/analysis/suggestions";
import type { Suggestion } from "@/lib/analysis/suggestions";
import { failWithGate, jsonWithGate, openModelGate } from "@/lib/api/guard";
import { asBlocks, asOptions, tooLong, tooLongMessage } from "@/lib/api/respond";
import { analyzeMessages } from "@/lib/prompts/revise";
import { completeJson } from "@/lib/providers/openrouter";
import { analyzeJsonSchema, analyzeSchema } from "@/lib/schemas/outputs";

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
  const requestedModel = typeof body?.model === "string" ? body.model : null;
  const gated = openModelGate(request, "deep", requestedModel);
  if (!gated.ok) return gated.response;
  const { ctx } = gated;
  const options = asOptions(body?.options);
  const messages = analyzeMessages(original, current, options);
  const result = await completeJson({
    model: ctx.model,
    key: ctx.key,
    baseUrl: ctx.baseUrl,
    enableThinking: ctx.enableThinking,
    schemaName: "pagebond_analyze",
    schema: analyzeJsonSchema,
    system: messages.system,
    user: messages.user,
  });
  if (!result.ok) {
    return failWithGate(ctx, result, result.code === "TIMEOUT" ? 504 : 502);
  }
  const parsed = analyzeSchema.safeParse(result.json);
  if (!parsed.success) {
    return failWithGate(
      ctx,
      { ok: false, code: "BAD_RESPONSE", message: "当前稿分析没有通过校验，没有写入正式结果。" },
      502,
    );
  }
  const suggestions: Suggestion[] = filterRealQuotes(
    current,
    parsed.data.suggestions
      .filter((item) => item.version === "current-draft")
      .map((item) => ({ ...item, origin: "model" as const })),
  );
  return jsonWithGate(
    ctx,
    {
      ok: true,
      model: result.model,
      usage: result.usage,
      summary: parsed.data.summary,
      dimensions: parsed.data.dimensions,
      suggestions,
    },
    undefined,
    result.usage,
  );
}
