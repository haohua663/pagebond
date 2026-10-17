import { failWithGate, jsonWithGate, openModelGate } from "@/lib/api/guard";
import { normalizeWriteField } from "@/lib/conceive/field-guides";
import { resolveWriteFieldGuide } from "@/lib/conceive/field-guides.server";
import { LIMITS } from "@/lib/limits";
import { draftSectionMessages } from "@/lib/prompts/conceive";
import { completeJson } from "@/lib/providers/openrouter";
import { conceiveDraftSchema } from "@/lib/schemas/outputs";

const draftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["heading", "markdown", "openGaps", "citedIds"],
  properties: {
    heading: { type: "string" },
    markdown: { type: "string" },
    openGaps: { type: "array", items: { type: "string" } },
    citedIds: { type: "array", items: { type: "string" } },
  },
} as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    requirementText?: unknown;
    notes?: unknown;
    theme?: unknown;
    scope?: unknown;
    section?: unknown;
    literature?: unknown;
    writeField?: unknown;
    model?: unknown;
  } | null;

  const requirementText = asString(body?.requirementText);
  const notes = asString(body?.notes);
  const theme = asString(body?.theme);
  const scope = asString(body?.scope);
  const writeField = normalizeWriteField(body?.writeField);
  const guide = resolveWriteFieldGuide(writeField);

  const sectionRaw = body?.section && typeof body.section === "object" ? (body.section as Record<string, unknown>) : null;
  const heading = asString(sectionRaw?.heading).trim();
  if (!heading) {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "请先选择要起草的章节。" }, { status: 400 });
  }
  if (!requirementText.trim() && !notes.trim() && !theme.trim()) {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "还没有可用的要求或框架主题。" }, { status: 400 });
  }
  const total = [...`${requirementText}${notes}${theme}${scope}${heading}`.replace(/\s/g, "")].length;
  if (total > LIMITS.targetChars) {
    return Response.json({ ok: false, code: "TOO_LONG", message: "材料过长，请先压缩要求或换一节。" }, { status: 413 });
  }

  const literature = Array.isArray(body?.literature)
    ? body.literature
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const openalexId = asString(item.openalexId).trim();
          const title = asString(item.title).trim();
          if (!openalexId || !title) return null;
          return {
            title,
            authors: asString(item.authors),
            year: asString(item.year),
            doi: typeof item.doi === "string" && item.doi.trim() ? item.doi.trim() : null,
            openalexId,
            venue: asString(item.venue),
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .slice(0, 12)
    : [];

  const section = {
    heading,
    purpose: asString(sectionRaw?.purpose),
    content: asString(sectionRaw?.content),
    evidence: asString(sectionRaw?.evidence),
    length: asString(sectionRaw?.length),
    openQuestions: Array.isArray(sectionRaw?.openQuestions)
      ? sectionRaw.openQuestions.map(String).filter(Boolean)
      : [],
  };

  const requestedModel = typeof body?.model === "string" ? body.model : null;
  const gated = openModelGate(request, "deep", requestedModel);
  if (!gated.ok) return gated.response;
  const { ctx } = gated;

  const messages = draftSectionMessages({
    requirementText,
    notes,
    theme,
    scope,
    writeFieldLabel: guide.label,
    fieldGuide: guide.guideText,
    section,
    literature,
  });

  const result = await completeJson({
    model: ctx.model,
    key: ctx.key,
    baseUrl: ctx.baseUrl,
    enableThinking: false,
    schemaName: "pagebond_conceive_draft",
    schema: draftJsonSchema,
    system: messages.system,
    user: messages.user,
    maxTokens: 4096,
  });

  if (!result.ok) {
    return failWithGate(ctx, result, result.code === "TIMEOUT" ? 504 : 502);
  }

  const parsed = conceiveDraftSchema.safeParse(result.json);
  if (!parsed.success) {
    return failWithGate(
      ctx,
      { ok: false, code: "BAD_RESPONSE", message: "章节草稿没有通过校验。" },
      502,
    );
  }

  const allowed = new Set(literature.map((item) => item.openalexId));
  const citedIds = parsed.data.citedIds.filter((id) => allowed.has(id));
  let markdown = parsed.data.markdown.trim();
  if (!markdown.startsWith("> 草稿")) {
    markdown = `> 草稿 · 不可投稿\n\n${markdown}`;
  }

  return jsonWithGate(
    ctx,
    {
      ok: true,
      model: result.model,
      usage: result.usage,
      writeField: guide.field,
      writeFieldLabel: guide.label,
      skillPaths: guide.skillPaths,
      draft: {
        heading: parsed.data.heading || heading,
        markdown,
        openGaps: parsed.data.openGaps.slice(0, 8),
        citedIds,
        origin: "model" as const,
      },
    },
    undefined,
    result.usage,
  );
}
