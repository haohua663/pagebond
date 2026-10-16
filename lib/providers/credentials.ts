export type KeySource = "session" | "server" | "none";

export function resolveCredential(sessionKey: string | null | undefined, serverKey = process.env.OPENROUTER_API_KEY): {
  source: KeySource;
  key: string | null;
} {
  const session = sessionKey?.trim();
  if (session) return { source: "session", key: session };
  const server = serverKey?.trim();
  if (server) return { source: "server", key: server };
  return { source: "none", key: null };
}

export function readSessionKey(request: Request): string | null {
  const header = request.headers.get("x-pagebond-session-key");
  if (!header?.trim()) return null;
  return header.trim();
}

export function assessKeyDraft(value: string): { ok: true; key: string } | { ok: false; message: string } {
  const key = value.trim();
  if (!key) return { ok: false, message: "先粘贴 OpenRouter 密钥。" };
  if (/\s/.test(key)) return { ok: false, message: "密钥里不能有空格或换行。没有发送。" };
  if (key.length < 20) return { ok: false, message: "这串太短，不像 OpenRouter 密钥。没有发送。" };
  return { ok: true, key };
}

export function safeKeyLabel(label: unknown, key: string): string {
  const text = typeof label === "string" ? label.trim() : "";
  if (text && text.length <= 80 && !text.includes(key)) return text;
  return `${key.slice(0, 7)}…${key.slice(-3)}`;
}

export async function verifyOpenRouterKey(
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { ok: true; key: string; label: string; limitRemaining: number | null }
  | { ok: false; message: string }
> {
  const draft = assessKeyDraft(key);
  if (!draft.ok) return draft;
  let response: Response;
  try {
    response = await fetchImpl("https://openrouter.ai/api/v1/key", {
      method: "GET",
      headers: { Authorization: `Bearer ${draft.key}` },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false, message: "没有连上 OpenRouter，密钥没有保存。" };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: "OpenRouter 没有接受这个密钥，没有保存。" };
  }
  if (!response.ok) {
    return { ok: false, message: `OpenRouter 没有确认密钥（${response.status}），没有保存。` };
  }
  const payload = (await response.json().catch(() => null)) as {
    data?: { label?: unknown; limit_remaining?: unknown };
  } | null;
  if (!payload?.data) {
    return { ok: false, message: "OpenRouter 的确认结果无法读取，密钥没有保存。" };
  }
  const remaining = payload.data.limit_remaining;
  return {
    ok: true,
    key: draft.key,
    label: safeKeyLabel(payload.data.label, draft.key),
    limitRemaining: typeof remaining === "number" ? remaining : null,
  };
}
