import { afterEach, describe, expect, it } from "vitest";
import {
  checkModelGate,
  quotaConfig,
  recordModelUse,
  resetQuotaStoreForTests,
  resolveVisitorId,
  shanghaiDay,
  snapshotQuota,
  visitorCookieHeader,
} from "@/lib/providers/quota";

afterEach(() => {
  resetQuotaStoreForTests();
  delete process.env.PAGEBOND_DAILY_REQUEST_LIMIT;
  delete process.env.PAGEBOND_DAILY_TOKEN_LIMIT;
  delete process.env.PAGEBOND_RATE_LIMIT_PER_MINUTE;
});

describe("quota", () => {
  it("defaults are finite and positive", () => {
    const config = quotaConfig();
    expect(config.dailyRequestLimit).toBe(20);
    expect(config.dailyTokenLimit).toBe(200_000);
    expect(config.rateLimitPerMinute).toBe(12);
  });

  it("reads env overrides", () => {
    process.env.PAGEBOND_DAILY_REQUEST_LIMIT = "5";
    process.env.PAGEBOND_DAILY_TOKEN_LIMIT = "1000";
    process.env.PAGEBOND_RATE_LIMIT_PER_MINUTE = "2";
    expect(quotaConfig()).toEqual({
      dailyRequestLimit: 5,
      dailyTokenLimit: 1000,
      rateLimitPerMinute: 2,
    });
  });

  it("issues a visitor cookie and reuses it", () => {
    const first = resolveVisitorId(new Request("http://localhost/api/x"));
    expect(first.isNew).toBe(true);
    expect(first.visitorId.length).toBeGreaterThanOrEqual(8);
    const cookie = visitorCookieHeader(first.visitorId);
    const second = resolveVisitorId(
      new Request("http://localhost/api/x", { headers: { cookie } }),
    );
    expect(second).toEqual({ visitorId: first.visitorId, isNew: false });
  });

  it("blocks platform daily request quota with a clear code", () => {
    process.env.PAGEBOND_DAILY_REQUEST_LIMIT = "2";
    process.env.PAGEBOND_RATE_LIMIT_PER_MINUTE = "100";
    const id = "visitorquota01";
    recordModelUse(id, "1.1.1.1", "platform", null);
    recordModelUse(id, "1.1.1.1", "platform", null);
    const denied = checkModelGate(id, "1.1.1.1", "platform");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("QUOTA_EXCEEDED");
      expect(denied.message).toContain("今日平台额度已用完");
      expect(JSON.stringify(denied)).not.toMatch(/sk-or-v1-|Bearer /i);
    }
  });

  it("does not consume platform daily quota for BYOK", () => {
    process.env.PAGEBOND_DAILY_REQUEST_LIMIT = "1";
    process.env.PAGEBOND_RATE_LIMIT_PER_MINUTE = "100";
    const id = "visitorbyok0001";
    recordModelUse(id, "1.1.1.1", "byok", 5000);
    const snap = snapshotQuota(id, "byok");
    expect(snap.dailyRequestsUsed).toBe(0);
    expect(checkModelGate(id, "1.1.1.1", "byok").ok).toBe(true);
    // Same visitor on platform still has a free slot.
    expect(checkModelGate(id, "1.1.1.1", "platform").ok).toBe(true);
  });

  it("rate-limits without charging the daily counter", () => {
    process.env.PAGEBOND_RATE_LIMIT_PER_MINUTE = "2";
    process.env.PAGEBOND_DAILY_REQUEST_LIMIT = "40";
    const id = "visitorrate0001";
    recordModelUse(id, "9.9.9.9", "platform", null);
    recordModelUse(id, "9.9.9.9", "platform", null);
    const denied = checkModelGate(id, "9.9.9.9", "platform");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("RATE_LIMITED");
      expect(denied.message).toContain("没有扣减");
      expect(denied.quota.dailyRequestsUsed).toBe(2);
    }
  });

  it("shanghai day is YYYY-MM-DD", () => {
    expect(shanghaiDay(Date.parse("2026-10-16T10:00:00+08:00"))).toBe("2026-10-16");
  });
});
