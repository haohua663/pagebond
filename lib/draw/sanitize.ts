/**
 * Strip disclaimer / "待补" footnotes models often append to captions.
 */

const LINE_DISCLAIMER =
  /^\s*(?:注[：:]|注意[：:]|说明[：:]|备注[：:]|Disclaimer\s*:|Note\s*:).+/iu;

const INLINE_PATTERNS: RegExp[] = [
  /（?\s*注[：:][^）\n]{0,200}）?/gu,
  /\(\s*Note\s*:[^)]{0,200}\)/giu,
  /图中数值均来自[^。\n]*[。.]?/gu,
  /数值均来自原文[^。\n]*[。.]?/gu,
  /需填入真实数据[^。\n]*[。.]?/gu,
  /待用户补充[^。\n]*[。.]?/gu,
  /（待补）/gu,
  /【待补】/gu,
  /\[待补\]/gu,
  /待补[。.]?/gu,
  /以上内容仅供参考[^。\n]*[。.]?/gu,
  /不作为(?:投稿|发表|证据)[^。\n]*[。.]?/gu,
];

export function stripDrawDisclaimer(text: string): string {
  if (!text) return "";
  let out = text.replace(/\r\n/g, "\n");
  out = out
    .split("\n")
    .filter((line) => !LINE_DISCLAIMER.test(line))
    .join("\n");
  for (const re of INLINE_PATTERNS) {
    out = out.replace(re, "");
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function sanitizeDrawFields<T extends Record<string, unknown>>(data: T): T {
  const next = { ...data };
  for (const key of ["title", "captionZh", "captionEn", "designNotes", "pythonHint"] as const) {
    if (typeof next[key] === "string") {
      (next as Record<string, unknown>)[key] = stripDrawDisclaimer(next[key] as string);
    }
  }
  if (Array.isArray(next.evidenceMapping)) {
    (next as Record<string, unknown>).evidenceMapping = next.evidenceMapping.map((row) => {
      if (!row || typeof row !== "object") return row;
      const item = row as { element?: unknown; evidence?: unknown };
      return {
        ...item,
        element: typeof item.element === "string" ? stripDrawDisclaimer(item.element) : item.element,
        evidence: typeof item.evidence === "string" ? stripDrawDisclaimer(item.evidence) : item.evidence,
      };
    });
  }
  return next;
}
