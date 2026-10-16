import { failWithGate, jsonWithGate, openModelGate } from "@/lib/api/guard";
import { asOptions } from "@/lib/api/respond";
import { LIMITS } from "@/lib/limits";
import { requirementsMessages } from "@/lib/prompts/conceive";
import { completeJson } from "@/lib/providers/openrouter";
import { requirementsSchema } from "@/lib/schemas/outputs";

const requirementsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requirements", "keywords", "conflicts", "missing", "directions", "assumptions", "titleFixed"],
  properties: {
    requirements: { type: "array", items: { type: "object" } },
    keywords: { type: "array", items: { type: "object" } },
    conflicts: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" } },
    directions: { type: "array", items: { type: "object" } },
    assumptions: { type: "array", items: { type: "string" } },
    titleFixed: { type: "boolean" },
  },
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    requirementText?: unknown;
    notes?: unknown;
    options?: unknown;
    model?: unknown;
  } | null;
  const requirementText = typeof body?.requirementText === "string" ? body.requirementText : "";
  const notes = typeof body?.notes === "string" ? body.notes : "";
  if (!requirementText.trim() && !notes.trim()) {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "要求或补充至少要有一项。" }, { status: 400 });
  }
  const chars = [...`${requirementText}${notes}`.replace(/\s/g, "")].length;
  if (chars > LIMITS.targetChars) {
    return Response.json({ ok: false, code: "TOO_LONG", message: "超过目标上限，没有截断。" }, { status: 413 });
  }
  const requestedModel = typeof body?.model === "string" ? body.model : null;
  const gated = openModelGate(request, "daily", requestedModel);
  if (!gated.ok) return gated.response;
  const { ctx } = gated;
  const options = asOptions(body?.options);
  const messages = requirementsMessages(requirementText, notes, options.articleType);
  const result = await completeJson({
    model: ctx.model,
    key: ctx.key,
    baseUrl: ctx.baseUrl,
    enableThinking: ctx.enableThinking,
    schemaName: "pagebond_requirements",
    schema: requirementsJsonSchema,
    system: messages.system,
    user: messages.user,
  });
  if (!result.ok) {
    return failWithGate(ctx, result, result.code === "TIMEOUT" ? 504 : 502);
  }
  const parsed = requirementsSchema.safeParse(result.json);
  if (!parsed.success) {
    return failWithGate(ctx, { ok: false, code: "BAD_RESPONSE", message: "要求整理没有通过校验。" }, 502);
  }
  return jsonWithGate(
    ctx,
    {
      ok: true,
      model: result.model,
      usage: result.usage,
      brief: { ...parsed.data, missing: parsed.data.missing.slice(0, 3), origin: "model" },
    },
    undefined,
    result.usage,
  );
}
