/** User-facing writing field for 起稿 → 写作. Client-safe (no node:fs). */

export type WriteField = "natural" | "cs_ml" | "social" | "other";

export type WriteFieldOption = {
  id: WriteField;
  label: string;
  blurb: string;
  /** Repo-relative skill / docs folders (encoded for UI + API). */
  skillPaths: string[];
};

export const WRITE_FIELD_OPTIONS: WriteFieldOption[] = [
  {
    id: "natural",
    label: "自然科学",
    blurb: "证据与报告规范优先；不编造数据与伦理批件。",
    skillPaths: [
      "skills/third-party/scientific-agent-skills/scientific-writing",
      "skills/third-party/nature-skills/nature-proposal-writer",
      "docs/scientific-writing",
    ],
  },
  {
    id: "cs_ml",
    label: "计算机/机器学习",
    blurb: "按节起草、主张–证据对齐；不编造实验结果与引用。",
    skillPaths: [
      "skills/third-party/Auto-claude-code-research-in-sleep/paper-write",
      "skills/third-party/AI-Research-SKILLs",
      "skills/third-party/Auto-claude-code-research-in-sleep",
    ],
  },
  {
    id: "social",
    label: "人文社科",
    blurb: "问题意识、文献与论证结构；引用可核验。",
    skillPaths: [
      "skills/third-party/social-science-paper-writing-skill",
      "skills/third-party/codex-claude-academic-skills/research-writing-skill",
      "skills/third-party/nature-skills/nature-social-science",
    ],
  },
  {
    id: "other",
    label: "其他",
    blurb: "按材料判断；不确定时按自然科学证据优先。",
    skillPaths: [
      "skills/third-party/nature-skills/nature-proposal-writer",
      "docs/scientific-writing",
      "skills/third-party/scientific-agent-skills/scientific-writing",
    ],
  },
];

export function normalizeWriteField(value: unknown): WriteField {
  if (value === "natural" || value === "cs_ml" || value === "social" || value === "other") return value;
  return "other";
}
