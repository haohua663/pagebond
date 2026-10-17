import { KNOWN_MODEL } from "@/lib/limits";
import {
  chatCompletionsUrl,
  isDashScopeBase,
  isDeepSeekBase,
  isDeepSeekModel,
  isOpenRouterBase,
  resolveLlmBaseUrl,
  supportsJsonSchema,
} from "@/lib/providers/llm-config";
import { ensureJsonPrompt } from "@/lib/prompts/shared";
import { TIMEOUT_BILLING_NOTE, nextRetryDelay } from "@/lib/workflows/task";

export interface CompletionRequest {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  key: string;
  /** OpenAI-compatible API root, e.g. https://openrouter.ai/api/v1 */
  baseUrl?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * When set, send enable_thinking for DashScope/Qwen-compatible gateways.
   * Daily polish should pass false; deep routes may pass true or omit.
   */
  enableThinking?: boolean;
  /** Output cap. Only sent when thinking is off (reasoning tokens would eat into it). */
  maxTokens?: number;
}

export interface CompletionSuccess {
  ok: true;
  json: unknown;
  model: string;
  usage: { promptTokens: number | null; completionTokens: number | null } | null;
  structured: boolean;
}

export interface CompletionFailure {
  ok: false;
  code: "NO_KEY" | "UPSTREAM" | "TIMEOUT" | "BAD_RESPONSE";
  message: string;
  status?: number;
}

export function estimateCost(chars: number, calls: number, modelId: string): {
  lowUsd: number | null;
  highUsd: number | null;
  note: string;
} {
  if (modelId !== KNOWN_MODEL.id || !KNOWN_MODEL.promptPerToken) {
    return {
      lowUsd: null,
      highUsd: null,
      note: "这个模型标识的价格还没有核对，无法估算费用。",
    };
  }
  const tokens = Math.ceil(chars / 1.4);
  const output = Math.ceil(tokens * 0.8);
  const long = tokens > KNOWN_MODEL.longContextFromTokens;
  const promptRate = long ? KNOWN_MODEL.longPromptPerToken : KNOWN_MODEL.promptPerToken;
  const completionRate = long ? KNOWN_MODEL.longCompletionPerToken : KNOWN_MODEL.completionPerToken;
  const low = calls * (tokens * KNOWN_MODEL.promptPerToken + output * 0.5 * KNOWN_MODEL.completionPerToken);
  const high = calls * (tokens * Math.max(promptRate, KNOWN_MODEL.longPromptPerToken) + output * completionRate) * 1.3;
  return {
    lowUsd: Number(low.toFixed(4)),
    highUsd: Number(high.toFixed(4)),
    note: `按 ${KNOWN_MODEL.id} 在 ${KNOWN_MODEL.checkedOn} 的公开价格估算，实际以返回用量为准。`,
  };
}

/**
 * Best-effort bracket repair for json_object output: drops closers that do not match the open
 * container (or that would close the root while more content follows) and appends missing
 * closers. Non-thinking DeepSeek occasionally emits a stray `]}` mid-object.
 */
export function repairJson(raw: string): string {
  const stack: string[] = [];
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
      out += ch;
      continue;
    }
    if (ch === "}" || ch === "]") {
      if (stack[stack.length - 1] !== ch) continue;
      if (stack.length === 1 && raw.slice(i + 1).trim().length > 0) continue;
      stack.pop();
      out = out.replace(/,\s*$/, "") + ch;
      continue;
    }
    out += ch;
  }
  if (inString) out += '"';
  while (stack.length) out = out.replace(/,\s*$/, "") + stack.pop();
  return out;
}

export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  let raw = (fenced?.[1] ?? text).trim();
  const start = raw.search(/[{[]/);
  if (start > 0) raw = raw.slice(start);
  try {
    return JSON.parse(raw);
  } catch (error) {
    try {
      return JSON.parse(repairJson(raw));
    } catch {
      throw error;
    }
  }
}

function bodyFor(request: CompletionRequest, structured: boolean) {
  const messages = structured
    ? { system: request.system, user: request.user }
    : ensureJsonPrompt(request.system, request.user, request.schema);
  const body: Record<string, unknown> = {
    model: request.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: messages.system },
      { role: "user", content: messages.user },
    ],
    response_format: structured
      ? {
          type: "json_schema",
          json_schema: { name: request.schemaName, strict: true, schema: request.schema },
        }
      : { type: "json_object" },
  };
  // DashScope Qwen hybrid-thinking models need an explicit flag on non-streaming calls.
  if (typeof request.enableThinking === "boolean") {
    const base = resolveLlmBaseUrl(request.baseUrl);
    // Only DashScope/Aliyun accept enable_thinking; other gateways may reject unknown fields.
    if (isDashScopeBase(base)) {
      body.enable_thinking = request.enableThinking;
    } else if (isDeepSeekBase(base) || isDeepSeekModel(request.model)) {
      // DeepSeek V4.x thinks by default (effort "high"); without this flag every call reasons.
      body.thinking = { type: request.enableThinking ? "enabled" : "disabled" };
    }
  }
  if (request.maxTokens && request.enableThinking === false) {
    body.max_tokens = request.maxTokens;
  }
  return body;
}

async function postOnce(
  request: CompletionRequest,
  structured: boolean,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  request.signal?.addEventListener("abort", onAbort);
  const baseUrl = resolveLlmBaseUrl(request.baseUrl);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${request.key}`,
    "Content-Type": "application/json",
  };
  // OpenRouter optional attribution headers; omit for other gateways.
  if (isOpenRouterBase(baseUrl)) {
    headers["HTTP-Referer"] = "http://localhost:4721";
    headers["X-OpenRouter-Title"] = "pagebond";
  }
  try {
    return await fetchImpl(chatCompletionsUrl(baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(bodyFor(request, structured)),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onAbort);
  }
}

export async function completeJson(
  request: CompletionRequest,
  deps?: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> },
): Promise<CompletionSuccess | CompletionFailure> {
  if (!request.key.trim()) {
    return { ok: false, code: "NO_KEY", message: "没有可用密钥。未调用模型。" };
  }
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const sleep = deps?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = request.timeoutMs ?? 120_000;
  const baseUrl = resolveLlmBaseUrl(request.baseUrl);
  // DeepSeek rejects json_schema; prefer json_object (prompt must contain "json").
  let structured =
    supportsJsonSchema(baseUrl, request.model) &&
    (request.model === KNOWN_MODEL.id || request.schemaName.length > 0);
  let attempt = 0;
  let retriedFormat = false;

  while (attempt < 4) {
    let response: Response;
    try {
      response = await postOnce(request, structured, fetchImpl, timeoutMs);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, code: "TIMEOUT", message: TIMEOUT_BILLING_NOTE };
      }
      return { ok: false, code: "UPSTREAM", message: "模型请求没有完成。正文没有被改写。" };
    }
    if (response.status === 400 && structured && !retriedFormat) {
      structured = false;
      retriedFormat = true;
      continue;
    }
    const delay = nextRetryDelay(attempt, response.status);
    if (delay !== null) {
      attempt += 1;
      await sleep(delay);
      continue;
    }
    if (!response.ok) {
      return {
        ok: false,
        code: "UPSTREAM",
        status: response.status,
        message: `模型没有返回可用结果（${response.status}）。正文保持确认输入版。`,
      };
    }
    const payload = (await response.json()) as {
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (payload.choices?.[0]?.finish_reason === "length") {
      return { ok: false, code: "BAD_RESPONSE", message: "模型输出超过长度上限被截断。没有写入正式结果。" };
    }
    if (!content) {
      return { ok: false, code: "BAD_RESPONSE", message: "模型返回是空的。没有写入正式结果。" };
    }
    try {
      return {
        ok: true,
        json: extractJson(content),
        model: payload.model || request.model,
        usage: payload.usage
          ? {
              promptTokens: payload.usage.prompt_tokens ?? null,
              completionTokens: payload.usage.completion_tokens ?? null,
            }
          : null,
        structured,
      };
    } catch {
      return { ok: false, code: "BAD_RESPONSE", message: "模型没有返回可解析的结构。没有写入正式结果。" };
    }
  }
  return { ok: false, code: "UPSTREAM", message: "限流后已退避两次，仍然失败。已完成的块会保留。" };
}

export { bodyFor as buildOpenRouterBody, bodyFor as buildCompletionBody };

/**
 * completeJson + schema check, with one extra attempt when the model returns unparseable or
 * off-schema JSON (non-thinking json_object output is fast but occasionally malformed).
 * Upstream/timeout failures are not retried here; completeJson already backs off on 429/5xx.
 */
export async function completeValidated<T>(
  request: CompletionRequest,
  validate: (json: unknown) => T | null,
  deps?: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> },
  attempts = 2,
): Promise<(CompletionSuccess & { data: T }) | CompletionFailure | (CompletionSuccess & { data: null })> {
  let last: (CompletionSuccess & { data: null }) | CompletionFailure | null = null;
  // Carry token usage of discarded attempts so platform quota still counts them.
  let spent: CompletionSuccess["usage"] = null;
  const addUsage = (usage: CompletionSuccess["usage"]): CompletionSuccess["usage"] => {
    if (!spent) return usage;
    if (!usage) return spent;
    return {
      promptTokens: (usage.promptTokens ?? 0) + (spent.promptTokens ?? 0),
      completionTokens: (usage.completionTokens ?? 0) + (spent.completionTokens ?? 0),
    };
  };
  for (let i = 0; i < attempts; i += 1) {
    const result = await completeJson(request, deps);
    if (!result.ok) {
      if (result.code !== "BAD_RESPONSE") return result;
      last = result;
      continue;
    }
    const usage = addUsage(result.usage);
    const data = validate(result.json);
    if (data !== null) return { ...result, usage, data };
    spent = usage;
    last = { ...result, usage, data: null };
  }
  return last as (CompletionSuccess & { data: null }) | CompletionFailure;
}
