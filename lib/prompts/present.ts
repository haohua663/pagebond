import { PROMPT_VERSION } from "@/lib/limits";
import { UNTRUSTED_PREFACE } from "@/lib/prompts/shared";

/**
 * Outline content only — visual system lives in lib/present/deck-html.ts
 * (frontend-slides Bold Signal + SVG templates).
 */
const PRESENT_RULES = [
  "你是学术汇报演示助手：生成面向听众的幻灯大纲（不要讲者口播套话）。",
  "叙事对齐论文论证链：为何重要 → 缺口 → 方法 → 关键证据 → 可信度 → 新意 → 边界。",
  "每页一个主信息；标题短；要点 3–5 条（避免只有 1–2 条导致版面空）。",
  "严禁「开场一句话点题」「这里可以说」「口播」「讲者注意」等元话语。",
  "不要编造精确实验数值；若需要示意强度，用 visual.bars 的 0–100 相对值并在 caption 标明「示意」。",
  "每页（title/close 除外）尽量提供 visual：bars | flow | callout | compare | steps。",
  "visual.items 为 {label, value?}；callout 用 metric+caption；compare 两项；flow/steps 用多个 label。",
  "结构：首页 kind=title；至少一页 kind=section；正文 kind=body；末页 kind=close。",
  "layout 可选：title-hero | section-bleed | body-stack | body-split | body-band | body-grid | body-chart | close-field。",
  "中文。notes 可空且不要渲染给听众。",
].join("\n");

export type PresentRequestInput = {
  source: string;
  talkMinutes?: number | null;
  audience?: string | null;
};

export function presentMessages(input: PresentRequestInput): { system: string; user: string } {
  const minutes =
    typeof input.talkMinutes === "number" && input.talkMinutes > 0 && input.talkMinutes <= 90
      ? Math.round(input.talkMinutes)
      : 12;

  const system = [
    UNTRUSTED_PREFACE,
    PRESENT_RULES,
    `目标时长约 ${minutes} 分钟。`,
    "只返回 JSON：title、talkMinutes、outline。",
    "outline 项：id、title、bullets、notes、kind、layout、visual。",
    'visual：{ type, metric?, caption?, items:[{label,value?}] }。',
    "不要返回 HTML。",
    `promptVersion=${PROMPT_VERSION}`,
  ].join("\n");

  const parts = ["材料：", "<document>", input.source.trim(), "</document>", `talkMinutes=${minutes}`];
  if (input.audience?.trim()) parts.push(`听众：${input.audience.trim()}`);
  return { system, user: parts.join("\n") };
}

export function scrubPresentCopy(text: string): string {
  if (!text) return "";
  let out = text.replace(/\r\n/g, "\n").trim();
  const banLine =
    /^(开场一句话点题|开场点题|这里可以说|提醒自己|口播|讲者注意|讲者备注|过渡句|下页展开|可以说一句|先抛问题)[：:\s]/u;
  out = out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !banLine.test(line))
    .join("\n");
  out = out.replace(/开场一句话点题[：:][^\n。]*/g, "");
  return out.replace(/\s{2,}/g, " ").trim();
}
