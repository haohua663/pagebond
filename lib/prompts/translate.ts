import { PROMPT_VERSION } from "@/lib/limits";
import { UNTRUSTED_PREFACE } from "@/lib/prompts/shared";

export type TranslateDirection = "auto" | "en-zh" | "zh-en";

/**
 * Text-applicable fidelity rules distilled from
 * skills/third-party/nature-skills/nature-paper-trans
 * (SKILL.md + references/image-translation-prompt.md §翻译与内容对应).
 * Image-only / PDF-pipeline rules (layout pixels, image_gen, page assemble) are omitted.
 */
const NATURE_TEXT_RULES = [
  "你是学术论文中英互译助手。内容忠实原则对齐 nature-paper-trans；本产品输出可编辑纯文本，不做 PDF 生图或版式重建。",
  "完整翻译全部清晰可辨、需要翻译的正文，包括段落、列表项、小标题、图注/表注文字（若出现在文本中）、注释与脚注文字。不要只译摘要或节选。",
  "按完整段落理解语义；译文按原文段落与换行结构放置，保持原有空行与段落切分。列表保留编号、顺序与引导标记。",
  "忠实保留动作、对象、条件、否定、比较关系、先后顺序、原因和结论；不摘要、不扩写、不遗漏、不重复，不为凑篇幅增减信息。算法/方法的执行条件、适用范围与操作本身同样不可省略。",
  "数字、日期、编号、引用标记、正负号、单位、网址、邮箱、项目号及 DOI 与原字段一一对应，不互换或改写。",
  "公式与行内数学符号原样保留，包括字母、希腊字母、上下标、向量字重、括号和编号；不简化，不按常见表达补全。",
  "缩写保留原样；术语按原文含义翻译，全文（含图表相关字句）译法一致。人名、机构及无可靠规范译名的专有名称保留原文。",
  "无法可靠理解或辨认的片段保留原文，不猜测、不生成伪文字。",
  "标题、章节标题、以及段落引导标记必须原样保留其形式与位置，只翻译其后的可译正文。引导标记包括但不限于：(1)(2)、①②、a) b)、i. ii.、•、-、*、以及「第一，」「其次，」「一方面，」等。",
  "不要改写或「优化」原文论点；不要添加译者注、说明、前言、后记或任何元评论。",
  "输出译文学术语体：译入简体中文时用规范书面语；译入英文时用正式学术英语。不要口语化，不要客服腔。",
].join("\n");

function detectDirection(text: string, requested: TranslateDirection): "en-zh" | "zh-en" {
  if (requested === "en-zh" || requested === "zh-en") return requested;
  const chinese = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return chinese >= latin ? "zh-en" : "en-zh";
}

export function resolveTranslateDirection(text: string, requested: TranslateDirection): "en-zh" | "zh-en" {
  return detectDirection(text, requested);
}

export function translateMessages(
  text: string,
  direction: TranslateDirection = "auto",
  glossary?: string,
): { system: string; user: string; resolved: "en-zh" | "zh-en" } {
  const resolved = detectDirection(text, direction);
  const pair =
    resolved === "en-zh"
      ? "将英文学术正文译为简体中文。"
      : "将中文学术正文译为正式学术英语。";
  const glossaryBlock = glossary?.trim()
    ? `\n用户术语表（优先遵循；与原文明显冲突时保留原文术语）：\n${glossary.trim()}\n`
    : "";

  const system = [
    UNTRUSTED_PREFACE,
    NATURE_TEXT_RULES,
    pair,
    "只返回一个 JSON 对象，字段：translation（完整译文字符串）、direction（\"en-zh\" 或 \"zh-en\"）。",
    "translation 必须覆盖全部可译正文，保持原有段落换行；不要用 Markdown 代码围栏包裹。",
    `promptVersion=${PROMPT_VERSION}`,
  ].join("\n");

  const user = [`方向：${resolved}`, glossaryBlock, "<document>", text, "</document>"]
    .filter(Boolean)
    .join("\n");

  return { system, user, resolved };
}

export type TranslateSegmentInput = { id: string; text: string };

export function translateSegmentMessages(
  segments: TranslateSegmentInput[],
  direction: TranslateDirection = "auto",
  glossary?: string,
): { system: string; user: string; resolved: "en-zh" | "zh-en" } {
  const joined = segments.map((s) => s.text).join("\n\n");
  const resolved = detectDirection(joined, direction);
  const pair =
    resolved === "en-zh"
      ? "将下列英文学术段落分别译为简体中文。"
      : "将下列中文学术段落分别译为正式学术英语。";
  const glossaryBlock = glossary?.trim()
    ? `\n用户术语表（优先遵循；与原文明显冲突时保留原文术语）：\n${glossary.trim()}\n`
    : "";

  const system = [
    UNTRUSTED_PREFACE,
    NATURE_TEXT_RULES,
    pair,
    "每个输入段落对应一个输出项：保持 id 不变，只翻译 text。",
    "标题与章节标记不会出现在本请求中；不要自造标题。",
    "只返回一个 JSON 对象，字段：segments（数组，每项含 id 与 translation）、direction（\"en-zh\" 或 \"zh-en\"）。",
    "不要用 Markdown 代码围栏包裹。",
    `promptVersion=${PROMPT_VERSION}`,
  ].join("\n");

  const payload = segments.map((s) => ({ id: s.id, text: s.text }));
  const user = [
    `方向：${resolved}`,
    glossaryBlock,
    "<document>",
    JSON.stringify(payload, null, 2),
    "</document>",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user, resolved };
}
