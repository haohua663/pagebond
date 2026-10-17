"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type DrawMode = "research" | "chart" | "mechanism";
type CaptionLang = "both" | "zh" | "en";
type CaptionSide = "zh" | "en";

type EvidenceRow = { element: string; evidence: string };

type DrawResult = {
  figureType: string;
  title: string;
  captionZh: string;
  captionEn: string;
  designNotes: string;
  mermaid: string;
  pythonHint: string;
  evidenceMapping: EvidenceRow[];
  model?: string;
};

const MODES: { id: DrawMode; label: string; hint: string }[] = [
  {
    id: "research",
    label: "研究内容",
    hint: "写清科学问题、比较对象与要强调的结论；可附摘要要点。",
  },
  {
    id: "chart",
    label: "数据图表",
    hint: "说明变量、分组、对照与期望图表类型（柱/点/热图等）；有表头或列名可一并粘贴。",
  },
  {
    id: "mechanism",
    label: "流程或机制图",
    hint: "列出步骤或通路节点与关系（激活/抑制/反馈）；避免未给出的机制。",
  },
];

const PLACEHOLDER =
  "根据以下研究结果，设计一张机制示意图：A 激活 B，B 抑制 C；比较对照组与处理组，突出处理组中 C 的下降。风格简洁，适合论文正文。";

const TARGET_OPTIONS = ["", "机制示意图", "流程图", "多面板组合图", "柱状/散点图", "热图", "其他"];
const JOURNAL_OPTIONS = ["", "Nature 系", "通用 SCI 正文", "综述示意图", "答辩/汇报"];
const CAPTION_OPTIONS: { id: CaptionLang; label: string }[] = [
  { id: "both", label: "中英双语" },
  { id: "zh", label: "仅中文" },
  { id: "en", label: "仅英文" },
];

declare global {
  interface Window {
    mermaid?: {
      initialize: (config: Record<string, unknown>) => void;
      render: (id: string, text: string) => Promise<{ svg: string }>;
    };
  }
}

function loadMermaid(): Promise<NonNullable<Window["mermaid"]>> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.mermaid) return Promise.resolve(window.mermaid);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-pagebond-mermaid]");
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.mermaid) resolve(window.mermaid);
        else reject(new Error("mermaid missing"));
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
    script.async = true;
    script.dataset.pagebondMermaid = "1";
    script.onload = () => {
      if (!window.mermaid) {
        reject(new Error("mermaid missing"));
        return;
      }
      window.mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "strict",
      });
      resolve(window.mermaid);
    };
    script.onerror = () => reject(new Error("mermaid load failed"));
    document.head.appendChild(script);
  });
}

function MermaidPreview({ source }: { source: string }) {
  const reactId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const text = source.trim();
    if (!text || !hostRef.current) return;
    setFailed(false);
    void (async () => {
      try {
        const mermaid = await loadMermaid();
        if (cancelled || !hostRef.current) return;
        const { svg } = await mermaid.render(`pb-mmd-${reactId}`, text);
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, reactId]);

  if (!source.trim()) return null;
  if (failed) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-line bg-sunk/40 p-3 text-sm text-ink">
        {source}
      </pre>
    );
  }
  return <div ref={hostRef} className="overflow-x-auto rounded-xl border border-line bg-paper p-3" data-testid="draw-mermaid" />;
}

function fieldClass() {
  return "w-full rounded-xl border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-ink disabled:opacity-60";
}

function sessionHeaders(sessionKey: string, sessionBaseUrl: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionKey.trim()) headers["X-Pagebond-Session-Key"] = sessionKey.trim();
  if (sessionBaseUrl.trim() && sessionKey.trim()) {
    const base = sessionBaseUrl.trim().replace(/\/+$/, "");
    if (base) headers["X-Pagebond-Session-Base-Url"] = base;
  }
  return headers;
}

export function DrawPanel({
  sessionKey,
  model,
  sessionBaseUrl,
}: {
  sessionKey: string;
  model: string;
  sessionBaseUrl: string;
  onOpenSettings?: () => void;
}) {
  const [mode, setMode] = useState<DrawMode>("research");
  const [brief, setBrief] = useState("");
  const [targetType, setTargetType] = useState("");
  const [journalStyle, setJournalStyle] = useState("");
  const [captionLang, setCaptionLang] = useState<CaptionLang>("both");
  const [evidence, setEvidence] = useState("");
  const [result, setResult] = useState<DrawResult | null>(null);
  const [captionSide, setCaptionSide] = useState<CaptionSide>("zh");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<string | null>(null);
  const [imageSkipNote, setImageSkipNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const modeMeta = useMemo(() => MODES.find((m) => m.id === mode) || MODES[0], [mode]);

  const run = useCallback(async () => {
    const text = brief.trim();
    if (!text) {
      setError("请先描述要表达的研究内容。");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    setImageDataUrl(null);
    setImageMeta(null);
    setImageSkipNote(null);
    try {
      const payload: Record<string, string> = {
        brief: text,
        mode,
        captionLang,
      };
      if (targetType.trim()) payload.targetType = targetType.trim();
      if (journalStyle.trim()) payload.journalStyle = journalStyle.trim();
      if (evidence.trim()) payload.evidence = evidence.trim();
      if (sessionKey.trim() && model) payload.model = model;

      const response = await fetch("/api/draw", {
        method: "POST",
        headers: sessionHeaders(sessionKey, sessionBaseUrl),
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as
        | (DrawResult & { ok?: boolean; message?: string })
        | null;
      if (!response.ok || !data || data.ok !== true) {
        throw new Error(
          data?.message ||
            (response.status === 401
              ? "没有可用密钥。请在设置中配置 DeepSeek / LLM 密钥。"
              : `生成失败（${response.status}）。`),
        );
      }
      const mapping = Array.isArray(data.evidenceMapping)
        ? data.evidenceMapping
            .filter((row) => row && typeof row === "object")
            .map((row) => ({
              element: typeof row.element === "string" ? row.element : "",
              evidence: typeof row.evidence === "string" ? row.evidence : "",
            }))
            .filter((row) => row.element.trim() || row.evidence.trim())
        : [];
      const next: DrawResult = {
        figureType: data.figureType || "other",
        title: data.title || "",
        captionZh: data.captionZh || "",
        captionEn: data.captionEn || "",
        designNotes: data.designNotes || "",
        mermaid: data.mermaid || "",
        pythonHint: data.pythonHint || "",
        evidenceMapping: mapping,
        model: data.model,
      };
      setResult(next);
      setCaptionSide(next.captionZh.trim() ? "zh" : "en");

      // Auto image after briefing; soft-fail if no key.
      const imgRes = await fetch("/api/draw/image", {
        method: "POST",
        headers: sessionHeaders(sessionKey, sessionBaseUrl),
        body: JSON.stringify({
          brief: text,
          title: next.title,
          captionZh: next.captionZh,
          captionEn: next.captionEn,
          journalStyle: journalStyle.trim() || undefined,
        }),
      });
      const img = (await imgRes.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        code?: string;
        imageDataUrl?: string;
        model?: string;
        provider?: string;
      } | null;
      if (imgRes.ok && img?.ok && img.imageDataUrl) {
        setImageDataUrl(img.imageDataUrl);
        setImageMeta([img.provider, img.model].filter(Boolean).join(" · ") || null);
        setImageSkipNote(null);
      } else if (imgRes.status === 401 || img?.code === "NO_KEY") {
        setImageSkipNote(
          img?.message ||
            "未配置出图密钥，已跳过出图。可在 .env.local 设置 IMAGE_API_KEY 或 OPENROUTER_API_KEY。",
        );
      } else {
        setImageSkipNote(img?.message || `出图未成功（${imgRes.status}），文字方案仍可用。`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败。");
    } finally {
      setRunning(false);
    }
  }, [brief, mode, targetType, journalStyle, captionLang, evidence, sessionKey, sessionBaseUrl, model]);

  async function copyText(value: string) {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("无法写入剪贴板。");
    }
  }

  function downloadImage() {
    if (!imageDataUrl) return;
    const link = document.createElement("a");
    link.href = imageDataUrl;
    link.download = `pagebond-figure-${Date.now()}.png`;
    link.click();
  }

  function clearAll() {
    setBrief("");
    setEvidence("");
    setTargetType("");
    setJournalStyle("");
    setCaptionLang("both");
    setResult(null);
    setImageDataUrl(null);
    setImageMeta(null);
    setImageSkipNote(null);
    setError(null);
  }

  function flipCaption() {
    if (!result) return;
    const hasZh = Boolean(result.captionZh.trim());
    const hasEn = Boolean(result.captionEn.trim());
    if (hasZh && hasEn) {
      setCaptionSide((s) => (s === "zh" ? "en" : "zh"));
    }
  }

  const captionBody =
    result && captionSide === "zh"
      ? result.captionZh
      : result
        ? result.captionEn
        : "";
  const captionLabel = captionSide === "zh" ? "中文图注" : "English caption";
  const canFlipCaption = Boolean(result?.captionZh.trim() && result?.captionEn.trim());

  return (
    <section
      className="desk-card flex w-full min-w-0 max-w-none flex-col gap-4 p-4 sm:p-6"
      data-testid="draw-panel"
    >
      <h2 className="text-xl font-semibold tracking-tight text-ink">绘图</h2>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="输入模式" data-testid="draw-mode-tabs">
        {MODES.map((item) => {
          const active = item.id === mode;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`draw-mode-${item.id}`}
              disabled={running}
              onClick={() => setMode(item.id)}
              className={`min-h-11 cursor-pointer rounded-xl px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active ? "bg-ink text-paper" : "bg-sunk text-ink hover:bg-line"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-ink-soft" data-testid="draw-mode-hint">
        {modeMeta.hint}
      </p>

      <label className="block min-w-0">
        <span className="sr-only">研究内容</span>
        <textarea
          data-testid="draw-input"
          className={`min-h-40 resize-y ${fieldClass()}`}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          disabled={running}
          placeholder={PLACEHOLDER}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block min-w-0">
          <span className="mb-1 block text-sm text-ink-soft">目标图类型</span>
          <select
            data-testid="draw-target-type"
            className={fieldClass()}
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            disabled={running}
          >
            {TARGET_OPTIONS.map((opt) => (
              <option key={opt || "any"} value={opt}>
                {opt || "不指定"}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-sm text-ink-soft">期刊风格</span>
          <select
            data-testid="draw-journal-style"
            className={fieldClass()}
            value={journalStyle}
            onChange={(e) => setJournalStyle(e.target.value)}
            disabled={running}
          >
            {JOURNAL_OPTIONS.map((opt) => (
              <option key={opt || "any"} value={opt}>
                {opt || "不指定"}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-sm text-ink-soft">图注语言</span>
          <select
            data-testid="draw-caption-lang"
            className={fieldClass()}
            value={captionLang}
            onChange={(e) => setCaptionLang(e.target.value as CaptionLang)}
            disabled={running}
          >
            {CAPTION_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block min-w-0">
        <span className="mb-1 block text-sm text-ink-soft">依据段落 / 数据（可选）</span>
        <textarea
          data-testid="draw-evidence"
          className={`min-h-28 resize-y ${fieldClass()}`}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          disabled={running}
          placeholder="粘贴原文段落、结果句或表头；生成时会尽量给出「图中元素—原文依据」对照。"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="lime" onClick={() => void run()} disabled={running || !brief.trim()}>
          {running ? "生成中…" : "生成方案"}
        </Button>
        <Button type="button" variant="quiet" onClick={clearAll} disabled={running}>
          清空
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-red-700" data-testid="draw-error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="flex w-full min-w-0 flex-col gap-4" data-testid="draw-result">
          <div className="rounded-xl border border-line bg-sunk/30 px-3 py-3">
            <p className="text-xs text-ink-soft">
              {result.figureType}
              {result.model ? ` · ${result.model}` : ""}
            </p>
            {result.title ? <h3 className="mt-1 text-lg font-semibold text-ink">{result.title}</h3> : null}
          </div>

          {imageDataUrl ? (
            <div className="flex w-full min-w-0 flex-col gap-2" data-testid="draw-image-result">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-ink-soft">生成图{imageMeta ? ` · ${imageMeta}` : ""}</span>
                <Button type="button" variant="ghost" className="min-h-9 px-3 text-sm" onClick={downloadImage}>
                  下载
                </Button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageDataUrl}
                alt="生成的学术示意图"
                className="max-h-[28rem] w-full rounded-xl border border-line bg-paper object-contain"
              />
            </div>
          ) : imageSkipNote ? (
            <p className="rounded-xl border border-line bg-sunk/30 px-3 py-3 text-sm text-ink-soft" data-testid="draw-image-skip">
              {imageSkipNote}
            </p>
          ) : null}

          {captionBody.trim() ? (
            <button
              type="button"
              data-testid="draw-caption-toggle"
              className="w-full min-w-0 cursor-pointer rounded-xl border border-line bg-sunk/40 px-3 py-3 text-left outline-none transition-colors hover:border-ink focus-visible:ring-2 focus-visible:ring-ink"
              onClick={flipCaption}
              aria-label={`${captionLabel}${canFlipCaption ? "，点击切换中英文" : ""}`}
            >
              <span className="mb-1 block text-xs font-medium tracking-wide text-ink-soft">{captionLabel}</span>
              <div className="whitespace-pre-wrap text-base leading-relaxed text-ink">{captionBody}</div>
            </button>
          ) : null}

          {result.evidenceMapping.length ? (
            <div data-testid="draw-evidence-map">
              <span className="mb-1 block text-sm text-ink-soft">图中元素—原文依据</span>
              <ul className="flex flex-col gap-2">
                {result.evidenceMapping.map((row, index) => (
                  <li
                    key={`${index}-${row.element.slice(0, 24)}`}
                    className="rounded-xl border border-line bg-paper px-3 py-3 text-sm leading-relaxed text-ink"
                  >
                    <p className="font-medium">{row.element || "（未命名元素）"}</p>
                    <p className="mt-1 text-ink-soft whitespace-pre-wrap">{row.evidence || "—"}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.mermaid.trim() ? (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm text-ink-soft">示意图</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-9 px-3 text-sm"
                  onClick={() => void copyText(result.mermaid)}
                >
                  复制 Mermaid
                </Button>
              </div>
              <MermaidPreview source={result.mermaid} />
            </div>
          ) : null}

        </div>
      ) : null}
    </section>
  );
}
