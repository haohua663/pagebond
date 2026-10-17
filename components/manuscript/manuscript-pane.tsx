"use client";

import { useEffect, useMemo, useState } from "react";
import type { BlockCheck } from "@/lib/analysis/validate";
import { changedSentencePairs } from "@/lib/analysis/sentence-diff";
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
  if (view === "compare") {
    return (
      <CompareFocus
        original={original}
        current={current}
        checks={checks}
        accept={accept}
        readOnly={readOnly}
        activeId={activeId}
        onAccept={onAccept}
        onRevert={onRevert}
      />
    );
  }

  const checkById = new Map(checks.map((check) => [check.id, check]));
  const blocks = view === "current" ? current : original;

  return (
    <article className="manuscript text-ink">
      {blocks.map((block) => {
        const check = checkById.get(block.id);
        const state = accept[block.id];
        const changed = Boolean(check?.changed);
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
              <h2 className={block.level <= 1 ? "text-2xl" : "text-xl"}>{block.text}</h2>
            ) : (
              <p className="whitespace-pre-wrap">{block.text}</p>
            )}
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
                  className="desk-input manuscript mt-1 w-full p-2 text-ink"
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

function CompareFocus({
  original,
  current,
  checks,
  accept,
  readOnly,
  activeId,
  onAccept,
  onRevert,
}: {
  original: DocumentBlock[];
  current: DocumentBlock[];
  checks: BlockCheck[];
  accept: Record<string, AcceptState>;
  readOnly: boolean;
  activeId: string | null;
  onAccept: (id: string) => void;
  onRevert: (id: string) => void;
}) {
  const checkById = useMemo(() => new Map(checks.map((check) => [check.id, check])), [checks]);
  const currentById = useMemo(() => new Map(current.map((block) => [block.id, block])), [current]);

  const paragraphs = useMemo(
    () =>
      original.filter((block) => {
        if (block.kind === "heading") return false;
        const revisedText = currentById.get(block.id)?.text;
        return Boolean(checkById.get(block.id)?.changed) || (revisedText !== undefined && revisedText !== block.text);
      }),
    [original, currentById, checkById],
  );

  const paragraphNumber = useMemo(
    () => new Map(original.filter((item) => item.kind !== "heading").map((item, itemIndex) => [item.id, itemIndex])),
    [original],
  );

  const changedIds = useMemo(
    () => paragraphs.filter((block) => checkById.get(block.id)?.changed).map((block) => block.id),
    [paragraphs, checkById],
  );

  const initialId = useMemo(() => {
    if (activeId && paragraphs.some((block) => block.id === activeId)) return activeId;
    return changedIds[0] || paragraphs[0]?.id || "";
  }, [activeId, paragraphs, changedIds]);

  const [selectedId, setSelectedId] = useState(initialId);

  useEffect(() => {
    setSelectedId(initialId);
  }, [initialId]);

  useEffect(() => {
    if (!paragraphs.some((block) => block.id === selectedId)) {
      setSelectedId(changedIds[0] || paragraphs[0]?.id || "");
    }
  }, [paragraphs, selectedId, changedIds]);

  const index = Math.max(
    0,
    paragraphs.findIndex((block) => block.id === selectedId),
  );
  const block = paragraphs[index];
  if (!block) {
    return <p className="text-sm text-ink-soft">还没有改动的地方。先完成「人话化并改写」。</p>;
  }

  const revised = currentById.get(block.id);
  const check = checkById.get(block.id);
  const state = accept[block.id];
  const pairs = revised ? changedSentencePairs(block.text, revised.text) : [];

  function go(delta: number) {
    const next = Math.min(paragraphs.length - 1, Math.max(0, index + delta));
    setSelectedId(paragraphs[next]?.id || selectedId);
  }

  return (
    <div className="space-y-3" data-testid="compare-focus">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 font-ui text-sm text-ink-soft" htmlFor="compare-segment">
          选择段落
          <select
            id="compare-segment"
            data-testid="compare-segment-select"
            className="desk-input mt-1 min-h-11 w-full px-3 text-ink"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {paragraphs.map((item, itemIndex) => {
              return (
                <option key={item.id} value={item.id}>
                  {`第 ${(paragraphNumber.get(item.id) ?? itemIndex) + 1} 段`}
                </option>
              );
            })}
          </select>
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="quiet" disabled={index <= 0} onClick={() => go(-1)}>
            上一段
          </Button>
          <Button type="button" variant="quiet" disabled={index >= paragraphs.length - 1} onClick={() => go(1)}>
            下一段
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 font-ui text-sm text-ink-soft">
        <span>
          第 {index + 1} / {paragraphs.length} 处改动
        </span>
        {state === "accepted" || state === "manual" ? <span>{STATUS_LABEL[state]}</span> : null}
      </div>

      <div className="space-y-3" data-testid="compare-side-by-side">
        {pairs.length ? (
          pairs.map((pair, pairIndex) => (
            <div key={`${block.id}-p-${pairIndex}`} className="grid gap-2 md:grid-cols-2">
              <section className="rounded-xl border border-line bg-paper/70 p-3">
                <p className="font-ui text-sm text-ink-soft">原文</p>
                <p className="manuscript mt-1 whitespace-pre-wrap text-ink">{pair.before || "（新增）"}</p>
              </section>
              <section className="rounded-xl border border-line bg-sunk/50 p-3">
                <p className="font-ui text-sm text-ink-soft">改文</p>
                <p className="manuscript mt-1 whitespace-pre-wrap text-ink">{pair.after || "（删去）"}</p>
              </section>
            </div>
          ))
        ) : (
          <p className="font-ui text-sm text-ink-soft">这一段没有改动。</p>
        )}
      </div>


      {!readOnly && check && check.status !== "reverted" && check.changed ? (
        <div className="flex flex-wrap gap-2 font-ui">
          <Button type="button" variant="lime" onClick={() => onAccept(block.id)}>
            接受这段
          </Button>
          <Button type="button" variant="quiet" onClick={() => onRevert(block.id)}>
            撤销这段
          </Button>
        </div>
      ) : null}
    </div>
  );
}
