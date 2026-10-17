import { PROMPT_VERSION } from "@/lib/limits";
import { UNTRUSTED_PREFACE } from "@/lib/prompts/shared";

/**
 * Text-side figure briefing inspired by nature-figure
 * (schematic / caption / composition — not Python/R rendering).
 */
const NATURE_FIGURE_RULES = [
  "你是学术论文配图助手，风格对齐 nature-figure 的图件契约：一张图回答一个 Results 级科学问题。",
  "不要编造实验数值、显著性、样本量、机制或未给出的数据。",
  "配色简洁、少装饰；多面板时每面板角色不同（证据链），不要只换指标重复同一信息。",
  "示意图/流程图用 Mermaid（flowchart 或 graph）；不要输出互动仪表盘。",
  "图注（caption）要能独立读懂：对象、比较、条件。直接写图注正文，不要加「注：」「待补」「数值均来自原文」等免责声明或脚注。",
  "若适合定量图但缺数据，pythonHint 给 matplotlib 骨架即可；caption 与 title 中不要写「需填入真实数据」类提示。",
  "不要输出查重率、AI 检测率或投稿合规承诺。",
].join("\n");

export type DrawMode = "research" | "chart" | "mechanism";
export type CaptionLang = "zh" | "en" | "both";

export type DrawRequestInput = {
  brief: string;
  mode?: DrawMode | null;
  targetType?: string | null;
  journalStyle?: string | null;
  captionLang?: CaptionLang | null;
  evidence?: string | null;
};

const MODE_HINTS: Record<DrawMode, string> = {
  research: "模式=研究内容：先提炼科学问题与比较对象，再落到图件结构；优先多面板或总览示意图。",
  chart: "模式=数据图表：侧重坐标轴、分组、对照与统计展示骨架；mermaid 可空；pythonHint 尽量给出。",
  mechanism: "模式=流程或机制图：优先 Mermaid 流程图/机制网络；节点与箭头须能对应证据，勿发明通路。",
};

export function drawMessages(input: DrawRequestInput): { system: string; user: string } {
  const mode = input.mode && input.mode in MODE_HINTS ? input.mode : null;
  const captionLang =
    input.captionLang === "zh" || input.captionLang === "en" || input.captionLang === "both"
      ? input.captionLang
      : "both";
  const evidence = (input.evidence || "").trim();

  const captionRule =
    captionLang === "zh"
      ? "图注语言：只写 captionZh；captionEn 置空字符串。"
      : captionLang === "en"
        ? "图注语言：只写 captionEn；captionZh 置空字符串。"
        : "图注语言：中英各一版；captionZh 与 captionEn 都要写。";

  const evidenceRule = evidence
    ? [
        "用户提供了「依据段落/数据」。生成 evidenceMapping：数组，每项 { element, evidence }。",
        "element = 图中可见元素（节点、箭头、面板、轴标签等）；evidence = 依据原文中的短摘录或对应表述，勿编造。",
        "无法对应的元素不要硬写；不要在 mapping 或 caption 里写「待补」字样。",
      ].join("\n")
    : "用户未提供依据。evidenceMapping 必须为空数组 []。";

  const system = [
    UNTRUSTED_PREFACE,
    NATURE_FIGURE_RULES,
    mode ? MODE_HINTS[mode] : "模式未指定：按用户描述自行判断图件类型。",
    captionRule,
    evidenceRule,
    "只返回一个 JSON 对象，字段：",
    'figureType（"schematic"|"chart"|"multipanel"|"other"）、title、captionZh、captionEn、designNotes、mermaid、pythonHint、evidenceMapping。',
    "designNotes 为多行字符串（每行一条设计要点），供内部构图，不要写成对读者的免责声明。",
    "mermaid / pythonHint 无则给空字符串。evidenceMapping 为数组；无依据时必须 []。",
    "mermaid 若有，必须是可解析的 Mermaid 源码，不要用代码围栏包裹整个 JSON。",
    `promptVersion=${PROMPT_VERSION}`,
  ].join("\n");

  const parts = ["用户需求：", "<document>", input.brief.trim(), "</document>"];
  if (input.targetType?.trim()) parts.push(`目标图类型：${input.targetType.trim()}`);
  if (input.journalStyle?.trim()) parts.push(`期刊风格：${input.journalStyle.trim()}`);
  parts.push(`图注语言偏好：${captionLang}`);
  if (mode) parts.push(`输入模式：${mode}`);
  if (evidence) {
    parts.push("依据段落/数据：", "<evidence>", evidence, "</evidence>");
  }

  return { system, user: parts.join("\n") };
}
