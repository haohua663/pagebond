import {
  alignParagraphs,
  checkRewriteWithTerms,
  flagLostTerms,
  humanizeSoftChecks,
  type RewriteCheck,
} from "@/lib/analysis/validate";
import { failWithGate, jsonWithGate, openModelGate } from "@/lib/api/guard";
import { asBlocks, asOptions, tooLong, tooLongMessage } from "@/lib/api/respond";
import { humanizeMessages } from "@/lib/prompts/revise";
import { completeJson } from "@/lib/providers/openrouter";
import { rewriteJsonSchema, rewriteSchema } from "@/lib/schemas/outputs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    blocks?: unknown;
    options?: unknown;
    model?: unknown;
  } | null;
  const blocks = asBlocks(body?.blocks);
  if (!blocks) return Response.json({ ok: false, code: "BAD_REQUEST", message: "没有可做人话化的段落。" }, { status: 400 });
  if (tooLong(blocks)) return Response.json({ ok: false, code: "TOO_LONG", message: tooLongMessage() }, { status: 413 });
  const requestedModel = typeof body?.model === "string" ? body.model : null;
  const gated = openModelGate(request, "daily", requestedModel);
  if (!gated.ok) return gated.response;
  const { ctx } = gated;
  const options = asOptions(body?.options);
  const model = ctx.model;
  let repairNotes: string[] = [];
  let lastCheck = checkRewriteWithTerms(blocks, [], options.lockedTerms);
  let usedModel = model;
  let usage = null as { promptTokens: number | null; completionTokens: number | null } | null;

  // Best structurally valid result so far; a soft retry (over-deletion, lost terms) never makes things worse.
  let accepted: RewriteCheck | null = null;
  let softBlocks: ReturnType<typeof humanizeSoftChecks>["blocks"] = [];

  for (let pass = 0; pass < 2; pass += 1) {
    const messages = humanizeMessages(blocks, options, repairNotes);
    const result = await completeJson({
      model,
      key: ctx.key,
      baseUrl: ctx.baseUrl,
      enableThinking: ctx.enableThinking,
      schemaName: "pagebond_humanize",
      schema: rewriteJsonSchema,
      system: messages.system,
      user: messages.user,
    });
    if (!result.ok) {
      if (accepted) break;
      return failWithGate(ctx, result, result.code === "TIMEOUT" ? 504 : 502);
    }
    usedModel = result.model;
    usage = addUsage(usage, result.usage);
    const parsed = rewriteSchema.safeParse(result.json);
    if (!parsed.success) {
      if (accepted) break;
      repairNotes = ["返回的结构无法解析"];
      continue;
    }
    const aligned = alignParagraphs(blocks, parsed.data.paragraphs);
    const check = checkRewriteWithTerms(blocks, aligned, options.lockedTerms);
    if (check.integrity !== "passed") {
      if (accepted) break;
      lastCheck = check;
      repairNotes = check.issues;
      continue;
    }
    accepted = check;
    lastCheck = check;
    const soft = humanizeSoftChecks(blocks, check.blocks, options.lockedTerms);
    softBlocks = soft.blocks;
    if (!soft.notes.length) break;
    // One retry for over-deletion or dropped terms; the retry result is accepted as is.
    repairNotes = soft.notes;
  }
  lastCheck = flagLostTerms(blocks, lastCheck, softBlocks);

  return jsonWithGate(
    ctx,
    {
      ok: true,
      model: usedModel,
      usage,
      integrity: lastCheck.integrity,
      issues: lastCheck.issues,
      checks: lastCheck.blocks,
      stage: "humanize",
      official: lastCheck.integrity === "passed",
    },
    undefined,
    usage,
  );
}

function addUsage(
  total: { promptTokens: number | null; completionTokens: number | null } | null,
  next: { promptTokens: number | null; completionTokens: number | null } | null,
) {
  if (!total) return next;
  if (!next) return total;
  const sum = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
  return { promptTokens: sum(total.promptTokens, next.promptTokens), completionTokens: sum(total.completionTokens, next.completionTokens) };
}
