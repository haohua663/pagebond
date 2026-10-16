import { describe, expect, it, vi } from "vitest";
import { assessKeyDraft, safeKeyLabel, verifyOpenRouterKey } from "@/lib/providers/credentials";

const sampleKey = "sk-or-v1-test-key-value-0001";

describe("assessKeyDraft", () => {
  it("rejects an empty or short draft before any request", () => {
    expect(assessKeyDraft("  ").ok).toBe(false);
    expect(assessKeyDraft("sk-or-short").ok).toBe(false);
    expect(assessKeyDraft(`${sampleKey}\nmore`).ok).toBe(false);
  });

  it("keeps a trimmed key", () => {
    expect(assessKeyDraft(`  ${sampleKey}  `)).toEqual({ ok: true, key: sampleKey });
  });
});

describe("verifyOpenRouterKey", () => {
  it("stores nothing when OpenRouter rejects the key", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401 }));
    const result = await verifyOpenRouterKey(sampleKey, fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("没有保存");
    expect(JSON.stringify(result)).not.toContain(sampleKey);
  });

  it("returns a masked label and never the raw key", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { label: `prefix-${sampleKey}-suffix`, limit_remaining: 12.5 },
          }),
          { status: 200 },
        ),
    );
    const result = await verifyOpenRouterKey(sampleKey, fetchImpl);
    expect(result).toMatchObject({ ok: true, limitRemaining: 12.5 });
    if (result.ok) {
      expect(result.label).not.toContain(sampleKey);
      expect(result.label.startsWith("sk-or-v")).toBe(true);
    }
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/key");
    expect(init.method).toBe("GET");
  });

  it("keeps OpenRouter's own masked label", () => {
    expect(safeKeyLabel("sk-or-v1-au7...890", sampleKey)).toBe("sk-or-v1-au7...890");
  });
});
