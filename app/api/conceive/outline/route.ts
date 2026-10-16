import { asOptions, credentialOrNull, noKeyBody } from "@/lib/api/respond";
import { DEFAULT_MODEL, LIMITS } from "@/lib/limits";
import { outlineMessages } from "@/lib/prompts/conceive";
import { completeJson } from "@/lib/providers/openrouter";
import { outlineSchema } from "@/lib/schemas/outputs";

const outlineJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "keywords",
    "theme",
    "scope",
    "premises",
    "writingOrder",
    "sections",
    "lengthNote",
    "literatureQueries",
    "assumptions",
    "requirementsConflict",
  ],
  properties: {
    keywords: { type: "array", items: { type: "object" } },
    theme: { type: "string" },
    scope: { type: "string" },
    premises: { type: "array", items: { type: "string" } },
    writingOrder: { type: "array", items: { type: "string" } },
    sections: { type: "array", items: { type: "object" } },
    lengthNote: { type: "string" },
    literatureQueries: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    requirementsConflict: { type: "boolean" },
  },
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    requirementText?: unknown;
    notes?: unknown;
    directionTitle?: unknown;
    assumptions?: unknown;
    options?: unknown;
    model?: unknown;
  } | null;
  const requirementText = typeof body?.requirementText === "string" ? body.requirementText : "";
  const notes = typeof body?.notes === "string" ? body.notes : "";
  if (!requirementText.trim() && !notes.trim()) {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "还没有要求或补充。" }, { status: 400 });
  }
  if ([...`${requirementText}${notes}`.replace(/\s/g, "")].length > LIMITS.targetChars) {
    return Response.json({ ok: false, code: "TOO_LONG", message: "超过目标上限，没有截断。" }, { status: 413 });
  }
  const credential = credentialOrNull(request);
  if (!credential.key) return Response.json(noKeyBody(), { status: 401 });
  const options = asOptions(body?.options);
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
  const assumptions = Array.isArray(body?.assumptions) ? body.assumptions.map(String) : [];
  const messages = outlineMessages({
    requirementText,
    notes,
    articleType: options.articleType,
    directionTitle: typeof body?.directionTitle === "string" ? body.directionTitle : "",
    assumptions,
  });
  const result = await completeJson({
    model,
    key: credential.key,
    schemaName: "pagebond_outline",
    schema: outlineJsonSchema,
    system: messages.system,
    user: messages.user,
  });
  if (!result.ok) return Response.json(result, { status: result.code === "TIMEOUT" ? 504 : 502 });
  const parsed = outlineSchema.safeParse(result.json);
  if (!parsed.success) {
    return Response.json({ ok: false, code: "BAD_RESPONSE", message: "框架没有通过校验，没有覆盖已有框架。" }, { status: 502 });
  }
  const queries = parsed.data.literatureQueries.map((item) => item.trim()).filter(Boolean).slice(0, LIMITS.maxLiteratureQueries);
  return Response.json({
    ok: true,
    keySource: credential.source,
    model: result.model,
    usage: result.usage,
    outline: { ...parsed.data, literatureQueries: queries, origin: "model" },
  });
}
