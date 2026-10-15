"use client";

import type { Suggestion } from "@/lib/analysis/suggestions";

const DIMENSION: Record<Suggestion["dimension"], string> = {
  structure: "结构",
  argument: "论证",
  evidence: "证据",
  method: "方法",
  expression: "表达",
  fact: "事实",
};

export function SuggestionRail({
  suggestions,
  notice,
  onOpen,
}: {
  suggestions: Suggestion[];
  notice?: string | null;
  onOpen: (suggestion: Suggestion) => void;
}) {
  return (
    <aside className="border border-line bg-paper p-4" aria-label="建议">
      <h2 className="text-lg">页边建议</h2>
      <p className="mt-1 text-sm text-ink-soft">未进行外部查重／AI 检测。</p>
      {notice ? <p className="mt-3 border-l-4 border-lime pl-3 text-ink">{notice}</p> : null}
      {suggestions.length === 0 ? <p className="mt-4 text-ink-soft">确认文稿之后，能定位的问题会出现在这里。</p> : null}
      <ul className="mt-4 space-y-4">
        {suggestions.map((suggestion) => (
          <li key={suggestion.id} className="border-l-4 border-lime pl-3">
            <button type="button" className="min-h-11 w-full cursor-pointer text-left" onClick={() => onOpen(suggestion)}>
              <span className="text-sm text-ink-soft">
                {DIMENSION[suggestion.dimension]} · {suggestion.priority === "high" ? "高" : suggestion.priority === "medium" ? "中" : "低"} ·{" "}
                {suggestion.origin === "model" ? "模型" : "本地"} · {suggestion.blockId}
              </span>
              <span className="mt-1 block text-ink">“{suggestion.quote}”</span>
            </button>
            <p className="mt-2 text-ink">{suggestion.problem}</p>
            <p className="mt-1 text-ink-soft">{suggestion.change}</p>
            <p className="mt-1 text-sm text-ink-soft">需要核对：{suggestion.verify}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
