export type ArticleType = "empirical" | "review" | "theory" | "course" | "other";

export type DraftLanguage = "zh" | "en" | "unset";

export type RewriteLevel = "conservative" | "standard";

export type BlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "quote"
  | "formula"
  | "reference"
  | "table"
  | "caption";

export type ProtectionKind = "formula" | "quote" | "number-unit" | "citation" | "reference";

export interface Protection {
  kind: ProtectionKind;
  text: string;
}

export interface ParseWarning {
  code:
    | "empty"
    | "garbled"
    | "scan-pdf"
    | "encrypted-or-corrupt"
    | "missing-pages"
    | "dangerous-html"
    | "pseudo-instruction"
    | "no-heading"
    | "double-column"
    | "unsupported"
    | "too-large";
  message: string;
}

export interface DocumentBlock {
  id: string;
  order: number;
  kind: BlockKind;
  level: number;
  text: string;
  locked: boolean;
  protections: Protection[];
  listOrdered?: boolean;
}

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
}

export interface ParsedDocument {
  blocks: DocumentBlock[];
  warnings: ParseWarning[];
  unsupported: string[];
  outline: OutlineItem[];
  stats: { chars: number; words: number };
  title: string;
}

export interface IntakeOptions {
  articleType: ArticleType;
  purpose: string;
  language: DraftLanguage;
  level: RewriteLevel;
  scopeNote: string;
  lockedBlockIds: string[];
  lockedTerms: string[];
}

export const ARTICLE_TYPE_LABEL: Record<ArticleType, string> = {
  empirical: "实证研究",
  review: "文献综述",
  theory: "理论／人文论证",
  course: "课程论文",
  other: "其他",
};

export function emptyOptions(): IntakeOptions {
  return {
    articleType: "other",
    purpose: "",
    language: "unset",
    level: "conservative",
    scopeNote: "",
    lockedBlockIds: [],
    lockedTerms: [],
  };
}
