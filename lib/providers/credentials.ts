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
  const header = request.headers.get("x-yeyuan-session-key");
  if (!header?.trim()) return null;
  return header.trim();
}
