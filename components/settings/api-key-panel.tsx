"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { assessKeyDraft, type KeySource } from "@/lib/providers/credentials";
import { DEFAULT_LLM_BASE_URL } from "@/lib/providers/llm-config";

export type RouteStatus = {
  daily?: { label: string; model: string; keyConfigured: boolean };
  deep?: { label: string; model: string; keyConfigured: boolean };
};

export function MissingKeyLink({ message, onOpen }: { message: string; onOpen: () => void }) {
  if (!message.includes("没有可用密钥") && !message.includes("需要 Qwen") && !message.includes("需要 DeepSeek")) {
    return null;
  }
  return (
    <button type="button" className="mt-2 min-h-11 cursor-pointer rounded-xl px-3 text-sm text-ink underline-offset-4 hover:bg-sunk hover:underline" onClick={onOpen}>
      到设置添加密钥
    </button>
  );
}

export type PlatformQuota = {
  dailyRequestsRemaining: number;
  dailyRequestLimit: number;
  dailyTokensRemaining: number | null;
  dailyTokenLimit: number;
};

export function SettingsScreen({
  model: _model,
  baseUrl,
  keySource,
  sessionLabel,
  routes,
  quota,
  onModel: _onModel,
  onBaseUrl: _onBaseUrl,
  onAdded,
  onClearSession,
  onStart,
}: {
  model: string;
  baseUrl: string;
  keySource: KeySource;
  sessionLabel: string | null;
  routes?: RouteStatus | null;
  quota?: PlatformQuota | null;
  onModel: (value: string) => void;
  onBaseUrl: (value: string) => void;
  onAdded: (key: string, label: string) => void;
  onClearSession: () => void;
  onStart: () => void;
}) {
  void _model;
  void _onModel;
  void _onBaseUrl;
  void routes;
  void quota;
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
      const headers: Record<string, string> = { "X-Pagebond-Session-Key": assessed.key };
      const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
      if (trimmedBase && trimmedBase !== DEFAULT_LLM_BASE_URL) {
        headers["X-Pagebond-Session-Base-Url"] = trimmedBase;
      }
      const response = await fetch("/api/credentials/check", {
        method: "POST",
        headers,
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

  const statusText =
    keySource === "session"
      ? `这次会话已添加${sessionLabel ? `：${sessionLabel}` : ""}。它优先于服务端密钥。`
      : keySource === "server"
        ? ""
        : "还没有可用密钥。可在此添加，或由部署方配置";
  return (
    <div className="space-y-4" data-testid="settings-screen">
      <section className="desk-card relative overflow-hidden p-4 sm:p-6 before:absolute before:inset-y-4 before:left-0 before:w-1 before:rounded-full before:bg-lime">
        <h1 className="text-2xl font-medium tracking-tight">API 密钥</h1>
        {statusText ? (
          <p className="mt-4 text-ink" data-testid="api-key-status">
            {statusText}
          </p>
        ) : null}
        <label className="mt-4 block max-w-xl" htmlFor="api-key-draft">
          <span className="sr-only">API 密钥</span>
          <input
            id="api-key-draft"
            data-testid="api-key-input"
            type="password"
            autoComplete="off"
            autoFocus
            spellCheck={false}
            className="desk-input w-full bg-desk p-3"
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
          <p role="alert" data-testid="api-key-error" className="mt-3 max-w-xl rounded-xl border border-line bg-sunk/80 px-3 py-2">
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
    </div>
  );
}
