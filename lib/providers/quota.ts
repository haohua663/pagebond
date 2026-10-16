import { randomUUID } from "node:crypto";

/**
 * Lightweight visitor quota + rate limits for the platform LLM key.
 * Design: platform key is the default billing path now; future "paid" mode can
 * raise or bypass these caps without changing route call sites.
 * BYOK (session key) does not consume platform daily quota.
 */

export type BillingPath = "platform" | "byok" | "paid";

const VISITOR_COOKIE = "pagebond_vid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type DayBucket = {
  day: string;
  requests: number;
  tokens: number;
};

type WindowHit = number;

const dayUsage = new Map<string, DayBucket>();
const rateHits = new Map<string, WindowHit[]>();

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Defaults sized for light public desk use of a shared platform key. */
export function quotaConfig() {
  return {
    /** Max model requests per visitor per Shanghai calendar day when using platform key. */
    dailyRequestLimit: envInt("PAGEBOND_DAILY_REQUEST_LIMIT", 20),
    /** Soft token cap (prompt+completion) per visitor per day for platform key. 0 = disabled. */
    dailyTokenLimit: envInt("PAGEBOND_DAILY_TOKEN_LIMIT", 200_000),
    /** Model-route requests allowed per visitor (or IP) per rolling minute. */
    rateLimitPerMinute: envInt("PAGEBOND_RATE_LIMIT_PER_MINUTE", 12),
  };
}

export function shanghaiDay(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export function nextShanghaiMidnightIso(now = Date.now()): string {
  const day = shanghaiDay(now);
  // Asia/Shanghai is UTC+8 year-round.
  const nextUtcMs = Date.parse(`${day}T00:00:00+08:00`) + 24 * 60 * 60 * 1000;
  return new Date(nextUtcMs).toISOString();
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.split("=");
    if (rawKey?.trim() === name) {
      const value = rest.join("=").trim();
      return value || null;
    }
  }
  return null;
}

export function isValidVisitorId(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[a-zA-Z0-9_-]{8,64}$/.test(value);
}

export function resolveVisitorId(request: Request): { visitorId: string; isNew: boolean } {
  const existing = readCookie(request.headers.get("cookie"), VISITOR_COOKIE);
  if (isValidVisitorId(existing)) return { visitorId: existing, isNew: false };
  return { visitorId: randomUUID().replace(/-/g, ""), isNew: true };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  return "unknown";
}

function getDayBucket(visitorId: string, now = Date.now()): DayBucket {
  const day = shanghaiDay(now);
  const current = dayUsage.get(visitorId);
  if (!current || current.day !== day) {
    const fresh = { day, requests: 0, tokens: 0 };
    dayUsage.set(visitorId, fresh);
    return fresh;
  }
  return current;
}

export type QuotaSnapshot = {
  day: string;
  resetsAt: string;
  dailyRequestLimit: number;
  dailyRequestsUsed: number;
  dailyRequestsRemaining: number;
  dailyTokenLimit: number;
  dailyTokensUsed: number;
  dailyTokensRemaining: number | null;
  billing: BillingPath;
};

export function snapshotQuota(visitorId: string, billing: BillingPath = "platform", now = Date.now()): QuotaSnapshot {
  const config = quotaConfig();
  const bucket = getDayBucket(visitorId, now);
  const tokenRemaining =
    config.dailyTokenLimit > 0 ? Math.max(0, config.dailyTokenLimit - bucket.tokens) : null;
  return {
    day: bucket.day,
    resetsAt: nextShanghaiMidnightIso(now),
    dailyRequestLimit: config.dailyRequestLimit,
    dailyRequestsUsed: bucket.requests,
    dailyRequestsRemaining: Math.max(0, config.dailyRequestLimit - bucket.requests),
    dailyTokenLimit: config.dailyTokenLimit,
    dailyTokensUsed: bucket.tokens,
    dailyTokensRemaining: tokenRemaining,
    billing,
  };
}

export type GateFailure = {
  ok: false;
  code: "RATE_LIMITED" | "QUOTA_EXCEEDED";
  message: string;
  status: number;
  quota: QuotaSnapshot;
};

export type GateSuccess = {
  ok: true;
  quota: QuotaSnapshot;
};

/**
 * Check rate limit always; check daily quota only when billing === "platform".
 * Call recordModelUse after accepting the request.
 */
export function checkModelGate(
  visitorId: string,
  ip: string,
  billing: BillingPath,
  now = Date.now(),
): GateSuccess | GateFailure {
  const config = quotaConfig();
  const quota = snapshotQuota(visitorId, billing, now);

  const rateKey = `${visitorId}|${ip}`;
  const windowStart = now - 60_000;
  const hits = (rateHits.get(rateKey) ?? []).filter((t) => t > windowStart);
  rateHits.set(rateKey, hits);
  if (config.rateLimitPerMinute > 0 && hits.length >= config.rateLimitPerMinute) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      status: 429,
      message: "请求太频繁。请稍后再试。今日额度没有扣减。",
      quota,
    };
  }

  if (billing === "platform") {
    if (config.dailyRequestLimit > 0 && quota.dailyRequestsUsed >= config.dailyRequestLimit) {
      return {
        ok: false,
        code: "QUOTA_EXCEEDED",
        status: 429,
        message: `今日平台额度已用完（${config.dailyRequestLimit} 次请求）。可到设置添加自己的 API 密钥继续，或等到上海时区次日重置。`,
        quota,
      };
    }
    if (config.dailyTokenLimit > 0 && quota.dailyTokensUsed >= config.dailyTokenLimit) {
      return {
        ok: false,
        code: "QUOTA_EXCEEDED",
        status: 429,
        message: `今日平台 token 额度已用完（${config.dailyTokenLimit}）。可到设置添加自己的密钥继续，或等到次日重置。`,
        quota,
      };
    }
  }

  return { ok: true, quota };
}

/** Record one accepted model attempt. Rate-limit hits always; daily only for platform. */
export function recordModelUse(
  visitorId: string,
  ip: string,
  billing: BillingPath,
  tokens: number | null,
  now = Date.now(),
): QuotaSnapshot {
  const rateKey = `${visitorId}|${ip}`;
  const windowStart = now - 60_000;
  const hits = (rateHits.get(rateKey) ?? []).filter((t) => t > windowStart);
  hits.push(now);
  rateHits.set(rateKey, hits);

  if (billing === "platform") {
    const bucket = getDayBucket(visitorId, now);
    bucket.requests += 1;
    if (typeof tokens === "number" && Number.isFinite(tokens) && tokens > 0) {
      bucket.tokens += Math.floor(tokens);
    }
  }

  return snapshotQuota(visitorId, billing, now);
}

export function visitorCookieHeader(visitorId: string): string {
  return `${VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; HttpOnly`;
}

export function usageTokens(
  usage: { promptTokens: number | null; completionTokens: number | null } | null | undefined,
): number | null {
  if (!usage) return null;
  const prompt = typeof usage.promptTokens === "number" ? usage.promptTokens : 0;
  const completion = typeof usage.completionTokens === "number" ? usage.completionTokens : 0;
  const total = prompt + completion;
  return total > 0 ? total : null;
}

/** Add tokens only (request already reserved by recordModelUse). */
export function addPlatformTokensOnly(visitorId: string, tokens: number, now = Date.now()): QuotaSnapshot {
  if (!(tokens > 0)) return snapshotQuota(visitorId, "platform", now);
  const bucket = getDayBucket(visitorId, now);
  bucket.tokens += Math.floor(tokens);
  return snapshotQuota(visitorId, "platform", now);
}

/** Test helper: wipe in-memory counters. */
export function resetQuotaStoreForTests() {
  dayUsage.clear();
  rateHits.clear();
}

export { VISITOR_COOKIE };
