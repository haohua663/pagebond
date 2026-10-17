import { isOpenRouterBase, normalizeBaseUrl } from "@/lib/providers/llm-config";

export type ImageProviderKind = "openrouter" | "openai-compatible";

export type ImageCred = {
  key: string;
  apiUrl: string;
  model: string;
  provider: ImageProviderKind;
  keySource: "image" | "openrouter" | "llm" | "session";
};

export type GenerateImageOk = {
  ok: true;
  dataUrl: string;
  mime: string;
  model: string;
  provider: ImageProviderKind;
  keySource: ImageCred["keySource"];
};

export type GenerateImageErr = {
  ok: false;
  code: "NO_KEY" | "UPSTREAM" | "TIMEOUT" | "BAD_RESPONSE";
  message: string;
  status?: number;
};

function envTrim(name: string): string {
  return process.env[name]?.trim() || "";
}

function looksOpenRouterKey(key: string): boolean {
  return key.startsWith("sk-or-");
}

/**
 * Resolve an image-generation credential.
 * Prefer dedicated IMAGE_* / OpenRouter image keys; fall back to LLM OpenRouter keys.
 */
export function resolveImageCred(opts?: {
  sessionKey?: string | null;
  sessionBaseUrl?: string | null;
}): ImageCred | null {
  const imageKey = envTrim("IMAGE_API_KEY") || envTrim("SCHEMATIC_IMAGE_API_KEY");
  const imageUrl =
    envTrim("IMAGE_API_URL") ||
    envTrim("SCHEMATIC_IMAGE_API_URL") ||
    envTrim("IMAGE_BASE_URL");
  const imageModel = envTrim("IMAGE_MODEL") || envTrim("OPENROUTER_IMAGE_MODEL");

  if (imageKey) {
    if (imageUrl) {
      const hostOpenRouter = /openrouter\.ai/i.test(imageUrl);
      const apiUrl = /\/images(\/|$)/.test(imageUrl)
        ? imageUrl.replace(/\/+$/, "")
        : `${normalizeBaseUrl(imageUrl)}/images/generations`;
      const provider: ImageProviderKind =
        hostOpenRouter || looksOpenRouterKey(imageKey) || apiUrl.endsWith("/images")
          ? "openrouter"
          : "openai-compatible";
      return {
        key: imageKey,
        apiUrl,
        model:
          imageModel ||
          (provider === "openrouter" ? "openai/gpt-image-2" : "gpt-image-1"),
        provider,
        keySource: "image",
      };
    }
    if (looksOpenRouterKey(imageKey)) {
      return {
        key: imageKey,
        apiUrl: "https://openrouter.ai/api/v1/images",
        model: imageModel || "openai/gpt-image-2",
        provider: "openrouter",
        keySource: "image",
      };
    }
    return {
      key: imageKey,
      apiUrl: `${normalizeBaseUrl(envTrim("LLM_BASE_URL") || "https://api.openai.com/v1")}/images/generations`,
      model: imageModel || "gpt-image-1",
      provider: "openai-compatible",
      keySource: "image",
    };
  }

  const orKey = envTrim("OPENROUTER_API_KEY");
  if (orKey) {
    return {
      key: orKey,
      apiUrl: "https://openrouter.ai/api/v1/images",
      model: imageModel || "openai/gpt-image-2",
      provider: "openrouter",
      keySource: "openrouter",
    };
  }

  const llmKey = envTrim("LLM_API_KEY");
  const llmBase = normalizeBaseUrl(envTrim("LLM_BASE_URL") || "https://openrouter.ai/api/v1");
  if (llmKey && (isOpenRouterBase(llmBase) || looksOpenRouterKey(llmKey))) {
    return {
      key: llmKey,
      apiUrl: "https://openrouter.ai/api/v1/images",
      model: imageModel || "openai/gpt-image-2",
      provider: "openrouter",
      keySource: "llm",
    };
  }

  const sessionKey = opts?.sessionKey?.trim() || "";
  if (sessionKey) {
    const sessionBase = opts?.sessionBaseUrl?.trim()
      ? normalizeBaseUrl(opts.sessionBaseUrl)
      : "";
    if (looksOpenRouterKey(sessionKey) || (sessionBase && isOpenRouterBase(sessionBase))) {
      return {
        key: sessionKey,
        apiUrl: "https://openrouter.ai/api/v1/images",
        model: imageModel || "openai/gpt-image-2",
        provider: "openrouter",
        keySource: "session",
      };
    }
    if (sessionBase) {
      return {
        key: sessionKey,
        apiUrl: `${sessionBase}/images/generations`,
        model: imageModel || "gpt-image-1",
        provider: "openai-compatible",
        keySource: "session",
      };
    }
  }

  return null;
}

function mimeFromFormat(format: string | undefined, mediaType: string | undefined): string {
  if (mediaType && mediaType.startsWith("image/")) return mediaType;
  if (format === "jpeg" || format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

function toDataUrl(b64: string, mime: string): string {
  const raw = b64.startsWith("data:") ? b64.split(",", 1)[1] || "" : b64;
  return `data:${mime};base64,${raw}`;
}

export function buildSchematicImagePrompt(input: {
  title?: string;
  brief: string;
  captionZh?: string;
  captionEn?: string;
  journalStyle?: string;
}): string {
  const style = input.journalStyle?.trim() || "Nature-style flat vector scientific schematic";
  const parts = [
    `Create a clean ${style} mechanism / workflow schematic for a research paper.`,
    "Flat vector-like look, restrained palette, white background, clear hierarchy, simple arrows, minimal short labels.",
    "Do not invent quantitative values, p-values, logos, or unsupported mechanisms. Conceptual illustration only.",
  ];
  if (input.title?.trim()) parts.push(`Title: ${input.title.trim()}`);
  if (input.brief.trim()) parts.push(`Content brief:\n${input.brief.trim().slice(0, 2500)}`);
  const caption = (input.captionEn || input.captionZh || "").trim();
  if (caption) parts.push(`Caption cues:\n${caption.slice(0, 1200)}`);
  return parts.join("\n\n");
}

function upstreamMessage(json: unknown, rawText: string, status: number): string {
  if (json && typeof json === "object") {
    const err = (json as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) return err.trim().slice(0, 240);
    if (err && typeof err === "object") {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 240);
    }
  }
  return rawText.trim().slice(0, 240) || `上游返回 ${status}`;
}

export async function generateSchematicImage(opts: {
  prompt: string;
  cred: ImageCred;
  timeoutMs?: number;
}): Promise<GenerateImageOk | GenerateImageErr> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const payload: Record<string, unknown> =
    opts.cred.provider === "openrouter"
      ? {
          model: opts.cred.model,
          prompt: opts.prompt,
          aspect_ratio: "16:9",
          output_format: "png",
        }
      : {
          model: opts.cred.model,
          prompt: opts.prompt,
          n: 1,
          size: "1536x1024",
        };

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.cred.key}`,
      "Content-Type": "application/json",
    };
    if (opts.cred.provider === "openrouter") {
      headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL?.trim() || "https://pagebond.local";
      headers["X-Title"] = process.env.OPENROUTER_APP_NAME?.trim() || "pagebond";
    }

    const response = await fetch(opts.cred.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let json: unknown = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        code: "UPSTREAM",
        message: `出图失败（${response.status}）：${upstreamMessage(json, rawText, response.status)}`,
        status: response.status,
      };
    }

    const data = json as {
      data?: { b64_json?: string; url?: string; media_type?: string }[];
      output_format?: string;
    } | null;
    const item = data?.data?.[0];
    if (!item) {
      return { ok: false, code: "BAD_RESPONSE", message: "出图接口没有返回图片。" };
    }

    const mime = mimeFromFormat(data?.output_format, item.media_type);
    if (item.b64_json) {
      return {
        ok: true,
        dataUrl: toDataUrl(item.b64_json, mime),
        mime,
        model: opts.cred.model,
        provider: opts.cred.provider,
        keySource: opts.cred.keySource,
      };
    }
    if (item.url) {
      const imgRes = await fetch(item.url, { signal: controller.signal });
      if (!imgRes.ok) {
        return { ok: false, code: "UPSTREAM", message: "无法下载生成的图片。", status: imgRes.status };
      }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const ct = imgRes.headers.get("content-type") || mime;
      return {
        ok: true,
        dataUrl: `data:${ct};base64,${buf.toString("base64")}`,
        mime: ct,
        model: opts.cred.model,
        provider: opts.cred.provider,
        keySource: opts.cred.keySource,
      };
    }
    return { ok: false, code: "BAD_RESPONSE", message: "出图接口没有返回图片数据。" };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, code: "TIMEOUT", message: "出图超时，请稍后重试。" };
    }
    return {
      ok: false,
      code: "UPSTREAM",
      message: err instanceof Error ? err.message : "出图请求失败。",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const NO_IMAGE_KEY_MESSAGE =
  "没有可用的出图密钥。请在 .env.local 配置 IMAGE_API_KEY（或 OPENROUTER_API_KEY），或在设置中使用 OpenRouter / 兼容 Images 接口的会话密钥。";
