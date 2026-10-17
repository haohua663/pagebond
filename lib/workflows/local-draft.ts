import type { OutlineSection } from "@/lib/workflows/conceive";

export type LocalSectionDraft = {
  heading: string;
  markdown: string;
  openGaps: string[];
  citedIds: string[];
  origin: "local";
};

/** Offline skeleton when no model key — never invents citations. */
export function localSectionDraft(section: OutlineSection, theme: string): LocalSectionDraft {
  const gaps = [
    ...(section.openQuestions || []),
    section.evidence ? `需核对证据：${section.evidence}` : "本节证据来源尚未登记",
  ].filter(Boolean);

  const markdown = [
    "> 草稿 · 不可投稿",
    "",
    `## ${section.heading}`,
    "",
    theme ? `（围绕主题：${theme}）` : "",
    "",
    `**本节目的**：${section.purpose || "〔待核实〕"}`,
    "",
    `**拟写要点**：${section.content || "〔待核实〕"}`,
    "",
    "正文尚未由模型起草。请先完成「构思」框架与（可选）「检索」，再点「起草本节」。",
    "",
    gaps.length ? `**开放缺口**：\n${gaps.map((g) => `- ${g}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    heading: section.heading,
    markdown,
    openGaps: gaps.slice(0, 8),
    citedIds: [],
    origin: "local",
  };
}
