import { KNOWN_MODEL } from "@/lib/limits";
import { TIMEOUT_BILLING_NOTE, nextRetryDelay } from "@/lib/workflows/task";

export interface CompletionRequest {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  key: string;
  timeoutMs?: number;
  signal?: AbortSignal;
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
  if (modelId !== KNOWN_MODEL.id) {
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

export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = (fenced?.[1] ?? text).trim();
  return JSON.parse(raw);
}

function bodyFor(request: CompletionRequest, structured: boolean) {
  return {
    model: request.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
    response_format: structured
      ? {
          type: "json_schema",
          json_schema: { name: request.schemaName, strict: true, schema: request.schema },
        }
      : { type: "json_object" },
  };
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
  try {
    return await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${request.key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:4721",
        "X-OpenRouter-Title": "Yeyuan",
      },
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
  let structured = request.model === KNOWN_MODEL.id || request.schemaName.length > 0;
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
      choices?: { message?: { content?: string | null } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
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

export { bodyFor as buildOpenRouterBody };
