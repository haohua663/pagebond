"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { assessKeyDraft, type KeySource } from "@/lib/providers/credentials";
import { DEFAULT_MODEL, KNOWN_MODEL } from "@/lib/limits";

export function MissingKeyLink({ message, onOpen }: { message: string; onOpen: () => void }) {
  if (!message.includes("没有可用密钥")) return null;
  return (
    <button type="button" className="mt-2 min-h-11 cursor-pointer underline" onClick={onOpen}>
      到设置添加密钥
    </button>
  );
}

export function SettingsScreen({
  model,
  keySource,
  sessionLabel,
  onModel,
  onAdded,
  onClearSession,
  onStart,
}: {
  model: string;
  keySource: KeySource;
  sessionLabel: string | null;
  onModel: (value: string) => void;
  onAdded: (key: string, label: string) => void;
  onClearSession: () => void;
  onStart: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const ready = keySource !== "none";

  async function addKey() {
    const assessed = assessKeyDraft(draft);
    if (!assessed.ok) {
      setError(assessed.message);
      setJustAdded(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/credentials/check", {
        method: "POST",
        headers: { "X-Pagebond-Session-Key": assessed.key },
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; label?: string } | null;
      if (!response.ok || !data?.ok || !data.label) {
        setJustAdded(false);
        setError(data?.message || "密钥没有保存。");
        return;
      }
      onAdded(assessed.key, data.label);
      setDraft("");
      setJustAdded(true);
    } catch {
      setJustAdded(false);
      setError("没有连上本机服务，密钥没有保存。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="settings-screen">
      <section className="border border-line bg-paper p-4 shadow-[inset_4px_0_0_#9ee86f] sm:p-6">
        <h1 className="text-2xl font-medium tracking-tight">API 密钥</h1>
        <p className="mt-2 max-w-xl text-ink-soft">
          只用来调用模型。核对通过后留在这次页面会话的内存里，不写入浏览器存储，也不进存档。刷新后需要再添加。
        </p>
        <p className="mt-4 text-ink" data-testid="api-key-status">
          {keySource === "session"
            ? `这次会话已添加${sessionLabel ? `：${sessionLabel}` : ""}。它优先于服务端密钥。`
            : keySource === "server"
              ? "服务端环境变量里已经有密钥，可以直接开始。另填一把时，以你添加的这把为准。"
              : "还没有密钥。添加完成之后，才能开始改稿或起稿里的模型步骤。"}
        </p>
        <label className="mt-4 block max-w-xl" htmlFor="api-key-draft">
          OpenRouter 密钥
          <input
            id="api-key-draft"
            data-testid="api-key-input"
            type="password"
            autoComplete="off"
            autoFocus
            spellCheck={false}
            className="mt-1 w-full border border-line-strong bg-desk p-3"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addKey();
              }
            }}
          />
        </label>
        {error ? (
          <p role="alert" data-testid="api-key-error" className="mt-3 max-w-xl border-l-4 border-ink bg-sunk px-3 py-2">
            {error}
          </p>
        ) : null}
        {justAdded ? (
          <p className="mt-3 max-w-xl" data-testid="api-key-added">
            密钥已加入这次会话。可以开始工作。
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" data-testid="api-key-add" disabled={busy} onClick={() => void addKey()}>
            {busy ? "正在核对" : "添加密钥"}
          </Button>
          {ready ? (
            <Button type="button" variant="lime" data-testid="api-key-start" onClick={onStart}>
              开始工作
            </Button>
          ) : null}
          {keySource === "session" ? (
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                onClearSession();
                setJustAdded(false);
                setError(null);
              }}
            >
              清除这次密钥
            </Button>
          ) : null}
        </div>
      </section>
      <section className="border border-line bg-paper p-4 sm:p-6">
        <h2 className="text-lg font-medium">模型</h2>
        <label className="mt-3 block max-w-xl" htmlFor="model-slug">
          模型标识
          <input
            id="model-slug"
            className="mt-1 w-full border border-line bg-desk p-3"
            value={model}
            onChange={(event) => onModel(event.target.value)}
          />
        </label>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          默认 {DEFAULT_MODEL}，上下文约 {KNOWN_MODEL.contextLength.toLocaleString()} token。换成别的标识后，费用估算需要另外核对。
        </p>
      </section>
    </div>
  );
}
