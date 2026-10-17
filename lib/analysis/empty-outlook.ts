import { leadingMarker, technicalTerms, type ParagraphRewrite } from "@/lib/analysis/validate";
import type { DocumentBlock } from "@/lib/document/types";

/**
 * Conservative removal of empty outlook / future-research sentences such as
 * 「后续研究仍需讨论理论、方法与实践层面的问题」 or "Future research should further explore this topic."
 *
 * A sentence (or a trailing additive clause such as 「，也是后续研究要面对的问题」) is removed only when
 * it is built almost entirely from generic outlook words, carries no digits, citation marks, quotes,
 * or technical/locked terms, and is short. Concrete limitations and future work that name an object
 * (「推广性有待验证」「将扩大到西部高校」) always survive.
 */

const ZH_SEED = /研究|探讨|讨论|方向|课题|问题/;
// Generic outlook vocabulary; what is left after removing these must be (almost) nothing.
const ZH_GENERIC = new RegExp(
  [
    "因此", "可见", "总之", "总体而言", "总的来说", "综上", "这也", "这仍", "这些", "这一", "这",
    "后续", "未来", "今后", "进一步", "一步", "相关", "研究者", "研究", "仍然", "仍", "还", "尚", "也", "亦", "并", "将", "必将",
    "需要", "需", "有待", "应当", "应该", "应", "可以", "可", "要", "值得", "继续", "持续", "深入", "加以",
    "讨论", "探讨", "展开", "关注", "回应", "思考", "面对", "解决", "成为", "是", "的", "重要", "主要",
    "在", "从", "对", "就", "和", "与", "及", "其", "该", "等", "上", "中",
    "理论", "方法", "实践", "层面", "方面", "角度", "维度", "领域", "方向", "课题", "问题", "议题", "空间",
    "、", "，", "；", "：", "\\s",
  ].join("|"),
  "g",
);
// 「……既带来机遇，也伴随挑战」「既是机遇，也是挑战」 empty balance summaries.
const ZH_BALANCE =
  /^(?:因此|可见|总之|总体而言|总的来说|综上所述|综上)?[，,]?[^0-9０-９\[\]［］“”「」，。；]{0,24}?(?:既|同时)?(?:带来了?|是|存在)(?:发展)?(?:机遇|机会)[，、,]?(?:也|又|同时也|但也)?(?:伴随着?|是|面临着?|带来了?|存在|有)(?:诸多|一定的?|不少)?(?:挑战|风险|问题)$/;
const ZH_BALANCE_AND =
  /^(?:因此|可见|总之|总体而言|总的来说|综上所述|综上)?[，,]?[^0-9０-９\[\]［］“”「」，。；]{0,24}?(?:同时)?(?:带来了?|存在|面临着?)(?:机遇|机会)(?:和|与|及)(?:挑战|风险)(?:并存)?$|(?:机遇|机会)(?:与|和)(?:挑战|风险)并存$/;
const ZH_ADDITIVE_TAIL = /^(?:也|这也|亦|同时也|并且也|并将|也将|必将)/;
const ZH_OUTLOOK_START = /^(?:后续|未来|今后)(?:的)?研究/;
const ZH_INFLATED_TAIL =
  /^(?:以|从而|进而|并)?(?:推进|推动|助力|赋能|服务于|促进)[^，。；]{0,14}(?:转型|发展|建设|进程)$|^(?:从而|进而)?为[^，。；]{0,14}(?:贡献力量|提供参考|奠定基础|提供借鉴)$/;

const EN_SEED = /\b(?:future|further|more|additional)\b[\s\S]*\b(?:research|investigation|work|studies|study|exploration)\b|\bwarrants?\b/i;
const EN_GENERIC = new Set(
  (
    "future further more additional research investigation investigations work studies study exploration " +
    "should could would may might must will need needs needed is are be to also still remains remain " +
    "explore examine investigate address delve deeper into in on of for and the a an this these that those " +
    "issue issues question questions topic topics area areas field direction directions avenue avenues " +
    "findings results provide provides basis pave paves way open opens new warrant warrants raise raises " +
    "important implications theoretical methodological practical level levels dimension dimensions " +
    "thus overall ultimately therefore hence it there"
  ).split(" "),
);

function chineseText(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function zhGenericOnly(text: string): boolean {
  return [...text.replace(ZH_GENERIC, "")].length <= 1;
}

function hasConcrete(text: string, terms: string[]): boolean {
  if (/[0-9０-９]|\[|［|“|「|"|%|％/.test(text)) return true;
  // Term detection can mistake 「讨论理论」 for a theory name; ignore candidates built from generic words.
  if (technicalTerms(text).some((term) => !zhGenericOnly(term))) return true;
  return terms.some((term) => term && text.includes(term));
}

function zhBalance(clause: string): boolean {
  const body = clause.replace(/[。！？!?；;]+$/, "").trim();
  if (!body || [...body].length > 40 || /[0-9０-９\[［“「]/.test(body)) return false;
  return ZH_BALANCE.test(body) || ZH_BALANCE_AND.test(body);
}

function zhEmpty(clause: string, terms: string[]): boolean {
  const body = clause.replace(/[。！？!?；;]+$/, "").trim();
  if (!body) return false;
  if (zhBalance(body)) return true;
  if ([...body].length > 40 || hasConcrete(body, terms)) return false;
  if (!ZH_SEED.test(body)) return false;
  return zhGenericOnly(body);
}

/** Trailing clauses that are pure outlook or 「以推进……转型」 style inflation. */
function zhEmptyTail(clause: string, terms: string[]): boolean {
  const body = clause.trim();
  if (ZH_INFLATED_TAIL.test(body) && !/[0-9０-９\[［“「]/.test(body)) return true;
  if (!(ZH_ADDITIVE_TAIL.test(body) || ZH_OUTLOOK_START.test(body))) return false;
  return zhEmpty(body, terms);
}

function enEmpty(sentence: string, terms: string[]): boolean {
  const body = sentence.replace(/[.!?;]+$/, "").trim();
  const words = body.toLowerCase().match(/[a-z'-]+/g) ?? [];
  if (!words.length || words.length > 25 || !EN_SEED.test(body)) return false;
  if (/[0-9]|\[|"|%/.test(body) || terms.some((term) => term && body.includes(term))) return false;
  return words.filter((word) => !EN_GENERIC.has(word)).length === 0;
}

/** Split Chinese text into sentences that keep their closing punctuation (。！？ and ；). */
function zhSentences(text: string): string[] {
  return text.match(/[^。！？；]+[。！？；]*/g) ?? [text];
}

function enSentences(text: string): string[] {
  return text.match(/[^.!?]+(?:[.!?]+|$)\s*/g) ?? [text];
}

export interface OutlookRemoval {
  text: string;
  removed: string[];
}

/**
 * Remove empty outlook sentences from one paragraph.
 * keepIfIn: when given (rewrite), a sentence present in this text is kept, so rewrite only drops what it introduced.
 */
export function removeEmptyOutlook(text: string, terms: string[] = [], keepIfIn?: string): OutlookRemoval {
  const removed: string[] = [];
  const known = keepIfIn?.replace(/\s/g, "");
  const inSource = (part: string) => Boolean(known && known.includes(part.replace(/[。！？!?；;.\s]+$/g, "").replace(/\s/g, "")));
  const marker = leadingMarker(text);

  if (chineseText(text)) {
    const sentences = zhSentences(text);
    const kept: string[] = [];
    sentences.forEach((sentence, index) => {
      if (index === 0 && marker) {
        kept.push(sentence);
        return;
      }
      const ending = /[。！？；]+$/.exec(sentence)?.[0] ?? "";
      if (zhEmpty(sentence, terms) && !inSource(sentence)) {
        removed.push(sentence.trim());
        // A dropped 「；」 clause hands its full stop to the clause before it.
        if (/。|！|？/.test(ending) && kept.length && /；$/.test(kept[kept.length - 1])) {
          kept[kept.length - 1] = kept[kept.length - 1].replace(/；$/, ending);
        }
        return;
      }
      // Trailing clauses: 「……，也是后续研究可以继续讨论的方向。」「……，未来研究仍需……，以推进……转型。」
      let clauses = sentence.replace(/[。！？；]+$/, "").split("，");
      const dropped: string[] = [];
      while (clauses.length > 1) {
        const tail = clauses[clauses.length - 1];
        if (!zhEmptyTail(tail, terms) || inSource(tail)) break;
        dropped.push(tail.trim());
        clauses = clauses.slice(0, -1);
      }
      const rest = clauses.join("，");
      // What remains may itself be an empty balance (「可见，……既带来机遇，也伴随挑战」).
      if (dropped.length && zhBalance(rest) && !inSource(rest)) {
        removed.push(rest.trim(), ...dropped);
        if (/。|！|？/.test(ending) && kept.length && /；$/.test(kept[kept.length - 1])) {
          kept[kept.length - 1] = kept[kept.length - 1].replace(/；$/, ending);
        }
        return;
      }
      if (dropped.length) {
        removed.push(...dropped);
        kept.push(`${rest}${ending}`);
        return;
      }
      kept.push(sentence);
    });
    if (!removed.length || !kept.join("").trim()) return { text, removed: [] };
    return { text: kept.join("").replace(/；$/, "。"), removed };
  }

  const sentences = enSentences(text);
  const kept: string[] = [];
  sentences.forEach((sentence, index) => {
    if (index === 0 && marker) {
      kept.push(sentence);
      return;
    }
    if (enEmpty(sentence, terms) && !inSource(sentence)) {
      removed.push(sentence.trim());
      return;
    }
    kept.push(sentence);
  });
  if (!removed.length || !kept.join("").trim()) return { text, removed: [] };
  return { text: kept.join("").trim(), removed };
}

/**
 * Apply removeEmptyOutlook to model output. Headings, locked blocks and quote/formula/reference blocks are
 * never touched. mode "rewrite" only removes sentences that the source block did not already contain.
 */
export function stripEmptyOutlook(
  original: DocumentBlock[],
  output: ParagraphRewrite[],
  terms: string[],
  mode: "humanize" | "rewrite",
): ParagraphRewrite[] {
  const byId = new Map(original.map((block) => [block.id, block]));
  return output.map((item) => {
    const source = byId.get(item.id);
    if (!source || source.locked || (source.kind !== "paragraph" && source.kind !== "list")) return item;
    const result = removeEmptyOutlook(item.text, terms, mode === "rewrite" ? source.text : undefined);
    if (!result.removed.length) return item;
    return { ...item, text: result.text };
  });
}
