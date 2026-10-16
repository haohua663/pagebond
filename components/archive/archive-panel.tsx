"use client";

import type { PaperRecord } from "@/lib/storage/types";
import { reminderForCount } from "@/lib/storage/types";
import { Button } from "@/components/ui/button";

export function ArchivePanel({
  records,
  onOpen,
  onDelete,
  onExport,
  onImport,
}: {
  records: PaperRecord[];
  onOpen: (record: PaperRecord) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const reminder = reminderForCount(records.length);
  return (
    <section data-testid="archive-panel" className="desk-card p-4 sm:p-6">
      <h2 className="text-2xl">存档</h2>
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
      {records.length === 0 ? (
        <p data-testid="archive-empty" className="hidden" />
      ) : (
        <ul className="mt-6 divide-y divide-line">
          {records.map((record) => (
            <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-ink">{record.title || "未命名"}</p>
                <p className="text-sm text-ink-soft">
                  {record.mode === "revise" ? "改稿" : "起稿"} · {new Date(record.updatedAt).toLocaleString()} · {record.status}
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
