"use client";

import type { BlockCheck } from "@/lib/analysis/validate";
import { compareExpressions } from "@/lib/analysis/overlap";
import type { DocumentBlock } from "@/lib/document/types";
import type { AcceptState } from "@/lib/workflows/revise";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<string, string> = {
  passed: "检查通过",
  reverted: "已回退",
  "needs-review": "待人工检查",
  pending: "尚未决定",
  accepted: "已接受",
  manual: "手动改过",
};

export function ManuscriptPane({
  view,
  original,
  current,
  checks,
  accept,
  readOnly,
  activeId,
  onAccept,
  onRevert,
  onManual,
}: {
  view: "original" | "compare" | "current";
  original: DocumentBlock[];
  current: DocumentBlock[];
  checks: BlockCheck[];
  accept: Record<string, AcceptState>;
  readOnly: boolean;
  activeId: string | null;
  onAccept: (id: string) => void;
  onRevert: (id: string) => void;
  onManual: (id: string, text: string) => void;
}) {
  const checkById = new Map(checks.map((check) => [check.id, check]));
  const currentById = new Map(current.map((block) => [block.id, block]));
  const blocks = view === "current" ? current : original;

  return (
    <article className="manuscript text-ink">
      <p className="mb-4 border-l-4 border-lime pl-3 font-ui text-sm not-italic text-ink">未进行外部查重／AI 检测。下面只标出哪些表达变了，不计算查重或检测分数。</p>
      {blocks.map((block) => {
        const check = checkById.get(block.id);
        const revised = currentById.get(block.id);
        const state = accept[block.id];
        const changed = Boolean(check?.changed);
        const expressions =
          view === "compare" && revised ? compareExpressions(block.id, block.text, revised.text, block.protections) : null;
        return (
          <section
            key={block.id}
            id={`block-${block.id}`}
            data-block-id={block.id}
            className={`mb-5 border-l-4 py-1 pl-3 ${activeId === block.id || changed ? "border-lime" : "border-transparent"}`}
          >
            <div className="mb-1 flex flex-wrap gap-2 font-ui text-sm text-ink-soft">
              <span>{block.id}</span>
              {block.kind === "heading" ? <span>标题</span> : null}
              {block.locked ? <span>锁定</span> : null}
              {check ? <span>{STATUS_LABEL[check.status]}</span> : null}
              {state ? <span>{STATUS_LABEL[state] ?? state}</span> : null}
              {changed ? <span>表达有变化</span> : <span>表达未改</span>}
            </div>
            {block.kind === "heading" ? (
              <h2 className={block.level <= 1 ? "text-2xl" : "text-xl"}>{view === "current" ? block.text : block.text}</h2>
            ) : (
              <p className="whitespace-pre-wrap">{view === "compare" ? block.text : block.text}</p>
            )}
            {view === "compare" && revised && revised.text !== block.text ? (
              <div className="mt-2 bg-sunk/70 p-3 font-ui text-base">
                <p className="text-ink">建议稿</p>
                <p className="manuscript mt-1 whitespace-pre-wrap">{revised.text}</p>
                {expressions?.changed.length ? (
                  <ul className="mt-2 list-disc pl-5 text-ink">
                    {expressions.changed.map((item, index) => (
                      <li key={`${block.id}-c-${index}`}>
                        {item.before ? `原表达：${item.before}` : "新增表达"}
                        {item.after ? ` → ${item.after}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {expressions?.held.length ? (
                  <p className="mt-2 text-ink-soft">仍保持的引用、数字或锁定内容：{expressions.held.map((item) => item.text).join("、")}</p>
                ) : null}
              </div>
            ) : null}
            {!readOnly && check && check.status !== "reverted" && check.changed ? (
              <div className="mt-2 flex flex-wrap gap-2 font-ui">
                <Button type="button" variant="lime" onClick={() => onAccept(block.id)}>
                  接受这段
                </Button>
                <Button type="button" variant="quiet" onClick={() => onRevert(block.id)}>
                  撤销这段
                </Button>
              </div>
            ) : null}
            {!readOnly && view === "current" && block.kind !== "heading" ? (
              <label className="mt-2 block font-ui text-sm text-ink-soft">
                手动修改这一段
                <textarea
                  className="manuscript mt-1 w-full border border-line bg-paper p-2 text-ink"
                  rows={3}
                  defaultValue={block.text}
                  onBlur={(event) => {
                    if (event.target.value !== block.text) onManual(block.id, event.target.value);
                  }}
                />
              </label>
            ) : null}
            {check?.reasons.length ? <p className="mt-2 font-ui text-sm text-ink">{check.reasons.join("；")}</p> : null}
          </section>
        );
      })}
    </article>
  );
}
