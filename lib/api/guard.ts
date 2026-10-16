import { noKeyBody } from "@/lib/api/respond";
import type { KeySource } from "@/lib/providers/credentials";
import {
  type LlmRoute,
  type RouteKeySource,
  readSessionBaseUrl,
  resolveLlmRoute,
} from "@/lib/providers/llm-config";
import { readSessionKey } from "@/lib/providers/credentials";
import {
  type BillingPath,
  type QuotaSnapshot,
  addPlatformTokensOnly,
  checkModelGate,
  clientIp,
  recordModelUse,
  resolveVisitorId,
  usageTokens,
  visitorCookieHeader,
} from "@/lib/providers/quota";

export type ModelGateContext = {
  key: string;
  baseUrl: string;
  model: string;
  enableThinking: boolean;
  route: LlmRoute;
  routeLabel: string;
  source: KeySource;
  routeKeySource: RouteKeySource;
  billing: BillingPath;
  visitorId: string;
  ip: string;
  setCookie: boolean;
  quota: QuotaSnapshot;
};

function billingFor(source: KeySource): BillingPath {
  // Future paid accounts can return "paid" here without touching routes.
  if (source === "session") return "byok";
  return "platform";
}

function withCookie(init: ResponseInit | undefined, setCookie: boolean, visitorId: string): ResponseInit {
  if (!setCookie) return init ?? {};
  const headers = new Headers(init?.headers);
  headers.append("Set-Cookie", visitorCookieHeader(visitorId));
  return { ...init, headers };
}

function stripSecrets(body: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...body };
  delete payload.key;
  delete payload.apiKey;
  delete payload.OPENROUTER_API_KEY;
  delete payload.LLM_API_KEY;
  delete payload.QWEN_API_KEY;
  delete payload.DEEPSEEK_API_KEY;
  delete payload.authorization;
  delete payload.sessionKey;
  return payload;
}

function toKeySource(routeKeySource: RouteKeySource): KeySource {
  if (routeKeySource === "session") return "session";
  if (routeKeySource === "none") return "none";
  return "server";
}

/**
 * Resolve credential + visitor for a product route, enforce rate/daily limits.
 * Never returns the raw key in JSON.
 */
export function openModelGate(
  request: Request,
  route: LlmRoute = "daily",
  requestedModel?: string | null,
): { ok: true; ctx: ModelGateContext } | { ok: false; response: Response } {
  const { visitorId, isNew } = resolveVisitorId(request);
  const ip = clientIp(request);
  const sessionKey = readSessionKey(request);
  // Session base URL only with BYOK — never point a platform key at a user-chosen host.
  const sessionBase = sessionKey ? readSessionBaseUrl(request) : null;
  const resolved = resolveLlmRoute(route, {
    sessionKey,
    sessionBaseUrl: sessionBase,
    requestedModel,
  });
  if (!resolved.key) {
    return {
      ok: false,
      response: Response.json(noKeyBody(route), withCookie({ status: 401 }, isNew, visitorId)),
    };
  }
  const source = toKeySource(resolved.keySource);
  const billing = billingFor(source);
  const gate = checkModelGate(visitorId, ip, billing);
  if (!gate.ok) {
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          code: gate.code,
          message: gate.message,
          quota: gate.quota,
        },
        withCookie({ status: gate.status }, isNew, visitorId),
      ),
    };
  }
  // Reserve a request slot up front so parallel calls cannot stampede past the cap.
  const quota = recordModelUse(visitorId, ip, billing, null);
  return {
    ok: true,
    ctx: {
      key: resolved.key,
      baseUrl: resolved.baseUrl,
      model: resolved.model,
      enableThinking: resolved.enableThinking,
      route: resolved.route,
      routeLabel: resolved.label,
      source,
      routeKeySource: resolved.keySource,
      billing,
      visitorId,
      ip,
      setCookie: isNew,
      quota,
    },
  };
}

export function attachUsageTokens(
  ctx: ModelGateContext,
  usage: { promptTokens: number | null; completionTokens: number | null } | null | undefined,
): QuotaSnapshot {
  const tokens = usageTokens(usage);
  if (!tokens || ctx.billing !== "platform") return ctx.quota;
  return addPlatformTokensOnly(ctx.visitorId, tokens);
}

export function jsonWithGate(
  ctx: ModelGateContext,
  body: Record<string, unknown>,
  init?: ResponseInit,
  usage?: { promptTokens: number | null; completionTokens: number | null } | null,
): Response {
  const quota = attachUsageTokens(ctx, usage);
  const payload = stripSecrets({
    ...body,
    keySource: ctx.source,
    route: ctx.route,
    routeLabel: ctx.routeLabel,
    quota,
  });
  return Response.json(payload, withCookie(init, ctx.setCookie, ctx.visitorId));
}

export function failWithGate(ctx: ModelGateContext, body: Record<string, unknown> | object, status: number): Response {
  const payload = stripSecrets({
    ...(body as Record<string, unknown>),
    route: ctx.route,
    routeLabel: ctx.routeLabel,
    quota: ctx.quota,
  });
  return Response.json(payload, withCookie({ status }, ctx.setCookie, ctx.visitorId));
}

