import { DEFAULT_MODEL, KNOWN_MODEL } from "@/lib/limits";
import { resolveCredential } from "@/lib/providers/credentials";

export async function GET() {
  const credential = resolveCredential(null);
  return Response.json({
    keySource: credential.source,
    model: DEFAULT_MODEL,
    contextLength: KNOWN_MODEL.contextLength,
    structuredOutputs: KNOWN_MODEL.structuredOutputs,
    openalex: process.env.OPENALEX_API_KEY ? "keyed" : "anonymous",
    externalDetection: "未进行外部查重／AI 检测",
  });
}
