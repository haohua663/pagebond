"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { HoverEffect, type HoverCardItem } from "@/components/ui/card-hover-effect";
import { MissingKeyLink } from "@/components/settings/api-key-panel";
import { WRITE_FIELD_OPTIONS, type WriteField } from "@/lib/conceive/field-guides";
import type { LiteratureQueryResult } from "@/lib/providers/openalex";
import type { OutlineDraft, RequirementsBrief } from "@/lib/workflows/conceive";

export type ConceiveEntryChoice = "ideate" | "search" | "write" | null;
export type ConceivePanelId = "ideate" | "search" | "write" | null;

export type SectionDraft = {
  heading: string;
  markdown: string;
  openGaps: string[];
  citedIds: string[];
  origin: "local" | "model";
};

export type ConceivePanelState = {
  paste: string;
  notes: string;
  loaded: {
    source: "paste" | "file";
    fileName: string;
    editText: string;
    rawText: string;
    parsed: { stats: { chars: number } };
  } | null;
  error: string | null;
  paperId?: string;
  brief: RequirementsBrief | null;
  outline: OutlineDraft | null;
  direction: string;
  literature: LiteratureQueryResult[];
  queries: string;
  searchCommitted: boolean;
  activePanel: ConceivePanelId;
  entryChoice: ConceiveEntryChoice;
  writeField: WriteField | null;
  drafts: Record<string, SectionDraft>;
  draftHeading: string;
  modelError: string | null;
  running: boolean;
  saveState: "未保存" | "已保存" | "尚未保存";
  consent?: string;
};

const ENTRY_CARDS: (HoverCardItem & { id: NonNullable<ConceiveEntryChoice> })[] = [
  { id: "ideate", title: "构思", description: "整理要求并生成可执行框架。" },
  { id: "search", title: "检索", description: "输入检索词，确认后查看题名列表。" },
  { id: "write", title: "写作", description: "先选领域方向，再按节协助起草。" },
];

export function ConceivePanel({
  state,
  setConceive,
  onFile,
  onUsePaste,
  onIdeate,
  onSearch,
  onDraft,
  onSave,
  onBack,
  onOpenSettings,
}: {
  state: ConceivePanelState;
  setConceive: Dispatch<SetStateAction<ConceivePanelState>> | Dispatch<SetStateAction<any>>;
  onFile: (file: File) => void;
  onUsePaste: () => void;
  onIdeate: () => void;
  onSearch: () => void;
  onDraft: () => void;
  onSave: () => void;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  const entry = state.entryChoice ?? null;

  function pickEntry(id: NonNullable<ConceiveEntryChoice>) {
    setConceive((current: ConceivePanelState) => ({
      ...current,
      entryChoice: id,
      activePanel: id,
      searchCommitted: id === "search" ? false : current.searchCommitted,
      error: null,
      modelError: null,
    }));
  }

  function backToCards() {
    setConceive((current: ConceivePanelState) => ({
      ...current,
      entryChoice: null,
      activePanel: null,
      loaded: null,
      error: null,
      modelError: null,
      running: false,
    }));
  }

  if (!entry) {
    return (
      <div className="space-y-4" data-testid="conceive-setup">
        <header className="px-1">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">起稿</h2>
        </header>
        <HoverEffect
          items={ENTRY_CARDS}
          onSelect={(item) => {
            if (item.id === "ideate" || item.id === "search" || item.id === "write") pickEntry(item.id);
          }}
        />
      </div>
    );
  }

  if (entry === "ideate") {
    return (
      <IdeateFlow
        state={state}
        setConceive={setConceive}
        onFile={onFile}
        onUsePaste={onUsePaste}
        onIdeate={onIdeate}
        onSave={onSave}
        onBack={backToCards}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  if (entry === "search") {
    return (
      <SearchFlow
        state={state}
        setConceive={setConceive}
        onSearch={onSearch}
        onBack={backToCards}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  return (
    <WriteFlow
      state={state}
      setConceive={setConceive}
      onFile={onFile}
      onUsePaste={onUsePaste}
      onIdeate={onIdeate}
      onDraft={onDraft}
      onSave={onSave}
      onBack={backToCards}
      onOpenSettings={onOpenSettings}
    />
  );
}

function FullWidthIntake({
  testId,
  title,
  hint,
  paste,
  error,
  onPaste,
  onUsePaste,
  onFile,
}: {
  testId: string;
  title: string;
  hint: string;
  paste: string;
  error: string | null;
  onPaste: (v: string) => void;
  onUsePaste: () => void;
  onFile: (f: File) => void;
}) {
  return (
    <section data-testid={testId} className="desk-card w-full p-4 sm:p-6">
      <h3 className="text-lg font-medium text-ink">{title}</h3>
      <p className="mt-1 text-sm text-ink-soft">{hint}</p>
      <textarea
        data-testid={`${testId}-paste`}
        className="desk-input manuscript mt-4 min-h-[14rem] w-full p-4 text-base leading-relaxed text-ink"
        placeholder="在此粘贴论文要求、开题或想法…"
        value={paste}
        onChange={(e) => onPaste(e.target.value)}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onUsePaste} data-testid={`${testId}-use-paste`}>
          使用上方文字
        </Button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-sunk px-4 text-ink hover:bg-line">
          选择文件
          <input
            data-testid={`${testId}-input`}
            className="sr-only"
            type="file"
            accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-sm text-ink-soft">docx / 文字层 pdf / txt / md · ≤15 MB</span>
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-line bg-sunk/80 px-3 py-2">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function IdeateFlow({
  state,
  setConceive,
  onFile,
  onUsePaste,
  onIdeate,
  onSave,
  onBack,
  onOpenSettings,
}: {
  state: ConceivePanelState;
  setConceive: Dispatch<SetStateAction<ConceivePanelState>> | Dispatch<SetStateAction<any>>;
  onFile: (file: File) => void;
  onUsePaste: () => void;
  onIdeate: () => void;
  onSave: () => void;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  const loaded = state.loaded;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4" data-testid="conceive-work">
      <header className="flex flex-wrap items-center gap-2 px-1">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">构思</h2>
        <Button type="button" variant="quiet" onClick={onBack} data-testid="conceive-back">
          返回
        </Button>
        {loaded ? (
          <Button type="button" variant="quiet" onClick={onSave} data-testid="conceive-save">
            存入存档
          </Button>
        ) : null}
      </header>

      {!loaded ? (
        <FullWidthIntake
          testId="intake-conceive"
          title="把论文要求放在这里"
          hint="整理要求与生成框架在同一步完成。可粘贴全文，或上传文件。"
          paste={state.paste}
          error={state.error}
          onPaste={(value) => setConceive((c: ConceivePanelState) => ({ ...c, paste: value }))}
          onUsePaste={onUsePaste}
          onFile={onFile}
        />
      ) : (
        <>
          <section className="desk-card w-full p-4 sm:p-6">
            <p className="text-ink">
              {loaded.source === "paste" ? "当前：粘贴文字" : `${loaded.fileName} · ${loaded.parsed.stats.chars} 字`}
            </p>
            <label className="mt-4 block" htmlFor="conceive-notes-work">
              想法补充
              <textarea
                id="conceive-notes-work"
                data-testid="conceive-notes"
                className="desk-input manuscript mt-2 min-h-[6rem] w-full p-3"
                value={state.notes}
                onChange={(e) => setConceive((c: ConceivePanelState) => ({ ...c, notes: e.target.value }))}
              />
            </label>
            {state.modelError ? (
              <div className="mt-3">
                <p role="alert" className="rounded-xl border border-line bg-sunk/80 px-3 py-2">
                  {state.modelError}
                </p>
                <MissingKeyLink message={state.modelError} onOpen={onOpenSettings} />
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={state.running}
                onClick={onIdeate}
                data-testid="conceive-ideate-run"
              >
                {state.running ? "整理中…" : "整理要求并生成框架"}
              </Button>
              {/* keep legacy testids for ui-copy */}
              <span className="sr-only">
                <button type="button" data-testid="conceive-organize" onClick={onIdeate}>
                  整理要求
                </button>
                <button type="button" data-testid="conceive-outline" onClick={onIdeate}>
                  生成框架
                </button>
                <button type="button" data-testid="conceive-search-open">
                  检索文献
                </button>
              </span>
            </div>
          </section>

          <section
            id="conceive-organize-panel"
            className="desk-card w-full p-4 sm:p-6"
            data-testid="conceive-organize-panel"
          >
            {state.brief ? <BriefView brief={state.brief} /> : <p className="text-ink-soft">整理后，要求会出现在这里。</p>}
          </section>

          <section
            id="conceive-outline-result"
            className="desk-card w-full p-4 sm:p-6"
            data-testid="conceive-outline-result"
          >
            {state.brief?.directions?.length ? (
              <div className="mb-4 space-y-3" data-testid="conceive-outline-directions">
                <h3 className="text-lg">可行方向</h3>
                <ul className="space-y-3">
                  {state.brief.directions.map((item) => (
                    <li key={item.title} className="rounded-xl border border-line/80 bg-desk/40 px-3 py-3">
                      <p className="text-ink">{item.title}</p>
                      {item.question ? <p className="mt-1 text-sm text-ink-soft">{item.question}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {state.outline ? (
              <>
                <h3 className="text-lg">框架 {state.outline.origin === "local" ? "（本地，未调用模型）" : ""}</h3>
                <p className="mt-2">{state.outline.theme}</p>
                <p className="text-ink-soft">{state.outline.scope}</p>
                <p className="mt-2">{state.outline.lengthNote}</p>
                <ol className="mt-3 list-decimal pl-5">
                  {state.outline.sections.map((section) => (
                    <li key={section.heading} className="mt-3">
                      <p className="text-ink">{section.heading}</p>
                      <p>目的：{section.purpose}</p>
                      <p>拟写：{section.content}</p>
                      <p>证据：{section.evidence}</p>
                      <p>篇幅：{section.length}</p>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-ink-soft">点「整理要求并生成框架」后，分节框架会出现在这里。</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SearchFlow({
  state,
  setConceive,
  onSearch,
  onBack,
  onOpenSettings,
}: {
  state: ConceivePanelState;
  setConceive: Dispatch<SetStateAction<ConceivePanelState>> | Dispatch<SetStateAction<any>>;
  onSearch: () => void;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4" data-testid="conceive-search">
      <header className="flex flex-wrap items-center gap-2 px-1">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">检索</h2>
        <Button type="button" variant="quiet" onClick={onBack} data-testid="conceive-back">
          返回
        </Button>
      </header>
      <section className="desk-card w-full p-4 sm:p-6">
        <h3 className="text-lg">检索词</h3>
        <p className="mt-1 text-sm text-ink-soft">每行一个词。确认后显示题名列表；不编造题名或 DOI。</p>
        <textarea
          className="desk-input mt-3 min-h-[8rem] w-full p-3"
          data-testid="conceive-search-queries"
          value={state.queries}
          onChange={(e) =>
            setConceive((c: ConceivePanelState) => ({
              ...c,
              queries: e.target.value,
              searchCommitted: false,
            }))
          }
          placeholder={"attention mechanism\nvisual classification"}
        />
        {state.modelError ? (
          <div className="mt-3">
            <p role="alert" className="rounded-xl border border-line bg-sunk/80 px-3 py-2">
              {state.modelError}
            </p>
            <MissingKeyLink message={state.modelError} onOpen={onOpenSettings} />
          </div>
        ) : null}
        <Button type="button" className="mt-3" variant="quiet" onClick={onSearch} data-testid="conceive-search-run">
          确认检索
        </Button>
      </section>
      {state.searchCommitted ? <TitleList results={state.literature} /> : null}
    </div>
  );
}

function WriteFlow({
  state,
  setConceive,
  onFile,
  onUsePaste,
  onIdeate,
  onDraft,
  onSave,
  onBack,
  onOpenSettings,
}: {
  state: ConceivePanelState;
  setConceive: Dispatch<SetStateAction<ConceivePanelState>> | Dispatch<SetStateAction<any>>;
  onFile: (file: File) => void;
  onUsePaste: () => void;
  onIdeate: () => void;
  onDraft: () => void;
  onSave: () => void;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  const field = state.writeField;
  const outline = state.outline;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4" data-testid="conceive-write">
      <header className="flex flex-wrap items-center gap-2 px-1">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">写作</h2>
        <Button type="button" variant="quiet" onClick={onBack} data-testid="conceive-back">
          返回
        </Button>
        {outline ? (
          <Button type="button" variant="quiet" onClick={onSave} data-testid="conceive-save">
            存入存档
          </Button>
        ) : null}
      </header>

      <section className="desk-card w-full p-4 sm:p-6" data-testid="conceive-write-fields">
        <h3 className="text-lg">先选领域方向</h3>
        <p className="mt-1 text-sm text-ink-soft">不确定时选「其他」，将按自然科学证据优先协助起草。</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WRITE_FIELD_OPTIONS.map((opt) => {
            const active = field === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`conceive-field-${opt.id}`}
                className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                  active ? "border-ink bg-paper shadow-sm" : "border-line bg-desk/40 hover:bg-sunk"
                }`}
                onClick={() => setConceive((c: ConceivePanelState) => ({ ...c, writeField: opt.id }))}
              >
                <p className="text-base font-medium text-ink">{opt.label}</p>
                <p className="mt-1 text-sm text-ink-soft">{opt.blurb}</p>
              </button>
            );
          })}
        </div>
      </section>

      {!field ? null : !outline ? (
        <>
          <FullWidthIntake
            testId="intake-conceive-write"
            title="提交构思材料"
            hint="写作前需要框架。粘贴要求后生成框架，或先去「构思」。"
            paste={state.paste}
            error={state.error}
            onPaste={(value) => setConceive((c: ConceivePanelState) => ({ ...c, paste: value }))}
            onUsePaste={onUsePaste}
            onFile={onFile}
          />
          <div className="px-1">
            <Button type="button" disabled={state.running || !state.loaded} onClick={onIdeate} data-testid="conceive-write-ideate">
              {state.running ? "生成框架中…" : "生成框架后写作"}
            </Button>
          </div>
        </>
      ) : (
        <section className="desk-card w-full p-4 sm:p-6">
          <p className="text-sm text-ink-soft">
            当前方向：{WRITE_FIELD_OPTIONS.find((o) => o.id === field)?.label} · 主题：{outline.theme}
          </p>
          {state.modelError ? (
            <div className="mt-3">
              <p role="alert" className="rounded-xl border border-line bg-sunk/80 px-3 py-2">
                {state.modelError}
              </p>
              <MissingKeyLink message={state.modelError} onOpen={onOpenSettings} />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2" data-testid="conceive-write-sections">
            {outline.sections.map((section) => {
              const done = Boolean(state.drafts[section.heading]);
              const active = state.draftHeading === section.heading;
              return (
                <Button
                  key={section.heading}
                  type="button"
                  variant={active ? "primary" : "quiet"}
                  onClick={() =>
                    setConceive((c: ConceivePanelState) => ({
                      ...c,
                      draftHeading: section.heading,
                    }))
                  }
                >
                  {section.heading}
                  {done ? " · 已有草稿" : ""}
                </Button>
              );
            })}
          </div>
          <Button
            type="button"
            className="mt-4"
            disabled={state.running || !state.draftHeading}
            onClick={onDraft}
            data-testid="conceive-write-run"
          >
            {state.running ? "起草中…" : "起草本节"}
          </Button>
          {state.draftHeading && state.drafts[state.draftHeading] ? (
            <article
              className="manuscript mt-4 whitespace-pre-wrap rounded-xl border border-line bg-desk/40 p-4"
              data-testid="conceive-write-result"
            >
              <p className="mb-2 text-sm text-ink-soft">
                {state.drafts[state.draftHeading].origin === "local" ? "本地骨架（未调用模型）" : "模型草稿"}
              </p>
              {state.drafts[state.draftHeading].markdown}
            </article>
          ) : null}
        </section>
      )}
    </div>
  );
}

function TitleList({ results }: { results: LiteratureQueryResult[] }) {
  const items = results.flatMap((r) => r.items.map((item) => ({ ...item, query: r.query, status: r.status })));
  if (!results.length) {
    return (
      <section className="desk-card p-4 sm:p-6">
        <p className="text-ink-soft">还没有结果。</p>
      </section>
    );
  }
  return (
    <section className="desk-card p-4 sm:p-6" data-testid="conceive-search-titles">
      <h3 className="text-lg">题名列表</h3>
      <ol className="mt-3 list-decimal space-y-3 pl-5">
        {results.map((result) => (
          <li key={result.query} className="text-ink">
            <p className="font-medium">检索词「{result.query}」</p>
            {result.status !== "ok" || !result.items.length ? (
              <p className="mt-1 text-sm text-ink-soft">{result.message || "未找到"}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {result.items.map((item) => (
                  <li key={item.openalexId} className="rounded-xl border border-line bg-desk/50 px-3 py-2">
                    <p className="text-ink">{item.title}</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {item.year ?? "年份未返回"}
                      {item.authors.length ? ` · ${item.authors.slice(0, 3).join(", ")}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {items.length === 0 ? null : null}
    </section>
  );
}

function BriefView({ brief }: { brief: RequirementsBrief }) {
  return (
    <div data-testid="conceive-brief">
      <h3 className="text-lg">整理要求 {brief.origin === "local" ? "（本地整理，未调用模型）" : ""}</h3>
      <ul className="mt-2 list-disc pl-5">
        {brief.requirements.map((item) => (
          <li key={`${item.source}-${item.text}`}>
            {item.text}{" "}
            <span className="text-ink-soft">
              来自
              {item.source === "school" ? "要求" : item.source === "user" ? "补充" : item.source === "model" ? "模型建议" : "未标明"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2">
        关键词：{brief.keywords.map((item) => `${item.term}（${item.source}）`).join("、") || "还没有"}
      </p>
    </div>
  );
}
