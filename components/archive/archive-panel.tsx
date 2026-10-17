"use client";

import { useMemo, useState } from "react";
import type { PaperRecord } from "@/lib/storage/types";
import { reminderForCount } from "@/lib/storage/types";
import { filterPapersByQuery } from "@/lib/storage/archive-search";
import { Button } from "@/components/ui/button";
import { GooeyInput } from "@/components/ui/gooey-input";

export function ArchivePanel({
  records,
  onOpen,
  onDelete,
  onExport,
  onImport,
  serverHint,
}: {
  records: PaperRecord[];
  onOpen: (record: PaperRecord) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  /** Optional status from /api/archives (postgres | unavailable) */
  serverHint?: string | null;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterPapersByQuery(records, query), [records, query]);
  const reminder = reminderForCount(records.length);

  return (
    <section data-testid="archive-panel" className="desk-card p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl">存档</h2>
          <p className="mt-1 text-sm text-ink-soft">
            本机 IndexedDB 为主；有 Postgres 时会镜像以便搜索。
          </p>
        </div>
        <div className="min-w-[14rem] flex-1 sm:max-w-sm" data-testid="archive-search">
          <GooeyInput
            placeholder="搜索存档…"
            value={query}
            onValueChange={setQuery}
            collapsedWidth={48}
            expandedWidth={260}
            expandedOffset={12}
            classNames={{
              root: "justify-start",
              trigger: "bg-ink text-paper",
              input: "bg-ink text-paper placeholder:text-paper/50",
              bubble: "bg-ink",
              bubbleSurface: "bg-ink text-paper",
            }}
          />
        </div>
      </div>
      {serverHint ? <p className="mt-2 text-xs text-ink-soft" data-testid="archive-server-hint">{serverHint}</p> : null}
      {reminder ? <p className="desk-callout mt-3 px-3 py-2 text-sm">{reminder}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="quiet" onClick={onExport}>
          导出备份
        </Button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-sunk px-4">
          导入备份
          <input
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <p data-testid="archive-empty" className="mt-6 text-sm text-ink-soft">
          {records.length === 0 ? "还没有存档。" : "没有匹配的存档。"}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line" data-testid="archive-list">
          {filtered.map((record) => (
            <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-ink">{record.title || "未命名"}</p>
                <p className="text-sm text-ink-soft">
                  {record.mode === "revise" ? "改稿" : "起稿"} · {new Date(record.updatedAt).toLocaleString()} ·{" "}
                  {record.status}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="quiet" onClick={() => onOpen(record)}>
                  打开
                </Button>
                <Button type="button" variant="ghost" onClick={() => onDelete(record.id)}>
                  删除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
