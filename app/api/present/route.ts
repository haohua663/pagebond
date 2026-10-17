import { failWithGate, jsonWithGate, openModelGate } from "@/lib/api/guard";
import { LIMITS } from "@/lib/limits";
import { buildDeckHtml, type DeckVisual, type DeckVisualItem } from "@/lib/present/deck-html";
import { presentMessages, scrubPresentCopy } from "@/lib/prompts/present";
import { completeJson } from "@/lib/providers/openrouter";
import { presentJsonSchema, presentSchema } from "@/lib/schemas/outputs";

function asOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function scrubVisual(raw: unknown): DeckVisual | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as {
    type?: unknown;
    metric?: unknown;
    caption?: unknown;
    items?: unknown;
  };
  const items: DeckVisualItem[] = [];
  if (Array.isArray(v.items)) {
    for (const item of v.items) {
      if (!item || typeof item !== "object") continue;
      const row = item as { label?: unknown; value?: unknown };
      const label = typeof row.label === "string" ? scrubPresentCopy(row.label) : "";
      if (!label) continue;
      const value = typeof row.value === "number" && Number.isFinite(row.value) ? row.value : undefined;
      items.push({ label, value });
    }
  }
  return {
    type: typeof v.type === "string" ? v.type : undefined,
    metric: typeof v.metric === "string" ? scrubPresentCopy(v.metric) : undefined,
    caption: typeof v.caption === "string" ? scrubPresentCopy(v.caption) : undefined,
    items,
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    source?: unknown;
    talkMinutes?: unknown;
    audience?: unknown;
    model?: unknown;
  } | null;

  const source = asOptionalString(body?.source);
  if (!source) {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "请先粘贴摘要或提纲。" }, { status: 400 });
  }

  const audience = asOptionalString(body?.audience);
  const talkMinutes = asMinutes(body?.talkMinutes);
  const totalChars = [...`${source}${audience}`.replace(/\s/g, "")].length;
  if (totalChars > LIMITS.translateChars) {
    return Response.json({ ok: false, code: "TOO_LONG", message: "材料过长。请先压缩到摘要或提纲。" }, { status: 413 });
  }

  const requestedModel = typeof body?.model === "string" ? body.model : null;
  const gated = openModelGate(request, "deep", requestedModel);
  if (!gated.ok) return gated.response;
  const { ctx } = gated;

  const messages = presentMessages({ source, talkMinutes, audience: audience || null });
  const result = await completeJson({
    model: ctx.model,
    key: ctx.key,
    baseUrl: ctx.baseUrl,
    enableThinking: false,
    schemaName: "pagebond_present",
    schema: presentJsonSchema,
    system: messages.system,
    user: messages.user,
    maxTokens: 4096,
  });

  if (!result.ok) {
    return failWithGate(ctx, result, result.code === "TIMEOUT" ? 504 : 502);
  }

  const parsed = presentSchema.safeParse(result.json);
  if (!parsed.success) {
    return failWithGate(
      ctx,
      { ok: false, code: "BAD_RESPONSE", message: "模型没有返回可用的演示大纲。" },
      502,
    );
  }

  const data = parsed.data;
  const outline = data.outline.map((slide, index) => ({
    ...slide,
    id: slide.id || `s${index + 1}`,
    title: scrubPresentCopy(slide.title),
    bullets: (slide.bullets || []).map(scrubPresentCopy).filter(Boolean),
    notes: scrubPresentCopy(slide.notes || ""),
    kind: slide.kind,
    layout: typeof slide.layout === "string" ? slide.layout : undefined,
    visual: scrubVisual(slide.visual),
  }));

  const html = buildDeckHtml({
    title: scrubPresentCopy(data.title),
    slides: outline,
    talkMinutes: data.talkMinutes || talkMinutes || undefined,
  });

  return jsonWithGate(
    ctx,
    {
      ok: true,
      title: scrubPresentCopy(data.title),
      talkMinutes: data.talkMinutes,
      outline,
      html,
      model: result.model,
      usage: result.usage,
    },
    undefined,
    result.usage,
  );
}
