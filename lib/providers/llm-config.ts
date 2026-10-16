/** OpenAI Chat Completions–compatible LLM settings with dual-route (Qwen daily / DeepSeek deep). */

import { DAILY_MODEL_DEFAULT, DEEP_MODEL_DEFAULT } from "@/lib/limits";

/** Legacy single-key fallback default (OpenRouter). Prefer QWEN_* / DEEPSEEK_* for product routing. */
export const DEFAULT_LLM_BASE_URL = "https://openrouter.ai/api/v1";

/** Aliyun DashScope OpenAI-compatible root (Beijing shared domain; override per region if needed). */
export const DEFAULT_QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

/** DeepSeek OpenAI-compatible root (also accepts /v1). */
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

const SESSION_BASE_HEADER = "x-pagebond-session-base-url";

/** daily = rewrite / humanize / outline / requirements; deep = analyze (diagnose + draft compare). */
export type LlmRoute = "daily" | "deep";

export type RouteKeySource = "session" | "route" | "legacy" | "none";

export type ResolvedLlmRoute = {
  route: LlmRoute;
  key: string | null;
  baseUrl: string;
  model: string;
  /** When true, ask upstream to keep thinking/reasoning on (if supported). Daily polish defaults false. */
  enableThinking: boolean;
  keySource: RouteKeySource;
  label: string;
  configured: boolean;
};

export function normalizeBaseUrl(value: string | null | undefined, fallback = DEFAULT_LLM_BASE_URL): string {
  const raw = (value ?? "").trim().replace(/\/+$/, "");
  return raw || fallback;
}

/** Preferred `LLM_API_KEY`, then legacy `OPENROUTER_API_KEY`. */
export function resolveServerApiKey(
  serverKey = process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY,
): string | null {
  const key = serverKey?.trim();
  return key || null;
}

function envTrim(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export function resolveLlmBaseUrl(sessionBaseUrl?: string | null): string {
  const session = sessionBaseUrl?.trim();
  if (session) return normalizeBaseUrl(session);
  return normalizeBaseUrl(process.env.LLM_BASE_URL);
}

/** Request body model wins; else `LLM_MODEL` env; else product daily default. */
export function resolveLlmModel(requested?: string | null): string {
  const fromBody = requested?.trim();
  if (fromBody) return fromBody;
  const fromEnv = process.env.LLM_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return DAILY_MODEL_DEFAULT;
}

export function routeLabel(route: LlmRoute): string {
  return route === "deep" ? "深度 · DeepSeek-V4-Pro" : "日常 · Qwen3.7-Plus";
}

export function defaultModelForRoute(route: LlmRoute): string {
  return route === "deep" ? DEEP_MODEL_DEFAULT : DAILY_MODEL_DEFAULT;
}

export function defaultBaseUrlForRoute(route: LlmRoute): string {
  return route === "deep" ? DEFAULT_DEEPSEEK_BASE_URL : DEFAULT_QWEN_BASE_URL;
}

/**
 * Resolve key / base / model for a product route.
 * Order: session BYOK → route-specific env → LLM_* legacy → none.
 * Thinking defaults OFF for daily polish; deep leaves thinking to upstream defaults unless overridden.
 */
export function resolveLlmRoute(
  route: LlmRoute,
  opts?: {
    sessionKey?: string | null;
    sessionBaseUrl?: string | null;
    requestedModel?: string | null;
    /** Override thinking; default false for daily, true for deep (DeepSeek thinks by default). */
    enableThinking?: boolean;
  },
): ResolvedLlmRoute {
  const label = routeLabel(route);
  const requested = opts?.requestedModel?.trim() || null;
  const thinkingDefault = route === "deep";

  const sessionKey = opts?.sessionKey?.trim() || null;
  if (sessionKey) {
    const model =
      requested ||
      (route === "deep" ? envTrim("DEEPSEEK_MODEL") : envTrim("QWEN_MODEL")) ||
      envTrim("LLM_MODEL") ||
      defaultModelForRoute(route);
    const baseUrl = opts?.sessionBaseUrl?.trim()
      ? normalizeBaseUrl(opts.sessionBaseUrl)
      : route === "deep"
        ? normalizeBaseUrl(envTrim("DEEPSEEK_BASE_URL"), DEFAULT_DEEPSEEK_BASE_URL)
        : normalizeBaseUrl(envTrim("QWEN_BASE_URL"), DEFAULT_QWEN_BASE_URL);
    return {
      route,
      key: sessionKey,
      baseUrl,
      model,
      enableThinking: opts?.enableThinking ?? false,
      keySource: "session",
      label,
      configured: true,
    };
  }

  if (route === "daily") {
    const routeKey = envTrim("QWEN_API_KEY");
    if (routeKey) {
      return {
        route,
        key: routeKey,
        baseUrl: normalizeBaseUrl(envTrim("QWEN_BASE_URL"), DEFAULT_QWEN_BASE_URL),
        model: requested || envTrim("QWEN_MODEL") || envTrim("LLM_MODEL") || DAILY_MODEL_DEFAULT,
        enableThinking: opts?.enableThinking ?? false,
        keySource: "route",
        label,
        configured: true,
      };
    }
  } else {
    const routeKey = envTrim("DEEPSEEK_API_KEY");
    if (routeKey) {
      return {
        route,
        key: routeKey,
        baseUrl: normalizeBaseUrl(envTrim("DEEPSEEK_BASE_URL"), DEFAULT_DEEPSEEK_BASE_URL),
        model: requested || envTrim("DEEPSEEK_MODEL") || envTrim("LLM_MODEL") || DEEP_MODEL_DEFAULT,
        enableThinking: opts?.enableThinking ?? true,
        keySource: "route",
        label,
        configured: true,
      };
    }
  }

  const legacyKey = resolveServerApiKey();
  if (legacyKey) {
    return {
      route,
      key: legacyKey,
      baseUrl: normalizeBaseUrl(envTrim("LLM_BASE_URL"), DEFAULT_LLM_BASE_URL),
      model: requested || envTrim("LLM_MODEL") || defaultModelForRoute(route),
      enableThinking: opts?.enableThinking ?? thinkingDefault,
      keySource: "legacy",
      label,
      configured: true,
    };
  }

  return {
    route,
    key: null,
    baseUrl: defaultBaseUrlForRoute(route),
    model: requested || defaultModelForRoute(route),
    enableThinking: opts?.enableThinking ?? thinkingDefault,
    keySource: "none",
    label,
    configured: false,
  };
}

/** Snapshot of both routes for health / settings (no secrets). */
export function describeRoutes(): {
  daily: Omit<ResolvedLlmRoute, "key"> & { keyConfigured: boolean };
  deep: Omit<ResolvedLlmRoute, "key"> & { keyConfigured: boolean };
} {
  const daily = resolveLlmRoute("daily");
  const deep = resolveLlmRoute("deep");
  const strip = (r: ResolvedLlmRoute) => {
    const { key: _k, ...rest } = r;
    return { ...rest, keyConfigured: Boolean(r.key) };
  };
  return { daily: strip(daily), deep: strip(deep) };
}

export function anyPlatformKeyConfigured(): boolean {
  return Boolean(envTrim("QWEN_API_KEY") || envTrim("DEEPSEEK_API_KEY") || resolveServerApiKey());
}

export function chatCompletionsUrl(baseUrl?: string | null, fallback = DEFAULT_LLM_BASE_URL): string {
  return `${normalizeBaseUrl(baseUrl, fallback)}/chat/completions`;
}

export function modelsUrl(baseUrl?: string | null, fallback = DEFAULT_LLM_BASE_URL): string {
  return `${normalizeBaseUrl(baseUrl, fallback)}/models`;
}

export function openRouterKeyUrl(baseUrl?: string | null): string {
  return `${normalizeBaseUrl(baseUrl)}/key`;
}

export function isOpenRouterBase(baseUrl?: string | null): boolean {
  try {
    const host = new URL(normalizeBaseUrl(baseUrl)).hostname.toLowerCase();
    return host === "openrouter.ai" || host.endsWith(".openrouter.ai");
  } catch {
    return false;
  }
}

export function isDashScopeBase(baseUrl?: string | null): boolean {
  try {
    const host = new URL(normalizeBaseUrl(baseUrl, DEFAULT_QWEN_BASE_URL)).hostname.toLowerCase();
    return host.includes("dashscope") || host.includes("maas.aliyuncs.com");
  } catch {
    return false;
  }
}


export function isDeepSeekBase(baseUrl?: string | null): boolean {
  try {
    const host = new URL(normalizeBaseUrl(baseUrl, DEFAULT_DEEPSEEK_BASE_URL)).hostname.toLowerCase();
    return host === "api.deepseek.com" || host.endsWith(".deepseek.com");
  } catch {
    return false;
  }
}

/** True for DeepSeek model ids (deepseek-flash, deepseek-v4-pro, vendor/deepseek-*, ...). */
export function isDeepSeekModel(model?: string | null): boolean {
  const id = (model ?? "").trim().toLowerCase();
  if (!id) return false;
  return id.startsWith("deepseek-") || id.includes("/deepseek-") || id.includes("deepseek/");
}

/**
 * DeepSeek rejects response_format type json_schema ("unavailable now").
 * Use json_object (plus a prompt that contains the word json) instead.
 */
export function supportsJsonSchema(baseUrl?: string | null, model?: string | null): boolean {
  if (isDeepSeekBase(baseUrl) || isDeepSeekModel(model)) return false;
  return true;
}

export function readSessionBaseUrl(request: Request): string | null {
  const header = request.headers.get(SESSION_BASE_HEADER);
  if (!header?.trim()) return null;
  const value = header.trim();
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return normalizeBaseUrl(value);
  } catch {
    return null;
  }
}

export { SESSION_BASE_HEADER };
