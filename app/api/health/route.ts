import { KNOWN_MODEL } from "@/lib/limits";
import {
  anyPlatformKeyConfigured,
  describeRoutes,
  resolveLlmBaseUrl,
  resolveLlmModel,
} from "@/lib/providers/llm-config";
import { resolveCredential } from "@/lib/providers/credentials";
import {
  quotaConfig,
  resolveVisitorId,
  snapshotQuota,
  visitorCookieHeader,
} from "@/lib/providers/quota";

export async function GET(request: Request) {
  const credential = resolveCredential(null);
  const platformConfigured = anyPlatformKeyConfigured();
  const routes = describeRoutes();
  const { visitorId, isNew } = resolveVisitorId(request);
  const quota = snapshotQuota(visitorId, "platform");
  const config = quotaConfig();
  const body = {
    keySource: credential.source === "server" || platformConfigured ? "server" : "none",
    platformKeyConfigured: platformConfigured,
    model: resolveLlmModel() || routes.daily.model,
    baseUrl: resolveLlmBaseUrl(),
    contextLength: KNOWN_MODEL.contextLength,
    structuredOutputs: KNOWN_MODEL.structuredOutputs,
    routes: {
      daily: {
        label: routes.daily.label,
        model: routes.daily.model,
        baseUrl: routes.daily.baseUrl,
        keyConfigured: routes.daily.keyConfigured,
        enableThinking: routes.daily.enableThinking,
      },
      deep: {
        label: routes.deep.label,
        model: routes.deep.model,
        baseUrl: routes.deep.baseUrl,
        keyConfigured: routes.deep.keyConfigured,
        enableThinking: routes.deep.enableThinking,
      },
    },
    openalex: process.env.OPENALEX_API_KEY ? "keyed" : "anonymous",
    externalDetection: "未进行外部查重／AI 检测",
    quota: {
      ...quota,
      configured: {
        dailyRequestLimit: config.dailyRequestLimit,
        dailyTokenLimit: config.dailyTokenLimit,
        rateLimitPerMinute: config.rateLimitPerMinute,
      },
    },
  };
  if (!isNew) return Response.json(body);
  return Response.json(body, {
    headers: { "Set-Cookie": visitorCookieHeader(visitorId) },
  });
}
