/**
 * Demo-only auth stub. Persists a fake session in localStorage + a cookie.
 * TODO(auth): replace with Postgres-backed users + real credentials / NextAuth.
 * Do NOT treat this as production auth. No Stripe.
 */

export const DEMO_SESSION_KEY = "pagebond.demoSession";
export const DEMO_COOKIE = "pagebond_demo_session";
export const DEMO_LABEL = "演示登录";

export type DemoSession = {
  name: string;
  email: string;
  /** Always true — marks stub session */
  demo: true;
  at: number;
};

/** In-memory mirror so the stub works in Node/vitest without localStorage. */
let memorySession: DemoSession | null = null;

function canUseDom() {
  return typeof window !== "undefined";
}

function parseSession(raw: string | null): DemoSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    if (
      parsed &&
      parsed.demo === true &&
      typeof parsed.name === "string" &&
      typeof parsed.email === "string" &&
      typeof parsed.at === "number"
    ) {
      return { name: parsed.name, email: parsed.email, demo: true, at: parsed.at };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function readDemoSession(): DemoSession | null {
  if (canUseDom()) {
    try {
      const fromStore = parseSession(window.localStorage.getItem(DEMO_SESSION_KEY));
      if (fromStore) {
        memorySession = fromStore;
        return fromStore;
      }
    } catch {
      /* ignore */
    }
  }
  return memorySession;
}

function writeCookie(session: DemoSession | null) {
  if (!canUseDom()) return;
  if (!session) {
    window.document.cookie = `${DEMO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  const payload = encodeURIComponent(
    JSON.stringify({ name: session.name, email: session.email, demo: true }),
  );
  // 7 days; httpOnly cannot be set from JS — stub only
  window.document.cookie = `${DEMO_COOKIE}=${payload}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

export function writeDemoSession(input: { name: string; email: string }): DemoSession {
  const session: DemoSession = {
    name: input.name.trim() || "用户",
    email: input.email.trim().toLowerCase(),
    demo: true,
    at: Date.now(),
  };
  memorySession = session;
  if (canUseDom()) {
    window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
    writeCookie(session);
    window.dispatchEvent(new Event("pagebond:demo-session"));
  }
  return session;
}

export function clearDemoSession() {
  memorySession = null;
  if (!canUseDom()) return;
  window.localStorage.removeItem(DEMO_SESSION_KEY);
  writeCookie(null);
  window.dispatchEvent(new Event("pagebond:demo-session"));
}

export function isDemoSession(value: unknown): value is DemoSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<DemoSession>;
  return v.demo === true && typeof v.email === "string" && typeof v.name === "string";
}
