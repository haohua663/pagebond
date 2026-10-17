import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_QWEN_BASE_URL,
  chatCompletionsUrl,
  isDashScopeBase,
  isDeepSeekBase,
  isDeepSeekModel,
  isOpenRouterBase,
  normalizeBaseUrl,
  resolveLlmBaseUrl,
  resolveLlmModel,
  resolveLlmRoute,
  resolveServerApiKey,
  supportsJsonSchema,
} from "@/lib/providers/llm-config";
import { DAILY_MODEL_DEFAULT, DEEP_MODEL_DEFAULT, DEFAULT_MODEL } from "@/lib/limits";

const KEYS = [
  "LLM_API_KEY",
  "OPENROUTER_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "QWEN_API_KEY",
  "QWEN_BASE_URL",
  "QWEN_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
] as const;

const saved: Record<string, string | undefined> = {};
for (const key of KEYS) saved[key] = process.env[key];

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] !== undefined) process.env[key] = saved[key]!;
    else delete process.env[key];
  }
});

function clearAll() {
  for (const key of KEYS) delete process.env[key];
}

describe("llm-config", () => {
  it("prefers LLM_API_KEY over OPENROUTER_API_KEY", () => {
    process.env.LLM_API_KEY = "sk-llm-preferred-key-00000001";
    process.env.OPENROUTER_API_KEY = "sk-or-legacy-key-0000000001";
    expect(resolveServerApiKey()).toBe("sk-llm-preferred-key-00000001");
  });

  it("falls back to OPENROUTER_API_KEY", () => {
    delete process.env.LLM_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-or-legacy-key-0000000001";
    expect(resolveServerApiKey()).toBe("sk-or-legacy-key-0000000001");
  });

  it("defaults base URL to OpenRouter and builds chat URL", () => {
    delete process.env.LLM_BASE_URL;
    expect(resolveLlmBaseUrl()).toBe(DEFAULT_LLM_BASE_URL);
    expect(chatCompletionsUrl()).toBe(`${DEFAULT_LLM_BASE_URL}/chat/completions`);
    expect(normalizeBaseUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
    expect(isOpenRouterBase(DEFAULT_LLM_BASE_URL)).toBe(true);
    expect(isOpenRouterBase("https://api.openai.com/v1")).toBe(false);
    expect(isDashScopeBase(DEFAULT_QWEN_BASE_URL)).toBe(true);
  });

  it("lets session base URL override env", () => {
    process.env.LLM_BASE_URL = "https://env.example/v1";
    expect(resolveLlmBaseUrl("https://session.example/v1")).toBe("https://session.example/v1");
  });

  it("resolves model from body, then env, then daily default", () => {
    process.env.LLM_MODEL = "env-model";
    expect(resolveLlmModel("body-model")).toBe("body-model");
    expect(resolveLlmModel(null)).toBe("env-model");
    delete process.env.LLM_MODEL;
    expect(resolveLlmModel(null)).toBe(DEFAULT_MODEL);
    expect(DEFAULT_MODEL).toBe(DAILY_MODEL_DEFAULT);
  });
});

describe("resolveLlmRoute dual keys", () => {
  it("uses Qwen env for daily and DeepSeek for deep", () => {
    clearAll();
    process.env.QWEN_API_KEY = "sk-qwen-test-key-000000000001";
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-test-key-00000001";
    const daily = resolveLlmRoute("daily");
    expect(daily.key).toBe("sk-qwen-test-key-000000000001");
    expect(daily.baseUrl).toBe(DEFAULT_QWEN_BASE_URL);
    expect(daily.model).toBe(DAILY_MODEL_DEFAULT);
    expect(daily.enableThinking).toBe(false);
    expect(daily.keySource).toBe("route");
    expect(daily.label).toContain("Qwen");

    const deep = resolveLlmRoute("deep");
    expect(deep.key).toBe("sk-deepseek-test-key-00000001");
    expect(deep.baseUrl).toBe(DEFAULT_DEEPSEEK_BASE_URL);
    expect(deep.model).toBe(DEEP_MODEL_DEFAULT);
    expect(deep.enableThinking).toBe(false);
    expect(deep.keySource).toBe("route");
    expect(deep.label).toContain("DeepSeek");
  });

  it("allows daily Qwen-only when DeepSeek key is missing", () => {
    clearAll();
    process.env.QWEN_API_KEY = "sk-qwen-only-key-000000000001";
    expect(resolveLlmRoute("daily").configured).toBe(true);
    expect(resolveLlmRoute("deep").configured).toBe(false);
    expect(resolveLlmRoute("deep").key).toBeNull();
  });

  it("allows deep DeepSeek-only when Qwen key is missing", () => {
    clearAll();
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-only-key-00000001";
    expect(resolveLlmRoute("deep").configured).toBe(true);
    expect(resolveLlmRoute("daily").configured).toBe(false);
  });

  it("falls back to LLM_* for both routes", () => {
    clearAll();
    process.env.LLM_API_KEY = "sk-legacy-shared-key-0000000001";
    process.env.LLM_BASE_URL = "https://gateway.example/v1";
    process.env.LLM_MODEL = "shared-model";
    const daily = resolveLlmRoute("daily");
    expect(daily.keySource).toBe("legacy");
    expect(daily.key).toBe("sk-legacy-shared-key-0000000001");
    expect(daily.baseUrl).toBe("https://gateway.example/v1");
    expect(daily.model).toBe("shared-model");
    const deep = resolveLlmRoute("deep", { requestedModel: null });
    expect(deep.keySource).toBe("legacy");
    expect(deep.model).toBe("shared-model");
  });

  it("prefers route key over LLM_* and body model over env", () => {
    clearAll();
    process.env.QWEN_API_KEY = "sk-qwen-route-key-000000000001";
    process.env.LLM_API_KEY = "sk-legacy-should-not-win-000001";
    process.env.QWEN_MODEL = "qwen-from-env";
    const daily = resolveLlmRoute("daily", { requestedModel: "body-qwen" });
    expect(daily.key).toBe("sk-qwen-route-key-000000000001");
    expect(daily.model).toBe("body-qwen");
    expect(resolveLlmRoute("daily").model).toBe("qwen-from-env");
  });

  it("session BYOK wins and keeps thinking off for daily", () => {
    clearAll();
    process.env.QWEN_API_KEY = "sk-qwen-ignored-00000000000001";
    const daily = resolveLlmRoute("daily", {
      sessionKey: "sk-session-byok-key-00000000001",
      sessionBaseUrl: "https://session.example/v1",
    });
    expect(daily.keySource).toBe("session");
    expect(daily.key).toBe("sk-session-byok-key-00000000001");
    expect(daily.baseUrl).toBe("https://session.example/v1");
    expect(daily.enableThinking).toBe(false);
  });
});

describe("DeepSeek json_schema support", () => {
  it("detects DeepSeek base and model ids", () => {
    expect(isDeepSeekBase(DEFAULT_DEEPSEEK_BASE_URL)).toBe(true);
    expect(isDeepSeekBase("https://api.deepseek.com/v1")).toBe(true);
    expect(isDeepSeekBase(DEFAULT_QWEN_BASE_URL)).toBe(false);
    expect(isDeepSeekModel("deepseek-flash")).toBe(true);
    expect(isDeepSeekModel("deepseek-v4-pro")).toBe(true);
    expect(isDeepSeekModel("qwen3.7-plus")).toBe(false);
    expect(supportsJsonSchema(DEFAULT_DEEPSEEK_BASE_URL, "deepseek-flash")).toBe(false);
    expect(supportsJsonSchema(DEFAULT_QWEN_BASE_URL, "qwen3.7-plus")).toBe(true);
    expect(supportsJsonSchema(DEFAULT_LLM_BASE_URL, "deepseek-chat")).toBe(false);
  });
});

