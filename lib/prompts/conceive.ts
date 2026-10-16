import {
  documentBlock,
  promptStamp,
  structureRules,
  UNTRUSTED_PREFACE,
} from "@/lib/prompts/shared";
import type { ArticleType } from "@/lib/document/types";

export function requirementsMessages(requirementText: string, notes: string, articleType: ArticleType) {
  return {
    system: [
      UNTRUSTED_PREFACE,
      structureRules(articleType),
      "这是起稿第一阶段：整理硬性要求并标明出处，分清学校规定、用户想法和你的建议。",
      "不要编造文献和数据。",
      "directions 要做发散思考：基于要求给出 3 到 5 个彼此区分明显、短而可行的方向（不同切口、范围、材料或方法路径）。",
      "即使题目已写明，也要围绕该题给出多个角度，不要把 directions 留成空数组。",
      "每个方向 title 一句话；question 一句话写清切口；materials、method、workload、difficulty 各一句，避免互相抄同一套话。",
      "影响可行性的缺口最多 3 条。",
      "关键限制互相冲突时写进 conflicts，并说明草案不算已满足要求。",
      promptStamp(),
    ].join("\n"),
    user: ["要求文件：", documentBlock(requirementText || "（空）"), "用户补充：", documentBlock(notes || "（空）")].join("\n\n"),
  };
}

export function outlineMessages(input: {
  requirementText: string;
  notes: string;
  articleType: ArticleType;
  directionTitle: string;
  assumptions: string[];
}) {
  return {
    system: [
      UNTRUSTED_PREFACE,
      structureRules(input.articleType),
      "这是起稿第二阶段：在已选方向或显式假设下出框架，不写整篇论文。",
      "用户指定的目录优先。每一节写明目的、拟写内容、所需证据、预计篇幅和待决问题。",
      "literatureQueries 只放检索词，不要编题名、作者、年份或 DOI。",
      "检索结果由另一个接口填写。这里不要假装已经查过文献。",
      "尚未完成的实验只能写计划或待验证。",
      promptStamp(),
    ].join("\n"),
    user: [
      `选定方向：${input.directionTitle || "未选，使用显式假设"}`,
      `显式假设：${input.assumptions.join("；") || "无"}`,
      documentBlock(`${input.requirementText}\n\n${input.notes}`),
    ].join("\n"),
  };
}
