"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

type PresentSlide = {
  id: string;
  title: string;
  bullets: string[];
  notes: string;
  kind?: string;
};

type PresentResult = {
  title: string;
  talkMinutes?: number;
  outline: PresentSlide[];
  html: string;
  model?: string;
};

const PLACEHOLDER =
  "粘贴论文摘要、结果提纲或已有大纲。例如：背景…；问题…；方法…；主要结果…；结论…";

function fieldClass() {
  return "w-full rounded-xl border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-ink disabled:opacity-60";
}

export function PresentPanel({
  sessionKey,
  model,
  sessionBaseUrl,
}: {
  sessionKey: string;
  model: string;
  sessionBaseUrl: string;
  onOpenSettings?: () => void;
}) {
  const [source, setSource] = useState("");
  const [talkMinutes, setTalkMinutes] = useState("12");
  const [audience, setAudience] = useState("");
  const [result, setResult] = useState<PresentResult | null>(null);
  const [outlineIndex, setOutlineIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    const text = source.trim();
    if (!text) {
      setError("请先粘贴摘要或提纲。");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sessionKey.trim()) headers["X-Pagebond-Session-Key"] = sessionKey.trim();
      if (sessionBaseUrl.trim() && sessionKey.trim()) {
        const base = sessionBaseUrl.trim().replace(/\/+$/, "");
        if (base) headers["X-Pagebond-Session-Base-Url"] = base;
      }
      const minutes = Number(talkMinutes);
      const payload: Record<string, unknown> = {
        source: text,
        talkMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 12,
      };
      if (audience.trim()) payload.audience = audience.trim();
      if (sessionKey.trim() && model) payload.model = model;

      const response = await fetch("/api/present", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as
        | (PresentResult & { ok?: boolean; message?: string })
        | null;
      if (!response.ok || !data || data.ok !== true) {
        throw new Error(
          data?.message ||
            (response.status === 401
              ? "没有可用密钥。请在设置中配置 DeepSeek / LLM 密钥。"
              : `生成失败（${response.status}）。`),
        );
      }
      const outline = Array.isArray(data.outline)
        ? data.outline.map((s, index) => ({
            id: typeof s?.id === "string" && s.id.trim() ? s.id : `s${index + 1}`,
            title: typeof s?.title === "string" ? s.title : `第 ${index + 1} 页`,
            bullets: Array.isArray(s?.bullets)
              ? s.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 0)
              : [],
            notes: typeof s?.notes === "string" ? s.notes : "",
            kind: typeof s?.kind === "string" ? s.kind : undefined,
          }))
        : [];
      if (!outline.length || typeof data.html !== "string" || !data.html.trim()) {
        throw new Error("模型没有返回可用的演示大纲。");
      }
      setResult({
        title: data.title || "学术汇报",
        talkMinutes: data.talkMinutes,
        outline,
        html: data.html,
        model: data.model,
      });
      setOutlineIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败。");
    } finally {
      setRunning(false);
    }
  }, [source, talkMinutes, audience, sessionKey, sessionBaseUrl, model]);

  function downloadHtml() {
    if (!result?.html) return;
    const blob = new Blob([result.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pagebond-slides-${Date.now()}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function backToEdit() {
    setResult(null);
    setOutlineIndex(0);
    setError(null);
  }

  function clearAll() {
    setSource("");
    setAudience("");
    setTalkMinutes("12");
    setResult(null);
    setOutlineIndex(0);
    setError(null);
  }

  const current = result?.outline[outlineIndex];
  const canPrev = outlineIndex > 0;
  const canNext = Boolean(result && outlineIndex < result.outline.length - 1);

  if (result) {
    return (
      <section
        className="desk-card flex w-full min-w-0 max-w-none flex-col gap-4 p-4 sm:p-6"
        data-testid="present-panel"
        data-view="result"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight text-ink">演示</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="quiet" onClick={backToEdit}>
              返回编辑
            </Button>
            <Button type="button" variant="primary" onClick={downloadHtml} data-testid="present-download">
              下载 HTML
            </Button>
          </div>
        </div>

        <h3 className="text-lg font-semibold tracking-tight text-ink" data-testid="present-result-title">
          {result.title}
        </h3>

        <div data-testid="present-outline" className="flex w-full min-w-0 flex-col gap-2">
          <span className="text-sm text-ink-soft">大纲</span>
          <div className="rounded-xl border border-line bg-paper px-3 py-3">
            {current ? (
              <div data-testid="present-outline-item">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-medium leading-snug text-ink">
                    {outlineIndex + 1}. {current.title}
                  </p>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-8 min-w-8 px-1.5"
                      disabled={!canPrev}
                      aria-label="上一项"
                      data-testid="present-outline-prev"
                      onClick={() => setOutlineIndex((i) => Math.max(0, i - 1))}
                    >
                      ‹
                    </Button>
                    <span
                      className="min-w-[2.75rem] text-center text-xs text-ink-soft"
                      data-testid="present-outline-pos"
                    >
                      {outlineIndex + 1}/{result.outline.length}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-8 min-w-8 px-1.5"
                      disabled={!canNext}
                      aria-label="下一项"
                      data-testid="present-outline-next"
                      onClick={() =>
                        setOutlineIndex((i) => Math.min(result.outline.length - 1, i + 1))
                      }
                    >
                      ›
                    </Button>
                  </div>
                </div>
                {current.bullets.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
                    {current.bullets.map((b, bi) => (
                      <li key={`${current.id}-b-${bi}`}>{b}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-sm text-ink-soft">预览</span>
          <iframe
            title="演示预览"
            data-testid="present-preview"
            className="h-[28rem] w-full rounded-xl border border-line bg-paper"
            sandbox="allow-scripts"
            srcDoc={result.html}
          />
        </div>
      </section>
    );
  }

  return (
    <section
      className="desk-card flex w-full min-w-0 max-w-none flex-col gap-4 p-4 sm:p-6"
      data-testid="present-panel"
      data-view="edit"
    >
      <h2 className="text-xl font-semibold tracking-tight text-ink">演示</h2>

      <label className="block min-w-0">
        <span className="sr-only">摘要或提纲</span>
        <textarea
          data-testid="present-input"
          className={`min-h-40 resize-y ${fieldClass()}`}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={running}
          placeholder={PLACEHOLDER}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-sm text-ink-soft">时长（分钟）</span>
          <input
            data-testid="present-minutes"
            type="number"
            min={3}
            max={90}
            className={fieldClass()}
            value={talkMinutes}
            onChange={(e) => setTalkMinutes(e.target.value)}
            disabled={running}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-sm text-ink-soft">听众（可选）</span>
          <input
            data-testid="present-audience"
            className={fieldClass()}
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            disabled={running}
            placeholder="组会 / 会议口头 / 答辩"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="lime" onClick={() => void run()} disabled={running || !source.trim()}>
          {running ? "生成中…" : "生成演示"}
        </Button>
        <Button type="button" variant="quiet" onClick={clearAll} disabled={running}>
          清空
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-red-700" data-testid="present-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
