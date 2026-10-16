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
    <aside className="desk-card p-5" aria-label="建议">
      <h2 className="text-base font-medium tracking-tight">页边建议</h2>
      {notice ? <p className="mt-3 rounded-xl border border-line bg-desk/70 px-3 py-2 text-sm text-ink">{notice}</p> : null}
      <ul className="mt-4 space-y-4">
        {suggestions.map((suggestion) => (
          <li key={suggestion.id} className="rounded-xl border border-line/80 bg-desk/40 px-3 py-3">
            <button type="button" className="min-h-11 w-full cursor-pointer text-left" onClick={() => onOpen(suggestion)}>
              <span className="text-sm text-ink-soft">
                {DIMENSION[suggestion.dimension]} · {suggestion.priority === "high" ? "高" : suggestion.priority === "medium" ? "中" : "低"} ·{" "}
                {suggestion.origin === "model" ? "模型" : "本地"} · {suggestion.blockId}
              </span>
              <span className="mt-1 block text-ink">“{suggestion.quote}”</span>
            </button>
            <p className="mt-2 text-ink">{suggestion.problem}</p>
            <p className="mt-1 text-ink-soft">{suggestion.change}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
