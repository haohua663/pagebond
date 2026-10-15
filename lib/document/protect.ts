import type { Protection, ProtectionKind } from "@/lib/document/types";

interface Rule {
  kind: ProtectionKind;
  re: RegExp;
}

const RULES: Rule[] = [
  {
    kind: "formula",
    re: /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g,
  },
  {
    kind: "quote",
    re: /“[^”]{1,800}”|「[^」]{1,800}」|『[^』]{1,800}』|\"[^\"\n]{2,400}\"/g,
  },
  {
    kind: "citation",
    re: /\[\d+(?:\s*[,，、\-–—]\s*\d+)*\]|（[^）\n]{0,40}?\d{4}[a-z]?[^）\n]{0,24}）|\([A-Z][^)\n]{0,48}?\d{4}[a-z]?[^)\n]{0,24}\)/g,
  },
  {
    kind: "number-unit",
    re: /\d+(?:\.\d+)?\s*(?:%|％|个百分点|倍)|\d+(?:\.\d+)?\s*(?:人次|平方英尺|平方千米|平方米|平方公里|公里|厘米|毫米|千克|毫克|毫升|小时|分钟|个月|人|名|次|例|篇|项|组|天|年|月|日|周|米|克|升|元|分)|[pP]\s*[<>]=?\s*0?\.\d+|(?:n|N)\s*=\s*\d+|\d+\s*±\s*\d+(?:\.\d+)?/g,
  },
];

function overlaps(spans: { start: number; end: number }[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

export function findProtections(text: string): Protection[] {
  const spans: { start: number; end: number; kind: ProtectionKind; text: string }[] = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const found = match[0];
      if (!found.trim()) continue;
      if (overlaps(spans, match.index, match.index + found.length)) continue;
      spans.push({
        start: match.index,
        end: match.index + found.length,
        kind: rule.kind,
        text: found,
      });
    }
  }
  return spans.map(({ kind, text: value }) => ({ kind, text: value }));
}

export function missingProtections(original: Protection[], rewritten: string): Protection[] {
  return original.filter((item) => !rewritten.includes(item.text));
}
