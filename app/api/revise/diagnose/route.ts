import { filterRealQuotes } from "@/lib/analysis/suggestions";
import type { Suggestion } from "@/lib/analysis/suggestions";
import { failWithGate, jsonWithGate, openModelGate } from "@/lib/api/guard";
import { asBlocks, asOptions, tooLong, tooLongMessage } from "@/lib/api/respond";
import { diagnoseMessages } from "@/lib/prompts/revise";
import { completeJson } from "@/lib/providers/openrouter";
import { diagnoseJsonSchema, diagnoseSchema } from "@/lib/schemas/outputs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { blocks?: unknown; options?: unknown; model?: unknown } | null;
  const blocks = asBlocks(body?.blocks);
  if (!blocks) return Response.json({ ok: false, code: "BAD_REQUEST", message: "需要先确认输入版。" }, { status: 400 });
  if (tooLong(blocks)) return Response.json({ ok: false, code: "TOO_LONG", message: tooLongMessage() }, { status: 413 });
  const requestedModel = typeof body?.model === "string" ? body.model : null;
  const gated = openModelGate(request, "deep", requestedModel);
  if (!gated.ok) return gated.response;
  const { ctx } = gated;
  const options = asOptions(body?.options);
  const messages = diagnoseMessages(blocks, options);
  const result = await completeJson({
    model: ctx.model,
    key: ctx.key,
    baseUrl: ctx.baseUrl,
    enableThinking: ctx.enableThinking,
    schemaName: "pagebond_diagnose",
    schema: diagnoseJsonSchema,
    system: messages.system,
    user: messages.user,
  });
  if (!result.ok) {
    return failWithGate(ctx, result, result.code === "TIMEOUT" ? 504 : 502);
  }
  const parsed = diagnoseSchema.safeParse(result.json);
  if (!parsed.success) {
    return failWithGate(
      ctx,
      { ok: false, code: "BAD_RESPONSE", message: "诊断结构没有通过校验，没有写入正式结果。" },
      502,
    );
  }
  const suggestions: Suggestion[] = filterRealQuotes(
    blocks,
    parsed.data.suggestions.map((item) => ({ ...item, origin: "model" as const })),
  );
  return jsonWithGate(
    ctx,
    {
      ok: true,
      model: result.model,
      usage: result.usage,
      researchQuestion: parsed.data.researchQuestion,
      terms: parsed.data.terms,
      facts: parsed.data.facts,
      summary: parsed.data.summary,
      suggestions,
      droppedSuggestions: parsed.data.suggestions.length - suggestions.length,
    },
    undefined,
    result.usage,
  );
}
