import {
  anyPlatformKeyConfigured,
  isOpenRouterBase,
  modelsUrl,
  openRouterKeyUrl,
  resolveLlmBaseUrl,
  resolveServerApiKey,
} from "@/lib/providers/llm-config";

export type KeySource = "session" | "server" | "none";

export function resolveCredential(
  sessionKey: string | null | undefined,
  serverKey = resolveServerApiKey() ?? undefined,
): {
  source: KeySource;
  key: string | null;
} {
  const session = sessionKey?.trim();
  if (session) return { source: "session", key: session };
  const server = serverKey?.trim();
  if (server) return { source: "server", key: server };
  // Dual-route keys (QWEN_* / DEEPSEEK_*) also count as platform credentials for UI/health.
  if (anyPlatformKeyConfigured()) {
    const qwen = process.env.QWEN_API_KEY?.trim();
    const deep = process.env.DEEPSEEK_API_KEY?.trim();
    return { source: "server", key: qwen || deep || null };
  }
  return { source: "none", key: null };
}

export function readSessionKey(request: Request): string | null {
  const header = request.headers.get("x-pagebond-session-key");
  if (!header?.trim()) return null;
  return header.trim();
}

export function assessKeyDraft(value: string): { ok: true; key: string } | { ok: false; message: string } {
  const key = value.trim();
  if (!key) return { ok: false, message: "先粘贴 API 密钥。" };
  if (/\s/.test(key)) return { ok: false, message: "密钥里不能有空格或换行。没有发送。" };
  if (key.length < 20) return { ok: false, message: "这串太短，不像 API 密钥。没有发送。" };
  return { ok: true, key };
}

export function safeKeyLabel(label: unknown, key: string): string {
  const text = typeof label === "string" ? label.trim() : "";
  if (text && text.length <= 80 && !text.includes(key)) return text;
  return `${key.slice(0, 7)}…${key.slice(-3)}`;
}

export async function verifyApiKey(
  key: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl?: string | null,
): Promise<
  | { ok: true; key: string; label: string; limitRemaining: number | null }
  | { ok: false; message: string }
> {
  const draft = assessKeyDraft(key);
  if (!draft.ok) return draft;
  const base = resolveLlmBaseUrl(baseUrl);

  if (isOpenRouterBase(base)) {
    return verifyOpenRouterKeyEndpoint(draft.key, base, fetchImpl);
  }
  return verifyCompatibleModelsEndpoint(draft.key, base, fetchImpl);
}

async function verifyOpenRouterKeyEndpoint(
  key: string,
  base: string,
  fetchImpl: typeof fetch,
): Promise<
  | { ok: true; key: string; label: string; limitRemaining: number | null }
  | { ok: false; message: string }
> {
  let response: Response;
  try {
    response = await fetchImpl(openRouterKeyUrl(base), {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false, message: "没有连上接口，密钥没有保存。" };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: "接口没有接受这个密钥，没有保存。" };
  }
  if (!response.ok) {
    return { ok: false, message: `接口没有确认密钥（${response.status}），没有保存。` };
  }
  const payload = (await response.json().catch(() => null)) as {
    data?: { label?: unknown; limit_remaining?: unknown };
  } | null;
  if (!payload?.data) {
    return { ok: false, message: "接口的确认结果无法读取，密钥没有保存。" };
  }
  const remaining = payload.data.limit_remaining;
  return {
    ok: true,
    key,
    label: safeKeyLabel(payload.data.label, key),
    limitRemaining: typeof remaining === "number" ? remaining : null,
  };
}
/** Generic OpenAI-compatible gateways: probe GET /models with the Bearer key. */
async function verifyCompatibleModelsEndpoint(
  key: string,
  base: string,
  fetchImpl: typeof fetch,
): Promise<
  | { ok: true; key: string; label: string; limitRemaining: number | null }
  | { ok: false; message: string }
> {
  let response: Response;
  try {
    response = await fetchImpl(modelsUrl(base), {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false, message: "没有连上接口，密钥没有保存。" };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: "接口没有接受这个密钥，没有保存。" };
  }
  // Some gateways omit /models; format-valid key is still usable for chat/completions.
  if (response.status === 404 || response.status === 405) {
    return { ok: true, key, label: safeKeyLabel(null, key), limitRemaining: null };
  }
  if (!response.ok) {
    return { ok: false, message: `接口没有确认密钥（${response.status}），没有保存。` };
  }
  return { ok: true, key, label: safeKeyLabel(null, key), limitRemaining: null };
}

/** @deprecated Prefer verifyApiKey — kept for existing imports/tests. */
export const verifyOpenRouterKey = verifyApiKey;
