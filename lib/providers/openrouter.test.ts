import { afterEach, describe, expect, it } from "vitest";
import { buildCompletionBody, completeValidated, extractJson, repairJson } from "@/lib/providers/openrouter";
import { resolveLlmRoute } from "@/lib/providers/llm-config";
import { originalDeltaPayload } from "@/lib/prompts/revise";
import type { DocumentBlock } from "@/lib/document/types";

const base = {
  model: "deepseek-flash",
  system: "s",
  user: "u",
  schemaName: "x",
  schema: { type: "object" },
  key: "k",
  baseUrl: "https://api.deepseek.com",
};

describe("DeepSeek request body", () => {
  it("sends thinking disabled plus max_tokens when thinking is off", () => {
    const body = buildCompletionBody({ ...base, enableThinking: false, maxTokens: 6000 }, false);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.max_tokens).toBe(6000);
    expect(body.enable_thinking).toBeUndefined();
  });

  it("sends thinking enabled and no output cap when thinking is on", () => {
    const body = buildCompletionBody({ ...base, enableThinking: true, maxTokens: 6000 }, false);
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.max_tokens).toBeUndefined();
  });

  it("keeps enable_thinking for DashScope and no thinking object", () => {
    const body = buildCompletionBody(
      { ...base, model: "qwen3.7-plus", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", enableThinking: false },
      true,
    );
    expect(body.enable_thinking).toBe(false);
    expect(body.thinking).toBeUndefined();
  });
});

describe("route thinking defaults", () => {
  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.PAGEBOND_DEEP_THINKING;
  });
  it("defaults deep route thinking off and lets env opt back in", () => {
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-test-key-00000001";
    expect(resolveLlmRoute("deep").enableThinking).toBe(false);
    process.env.PAGEBOND_DEEP_THINKING = "on";
    expect(resolveLlmRoute("deep").enableThinking).toBe(true);
  });
});

describe("JSON repair", () => {
  it("drops a stray early root close (seen from non-thinking DeepSeek)", () => {
    const broken = '{"summary":"a","dimensions":[{"id":"fact","x":["1"]}]},"suggestions":[{"id":"s"}]}';
    expect(extractJson(broken)).toEqual({ summary: "a", dimensions: [{ id: "fact", x: ["1"] }], suggestions: [{ id: "s" }] });
  });
  it("closes truncated containers and ignores brackets inside strings", () => {
    expect(JSON.parse(repairJson('{"a":"x]}","b":[1,2,'))).toEqual({ a: "x]}", b: [1, 2] });
  });
  it("strips prose before the JSON object", () => {
    expect(extractJson('Here you go: {"a":1}')).toEqual({ a: 1 });
  });
});

describe("completeValidated", () => {
  function reply(content: string, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
    return new Response(JSON.stringify({ model: "deepseek-flash", usage, choices: [{ message: { content } }] }), {
      status: 200,
    });
  }
  it("retries once on off-schema output and sums usage", async () => {
    const answers = [reply('{"wrong":true}'), reply('{"summary":"ok"}')];
    const fetchImpl = (async () => answers.shift()!) as unknown as typeof fetch;
    const result = await completeValidated(
      { ...base, enableThinking: false },
      (json) => ((json as { summary?: string }).summary ? (json as { summary: string }) : null),
      { fetchImpl },
    );
    expect(result.ok && result.data).toEqual({ summary: "ok" });
    expect(result.ok && result.usage).toEqual({ promptTokens: 20, completionTokens: 10 });
  });
});

describe("analyze payload", () => {
  const block = (id: string, text: string): DocumentBlock => ({
    id,
    order: 0,
    kind: "paragraph",
    level: 0,
    text,
    locked: false,
    protections: [],
  });
  it("lists unchanged original blocks by id only", () => {
    const payload = originalDeltaPayload([block("p-1", "same"), block("p-2", "old")], [block("p-1", "same"), block("p-2", "new")]);
    expect(payload).toContain("[p-2]");
    expect(payload).toContain("old");
    expect(payload).not.toContain("[p-1]");
    expect(payload).toContain("p-1");
  });
});
