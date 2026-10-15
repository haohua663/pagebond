import { asOptions, credentialOrNull, noKeyBody } from "@/lib/api/respond";
import { LIMITS, DEFAULT_MODEL } from "@/lib/limits";
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
  const credential = credentialOrNull(request);
  if (!credential.key) return Response.json(noKeyBody(), { status: 401 });
  const options = asOptions(body?.options);
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
  const messages = requirementsMessages(requirementText, notes, options.articleType);
  const result = await completeJson({
    model,
    key: credential.key,
    schemaName: "yeyuan_requirements",
    schema: requirementsJsonSchema,
    system: messages.system,
    user: messages.user,
  });
  if (!result.ok) return Response.json(result, { status: result.code === "TIMEOUT" ? 504 : 502 });
  const parsed = requirementsSchema.safeParse(result.json);
  if (!parsed.success) {
    return Response.json({ ok: false, code: "BAD_RESPONSE", message: "要求整理没有通过校验。" }, { status: 502 });
  }
  return Response.json({
    ok: true,
    keySource: credential.source,
    model: result.model,
    usage: result.usage,
    brief: { ...parsed.data, missing: parsed.data.missing.slice(0, 3), origin: "model" },
  });
}
