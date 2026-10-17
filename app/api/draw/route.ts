import { failWithGate, jsonWithGate, openModelGate } from "@/lib/api/guard";
import { sanitizeDrawFields } from "@/lib/draw/sanitize";
import { LIMITS } from "@/lib/limits";
import { drawMessages, type CaptionLang, type DrawMode } from "@/lib/prompts/draw";
import { completeJson } from "@/lib/providers/openrouter";
import { drawJsonSchema, drawSchema } from "@/lib/schemas/outputs";

function asMode(value: unknown): DrawMode | null {
  if (value === "research" || value === "chart" || value === "mechanism") return value;
  return null;
}

function asCaptionLang(value: unknown): CaptionLang | null {
  if (value === "zh" || value === "en" || value === "both") return value;
  return null;
}

function asOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    brief?: unknown;
    mode?: unknown;
    targetType?: unknown;
    journalStyle?: unknown;
    captionLang?: unknown;
    evidence?: unknown;
    model?: unknown;
  } | null;

  const brief = asOptionalString(body?.brief);
  if (!brief) {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "请先描述要画的图。" }, { status: 400 });
  }

  const evidence = asOptionalString(body?.evidence);
  const targetType = asOptionalString(body?.targetType);
  const journalStyle = asOptionalString(body?.journalStyle);
  const mode = asMode(body?.mode);
  const captionLang = asCaptionLang(body?.captionLang);

  const totalChars = [...`${brief}${evidence}${targetType}${journalStyle}`.replace(/\s/g, "")].length;
  if (totalChars > LIMITS.translateChars) {
    return Response.json({ ok: false, code: "TOO_LONG", message: "说明过长。请先压缩到要点。" }, { status: 413 });
  }

  const requestedModel = typeof body?.model === "string" ? body.model : null;
  const gated = openModelGate(request, "deep", requestedModel);
  if (!gated.ok) return gated.response;
  const { ctx } = gated;

  const messages = drawMessages({
    brief,
    mode,
    targetType: targetType || null,
    journalStyle: journalStyle || null,
    captionLang,
    evidence: evidence || null,
  });

  const result = await completeJson({
    model: ctx.model,
    key: ctx.key,
    baseUrl: ctx.baseUrl,
    enableThinking: false,
    schemaName: "pagebond_draw",
    schema: drawJsonSchema,
    system: messages.system,
    user: messages.user,
    maxTokens: 4096,
  });

  if (!result.ok) {
    return failWithGate(ctx, result, result.code === "TIMEOUT" ? 504 : 502);
  }

  const parsed = drawSchema.safeParse(result.json);
  if (!parsed.success) {
    return failWithGate(
      ctx,
      { ok: false, code: "BAD_RESPONSE", message: "模型没有返回可用的绘图方案。" },
      502,
    );
  }

  const cleaned = sanitizeDrawFields({
    ...parsed.data,
    evidenceMapping: evidence ? parsed.data.evidenceMapping : [],
  });

  return jsonWithGate(
    ctx,
    {
      ok: true,
      ...cleaned,
      model: result.model,
      usage: result.usage,
    },
    undefined,
    result.usage,
  );
}
