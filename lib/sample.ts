import type { Suggestion } from "@/lib/analysis/suggestions";

export const SAMPLE_REVISE = `引言

课堂反馈与学习投入相关。本研究调查了 128 名学生，满意度从 10% 上升到 15%，差异未显著（p = 0.42）。

作者写道：“这不是工具，而是一面镜子。”本文只讨论这句话为何被反复套用。

充分彰显了研究的重要价值。`;

export const SAMPLE_SUGGESTIONS: Suggestion[] = [
  {
    id: "sample-1",
    priority: "low",
    dimension: "expression",
    version: "confirmed-input",
    blockId: "p-004",
    quote: "充分彰显",
    problem: "这是套话，删掉它不损失前面的数字。",
    change: "直接说这一段要补充的事实；没有事实就删句。",
    verify: "确认没有新的数字被加进来。",
    origin: "local",
  },
];

export const SAMPLE_CONCEIVE = `题目：课堂反馈是否改变学生的修改行为
字数不少于 8000 字。
不得编造访谈。截止时间由课程说明另发。
学生必须使用课程提供的 12 份匿名稿件。`;
