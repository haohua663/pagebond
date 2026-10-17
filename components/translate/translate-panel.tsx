"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseUploadedFile } from "@/lib/document/parse-source";
import { exportDocxBlob } from "@/lib/document/export-doc";
import type { DocumentBlock } from "@/lib/document/types";
import {
  bodySegments,
  buildDisplayUnits,
  filterDisplayUnits,
  listTranslateSections,
  mergeSegmentTranslations,
  parseTranslateSource,
  plainFromBlocks,
} from "@/lib/translate/segments";

type SegmentSide = "translation" | "source";

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function TranslatePanel({
  sessionKey,
  model,
  sessionBaseUrl,
}: {
  sessionKey: string;
  model: string;
  sessionBaseUrl: string;
  onOpenSettings?: () => void;
}) {
  const [text, setText] = useState("");
  const [blocks, setBlocks] = useState<DocumentBlock[]>([]);
  const [resultBlocks, setResultBlocks] = useState<DocumentBlock[] | null>(null);
  const [sideById, setSideById] = useState<Record<string, SegmentSide>>({});
  /** Draft picks in the section list (before 应用). */
  const [draftSectionIds, setDraftSectionIds] = useState<Set<string>>(new Set());
  /** Applied filter; null = show all sections. */
  const [appliedSectionIds, setAppliedSectionIds] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const selectable = useMemo(() => bodySegments(blocks), [blocks]);
  const displayUnits = useMemo(() => {
    if (!resultBlocks?.length) return [];
    return buildDisplayUnits(blocks, resultBlocks);
  }, [blocks, resultBlocks]);
  const sections = useMemo(() => {
    const fromBlocks = listTranslateSections(blocks);
    if (fromBlocks.length) return fromBlocks;
    // Fallback: titles folded into display units (mis-parsed paragraphs promoted).
    const seen = new Set<string>();
    const out: { id: string; title: string }[] = [];
    for (const unit of displayUnits) {
      if (!unit.sectionId || !unit.headingLines.length || seen.has(unit.sectionId)) continue;
      seen.add(unit.sectionId);
      out.push({ id: unit.sectionId, title: unit.headingLines[unit.headingLines.length - 1] });
    }
    return out;
  }, [blocks, displayUnits]);
  const visibleUnits = useMemo(
    () => filterDisplayUnits(displayUnits, appliedSectionIds),
    [displayUnits, appliedSectionIds],
  );
  const showSectionPicker = Boolean(resultBlocks?.length) && sections.length > 0;

  const rebuildFromText = useCallback((next: string) => {
    setText(next);
    const parsed = parseTranslateSource(next);
    setBlocks(parsed);
    setResultBlocks(null);
    setSideById({});
    setDraftSectionIds(new Set());
    setAppliedSectionIds(null);
  }, []);

  const ingestFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const parsed = await parseUploadedFile(file.name, await file.arrayBuffer(), file.size);
        const plain = plainFromBlocks(parsed.document.blocks).trim();
        if (!plain) {
          setError(parsed.document.warnings[0]?.message || "没有读到正文。");
          return;
        }
        rebuildFromText(plain);
      } catch (err) {
        setError(err instanceof Error ? err.message : "文件无法解析。");
      }
    },
    [rebuildFromText],
  );

  const postTranslate = useCallback(
    async (payload: Record<string, unknown>) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sessionKey.trim()) headers["X-Pagebond-Session-Key"] = sessionKey.trim();
      if (sessionBaseUrl.trim() && sessionKey.trim()) {
        const base = sessionBaseUrl.trim().replace(/\/+$/, "");
        if (base) headers["X-Pagebond-Session-Base-Url"] = base;
      }
      const body = sessionKey.trim() ? { ...payload, model: model || undefined } : payload;
      const response = await fetch("/api/translate", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok || !data || data.ok !== true) {
        const message =
          (typeof data?.message === "string" && data.message) ||
          (response.status === 401
            ? "没有可用密钥。请在设置中配置 DeepSeek / LLM 密钥，或使用自带密钥。"
            : `翻译失败（${response.status}）。`);
        throw new Error(message);
      }
      return data;
    },
    [sessionKey, sessionBaseUrl, model],
  );

  const runTranslate = useCallback(async () => {
    const source = text.trim();
    if (!source) {
      setError("请先粘贴或拖入要翻译的正文。");
      return;
    }
    setRunning(true);
    setError(null);
    setSideById({});
    setAppliedSectionIds(null);
    try {
      if (blocks.length && selectable.length) {
        const data = await postTranslate({
          direction: "auto",
          segments: selectable.map((b) => ({ id: b.id, text: b.text })),
        });
        const segs = Array.isArray(data.segments)
          ? (data.segments as { id?: string; translation?: string }[])
              .filter((s) => typeof s?.id === "string" && typeof s?.translation === "string")
              .map((s) => ({ id: s.id as string, translation: s.translation as string }))
          : [];
        if (!segs.length) throw new Error("模型没有返回可用的分段译文。");
        const merged = mergeSegmentTranslations(blocks, segs);
        setResultBlocks(merged);
        const sides: Record<string, SegmentSide> = {};
        for (const b of selectable) sides[b.id] = "translation";
        setSideById(sides);
        const sectionIds = new Set(listTranslateSections(blocks).map((s) => s.id));
        setDraftSectionIds(sectionIds);
        return;
      }
      const data = await postTranslate({ text: source, direction: "auto" });
      const translation = typeof data.translation === "string" ? data.translation : "";
      if (!translation.trim()) throw new Error("模型没有返回可用译文。");
      const sourceBlock: DocumentBlock = {
        id: "p-001",
        order: 0,
        kind: "paragraph",
        level: 0,
        text: source,
        locked: false,
        protections: [],
      };
      const resultBlock: DocumentBlock = { ...sourceBlock, text: translation };
      setBlocks([sourceBlock]);
      setResultBlocks([resultBlock]);
      setSideById({ "p-001": "translation" });
      setDraftSectionIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "翻译失败。");
    } finally {
      setRunning(false);
    }
  }, [text, blocks, selectable, postTranslate]);

  async function downloadTranslation() {
    if (!resultBlocks?.length) return;
    const blob = await exportDocxBlob(resultBlocks, "译文");
    await downloadBlob(blob, "译文.docx");
  }

  function clearAll() {
    rebuildFromText("");
    setError(null);
  }

  function flipSegment(id: string) {
    setSideById((prev) => ({
      ...prev,
      [id]: prev[id] === "source" ? "translation" : "source",
    }));
  }

  function toggleDraftSection(id: string) {
    setDraftSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllSections() {
    setDraftSectionIds(new Set(sections.map((s) => s.id)));
  }

  function clearSectionDraft() {
    setDraftSectionIds(new Set());
  }

  function applySectionFilter() {
    if (draftSectionIds.size === 0 || draftSectionIds.size === sections.length) {
      setAppliedSectionIds(null);
      return;
    }
    setAppliedSectionIds(new Set(draftSectionIds));
  }

  const hasResult = Boolean(resultBlocks?.length);

  return (
    <section
      className="desk-card flex w-full min-w-0 max-w-none flex-col gap-4 p-4 sm:p-6"
      data-testid="translate-panel"
    >
      <h2 className="text-xl font-semibold tracking-tight text-ink">翻译</h2>

      <div
        className={`relative w-full min-w-0 rounded-xl border border-line transition-colors ${
          dragOver ? "border-ink bg-sunk/60" : "bg-paper"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void ingestFile(file);
        }}
      >
        <label className="sr-only" htmlFor="translate-input">
          原文
        </label>
        <textarea
          id="translate-input"
          data-testid="translate-input"
          className="min-h-56 w-full resize-y rounded-xl bg-transparent px-3 py-2 text-base text-ink outline-none focus:ring-0"
          placeholder=""
          value={text}
          onChange={(e) => rebuildFromText(e.target.value)}
          disabled={running}
        />
        <input
          data-testid="translate-file"
          className="sr-only"
          type="file"
          accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void ingestFile(file);
            event.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="lime" onClick={() => void runTranslate()} disabled={running || !text.trim()}>
          {running ? "翻译中…" : "开始翻译"}
        </Button>
        <Button type="button" variant="quiet" onClick={clearAll} disabled={running}>
          清空
        </Button>
        {hasResult ? (
          <Button
            type="button"
            variant="quiet"
            data-testid="download-translate-docx"
            onClick={() => void downloadTranslation()}
            disabled={running}
          >
            下载译文
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-700" data-testid="translate-error" role="alert">
          {error}
        </p>
      ) : null}

      {showSectionPicker ? (
        <div className="w-full min-w-0 rounded-xl border border-line bg-paper p-3" data-testid="translate-section-picker">
          <div className="mb-2 flex flex-wrap gap-2">
            <Button type="button" variant="ghost" className="min-h-9 px-3 text-sm" onClick={selectAllSections}>
              全选
            </Button>
            <Button type="button" variant="ghost" className="min-h-9 px-3 text-sm" onClick={clearSectionDraft}>
              清除
            </Button>
            <Button
              type="button"
              variant="quiet"
              className="min-h-9 px-3 text-sm"
              data-testid="translate-section-apply"
              onClick={applySectionFilter}
            >
              应用选段
            </Button>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {sections.map((section) => (
              <li key={section.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sunk/50">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0"
                    checked={draftSectionIds.has(section.id)}
                    data-testid={`translate-section-${section.id}`}
                    onChange={() => toggleDraftSection(section.id)}
                  />
                  <span className="text-sm font-medium text-ink">{section.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasResult ? (
        <div className="w-full min-w-0 space-y-2" data-testid="translate-result-segments">
          {visibleUnits.map((unit) => {
            const side = sideById[unit.id] ?? "translation";
            const body = side === "source" ? unit.bodySource : unit.bodyTranslation;
            const headingLines = unit.headingLines;
            const label = side === "source" ? "原文" : "译文";
            return (
              <button
                key={unit.id}
                type="button"
                data-testid={`translate-seg-toggle-${unit.id}`}
                className="w-full min-w-0 cursor-pointer rounded-xl border border-line bg-sunk/40 px-3 py-3 text-left outline-none transition-colors hover:border-ink focus-visible:ring-2 focus-visible:ring-ink"
                onClick={() => flipSegment(unit.id)}
                aria-label={`${label}，点击切换原文与译文`}
              >
                <span className="mb-1 block text-xs font-medium tracking-wide text-ink-soft">{label}</span>
                {headingLines.map((line, index) => (
                  <div key={`${unit.id}-h-${index}`} className="font-bold text-ink">
                    {line}
                  </div>
                ))}
                <div
                  className={`whitespace-pre-wrap text-base leading-relaxed text-ink ${
                    headingLines.length ? "mt-1" : ""
                  }`}
                >
                  {body}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
