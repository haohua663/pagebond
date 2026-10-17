import { missingProtections } from "@/lib/document/protect";
import type { DocumentBlock } from "@/lib/document/types";

export type CheckStatus = "passed" | "reverted" | "needs-review";

export interface ParagraphRewrite {
  id: string;
  text: string;
  reason?: string;
}

export interface BlockCheck {
  id: string;
  status: CheckStatus;
  reasons: string[];
  text: string;
  suggestedText: string;
  changed: boolean;
}

export interface RewriteCheck {
  blocks: BlockCheck[];
  integrity: "passed" | "failed";
  issues: string[];
}

const NON_NEGATING = /不仅仅|不仅|不只|不但|不单|不断|不少|不同|不管|不论|不久|不过|未来/g;

function semanticFlags(original: string, rewritten: string): string[] {
  const flags: string[] = [];
  if (original.includes("未显著") && !rewritten.includes("未显著") && rewritten.includes("显著")) {
    flags.push("「未显著」没有保持");
  }
  if (original.includes("没有显著") && !rewritten.includes("没有显著") && rewritten.includes("显著")) {
    flags.push("「没有显著」没有保持");
  }
  const originalCause = /导致|引起/.test(original);
  if (original.includes("相关") && !originalCause && /导致|引起/.test(rewritten)) {
    flags.push("「相关」被写成了因果");
  }
  if (/从\s*\d+(?:\.\d+)?\s*%\s*上升到\s*\d+(?:\.\d+)?\s*%/.test(original) && /增长\s*\d+(?:\.\d+)?\s*%/.test(rewritten)) {
    flags.push("「从…上升到…」被写成了「增长」");
  }
  // 「不仅」「不断」「不同」等不是否定；人话化删掉「不仅……而且」时不应报限定变少。
  const negation = (value: string) =>
    value.replace(NON_NEGATING, "").match(/不|未|没有|并非/g)?.length ?? 0;
  if (negation(original) > negation(rewritten)) {
    flags.push("否定或限定变少了");
  }
  return flags;
}

export function checkRewrite(original: DocumentBlock[], output: ParagraphRewrite[]): RewriteCheck {
  const issues: string[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, ParagraphRewrite>();
  for (const item of output) {
    if (seen.has(item.id)) issues.push(`段落 ${item.id} 重复出现`);
    seen.add(item.id);
    byId.set(item.id, item);
  }
  const originalIds = original.map((block) => block.id);
  const outputIds = output.map((item) => item.id);
  if (outputIds.join("|") !== originalIds.join("|")) {
    issues.push("返回的段落编号或顺序与原文不一致");
  }
  for (const id of outputIds) {
    if (!originalIds.includes(id)) issues.push(`出现了原文没有的段落 ${id}`);
  }
  for (const id of originalIds) {
    if (!outputIds.includes(id)) issues.push(`缺少段落 ${id}`);
  }

  const blocks: BlockCheck[] = original.map((block) => {
    const item = byId.get(block.id);
    const reasons: string[] = [];
    // Headings and structure markers are never rewritten: always keep the original text.
    if (block.kind === "heading") {
      return {
        id: block.id,
        status: "passed" as const,
        reasons: [],
        text: block.text,
        suggestedText: block.text,
        changed: false,
      };
    }
    if (!item || !item.text.trim()) {
      reasons.push(item ? "这一段的输出是空的" : "这一段没有返回");
      return {
        id: block.id,
        status: "reverted" as const,
        reasons,
        text: block.text,
        suggestedText: block.text,
        changed: false,
      };
    }
    const other = original.find(
      (candidate) =>
        candidate.id !== block.id &&
        candidate.text.length > 20 &&
        item.text.includes(candidate.text),
    );
    if (other) reasons.push(`疑似把 ${other.id} 拼进了这一段`);

    const lost = missingProtections(block.protections, item.text);
    if (lost.length) {
      reasons.push(`保护项被改动：${lost.map((part) => part.text).join("、")}`);
    }
    const marker = leadingMarker(block.text);
    if (marker && !item.text.trimStart().startsWith(marker)) {
      reasons.push(`段首结构标记被改动：${marker}`);
    }
    if (block.locked && item.text !== block.text) {
      reasons.push("这一段已锁定，不能改写");
    }
    for (const term of [] as string[]) {
      if (!item.text.includes(term)) reasons.push(`锁定术语缺失：${term}`);
    }

    const ruleFailed = reasons.length > 0;
    if (ruleFailed) {
      return {
        id: block.id,
        status: "reverted" as const,
        reasons,
        text: block.text,
        suggestedText: block.text,
        changed: false,
      };
    }

    const flags = semanticFlags(block.text, item.text);
    const changed = item.text !== block.text;
    if (flags.length) {
      return {
        id: block.id,
        status: "needs-review" as const,
        reasons: flags,
        text: block.text,
        suggestedText: item.text,
        changed,
      };
    }
    return {
      id: block.id,
      status: "passed" as const,
      reasons: item.reason ? [item.reason] : [],
      text: changed ? item.text : block.text,
      suggestedText: item.text,
      changed,
    };
  });

  return {
    blocks,
    integrity: issues.length ? "failed" : "passed",
    issues,
  };
}

const MARKER_PATTERN =
  /^\s*((?:第[一二三四五六七八九十百零〇\d]+[章节部分条篇]|[（(][一二三四五六七八九十\d]+[)）]|[一二三四五六七八九十]+[、.．]|\d+(?:\.\d+)+[、.．)）]?|\d+[、.．)）]|[A-Za-z][.)]|[IVXLC]+\.|[-*•·●▪◦]|#{1,6})(?=\s|[\u4e00-\u9fff]|$))/;

/** Leading structure marker such as "1.2", "（一）", "第三章", "-", "#". */
export function leadingMarker(text: string): string {
  const match = MARKER_PATTERN.exec(text);
  return match ? match[1] : "";
}

export function applyLockedTerms(blocks: DocumentBlock[], terms: string[]): DocumentBlock[] {
  const cleaned = terms.map((term) => term.trim()).filter(Boolean);
  if (!cleaned.length) return blocks;
  return blocks.map((block) => {
    const hit = cleaned.filter((term) => block.text.includes(term));
    if (!hit.length) return block;
    return { ...block, locked: true };
  });
}


const LOCK_TOKEN = /^\s*(?:locked|(?:formula|quote|number-unit|citation|reference):\S*)\s*(?:\|\s*)?/;

/** Remove prompt-side lock labels (e.g. "number-unit:76%") that a model echoed into its output. */
export function stripLockLabels(text: string): string {
  let out = text;
  for (let guard = 0; guard < 20; guard += 1) {
    const match = LOCK_TOKEN.exec(out);
    if (!match || !match[0]) break;
    out = out.slice(match[0].length);
  }
  return out === text ? text : out.trimStart();
}

const KIND_TOKEN = /\s*[(（](?:heading|paragraph|list|quote|formula|reference|table|caption|locked)[)）]\s*/gi;
const ID_TOKEN = /\s*\[p-\d{3,}\]\s*/g;

/** Remove block-kind tags like "(list)" and ids like "[p-002]" that the model echoed, unless the source had them. */
export function stripPromptTokens(text: string, source: string): string {
  let out = text;
  if (!/[(（](?:heading|paragraph|list|quote|formula|reference|table|caption|locked)[)）]/i.test(source)) {
    out = out.replace(KIND_TOKEN, (match) => (/^\s/.test(match) && /\s$/.test(match) ? " " : ""));
  }
  if (!/\[p-\d{3,}\]/.test(source)) {
    out = out.replace(ID_TOKEN, (match) => (/^\s/.test(match) && /\s$/.test(match) ? " " : ""));
  }
  return out === text ? text : out.trim();
}

/** Fill missing ids from original and restore original order (low-risk integrity repair). */
export function alignParagraphs(
  original: DocumentBlock[],
  output: ParagraphRewrite[],
): ParagraphRewrite[] {
  const byId = new Map(output.map((item) => [item.id, item]));
  return original.map((block) => {
    const hit = byId.get(block.id);
    const text = hit ? stripPromptTokens(stripLockLabels(hit.text), block.text) : "";
    if (hit && text.trim()) return { id: block.id, text, reason: hit.reason };
    return { id: block.id, text: block.text, reason: hit?.reason || "未返回，保留原文" };
  });
}

export function checkRewriteWithTerms(
  original: DocumentBlock[],
  output: ParagraphRewrite[],
  terms: string[],
): RewriteCheck {
  const result = checkRewrite(original, output);
  const cleaned = terms.map((term) => term.trim()).filter(Boolean);
  if (!cleaned.length) return result;
  const blocks = result.blocks.map((check) => {
    const source = original.find((block) => block.id === check.id);
    const item = output.find((row) => row.id === check.id);
    if (!source || !item) return check;
    const lost = cleaned.filter((term) => source.text.includes(term) && !item.text.includes(term));
    if (!lost.length || check.status === "reverted") return check;
    return {
      ...check,
      status: "reverted" as const,
      reasons: [...check.reasons, `锁定术语被改掉：${lost.join("、")}`],
      text: source.text,
      suggestedText: source.text,
      changed: false,
    };
  });
  return { ...result, blocks };
}

/** Humanize may trim filler tails, but a paragraph below this share of the source length is retried once. */
export const HUMANIZE_MIN_LENGTH_RATIO = 0.65;
/** Paragraphs shorter than this (non-space chars) are too small for a meaningful ratio. */
const SHRINK_MIN_SOURCE_CHARS = 40;

const ZH_TERM_SUFFIX =
  "(?:研究方法|研究设计|分析法|研究法|调查法|访谈法|实验法|方法论|理论|模型|量表|框架|范式|检验|系数|访谈)";
// Prefix: 2–6 chars without function words, so a term starts after 的/了/与/用 etc.
const ZH_TERM_STOP = "\\s，。；：、！？“”‘’「」（）()\\[\\]的了与和及或在对把将是为从由等其该这那并而且用于每各本此不也都还就要会能可仅只均已";
const ZH_TERM = new RegExp(`[^${ZH_TERM_STOP}]{2,6}${ZH_TERM_SUFFIX}`, "g");
const ZH_NAMED_ANALYSIS = /(?:回归|因子|主题|内容|方差|路径|聚类|话语|元|相关)分析/g;
// Leading verbs the prefix may still swallow (表明量表 → 量表 is too short to count).
const ZH_LEAD_VERB = /^(?:表明|显示|说明|关注|考察|结合|相结合|采|深入|开展|完成|构建|建立|提出|运用|借助|依据|根据)/;
const EN_TERM =
  /\b(?:mixed[- ]methods?(?: design| approach| study)?|semi-structured interviews?|grounded theory|structural equation model(?:ing)?|Likert(?:-type)? scale|Cronbach's alpha|(?:thematic|content|regression|factor|discourse|path|cluster|meta-)\s?analysis)\b/gi;
const EN_NAMED = /\b(?:[A-Z][a-z]+\s+){1,3}(?:Model|Theory|Scale|Framework|Test|Inventory|Questionnaire)\b/g;

/**
 * Cheap, conservative technical-term candidates (method, theory, scale names) found in a source
 * paragraph. Used only as a soft retry hint for humanize, never to revert a paragraph.
 */
export function technicalTerms(text: string): string[] {
  const found = new Set<string>();
  for (const raw of text.match(ZH_TERM) ?? []) {
    let term = raw;
    for (let guard = 0; guard < 3 && ZH_LEAD_VERB.test(term); guard += 1) term = term.replace(ZH_LEAD_VERB, "");
    const suffix = new RegExp(`${ZH_TERM_SUFFIX}$`).exec(term)?.[0] ?? "";
    if (term.length - suffix.length >= 2) found.add(term);
  }
  for (const match of text.match(ZH_NAMED_ANALYSIS) ?? []) found.add(match);
  for (const match of text.match(EN_TERM) ?? []) found.add(match);
  for (const match of text.match(EN_NAMED) ?? []) {
    if (!/^(?:The|A|An|This|That|Our|We)\s/.test(match)) found.add(match);
    else if (match.split(/\s+/).length > 2) found.add(match.replace(/^\S+\s+/, ""));
  }
  return [...found];
}

function visibleLength(text: string): number {
  return [...text.replace(/\s/g, "")].length;
}

export interface HumanizeSoftCheck {
  id: string;
  ratio: number;
  shrunk: boolean;
  lostTerms: string[];
}

/**
 * Soft checks for the humanize pass: over-deletion (length ratio) and dropped technical terms.
 * Returns per-block findings plus repair notes for one retry. Nothing here blocks a result.
 */
export function humanizeSoftChecks(
  original: DocumentBlock[],
  checks: BlockCheck[],
  extraTerms: string[] = [],
): { blocks: HumanizeSoftCheck[]; notes: string[] } {
  const extra = extraTerms.map((term) => term.trim()).filter(Boolean);
  const blocks: HumanizeSoftCheck[] = [];
  const notes: string[] = [];
  for (const check of checks) {
    const source = original.find((block) => block.id === check.id);
    if (!source || source.kind === "heading" || source.locked) continue;
    const lockedLoss = check.reasons.find((reason) => reason.startsWith("锁定术语被改掉"));
    if (check.status === "reverted" && lockedLoss) {
      notes.push(`${check.id} ${lockedLoss}，请原样保留`);
      continue;
    }
    if (!check.changed) continue;
    const before = visibleLength(source.text);
    const ratio = before ? visibleLength(check.suggestedText) / before : 1;
    const shrunk = before >= SHRINK_MIN_SOURCE_CHARS && ratio < HUMANIZE_MIN_LENGTH_RATIO;
    const terms = [...new Set([...technicalTerms(source.text), ...extra.filter((term) => source.text.includes(term))])];
    const lostTerms = terms.filter((term) => !check.suggestedText.includes(term));
    if (!shrunk && !lostTerms.length) continue;
    blocks.push({ id: check.id, ratio, shrunk, lostTerms });
    if (shrunk) {
      notes.push(`${check.id} 人话化删减过多（只剩原文约 ${Math.round(ratio * 100)}%），请保留信息只改表达，作者的判断和结论句不要删`);
    }
    if (lostTerms.length) notes.push(`${check.id} 丢了专业术语：${lostTerms.join("、")}，请原样保留`);
  }
  return { blocks, notes };
}

/** After the retry, keep the text but ask the user to look at paragraphs that still lost terms. */
export function flagLostTerms(
  original: DocumentBlock[],
  check: RewriteCheck,
  soft: HumanizeSoftCheck[],
): RewriteCheck {
  const byId = new Map(soft.filter((item) => item.lostTerms.length).map((item) => [item.id, item]));
  if (!byId.size) return check;
  return {
    ...check,
    blocks: check.blocks.map((block) => {
      const hit = byId.get(block.id);
      if (!hit || block.status !== "passed") return block;
      return {
        ...block,
        status: "needs-review" as const,
        reasons: [...block.reasons, `可能丢了术语：${hit.lostTerms.join("、")}`],
        text: original.find((source) => source.id === block.id)?.text ?? block.text,
      };
    }),
  };
}
