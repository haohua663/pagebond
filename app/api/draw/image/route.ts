import {
  buildSchematicImagePrompt,
  generateSchematicImage,
  NO_IMAGE_KEY_MESSAGE,
  resolveImageCred,
} from "@/lib/providers/image";
import { LIMITS } from "@/lib/limits";

function asOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readSessionKey(request: Request): string {
  return request.headers.get("X-Pagebond-Session-Key")?.trim() || "";
}

function readSessionBaseUrl(request: Request): string {
  return request.headers.get("X-Pagebond-Session-Base-Url")?.trim() || "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    brief?: unknown;
    title?: unknown;
    captionZh?: unknown;
    captionEn?: unknown;
    journalStyle?: unknown;
  } | null;

  const brief = asOptionalString(body?.brief);
  if (!brief) {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "请先提供出图说明。" }, { status: 400 });
  }

  const title = asOptionalString(body?.title);
  const captionZh = asOptionalString(body?.captionZh);
  const captionEn = asOptionalString(body?.captionEn);
  const journalStyle = asOptionalString(body?.journalStyle);

  const chars = [...`${brief}${title}${captionZh}${captionEn}`.replace(/\s/g, "")].length;
  if (chars > LIMITS.translateChars) {
    return Response.json({ ok: false, code: "TOO_LONG", message: "出图说明过长。" }, { status: 413 });
  }

  const sessionKey = readSessionKey(request);
  const sessionBaseUrl = sessionKey ? readSessionBaseUrl(request) : "";
  const cred = resolveImageCred({ sessionKey, sessionBaseUrl });
  if (!cred) {
    return Response.json(
      { ok: false, code: "NO_KEY", message: NO_IMAGE_KEY_MESSAGE },
      { status: 401 },
    );
  }

  const prompt = buildSchematicImagePrompt({
    brief,
    title,
    captionZh,
    captionEn,
    journalStyle,
  });

  const result = await generateSchematicImage({ prompt, cred });
  if (!result.ok) {
    const status = result.code === "TIMEOUT" ? 504 : result.code === "BAD_RESPONSE" ? 502 : 502;
    return Response.json(
      { ok: false, code: result.code, message: result.message, provider: cred.provider, model: cred.model },
      { status: result.status && result.status >= 400 && result.status < 600 ? result.status : status },
    );
  }

  return Response.json({
    ok: true,
    imageDataUrl: result.dataUrl,
    mime: result.mime,
    model: result.model,
    provider: result.provider,
    keySource: result.keySource,
  });
}
