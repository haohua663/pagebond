import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  WRITE_FIELD_OPTIONS,
  normalizeWriteField,
  type WriteField,
} from "@/lib/conceive/field-guides";

const FALLBACK_GUIDE: Record<WriteField, string> = {
  natural: [
    "领域：自然科学。证据先于文字；方法/结果/伦理不可编造。",
    "缺证据标「〔待核实〕」；不把相关写成因果。",
    "参考 skill：scientific-writing、nature-proposal-writer。",
  ].join("\n"),
  cs_ml: [
    "领域：计算机 / 机器学习。按节起草；主张须能对应方法或实验计划。",
    "禁止编造精度数字、数据集结果、未做的消融；引用仅用已提供文献列表。",
    "参考 skill：paper-write、AI-Research-SKILLs。",
  ].join("\n"),
  social: [
    "领域：人文社科。先澄清研究问题与论证链，再写段落。",
    "文献与数据主张须可核验；不编造问卷结果或田野细节。",
    "参考 skill：social-science-paper-writing、research-writing-skill。",
  ].join("\n"),
  other: [
    "领域未指定：默认按自然科学证据优先规则。",
    "不编造文献与数据；缺材料写入 openGaps。",
  ].join("\n"),
};

function readSkillExcerpt(repoRoot: string, skillPath: string, maxChars = 1800): string | null {
  const candidates = ["SKILL.md", "references/key_principles.md", "README.md"];
  for (const name of candidates) {
    const full = path.join(repoRoot, skillPath, name);
    if (!existsSync(full)) continue;
    try {
      const raw = readFileSync(full, "utf8");
      const body = raw.replace(/^---[\s\S]*?---\s*/, "").trim();
      if (body.length < 40) continue;
      return `「${skillPath}/${name}」摘录：\n${body.slice(0, maxChars)}`;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function resolveWriteFieldGuide(writeField: WriteField, repoRoot = process.cwd()): {
  field: WriteField;
  label: string;
  skillPaths: string[];
  guideText: string;
} {
  const field = normalizeWriteField(writeField);
  const option = WRITE_FIELD_OPTIONS.find((item) => item.id === field) || WRITE_FIELD_OPTIONS[3];
  const excerpts: string[] = [];
  for (const skillPath of option.skillPaths) {
    const hit = readSkillExcerpt(repoRoot, skillPath);
    if (hit) excerpts.push(hit);
    if (excerpts.length >= 2) break;
  }
  const guideText = [FALLBACK_GUIDE[option.id], excerpts.length ? "\n---\n" + excerpts.join("\n\n") : ""]
    .join("")
    .slice(0, 6000);
  return {
    field: option.id,
    label: option.label,
    skillPaths: option.skillPaths,
    guideText,
  };
}
