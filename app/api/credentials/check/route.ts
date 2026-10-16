import { readSessionKey, verifyOpenRouterKey } from "@/lib/providers/credentials";

export async function POST(request: Request) {
  const key = readSessionKey(request);
  if (!key) {
    return Response.json({ ok: false, message: "先粘贴 OpenRouter 密钥。" }, { status: 400 });
  }
  const result = await verifyOpenRouterKey(key);
  if (!result.ok) {
    const local = result.message.includes("没有发送") || result.message.startsWith("先粘贴");
    return Response.json({ ok: false, message: result.message }, { status: local ? 400 : 401 });
  }
  return Response.json({
    ok: true,
    label: result.label,
    limitRemaining: result.limitRemaining,
    message: "密钥已加入这次会话。可以开始工作。",
  });
}
