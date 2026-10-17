import type { DocumentBlock, IntakeOptions } from "@/lib/document/types";
import {
  documentBlock,
  languageRules,
  levelRule,
  promptStamp,
  structureRules,
  UNTRUSTED_PREFACE,
} from "@/lib/prompts/shared";

function blockPayload(blocks: DocumentBlock[]): string {
  return blocks
    .map((block) => {
      const locks = [
        block.locked ? "locked" : "",
        ...block.protections.map((item) => `${item.kind}:${item.text}`),
      ]
        .filter(Boolean)
        .join(" | ");
      return `[${block.id}] (${block.kind}) ${locks}\n${block.text}`;
    })
    .join("\n\n");
}

/** Cap on diagnose suggestions; keeps output (and latency) bounded on long drafts. */
export const DIAGNOSE_MAX_SUGGESTIONS = 10;
export const ANALYZE_MAX_SUGGESTIONS = 10;

/**
 * Original-draft payload for analyze: blocks identical to the current draft are listed by id only,
 * so the model reads each unchanged paragraph once instead of twice.
 */
export function originalDeltaPayload(original: DocumentBlock[], current: DocumentBlock[]): string {
  const currentText = new Map(current.map((block) => [block.id, block.text]));
  const unchanged: string[] = [];
  const changed: DocumentBlock[] = [];
  for (const block of original) {
    if (currentText.get(block.id) === block.text) unchanged.push(block.id);
    else changed.push(block);
  }
  const parts: string[] = [];
  if (changed.length) parts.push(blockPayload(changed));
  if (unchanged.length) parts.push(`（以下段落与当前稿逐字相同，此处省略：${unchanged.join("、")}）`);
  return parts.join("\n\n");
}

export function diagnoseMessages(blocks: DocumentBlock[], options: IntakeOptions) {
  const text = blocks.map((block) => block.text).join("\n");
  return {
    system: [
      UNTRUSTED_PREFACE,
      structureRules(options.articleType),
      languageRules(options.language, text),
      "先诊断，不要改写。",
      "每条建议的 quote 必须是对应段落里的原句，不要编摘句。",
      "没有问题时少写建议，不要为了凑数量制造问题。",
      `建议按重要性排序，最多 ${DIAGNOSE_MAX_SUGGESTIONS} 条；problem、change、verify 各用一两句写清，不要复述整段原文。`,
      "terms 只列最关键的术语（最多 8 个）。不要输出事实清单。",
      promptStamp(),
    ].join("\n"),
    user: [
      `文章类型：${options.articleType}`,
      `用途：${options.purpose || "未填写"}`,
      `范围：${options.scopeNote || "全文"}`,
      documentBlock(blockPayload(blocks)),
    ].join("\n"),
  };
}

export function rewriteMessages(
  blocks: DocumentBlock[],
  options: IntakeOptions,
  repairNotes: string[],
) {
  const text = blocks.map((block) => block.text).join("\n");
  return {
    system: [
      UNTRUSTED_PREFACE,
      levelRule(options.level),
      structureRules(options.articleType),
      languageRules(options.language, text),
      "只返回你负责的这些段落，编号必须与输入一致，不能合并、拆开或调换。",
      "公式、直接引语、数字与单位、引用标记、参考文献和锁定段落必须原样保留。",
      "标题（heading 段落）和段首的结构标记（如 1.、1.2、（一）、第一章、- 、#）一律原样保留，不改字、不改编号、不改格式。",
      "做不到就原样返回该段。不要补写文献和数据。",
      repairNotes.length ? `上一次这些检查没有通过，只修这些问题：${repairNotes.join("；")}` : "",
      promptStamp(),
    ]
      .filter(Boolean)
      .join("\n"),
    user: documentBlock(blockPayload(blocks)),
  };
}

export function humanizeMessages(
  blocks: DocumentBlock[],
  options: IntakeOptions,
  repairNotes: string[],
) {
  const text = blocks.map((block) => block.text).join("\n");
  return {
    system: [
      UNTRUSTED_PREFACE,
      structureRules(options.articleType),
      languageRules(options.language, text),
      "这是「人话化 / 行文自然度」优化，不是查重、也不是绕过检测器。",
      "目标：降低机械感与套话，让学术中文或英文学术行文更自然、像作者本人写的。",
      "只调整表达与句式节奏；研究问题、结论范围、论证方向保持不变。",
      "只返回你负责的这些段落，编号必须与输入一致，不能合并、拆开或调换。",
      "公式、直接引语、数字与单位、引用标记、参考文献和锁定段落必须原样保留。",
      "标题（heading 段落）和段首的结构标记（如 1.、1.2、（一）、第一章、- 、#）一律原样保留，不改字、不改编号、不改格式。",
      "已经清楚自然的句子不必为了改而改。做不到就原样返回该段。不要补写文献和数据。",
      "不要输出查重率或 AI 检测率，也不要声称能降低检测分数。",
      repairNotes.length ? `上一次这些检查没有通过，只修这些问题：${repairNotes.join("；")}` : "",
      promptStamp(),
    ]
      .filter(Boolean)
      .join("\n"),
    user: documentBlock(blockPayload(blocks)),
  };
}

export function analyzeMessages(original: DocumentBlock[], current: DocumentBlock[], options: IntakeOptions) {
  const text = current.map((block) => block.text).join("\n");
  return {
    system: [
      UNTRUSTED_PREFACE,
      structureRules(options.articleType),
      languageRules(options.language, text),
      "这是当前稿分析，不是改写。对照原稿说明哪些问题已解决、仍在，或必须补材料。",
      "六个维度都要有结论：结构、论证、证据、方法、表达、事实风险。不适用时说明原因。",
      "quote 必须出现在你指定的版本和段落里。",
      "原稿里与当前稿逐字相同的段落只列出编号，内容以当前稿为准。",
      "对改动过的段落逐句核对：新措辞是否引入了原文没有测量的概念、新的因果或泛化表述、与结果或结论段不一致之处；有就写成 current-draft 建议。",
      "字面重叠只描述哪些表达变了或没变，不要写成查重率或检测率。",
      `每个维度的 conclusion 用一两句；resolved、remaining、needsMaterial 每项一句话，各不超过 4 项。建议最多 ${ANALYZE_MAX_SUGGESTIONS} 条，按重要性排序，problem、change、verify 各一两句。`,
      promptStamp(),
    ].join("\n"),
    user: [
      "原稿（仅列出与当前稿不同的段落）：",
      documentBlock(originalDeltaPayload(original, current)),
      "当前稿：",
      documentBlock(blockPayload(current)),
    ].join("\n\n"),
  };
}
