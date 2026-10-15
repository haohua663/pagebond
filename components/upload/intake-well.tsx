"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function IntakeWell({
  testId,
  title,
  detail,
  fileName,
  error,
  paste,
  onPaste,
  onUsePaste,
  onFile,
  extra,
}: {
  testId: string;
  title: string;
  detail: string;
  fileName: string;
  error: string | null;
  paste: string;
  onPaste: (value: string) => void;
  onUsePaste: () => void;
  onFile: (file: File) => void;
  extra?: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const inputId = `${testId}-file`;

  return (
    <section data-testid={testId} className="rounded-sm border border-dashed border-line-strong bg-paper p-4 sm:p-6">
      <div
        className={`rounded-sm border border-line px-4 py-8 text-center ${over ? "border-ink bg-sunk" : "bg-desk/40"}`}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
      >
        <p className="text-xl text-ink">{title}</p>
        <p className="mx-auto mt-2 max-w-md text-ink-soft">{detail}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <label htmlFor={inputId} className="inline-flex min-h-11 cursor-pointer items-center rounded-sm bg-ink px-4 text-paper">
            选择文件
          </label>
          <input
            id={inputId}
            data-testid={`${testId}-input`}
            className="sr-only"
            type="file"
            accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.target.value = "";
            }}
          />
        </div>
        <p className="mt-3 text-sm text-ink-soft">也可以把文件拖到这里。接受 docx、有文字层的 pdf、txt、md，单个不超过 15 MB。</p>
        {fileName ? <p className="mt-3 text-ink">当前文件：{fileName}</p> : null}
      </div>
      <div className="mt-4">
        <label className="block text-ink" htmlFor={`${testId}-paste`}>
          或者粘贴文字
        </label>
        <textarea
          id={`${testId}-paste`}
          data-testid={`${testId}-paste`}
          value={paste}
          onChange={(event) => onPaste(event.target.value)}
          rows={6}
          className="manuscript mt-2 w-full rounded-sm border border-line bg-paper p-3 text-ink"
          placeholder="粘贴后点「使用这段文字」。它不会自动发给模型。"
        />
        <Button type="button" variant="quiet" className="mt-2" onClick={onUsePaste}>
          使用这段文字
        </Button>
      </div>
      {extra}
      {error ? (
        <p role="alert" className="mt-4 border-l-4 border-ink bg-sunk px-3 py-2 text-ink">
          {error}
        </p>
      ) : null}
    </section>
  );
}
