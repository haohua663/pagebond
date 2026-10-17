import { failWithGate, jsonWithGate, openModelGate } from "@/lib/api/guard";
import { LIMITS } from "@/lib/limits";
import {
  translateMessages,
  translateSegmentMessages,
  type TranslateDirection,
} from "@/lib/prompts/translate";
import { completeJson } from "@/lib/providers/openrouter";
import {
  translateJsonSchema,
  translateSchema,
  translateSegmentsJsonSchema,
  translateSegmentsSchema,
} from "@/lib/schemas/outputs";
import { batchTranslateSegments } from "@/lib/translate/segments";

const MAX_CHARS = LIMITS.translateChars;
/** Source chars per model batch — keeps completion under maxTokens. */
const BATCH_CHARS = 2_500;
const BATCH_MAX_TOKENS = 8_192;

function asDirection(value: unknown): TranslateDirection {
  if (value === "en-zh" || value === "zh-en" || value === "auto") return value;
  return "auto";
}

function asSegments(value: unknown): { id: string; text: string }[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const out: { id: string; text: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id.trim() : "";
    const text = typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text.trim() : "";
    if (id && text) out.push({ id, text });
  }
  return out.length ? out : null;
}

function charCount(value: string): number {
  return [...value.replace(/\s/g, "")].length;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
    segments?: unknown;
    direction?: unknown;
    glossary?: unknown;
    model?: unknown;
  } | null;

  const segments = asSegments(body?.segments);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!segments && !text) {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "没有可翻译的正文。" }, { status: 400 });
  }

  const measure = segments ? segments.map((s) => s.text).join("") : text;
  if (charCount(measure) > MAX_CHARS) {
    return Response.json(
      { ok: false, code: "TOO_LONG", message: "超过 6 万字上限。请先按章或按节拆开再译。" },
      { status: 413 },
    );
  }

  const direction = asDirection(body?.direction);
  const glossary = typeof body?.glossary === "string" ? body.glossary : "";
  const requestedModel = typeof body?.model === "string" ? body.model : null;

  const gated = openModelGate(request, "deep", requestedModel);
  if (!gated.ok) return gated.response;
  const { ctx } = gated;

  if (segments) {
    const batches = batchTranslateSegments(segments, BATCH_CHARS);
    const all: { id: string; translation: string }[] = [];
    let usedModel = ctx.model;
    let usage: { promptTokens: number | null; completionTokens: number | null } | null = null;
    let resolvedDir: "en-zh" | "zh-en" | null = null;

    for (const batch of batches) {
      const messages = translateSegmentMessages(batch, direction, glossary);
      if (!resolvedDir) resolvedDir = messages.resolved;
      const result = await completeJson({
        model: ctx.model,
        key: ctx.key,
        baseUrl: ctx.baseUrl,
        enableThinking: false,
        schemaName: "pagebond_translate_segments",
        schema: translateSegmentsJsonSchema,
        system: messages.system,
        user: messages.user,
        maxTokens: BATCH_MAX_TOKENS,
      });
      if (!result.ok) {
        if (all.length) {
          // Return partial progress so the client can keep already translated segments.
          return jsonWithGate(
            ctx,
            {
              ok: true,
              partial: true,
              segments: all,
              direction: resolvedDir ?? messages.resolved,
              model: usedModel,
              usage,
              message: result.message || "部分段落翻译失败，已返回已完成的段落。",
            },
            undefined,
            usage,
          );
        }
        return failWithGate(ctx, result, result.code === "TIMEOUT" ? 504 : 502);
      }
      usedModel = result.model;
      const spent = result.ok ? result.usage : null;
      if (spent) {
        usage = {
          promptTokens: (usage?.promptTokens ?? 0) + (spent.promptTokens ?? 0),
          completionTokens: (usage?.completionTokens ?? 0) + (spent.completionTokens ?? 0),
        };
      }
      const parsed = translateSegmentsSchema.safeParse(result.json);
      if (!parsed.success) {
        if (all.length) break;
        return failWithGate(
          ctx,
          { ok: false, code: "BAD_RESPONSE", message: "模型没有返回可用的分段译文。" },
          502,
        );
      }
      if (parsed.data.direction === "en-zh" || parsed.data.direction === "zh-en") {
        resolvedDir = parsed.data.direction;
      }
      all.push(...parsed.data.segments);
    }

    return jsonWithGate(
      ctx,
      {
        ok: true,
        segments: all,
        direction: resolvedDir ?? "en-zh",
        model: usedModel,
        usage,
      },
      undefined,
      usage,
    );
  }

  const messages = translateMessages(text, direction, glossary);
  const result = await completeJson({
    model: ctx.model,
    key: ctx.key,
    baseUrl: ctx.baseUrl,
    enableThinking: false,
    schemaName: "pagebond_translate",
    schema: translateJsonSchema,
    system: messages.system,
    user: messages.user,
    maxTokens: BATCH_MAX_TOKENS,
  });

  if (!result.ok) {
    return failWithGate(ctx, result, result.code === "TIMEOUT" ? 504 : 502);
  }

  const parsed = translateSchema.safeParse(result.json);
  if (!parsed.success) {
    const raw = result.json;
    let fallback = "";
    if (typeof raw === "string") fallback = raw;
    else if (raw && typeof raw === "object" && typeof (raw as { translation?: unknown }).translation === "string") {
      fallback = (raw as { translation: string }).translation;
    }
    if (!fallback.trim()) {
      return failWithGate(
        ctx,
        { ok: false, code: "BAD_RESPONSE", message: "模型没有返回可用译文。" },
        502,
      );
    }
    return jsonWithGate(
      ctx,
      {
        ok: true,
        translation: fallback.trim(),
        direction: messages.resolved,
        model: result.model,
        usage: result.usage,
      },
      undefined,
      result.usage,
    );
  }

  const resolved =
    parsed.data.direction === "en-zh" || parsed.data.direction === "zh-en"
      ? parsed.data.direction
      : messages.resolved;

  return jsonWithGate(
    ctx,
    {
      ok: true,
      translation: parsed.data.translation,
      direction: resolved,
      model: result.model,
      usage: result.usage,
    },
    undefined,
    result.usage,
  );
}
