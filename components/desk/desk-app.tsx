"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ArchivePanel } from "@/components/archive/archive-panel";
import { ManuscriptPane } from "@/components/manuscript/manuscript-pane";
import { MissingKeyLink, SettingsScreen, type RouteStatus } from "@/components/settings/api-key-panel";
import { SuggestionRail } from "@/components/suggestions/suggestion-rail";
import { Button } from "@/components/ui/button";
import { IntakeWell } from "@/components/upload/intake-well";
import { locateSuggestion, localStructureNotes, type Suggestion } from "@/lib/analysis/suggestions";
import type { BlockCheck } from "@/lib/analysis/validate";
import { contentVersion } from "@/lib/analysis/version";
import { missingProtections } from "@/lib/document/protect";
import { planChunks } from "@/lib/document/chunk";
import { exportAnalysisDocxBlob, exportDocxBlob } from "@/lib/document/export-doc";
import { parseUploadedFile } from "@/lib/document/parse-source";
import { blocksToPlain, parseProse } from "@/lib/document/structure";
import { documentChars } from "@/lib/document/stats";
import type { DocumentBlock, IntakeOptions, ParsedDocument } from "@/lib/document/types";
import { ARTICLE_TYPE_LABEL, emptyOptions } from "@/lib/document/types";
import { DEFAULT_MODEL, LIMITS, PROMPT_VERSION } from "@/lib/limits";
import { DEFAULT_LLM_BASE_URL } from "@/lib/providers/llm-config";
import type { LiteratureQueryResult } from "@/lib/providers/openalex";
import { fromBackup, toBackup } from "@/lib/storage/backup";
import { idbList, idbPut, idbRemove } from "@/lib/storage/idb";
import type { AnalysisSnapshot, PaperRecord } from "@/lib/storage/types";
import { localOutline, localRequirements, type OutlineDraft, type RequirementsBrief } from "@/lib/workflows/conceive";
import { acceptPassed, blocksFromChecks, draftBlocks, remapChecksToOriginal, type AcceptState } from "@/lib/workflows/revise";
import { runRewriteChunks } from "@/lib/workflows/run-revise";
import type { TaskStatus } from "@/lib/workflows/task";
import { downloadText, newId, prefersReducedMotion } from "@/lib/utils";

type Mode = "revise" | "conceive" | "archive";
type KeySource = "session" | "server" | "none";


function scrollDeskApp(block: ScrollLogicalPosition = "start") {
  if (typeof window === "undefined") return;
  const target =
    window.document.getElementById("app") || window.document.getElementById("main");
  target?.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block,
  });
}

function scrollDeskBlock(blockId: string) {
  if (typeof window === "undefined") return;
  window.document
    .getElementById(`block-${blockId}`)
    ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
}

/** Slow ease-in-out scroll so the element sits near the vertical center (~1.3s). */
function scrollElementToViewportCenter(el: HTMLElement, durationMs = 1000) {
  if (typeof window === "undefined") return;
  if (prefersReducedMotion()) {
    el.scrollIntoView({ behavior: "auto", block: "center" });
    return;
  }
  const rect = el.getBoundingClientRect();
  const absoluteTop = window.scrollY + rect.top;
  const target = absoluteTop - window.innerHeight / 2 + rect.height / 2;
  const start = window.scrollY;
  const delta = target - start;
  const t0 = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / durationMs);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    window.scrollTo(0, start + delta * eased);
    if (t < 1) window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

function scheduleOutlinePanelScroll() {
  if (typeof window === "undefined") return;
  const run = () => {
    const el = window.document.getElementById("conceive-outline-result");
    if (el) scrollElementToViewportCenter(el, 1000);
  };
  // Next paint only — no setTimeout delay so motion starts immediately after click/commit.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(run);
  });
}

function scheduleReviseOptionsScroll() {
  if (typeof window === "undefined") return;
  const run = () => {
    const el = window.document.getElementById("revise-options");
    if (el) scrollElementToViewportCenter(el, 1000);
  };
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(run);
  });
}


interface Loaded {
  fileName: string;
  source: "file" | "paste";
  rawText: string;
  parsed: ParsedDocument;
  editText: string;
}

interface ReviseState {
  paste: string;
  loaded: Loaded | null;
  error: string | null;
  confirmed: ParsedDocument | null;
  options: IntakeOptions;
  paperId: string;
  taskId: string;
  suggestions: Suggestion[];
  checks: BlockCheck[];
  accept: Record<string, AcceptState>;
  manual: Record<string, string>;
  analysisOriginal: AnalysisSnapshot | null;
  analysisCurrent: AnalysisSnapshot | null;
  view: "original" | "compare" | "current" | "analysis";
  modelError: string | null;
  diagnosisSummary: string | null;
  status: TaskStatus;
  running: boolean;
  saveState: "未保存" | "已保存" | "尚未保存";
  consent: string;
  activeId: string | null;
  stageNote: string | null;
}

interface ConceiveState {
  paste: string;
  notes: string;
  loaded: Loaded | null;
  error: string | null;
  paperId: string;
  brief: RequirementsBrief | null;
  outline: OutlineDraft | null;
  direction: string;
  literature: LiteratureQueryResult[];
  queries: string;
  activePanel: "organize" | "outline" | "search" | null;
  modelError: string | null;
  running: boolean;
  saveState: "未保存" | "已保存" | "尚未保存";
  consent: string;
}

function freshRevise(): ReviseState {
  return {
    paste: "",
    loaded: null,
    error: null,
    confirmed: null,
    options: emptyOptions(),
    paperId: "",
    taskId: "",
    suggestions: [],
    checks: [],
    accept: {},
    manual: {},
    analysisOriginal: null,
    analysisCurrent: null,
    view: "original",
    modelError: null,
    diagnosisSummary: null,
    status: "pending",
    running: false,
    saveState: "未保存",
    consent: "",
    activeId: null,
    stageNote: null,
  };
}

function freshConceive(): ConceiveState {
  return {
    paste: "",
    notes: "",
    loaded: null,
    error: null,
    paperId: "",
    brief: null,
    outline: null,
    direction: "",
    literature: [],
    queries: "",
    activePanel: null,
    modelError: null,
    running: false,
    saveState: "未保存",
    consent: "",
  };
}

type QuotaInfo = {
  dailyRequestsRemaining: number;
  dailyRequestLimit: number;
  dailyTokensRemaining: number | null;
  dailyTokenLimit: number;
  resetsAt: string;
};

async function postJson(
  url: string,
  body: unknown,
  sessionKey: string,
  onQuota?: (quota: QuotaInfo) => void,
  sessionBaseUrl?: string,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionKey.trim()) headers["X-Pagebond-Session-Key"] = sessionKey.trim();
  const base = (sessionBaseUrl ?? "").trim().replace(/\/+$/, "");
  if (base && base !== DEFAULT_LLM_BASE_URL) headers["X-Pagebond-Session-Base-Url"] = base;
  // Platform dual-routing picks Qwen/DeepSeek from env; only BYOK session sends an explicit model.
  let payload: unknown = body;
  if (!sessionKey.trim() && body && typeof body === "object" && !Array.isArray(body)) {
    const { model: _omitModel, ...rest } = body as Record<string, unknown>;
    payload = rest;
  }
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const data = (await response.json().catch(() => ({ ok: false, message: "响应无法读取。" }))) as {
    ok: boolean;
    message?: string;
    code?: string;
    quota?: {
      dailyRequestsRemaining?: number;
      dailyRequestLimit?: number;
      dailyTokensRemaining?: number | null;
      dailyTokenLimit?: number;
      resetsAt?: string;
    };
    [key: string]: unknown;
  };
  const q = data.quota;
  if (
    onQuota &&
    q &&
    typeof q.dailyRequestsRemaining === "number" &&
    typeof q.dailyRequestLimit === "number"
  ) {
    onQuota({
      dailyRequestsRemaining: q.dailyRequestsRemaining,
      dailyRequestLimit: q.dailyRequestLimit,
      dailyTokensRemaining: typeof q.dailyTokensRemaining === "number" ? q.dailyTokensRemaining : null,
      dailyTokenLimit: typeof q.dailyTokenLimit === "number" ? q.dailyTokenLimit : 0,
      resetsAt: typeof q.resetsAt === "string" ? q.resetsAt : "",
    });
  }
  return data;
}

export function DeskApp() {
  const [mode, setMode] = useState<Mode>("revise");
  const [revise, setRevise] = useState<ReviseState>(freshRevise);
  const [conceive, setConceive] = useState<ConceiveState>(freshConceive);
  const [records, setRecords] = useState<PaperRecord[]>([]);
  const [opened, setOpened] = useState<PaperRecord | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [routeStatus, setRouteStatus] = useState<RouteStatus | null>(null);
  const [sessionKey, setSessionKey] = useState("");
  const [sessionBaseUrl, setSessionBaseUrl] = useState(DEFAULT_LLM_BASE_URL);
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const [serverKey, setServerKey] = useState<KeySource>("none");
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const generation = useRef(1);
  const workMode = useRef<Mode>("revise");
  const taskId = useRef("");
  const cancelRevise = useRef(false);
  const reviseRef = useRef(revise);
  const conceiveRef = useRef(conceive);
  reviseRef.current = revise;
  conceiveRef.current = conceive;

  useEffect(() => {
    const stored = window.localStorage.getItem("pagebond.model") || window.localStorage.getItem("yeyuan.model");
    const storedBase = window.localStorage.getItem("pagebond.llmBaseUrl");
    if (storedBase?.trim()) setSessionBaseUrl(storedBase.trim().replace(/\/+$/, ""));
    if (stored?.trim()) setModel(stored.trim());
    void fetch("/api/health")
      .then((response) => response.json())
      .then(
        (data: {
          keySource?: KeySource;
          routes?: RouteStatus;
          quota?: {
            dailyRequestsRemaining?: number;
            dailyRequestLimit?: number;
            dailyTokensRemaining?: number | null;
            dailyTokenLimit?: number;
            resetsAt?: string;
          };
        }) => {
          setServerKey(data.keySource === "server" ? "server" : "none");
          if (data.routes) setRouteStatus(data.routes);
          if (
            data.quota &&
            typeof data.quota.dailyRequestsRemaining === "number" &&
            typeof data.quota.dailyRequestLimit === "number"
          ) {
            setQuota({
              dailyRequestsRemaining: data.quota.dailyRequestsRemaining,
              dailyRequestLimit: data.quota.dailyRequestLimit,
              dailyTokensRemaining:
                typeof data.quota.dailyTokensRemaining === "number" ? data.quota.dailyTokensRemaining : null,
              dailyTokenLimit: typeof data.quota.dailyTokenLimit === "number" ? data.quota.dailyTokenLimit : 0,
              resetsAt: typeof data.quota.resetsAt === "string" ? data.quota.resetsAt : "",
            });
          }
        },
      )
      .catch(() => {
        setServerKey("none");
        setQuota(null);
      });
    void idbList()
      .then(setRecords)
      .catch(() => setRecords([]));
  }, []);

  const keySource: KeySource = sessionKey.trim() ? "session" : serverKey;
  const keyLabel =
    keySource === "session"
      ? "这次用你添加的会话密钥，不会被服务端密钥覆盖。"
      : keySource === "server"
        ? ""
        : "还没有可用密钥。可在设置里添加，或由部署方配置";
  const needsKey = keySource === "none";

  function openSettings() {
    if (mode === "revise" || mode === "conceive") workMode.current = mode;
    setOpened(null);
    setSettingsOpen(true);
  }

  function startWork() {
    setSettingsOpen(false);
    setOpened(null);
    if (mode === "archive") setMode(workMode.current);
  }

  useEffect(() => {
    function onOpenSettingsEvent() {
      if (mode === "revise" || mode === "conceive") workMode.current = mode;
      setOpened(null);
      setSettingsOpen(true);
    }
    window.addEventListener("pagebond:open-settings", onOpenSettingsEvent);
    return () => window.removeEventListener("pagebond:open-settings", onOpenSettingsEvent);
  }, [mode]);

  async function refreshArchive() {
    try {
      setRecords(await idbList());
    } catch {
      setRevise((current) => ({ ...current, saveState: "尚未保存" }));
    }
  }

  async function persist(record: PaperRecord, which: "revise" | "conceive") {
    try {
      await idbPut(record);
      if (which === "revise") setRevise((current) => ({ ...current, saveState: "已保存" }));
      else setConceive((current) => ({ ...current, saveState: "已保存" }));
      await refreshArchive();
    } catch {
      downloadText(`${record.title || "PAGEBOND"}-尚未保存.json`, JSON.stringify(toBackup([record]), null, 2), "application/json");
      if (which === "revise") setRevise((current) => ({ ...current, saveState: "尚未保存", modelError: "存档写入失败。已下载备份，当前页面还留着。" }));
      else setConceive((current) => ({ ...current, saveState: "尚未保存", modelError: "存档写入失败。已下载备份，当前页面还留着。" }));
    }
  }

  function reviseRecord(state: ReviseState, status: TaskStatus = state.status): PaperRecord {
    const confirmed = state.confirmed;
    return {
      id: state.paperId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: "revise",
      title: confirmed?.title || state.loaded?.fileName || "改稿",
      status,
      configVersion: PROMPT_VERSION,
      model,
      promptVersion: PROMPT_VERSION,
      rawExtractedText: state.loaded?.rawText || "",
      confirmed,
      options: state.options,
      suggestions: state.suggestions,
      accept: state.accept,
      checks: state.checks,
      currentBlocks: confirmed ? draftBlocks(confirmed.blocks, state.checks, state.accept, state.manual) : null,
      analysisOriginal: state.analysisOriginal,
      analysisCurrent: state.analysisCurrent,
      checkpoints: [],
      taskId: state.taskId,
      generation: generation.current,
      conceive: null,
    };
  }

  async function readFile(file: File, which: "revise" | "conceive") {
    const fail = (message: string) => {
      if (which === "revise") setRevise((current) => ({ ...current, error: message, loaded: null }));
      else setConceive((current) => ({ ...current, error: message, loaded: null }));
    };
    if (file.size > LIMITS.maxFileBytes) {
      fail("文件超过 15 MB。没有截断。请先拆开，或改成粘贴。");
      return;
    }
    try {
      const parsed = await parseUploadedFile(file.name, await file.arrayBuffer(), file.size);
      const loaded: Loaded = {
        fileName: file.name,
        source: "file",
        rawText: parsed.rawText,
        parsed: parsed.document,
        editText: blocksToPlain(parsed.document.blocks),
      };
      if (which === "revise") {
        generation.current += 1;
        cancelRevise.current = true;
        setRevise((current) => ({
          ...freshRevise(),
          paste: current.paste,
          options: current.options,
          loaded,
          error: parsed.document.blocks.length ? null : parsed.document.warnings[0]?.message || "没有读到正文。",
        }));
        scheduleReviseOptionsScroll();
      } else {
        setConceive((current) => ({
          ...current,
          loaded,
          error: parsed.document.blocks.length ? null : parsed.document.warnings[0]?.message || "没有读到正文。",
          brief: null,
          outline: null,
          literature: [],
          direction: "",
          queries: "",
          activePanel: null,
          consent: "",
          modelError: null,
        }));
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : "文件无法解析。");
    }
  }

  function usePaste(which: "revise" | "conceive") {
    const text = which === "revise" ? revise.paste : conceive.paste;
    const parsedDoc = parseProse(text);
    const loaded: Loaded = {
      fileName: "粘贴的文字",
      source: "paste",
      rawText: text,
      parsed: parsedDoc,
      editText: blocksToPlain(parsedDoc.blocks) || text,
    };
    if (!text.trim()) {
      if (which === "revise") setRevise((current) => ({ ...current, error: "还没有可解析的文字。" }));
      else setConceive((current) => ({ ...current, error: "还没有可解析的文字。" }));
      return;
    }
    if (which === "revise") {
      generation.current += 1;
      cancelRevise.current = true;
      setRevise((current) => ({
        ...freshRevise(),
        paste: current.paste,
        options: current.options,
        loaded,
        error: parsedDoc.warnings.find((item) => item.code === "empty")?.message ?? null,
      }));
      scheduleReviseOptionsScroll();
    } else {
      setConceive((current) => ({
        ...current,
        loaded,
        brief: null,
        outline: null,
        literature: [],
        direction: "",
        queries: "",
        activePanel: null,
        consent: "",
        error: null,
        modelError: null,
      }));
    }
  }

  async function confirmRevise() {
    if (!revise.loaded) return;
    const confirmed = parseProse(revise.loaded.editText);
    if (!confirmed.blocks.length) {
      setRevise((current) => ({ ...current, error: "确认稿是空的。" }));
      return;
    }
    const paperId = revise.paperId || newId();
    const nextTask = newId();
    taskId.current = nextTask;
    generation.current += 1;
    const notes = localStructureNotes(confirmed, revise.options.articleType);
    const consentKey = `${model}:${contentVersion(confirmed.blocks)}:${revise.options.level}:${revise.options.language}`;
    const next: ReviseState = {
      ...revise,
      paperId,
      taskId: nextTask,
      confirmed,
      suggestions: notes,
      checks: [],
      accept: {},
      manual: {},
      analysisOriginal: null,
      analysisCurrent: null,
      modelError: null,
      diagnosisSummary: null,
      status: "pending",
      error: null,
      stageNote: null,
      consent: consentKey,
    };
    setRevise(next);
    await persist(reviseRecord(next, "pending"), "revise");
    scrollDeskApp();
  }

  const currentBlocks = useMemo(() => {
    if (!revise.confirmed) return [];
    return draftBlocks(revise.confirmed.blocks, revise.checks, revise.accept, revise.manual);
  }, [revise]);

  const scopeKey = `${model}:${revise.confirmed ? contentVersion(revise.confirmed.blocks) : ""}:${revise.options.level}:${revise.options.language}`;

  async function analyze() {
    if (!revise.confirmed) return;
    if (documentChars(revise.confirmed.blocks) > LIMITS.targetChars || documentChars(currentBlocks) > LIMITS.targetChars) {
      setRevise((current) => ({ ...current, modelError: "超过 4 万字目标上限，没有截断，也没有发送。" }));
      return;
    }
    const draftChanged = contentVersion(currentBlocks) !== contentVersion(revise.confirmed.blocks);
    setRevise((current) => ({ ...current, running: true, modelError: null, status: "running", stageNote: "诊断与分析中…" }));
    if (draftChanged) {
      const data = await postJson(
        "/api/revise/analyze",
        { original: revise.confirmed.blocks, current: currentBlocks, options: revise.options, model },
        sessionKey,
        setQuota,
        sessionBaseUrl,
      );
      if (!data.ok) {
        setRevise((current) => ({
          ...current,
          running: false,
          status: "failed",
          stageNote: null,
          modelError: data.message || "诊断与分析没有完成。未调用到可用模型。",
        }));
        return;
      }
      const suggestions = (data.suggestions as Suggestion[]) || [];
      const snapshot: AnalysisSnapshot = {
        version: contentVersion(currentBlocks),
        summary: String(data.summary || ""),
        dimensions: (data.dimensions as AnalysisSnapshot["dimensions"]) || [],
        suggestions,
        origin: "model",
        model: String(data.model || model),
        promptVersion: PROMPT_VERSION,
      };
      setRevise((current) => {
        const next = {
          ...current,
          running: false,
          status: "review" as TaskStatus,
          stageNote: null,
          diagnosisSummary: String(data.summary || ""),
          analysisCurrent: snapshot,
          suggestions: [...current.suggestions.filter((item) => item.version !== "current-draft"), ...suggestions],
          modelError: null,
          view: "analysis" as const,
        };
        void persist(reviseRecord(next, "review"), "revise");
        return next;
      });
      return;
    }
    const data = await postJson(
      "/api/revise/diagnose",
      { blocks: revise.confirmed.blocks, options: revise.options, model },
      sessionKey,
      setQuota,
      sessionBaseUrl,
    );
    if (!data.ok) {
      setRevise((current) => ({
        ...current,
        running: false,
        status: "failed",
        stageNote: null,
        modelError: data.message || "诊断与分析没有完成。未调用到可用模型。",
      }));
      return;
    }
    const modelNotes = (data.suggestions as Suggestion[]) || [];
    const summary = String(data.summary || "");
    const version = contentVersion(revise.confirmed.blocks);
    const analysisOriginal: AnalysisSnapshot = {
      version,
      summary,
      dimensions: [],
      suggestions: modelNotes,
      origin: "model",
      model: String(data.model || model),
      promptVersion: PROMPT_VERSION,
    };
    setRevise((current) => {
      const next = {
        ...current,
        running: false,
        status: "review" as TaskStatus,
        stageNote: null,
        diagnosisSummary: summary,
        analysisOriginal,
        suggestions: [...current.suggestions.filter((item) => item.origin === "local"), ...modelNotes],
        modelError: null,
        view: "analysis" as const,
      };
      void persist(reviseRecord(next, "review"), "revise");
      return next;
    });
  }

  async function rewrite() {
    if (!revise.confirmed) return;
    if (documentChars(revise.confirmed.blocks) > LIMITS.targetChars) {
      setRevise((current) => ({ ...current, modelError: "超过 4 万字目标上限，没有截断，也没有发送。" }));
      return;
    }
    const identity = { paperId: revise.paperId, taskId: revise.taskId || newId(), generation: generation.current };
    taskId.current = identity.taskId;
    cancelRevise.current = false;
    const originalBlocks = revise.confirmed.blocks;
    const plan = planChunks(originalBlocks, model);
    setRevise((current) => ({
      ...current,
      running: true,
      modelError: null,
      status: "running",
      checks: [],
      accept: {},
      stageNote: "① 先做人话化／行文自然度优化（降低机械感）…",
      view: "compare",
    }));
    const checkpoints: PaperRecord["checkpoints"] = [];

    // Stage 1: humanize
    const humanizeResult = await runRewriteChunks({
      plan,
      identity,
      current: () => ({ paperId: reviseRef.current.paperId, taskId: taskId.current, generation: generation.current }),
      cancelled: () => cancelRevise.current,
      rewriteChunk: async (index) => {
        const chunk = plan.chunks[index];
        const data = await postJson("/api/revise/humanize",
          { blocks: chunk.blocks, options: reviseRef.current.options, model }, sessionKey, undefined, sessionBaseUrl);
        if (!data.ok) throw new Error(data.message || "人话化没有完成");
        return { checks: data.checks as BlockCheck[], integrity: data.integrity as "passed" | "failed" };
      },
      onCheckpoint: async (checkpoint, checks) => {
        checkpoints.push({ ...checkpoint, status: checkpoint.status === "done" ? "done" : checkpoint.status });
        const state = reviseRef.current;
        if (!state.confirmed) return;
        const merged = [...state.checks.filter((item) => !checks.some((check) => check.id === item.id)), ...checks];
        const next = {
          ...state,
          checks: merged,
          status: checkpoint.status,
          stageNote: `① 人话化进行中（块 ${checkpoint.chunkIndex + 1}/${plan.chunks.length}）…`,
        };
        const record = reviseRecord(next, checkpoint.status);
        record.checkpoints = checkpoints;
        await persist(record, "revise");
        setRevise(next);
      },
    });

    if (cancelRevise.current) {
      setRevise((current) => ({
        ...current,
        running: false,
        status: "cancelled",
        stageNote: "已停止。人话化未完成。",
        modelError: "已停止。已保存的段落还在。",
      }));
      return;
    }

    if (humanizeResult.status === "failed" && !humanizeResult.checks.length) {
      setRevise((current) => ({
        ...current,
        running: false,
        status: "failed",
        stageNote: null,
        modelError: "人话化没有完成。未调用到可用模型，或请求失败。",
      }));
      return;
    }

    const humanizedBlocks = blocksFromChecks(originalBlocks, humanizeResult.checks);
    setRevise((current) => ({
      ...current,
      checks: humanizeResult.checks,
      stageNote: "① 人话化完成。② 进入受约束改写…",
      view: "compare",
    }));

    // Stage 2: constrained rewrite on humanized draft
    const rewritePlan = planChunks(humanizedBlocks, model);
    const rewriteResult = await runRewriteChunks({
      plan: rewritePlan,
      identity,
      current: () => ({ paperId: reviseRef.current.paperId, taskId: taskId.current, generation: generation.current }),
      cancelled: () => cancelRevise.current,
      rewriteChunk: async (index) => {
        const chunk = rewritePlan.chunks[index];
        const data = await postJson("/api/revise/rewrite",
          { blocks: chunk.blocks, options: reviseRef.current.options, model }, sessionKey, undefined, sessionBaseUrl);
        if (!data.ok) throw new Error(data.message || "改写失败");
        return { checks: data.checks as BlockCheck[], integrity: data.integrity as "passed" | "failed" };
      },
      onCheckpoint: async (checkpoint, checks) => {
        checkpoints.push(checkpoint);
        const state = reviseRef.current;
        if (!state.confirmed) return;
        const remapped = remapChecksToOriginal(originalBlocks, checks);
        const merged = [
          ...state.checks.filter((item) => !remapped.some((check) => check.id === item.id)),
          ...remapped,
        ];
        const next = {
          ...state,
          checks: merged,
          status: checkpoint.status,
          stageNote: `② 受约束改写进行中（块 ${checkpoint.chunkIndex + 1}/${rewritePlan.chunks.length}）…`,
        };
        const record = reviseRecord(next, checkpoint.status);
        record.checkpoints = checkpoints;
        await persist(record, "revise");
        setRevise(next);
      },
    });

    const finalChecks = remapChecksToOriginal(originalBlocks, rewriteResult.checks);
    // Prefer rewrite result; if a block was only humanized (rewrite missing), keep humanize check
    const byFinal = new Map(finalChecks.map((c) => [c.id, c]));
    const byHuman = new Map(humanizeResult.checks.map((c) => [c.id, c]));
    const mergedFinal = originalBlocks.map((block) => {
      const rewritten = byFinal.get(block.id);
      if (rewritten && (rewritten.changed || rewritten.status !== "reverted")) return rewritten;
      const humanized = byHuman.get(block.id);
      if (humanized) {
        return {
          ...humanized,
          text: block.text,
          changed: humanized.suggestedText !== block.text,
          reasons: humanized.reasons.length
            ? [`人话化：${humanized.reasons.join("；")}`, ...(rewritten?.reasons || [])]
            : rewritten?.reasons || ["人话化后未再改动"],
        };
      }
      return (
        rewritten || {
          id: block.id,
          status: "reverted" as const,
          reasons: ["这一段没有返回"],
          text: block.text,
          suggestedText: block.text,
          changed: false,
        }
      );
    });

    setRevise((current) => {
      const cancelled = rewriteResult.status === "cancelled";
      const accept = cancelled
        ? current.accept
        : acceptPassed(mergedFinal, current.accept);
      const next = {
        ...current,
        running: false,
        checks: mergedFinal,
        accept,
        status: cancelled ? ("cancelled" as const) : rewriteResult.status,
        stageNote: cancelled
          ? "已停止。人话化结果已保留在对照里。"
          : "已完成：先人话化／行文自然度，再受约束改写。已通过的修改已写入「改稿」。",
        view: (cancelled ? "compare" : "current") as "compare" | "current",
        modelError:
          rewriteResult.status === "failed"
            ? "改写没有全部完成。已通过的段落已写入「改稿」；未通过的段落保持更早一版。"
            : cancelled
              ? "已停止。已保存的段落还在。"
              : rewritePlan.overVerified || plan.overVerified
                ? "已超过自动测试验证过的篇幅。结果可用，但不标成长文已支持。"
                : null,
      };
      const record = reviseRecord(next, next.status);
      record.checkpoints = checkpoints;
      void persist(record, "revise");
      return next;
    });
  }



  function openSuggestion(suggestion: Suggestion) {
    const source = suggestion.version === "current-draft" ? currentBlocks : revise.confirmed?.blocks || [];
    const found = locateSuggestion(source, suggestion);
    if (!found) {
      setRevise((current) => ({ ...current, modelError: "这条摘句在对应版本里找不到，所以没有跳转。" }));
      return;
    }
    setRevise((current) => ({
      ...current,
      view: suggestion.version === "current-draft" ? "current" : "original",
      activeId: found.id,
      modelError: null,
    }));
    scrollDeskBlock(found.id);
  }

  function manualEdit(id: string, text: string) {
    const original = revise.confirmed?.blocks.find((block) => block.id === id);
    if (!original) return;
    const lost = missingProtections(original.protections, text);
    if (lost.length || (original.locked && text !== original.text)) {
      setRevise((current) => ({
        ...current,
        modelError: `保护项被改了，${id} 已退回原文：${lost.map((item) => item.text).join("、") || "锁定内容"}`,
      }));
      return;
    }
    setRevise((current) => ({
      ...current,
      manual: { ...current.manual, [id]: text },
      accept: { ...current.accept, [id]: "manual" },
      analysisCurrent: null,
      modelError: null,
    }));
  }

  async function runRequirements() {
    const text = conceive.loaded?.editText || conceive.paste;
    if (!text.trim() && !conceive.notes.trim()) {
      setConceive((current) => ({ ...current, error: "要求文件和补充至少要有一项。" }));
      return;
    }
    const consentOk = conceive.consent === `conceive:${model}:${text}`;
    const canModel = !needsKey && consentOk;
    setConceive((current) => ({
      ...current,
      running: true,
      modelError: null,
      error: null,
      activePanel: "organize",
      // 整理要求不附带框架；重新整理时收起旧框架，避免看起来像整理结果。
      outline: null,
      literature: [],
    }));
    if (!canModel) {
      const brief = localRequirements(text, conceive.notes);
      const reason = needsKey
        ? "还没有可用密钥，已改为本地整理。"
        : "未勾选外发说明，已改为本地整理。";
      setConceive((current) => ({
        ...current,
        running: false,
        brief,
        activePanel: "organize",
        outline: null,
        literature: [],
        modelError: reason,
      }));
      return;
    }
    const data = await postJson(
      "/api/conceive/requirements",
      { requirementText: text, notes: conceive.notes, model, options: { articleType: "course" } },
      sessionKey,
      setQuota,
      sessionBaseUrl,
    );
    if (!data.ok) {
      const brief = localRequirements(text, conceive.notes);
      setConceive((current) => ({
        ...current,
        running: false,
        brief,
        activePanel: "organize",
        outline: null,
        literature: [],
        modelError: `${data.message || "模型没有完成要求整理。"} 下面这份是本地整理，不是模型结果。`,
      }));
      return;
    }
    setConceive((current) => ({
      ...current,
      running: false,
      brief: data.brief as RequirementsBrief,
      outline: null,
      literature: [],
      activePanel: "organize",
      modelError: null,
    }));
  }

  async function runOutline() {
    const text = conceive.loaded?.editText || conceive.paste;
    if (conceive.consent !== `conceive:${model}:${text}`) {
      setConceive((current) => ({ ...current, modelError: "先勾选外发说明。" }));
      return;
    }
    setConceive((current) => ({ ...current, running: true, activePanel: "outline", modelError: null }));
    const previous = conceive.outline;
    let brief = conceive.brief ?? localRequirements(text, conceive.notes);
    let directionNote: string | null = null;

    if (needsKey) {
      brief = localRequirements(text, conceive.notes);
      const directionTitle = brief.directions[0]?.title || "";
      const outline = previous ?? localOutline(brief, { directionTitle, assumptions: brief.assumptions });
      setConceive((current) => ({
        ...current,
        running: false,
        brief,
        direction: directionTitle,
        outline,
        queries: outline.literatureQueries.join("\n"),
        activePanel: "outline",
        modelError: "还没有可用密钥，已生成本地方向与框架。",
      }));
      scheduleOutlinePanelScroll();
      return;
    }

    const reqData = await postJson(
      "/api/conceive/requirements",
      { requirementText: text, notes: conceive.notes, model, options: { articleType: "course" } },
      sessionKey,
      setQuota,
      sessionBaseUrl,
    );
    if (reqData.ok) {
      brief = { ...(reqData.brief as RequirementsBrief), origin: "model" };
    } else {
      const local = localRequirements(text, conceive.notes);
      brief = {
        ...brief,
        directions: local.directions.length ? local.directions : brief.directions,
      };
      directionNote = `${reqData.message || "方向未能由模型给出。"} 已用本地方向建议。`;
    }

    const directionTitle = brief.directions[0]?.title || "";
    const data = await postJson(
      "/api/conceive/outline",
      {
        requirementText: text,
        notes: conceive.notes,
        directionTitle,
        assumptions: brief.assumptions,
        model,
        options: { articleType: "course" },
      },
      sessionKey,
      setQuota,
      sessionBaseUrl,
    );
    if (!data.ok) {
      const outline = previous ?? localOutline(brief, { directionTitle, assumptions: brief.assumptions });
      const outlineNote = `${data.message || "模型没有写出框架。"} 已保留${previous ? "原来的" : "本地"}框架。`;
      setConceive((current) => ({
        ...current,
        running: false,
        brief,
        direction: directionTitle,
        outline,
        queries: outline.literatureQueries.join("\n"),
        activePanel: "outline",
        modelError: [directionNote, outlineNote].filter(Boolean).join(" "),
      }));
      scheduleOutlinePanelScroll();
      return;
    }
    const outline = data.outline as OutlineDraft;
    setConceive((current) => ({
      ...current,
      running: false,
      brief,
      direction: directionTitle,
      outline,
      queries: outline.literatureQueries.join("\n"),
      activePanel: "outline",
      modelError: directionNote,
    }));
    scheduleOutlinePanelScroll();
  }

  async function searchLiterature() {
    const queries = conceive.queries
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, LIMITS.maxLiteratureQueries);
    const outline = conceive.outline;
    const data = await postJson("/api/literature", { queries }, sessionKey, undefined, sessionBaseUrl);
    if (!data.ok) {
      setConceive((current) => ({
        ...current,
        literature: [],
        outline,
        modelError: data.message || "检索失败。",
      }));
      return;
    }
    setConceive((current) => ({ ...current, literature: data.results as LiteratureQueryResult[], outline, modelError: null }));
  }

  async function saveConceive(outline = conceive.outline, literature = conceive.literature) {
    const text = conceive.loaded?.editText || conceive.paste;
    const paperId = conceive.paperId || newId();
    const record: PaperRecord = {
      id: paperId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: "conceive",
      title: conceive.brief?.keywords[0]?.term || conceive.loaded?.fileName || "起稿",
      status: outline ? "done" : "partial",
      configVersion: PROMPT_VERSION,
      model,
      promptVersion: PROMPT_VERSION,
      rawExtractedText: conceive.loaded?.rawText || text,
      confirmed: conceive.loaded?.parsed ?? null,
      options: emptyOptions(),
      suggestions: [],
      accept: {},
      checks: [],
      currentBlocks: null,
      analysisOriginal: null,
      analysisCurrent: null,
      checkpoints: [],
      taskId: paperId,
      generation: 1,
      conceive: {
        requirementText: text,
        notes: conceive.notes,
        brief: conceive.brief,
        outline,
        literature,
      },
    };
    setConceive((current) => ({ ...current, paperId }));
    await persist(record, "conceive");
  }

  function analysisExportLines(): string[] {
    const snapshot = revise.analysisCurrent || revise.analysisOriginal;
    const summary = revise.analysisCurrent?.summary || revise.diagnosisSummary || revise.analysisOriginal?.summary || "";
    const lines: string[] = [];
    if (summary) lines.push(summary);
    for (const dimension of revise.analysisCurrent?.dimensions || []) {
      const bits = [
        dimension.conclusion,
        dimension.resolved.length ? `已解决：${dimension.resolved.join("、")}` : "",
        dimension.remaining.length ? `仍在：${dimension.remaining.join("、")}` : "",
        dimension.needsMaterial.length ? `要补材料：${dimension.needsMaterial.join("、")}` : "",
      ].filter(Boolean);
      lines.push(`${dimension.id}：${bits.join(" ")}`);
    }
    const suggestions = snapshot?.suggestions?.length
      ? snapshot.suggestions
      : revise.suggestions.filter((item) => item.origin === "model");
    for (const suggestion of suggestions) {
      lines.push(
        `${suggestion.quote} — ${suggestion.problem}${suggestion.change ? `；建议：${suggestion.change}` : ""}`,
      );
    }
    return lines;
  }

  async function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    if (typeof window === "undefined") return;
    const link = window.document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportRevisedDocx() {
    if (!revise.confirmed) return;
    const blob = await exportDocxBlob(currentBlocks, revise.confirmed.title || "改稿");
    await downloadBlob(blob, "改稿.docx");
  }

  async function exportAnalysisDocx() {
    if (!revise.confirmed) return;
    const lines = analysisExportLines();
    if (!lines.length) {
      setRevise((current) => ({ ...current, modelError: "还没有诊断与分析结果，请先点「诊断与分析」。" }));
      return;
    }
    const blob = await exportAnalysisDocxBlob("诊断与分析结果", lines);
    await downloadBlob(blob, "分析.docx");
  }

  const verifiedNote =
    revise.confirmed && documentChars(revise.confirmed.blocks) > LIMITS.verifiedChars
      ? `这篇大约 ${documentChars(revise.confirmed.blocks)} 字，超过已验证的 ${LIMITS.verifiedChars} 字。可以分块处理，但不标成长文已支持。`
      : "";
  const analysisStale =
    (revise.analysisCurrent && contentVersion(currentBlocks) !== revise.analysisCurrent.version) ||
    (revise.analysisOriginal &&
      !revise.analysisCurrent &&
      contentVersion(revise.confirmed?.blocks || []) !== revise.analysisOriginal.version)
      ? "稿件已变化，旧分析不再当作当前结论。"
      : null;

  const viewing = opened && !settingsOpen ? opened : null;
  const showReviseWork = mode === "revise" && !viewing && !settingsOpen;
  const showConceiveWork = mode === "conceive" && !viewing && !settingsOpen;

  return (
    <div className="min-h-screen bg-desk text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-paper focus:p-3">
        跳到正文
      </a>
      {revise.running || conceive.running ? (
        <header className="sticky top-0 z-20 border-b border-line/70 bg-desk/80 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="min-h-11 cursor-pointer rounded-xl px-3 text-sm text-ink hover:bg-sunk"
              onClick={() => {
                cancelRevise.current = true;
                generation.current += 1;
              }}
            >
              停止
            </button>
          </div>
        </header>
      ) : null}
      <div className={`desk-grid${settingsOpen ? " desk-grid-stretch" : ""}`}>
        <nav aria-label="模式" className="flex gap-2 lg:flex-col">
          {(
            [
              ["revise", "改稿", revise.confirmed ? "1" : ""],
              ["conceive", "起稿", conceive.brief ? "1" : ""],
              ["archive", "存档", ""],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              data-testid={`mode-${id}`}
              aria-pressed={mode === id}
              className={`desk-nav-pill flex min-h-11 w-auto flex-1 cursor-pointer lg:w-full lg:flex-none items-center justify-between px-4 text-left ${mode === id ? "" : "text-ink-soft hover:bg-paper/70 hover:text-ink"}`}
              onClick={() => {
                setMode(id);
                setOpened(null);
                setSettingsOpen(false);
              }}
            >
              <span>{label}</span>
              {count ? <span className="text-sm text-ink-soft">{count}</span> : null}
            </button>
          ))}
          <p className={`mt-4 hidden lg:flex ${needsKey ? "desk-chip" : "text-sm text-ink-soft"}`} data-testid="key-status-label">
            {needsKey ? <span className="desk-chip-dot" aria-hidden /> : null}
            <span>{keyLabel}</span>
          </p>
          {showReviseWork && revise.confirmed ? (
            <div className="mt-4 hidden lg:block">
              <p className="text-sm text-ink-soft">目录</p>
              <ul className="mt-2 space-y-1">
                {revise.confirmed.outline.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="min-h-11 cursor-pointer text-left"
                      onClick={() => scrollDeskBlock(item.id)}
                    >
                      {item.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </nav>
        <main id="main" className="min-w-0">
          {settingsOpen ? (
            <SettingsScreen
              model={model}
              baseUrl={sessionBaseUrl}
              keySource={keySource}
              sessionLabel={sessionLabel}
              routes={routeStatus}
              quota={keySource === "server" ? quota : null}
              onModel={(value) => {
                setModel(value);
                window.localStorage.setItem("pagebond.model", value);
                generation.current += 1;
              }}
              onBaseUrl={(value) => {
                const next = value.trim().replace(/\/+$/, "") || DEFAULT_LLM_BASE_URL;
                setSessionBaseUrl(next);
                window.localStorage.setItem("pagebond.llmBaseUrl", next);
              }}
              onAdded={(key, label) => {
                setSessionKey(key);
                setSessionLabel(label);
              }}
              onClearSession={() => {
                setSessionKey("");
                setSessionLabel(null);
              }}
              onStart={startWork}
            />
          ) : null}
          {viewing ? (
            <ArchiveReader record={viewing} onBack={() => setOpened(null)} />
          ) : null}
          {showReviseWork ? (
            <ReviseMain
              state={revise}
              setRevise={setRevise}
              onFile={(file) => void readFile(file, "revise")}
              onUsePaste={() => usePaste("revise")}
              onConfirm={() => void confirmRevise()}
              onRewrite={() => void rewrite()}
              onAnalyze={() => void analyze()}
              onExportRevised={() => void exportRevisedDocx()}
              onExportAnalysis={() => void exportAnalysisDocx()}
              hasAnalysis={Boolean(
                revise.diagnosisSummary || revise.analysisCurrent || revise.analysisOriginal,
              )}
              onAccept={(id) => setRevise((current) => ({ ...current, accept: { ...current.accept, [id]: "accepted" }, view: "current" }))}
              onRevert={(id) => setRevise((current) => ({ ...current, accept: { ...current.accept, [id]: "reverted" } }))}
              onManual={manualEdit}
              verifiedNote={verifiedNote}
              scopeKey={scopeKey}
              analysisStale={analysisStale}
              currentBlocks={currentBlocks}
              onClear={() => {
                generation.current += 1;
                cancelRevise.current = true;
                setRevise((current) => ({ ...freshRevise(), paste: current.paste, options: current.options }));
              }}
              onOpenSettings={openSettings}
            />
          ) : null}
          {showConceiveWork ? (
            <ConceiveMain
              state={conceive}
              setConceive={setConceive}
              onFile={(file) => void readFile(file, "conceive")}
              onUsePaste={() => usePaste("conceive")}
              onRequirements={() => void runRequirements()}
              onOutline={() => void runOutline()}
              onOpenSearch={() =>
                setConceive((current) => {
                  const queries =
                    current.queries.trim() ||
                    (current.outline?.literatureQueries.join("\n") ?? "");
                  return { ...current, activePanel: "search", queries };
                })
              }
              onSearch={() => void searchLiterature()}
              onSave={() => void saveConceive()}
              onBack={() =>
                setConceive((current) => ({
                  ...current,
                  loaded: null,
                  brief: null,
                  outline: null,
                  literature: [],
                  direction: "",
                  queries: "",
                  activePanel: null,
                  consent: "",
                  error: null,
                  modelError: null,
                  running: false,
                }))
              }
              model={model}
              onOpenSettings={openSettings}
            />
          ) : null}
          {mode === "archive" && !viewing && !settingsOpen ? (
            <ArchivePanel
              records={records}
              onOpen={(record) => setOpened(record)}
              onDelete={async (id) => {
                await idbRemove(id);
                if (revise.paperId === id) setRevise((current) => ({ ...current, paperId: "" }));
                await refreshArchive();
              }}
              onExport={() => downloadText("PAGEBOND-备份.json", JSON.stringify(toBackup(records), null, 2), "application/json")}
              onImport={async (file) => {
                const parsed = fromBackup(JSON.parse(await file.text()));
                if (parsed.error) {
                  setRevise((current) => ({ ...current, modelError: parsed.error }));
                  return;
                }
                for (const record of parsed.records) await idbPut(record);
                await refreshArchive();
              }}
            />
          ) : null}
        </main>
        <div className={settingsOpen || suggestionsOpen ? "block lg:block" : "hidden lg:block"}>
          {showReviseWork ? (
            revise.confirmed ? (
              <SuggestionRail
                suggestions={revise.suggestions}
                notice={analysisStale}
                onOpen={openSuggestion}
              />
            ) : (
              <aside className="desk-card p-5">
                <h2 className="text-lg">改稿</h2>
                <p className="mt-2 text-ink-soft">文章润色,去AI化</p>
              </aside>
            )
          ) : null}
          {showConceiveWork ? <ConceiveRail state={conceive} /> : null}
          {settingsOpen ? (
            <div className="flex h-full flex-col justify-between gap-3" data-testid="settings-rail">
              <aside className="desk-card px-4 py-4 text-sm leading-relaxed text-ink-soft">
                <p>密钥只留在这次会话里。</p>
                <p className="mt-2">未做查重；不绕过检测。</p>
              </aside>
              {routeStatus || (keySource === "server" && quota) ? (
                <aside className="desk-card px-4 py-4 text-sm leading-relaxed text-ink-soft">
                  {routeStatus ? (
                    <p data-testid="model-route-label">
                      日常 {routeStatus.daily?.keyConfigured ? "Qwen" : "未配"} · 深度{" "}
                      {routeStatus.deep?.keyConfigured ? "DeepSeek" : "未配"}
                    </p>
                  ) : null}
                  {keySource === "server" && quota ? (
                    <p className={`${routeStatus ? "mt-2 " : ""}whitespace-nowrap`} data-testid="platform-quota">
                      今日平台额度还剩 {quota.dailyRequestsRemaining}/{quota.dailyRequestLimit} 次
                    </p>
                  ) : null}
                </aside>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReviseMain({
  state,
  setRevise,
  onFile,
  onUsePaste,
  onConfirm,
  onRewrite,
  onAnalyze,
  onExportRevised,
  onExportAnalysis,
  hasAnalysis,
  onAccept,
  onRevert,
  onManual,
  onClear,
  verifiedNote,
  scopeKey,
  analysisStale,
  currentBlocks,
  onOpenSettings,
}: {
  state: ReviseState;
  setRevise: Dispatch<SetStateAction<ReviseState>>;
  onFile: (file: File) => void;
  onUsePaste: () => void;
  onConfirm: () => void;
  onRewrite: () => void;
  onAnalyze: () => void;
  onExportRevised: () => void;
  onExportAnalysis: () => void;
  hasAnalysis: boolean;
  onAccept: (id: string) => void;
  onRevert: (id: string) => void;
  onManual: (id: string, text: string) => void;
  onClear: () => void;
  verifiedNote: string;
  scopeKey: string;
  analysisStale: string | null;
  currentBlocks: DocumentBlock[];
  onOpenSettings: () => void;
}) {
  const loaded = state.loaded;
  return (
    <div className="space-y-4">
      {!state.confirmed ? (
        <IntakeWell
          testId="intake-revise"
          title="把已经写好的论文放在这里"
          fileName={loaded?.source === "file" ? loaded.fileName : ""}
          error={state.error}
          paste={state.paste}
          onPaste={(value) => setRevise((current) => ({ ...current, paste: value }))}
          onUsePaste={onUsePaste}
          onFile={onFile}
        />
      ) : null}
      {loaded && !state.confirmed ? (
        <ReviseOptions
          loaded={loaded}
          options={state.options}
          onOptions={(options) => setRevise((current) => ({ ...current, options }))}
          onConfirm={onConfirm}
        />
      ) : null}
      {state.confirmed ? (
        <section className="desk-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {loaded?.source === "paste" ? null : (
              <p className="text-ink">
                {loaded?.fileName} · {state.options.language === "en" ? `${state.confirmed.stats.words} 词` : `${state.confirmed.stats.chars} 字`} · 当前是文件
              </p>
            )}
            <Button type="button" variant="quiet" onClick={onClear}>
              换一篇
            </Button>
          </div>
          {verifiedNote ? <p className="mt-2 text-sm text-ink-soft">{verifiedNote}</p> : null}
          {state.modelError ? (
            <div className="mt-3">
              <p role="alert" data-testid="model-error" className="rounded-xl border border-line bg-sunk/80 px-3 py-2">
                {state.modelError}
              </p>
              <MissingKeyLink message={state.modelError} onOpen={onOpenSettings} />
            </div>
          ) : null}
          {analysisStale ? <p className="mt-2 text-ink">{analysisStale}</p> : null}
          {state.stageNote ? (
            <p className="mt-2 rounded-xl border border-line bg-desk/60 px-3 py-2 text-sm" data-testid="revise-stage">
              {state.stageNote}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" disabled={state.running} onClick={onAnalyze} data-testid="revise-analyze">
              诊断与分析
            </Button>
            <Button type="button" disabled={state.running} onClick={onRewrite}>
              人话化并改写
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="稿件版本">
            {(
              [
                ["original", "原稿"],
                ["current", "改稿"],
                ["compare", "逐段对照"],
                ["analysis", "分析"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={state.view === id}
                className={`min-h-11 cursor-pointer rounded-full px-4 text-sm ${state.view === id ? "bg-paper text-ink shadow-sm ring-1 ring-line" : "text-ink-soft hover:bg-paper/70"}`}
                onClick={() => setRevise((current) => ({ ...current, view: id }))}
              >
                {label}
              </button>
            ))}
          </div>
          {state.view === "analysis" ? (
            <div className="mt-4 space-y-2 rounded-xl border border-line bg-desk/60 px-3 py-2" data-testid="revise-analysis">
              <p className="text-sm text-ink-soft">诊断与分析结果</p>
              {state.diagnosisSummary || state.analysisCurrent || state.analysisOriginal ? (
                <>
                  <p>{state.analysisCurrent?.summary || state.diagnosisSummary || state.analysisOriginal?.summary}</p>
                  {(state.analysisCurrent?.dimensions || []).map((dimension) => (
                    <p key={dimension.id}>
                      {dimension.id}：{dimension.conclusion}
                      {dimension.resolved.length ? ` 已解决：${dimension.resolved.join("、")}` : ""}
                      {dimension.remaining.length ? ` 仍在：${dimension.remaining.join("、")}` : ""}
                      {dimension.needsMaterial.length ? ` 要补材料：${dimension.needsMaterial.join("、")}` : ""}
                    </p>
                  ))}
                </>
              ) : (
                <p className="text-ink-soft">还没有诊断与分析。点上方「诊断与分析」开始。</p>
              )}
            </div>
          ) : (
            <ManuscriptCollapse
              title={loaded?.fileName || state.confirmed.title || "已提交稿件"}
              charCount={state.options.language === "en" ? state.confirmed.stats.words : state.confirmed.stats.chars}
              unit={state.options.language === "en" ? "词" : "字"}
              preview={state.confirmed.blocks.map((block) => block.text).filter(Boolean)[0] || ""}
              resetKey={state.paperId || contentVersion(state.confirmed.blocks)}
              preferOpen={Boolean(state.activeId)}
            >
              <ManuscriptPane
                view={state.view === "compare" ? "compare" : state.view === "current" ? "current" : "original"}
                original={state.confirmed.blocks}
                current={state.view === "compare" ? suggestedBlocks(state) : currentBlocks}
                checks={state.checks}
                accept={state.accept}
                readOnly={false}
                activeId={state.activeId}
                onAccept={onAccept}
                onRevert={onRevert}
                onManual={onManual}
              />
            </ManuscriptCollapse>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="quiet" onClick={onExportRevised} data-testid="download-revise-docx">
              下载改稿
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={!hasAnalysis}
              onClick={onExportAnalysis}
              data-testid="download-analysis-docx"
              title={hasAnalysis ? undefined : "请先完成诊断与分析"}
            >
              下载分析
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function suggestedBlocks(state: ReviseState): DocumentBlock[] {
  if (!state.confirmed) return [];
  return state.confirmed.blocks.map((block) => {
    const check = state.checks.find((item) => item.id === block.id);
    if (!check || check.status === "reverted") return block;
    return { ...block, text: check.suggestedText };
  });
}

function ManuscriptCollapse({
  title,
  charCount,
  unit,
  preview,
  resetKey,
  preferOpen = false,
  children,
}: {
  title: string;
  charCount: number;
  unit: string;
  preview: string;
  resetKey: string;
  preferOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [resetKey]);
  useEffect(() => {
    if (preferOpen) setOpen(true);
  }, [preferOpen]);
  void title;
  void charCount;
  void unit;
  void preview;
  return (
    <div className="mt-4" data-testid="manuscript-collapse">
      <button
        type="button"
        className="flex w-full min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line bg-paper/70 px-3 py-3 text-left hover:bg-paper"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className={`inline-flex size-5 shrink-0 items-center justify-center text-ink-soft transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          <svg viewBox="0 0 20 20" className="size-4 fill-current" aria-hidden>
            <path d="M7.5 4.5 13 10l-5.5 5.5V4.5Z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-ink">{open ? "收起正文" : "展开正文"}</span>
        </span>
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function ReviseOptions({
  loaded,
  options,
  onOptions,
  onConfirm,
}: {
  loaded: Loaded;
  options: IntakeOptions;
  onOptions: (options: IntakeOptions) => void;
  onConfirm: () => void;
}) {
  return (
    <section id="revise-options" className="desk-card p-4 sm:p-6" data-testid="revise-options">
      <h2 className="text-xl">确认选项</h2>
      <p className="mt-2 text-ink-soft">
        {loaded.fileName} · {loaded.parsed.stats.chars} 字 · {loaded.parsed.stats.words} 词 · 当前用的是
        {loaded.source === "paste" ? "粘贴" : "文件"}
      </p>
      {loaded.parsed.warnings.map((warning) => (
        <p key={warning.code} className="mt-2 rounded-xl border border-line bg-desk/60 px-3 py-2 text-sm">
          {warning.message}
        </p>
      ))}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label>
          文章类型
          <select
            className="desk-input mt-1 min-h-11 w-full px-3"
            value={options.articleType}
            onChange={(event) => onOptions({ ...options, articleType: event.target.value as IntakeOptions["articleType"] })}
          >
            {Object.entries(ARTICLE_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          语言
          <select
            className="desk-input mt-1 min-h-11 w-full px-3"
            value={options.language}
            onChange={(event) => onOptions({ ...options, language: event.target.value as IntakeOptions["language"] })}
          >
            <option value="unset">未指定</option>
            <option value="zh">中文</option>
            <option value="en">英文</option>
          </select>
        </label>
        <label>
          改写档位
          <select
            className="desk-input mt-1 min-h-11 w-full px-3"
            value={options.level}
            onChange={(event) => onOptions({ ...options, level: event.target.value as IntakeOptions["level"] })}
          >
            <option value="conservative">保守润色</option>
            <option value="standard">标准改写</option>
          </select>
        </label>
        <label>
          目标用途
          <input
            className="desk-input mt-1 min-h-11 w-full px-3"
            value={options.purpose}
            onChange={(event) => onOptions({ ...options, purpose: event.target.value })}
          />
        </label>
      </div>
      <Button type="button" className="mt-4" onClick={onConfirm}>
        确认输入
      </Button>
    </section>
  );
}

function ConceiveMain({
  state,
  setConceive,
  onFile,
  onUsePaste,
  onRequirements,
  onOutline,
  onOpenSearch,
  onSearch,
  onSave,
  onBack,
  model,
  onOpenSettings,
}: {
  state: ConceiveState;
  setConceive: Dispatch<SetStateAction<ConceiveState>>;
  onFile: (file: File) => void;
  onUsePaste: () => void;
  onRequirements: () => void;
  onOutline: () => void;
  onOpenSearch: () => void;
  onSearch: () => void;
  onSave: () => void;
  onBack: () => void;
  model: string;
  onOpenSettings: () => void;
}) {
  const text = state.loaded?.editText || state.paste;
  const loaded = state.loaded;
  if (!loaded) {
    return (
      <div className="space-y-4" data-testid="conceive-setup">
        <IntakeWell
          testId="intake-conceive"
          title="把论文要求放在这里"
          fileName=""
          error={state.error}
          paste={state.paste}
          onPaste={(value) => setConceive((current) => ({ ...current, paste: value }))}
          onUsePaste={onUsePaste}
          onFile={onFile}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="conceive-work">
      <section className="desk-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-ink">
            {loaded.fileName} · {loaded.parsed.stats.chars} 字 · {loaded.source === "paste" ? "当前是粘贴" : "当前是文件"}
          </p>
          <Button type="button" variant="quiet" onClick={onBack} data-testid="conceive-back">
            返回
          </Button>
        </div>
        <label className="mt-4 block" htmlFor="conceive-notes-work">
          想法补充
          <textarea
            id="conceive-notes-work"
            data-testid="conceive-notes"
            className="desk-input manuscript mt-2 w-full p-3"
            rows={4}
            value={state.notes}
            onChange={(event) => setConceive((current) => ({ ...current, notes: event.target.value }))}
          />
        </label>
        <label className="mt-4 flex min-h-11 items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 size-5"
            checked={state.consent === `conceive:${model}:${text}`}
            onChange={(event) =>
              setConceive((current) => ({ ...current, consent: event.target.checked ? `conceive:${model}:${text}` : "" }))
            }
          />
          <span>整理要求和生成框架时，这些文字会经本机服务发到兼容 OpenAI 的接口。文献检索只发送检索词。</span>
        </label>
        {state.modelError ? (
          <div className="mt-3">
            <p role="alert" className="rounded-xl border border-line bg-sunk/80 px-3 py-2">
              {state.modelError}
            </p>
            <MissingKeyLink message={state.modelError} onOpen={onOpenSettings} />
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="quiet"
            className={state.activePanel === "organize" ? "ring-1 ring-line bg-paper" : undefined}
            disabled={state.running}
            onClick={onRequirements}
            data-testid="conceive-organize"
          >
            整理要求
          </Button>
          <Button
            type="button"
            variant="quiet"
            className={state.activePanel === "search" ? "ring-1 ring-line bg-paper" : undefined}
            onClick={onOpenSearch}
            data-testid="conceive-search-open"
          >
            检索文献
          </Button>
          <Button
            type="button"
            variant="quiet"
            className={state.activePanel === "outline" ? "ring-1 ring-line bg-paper" : undefined}
            disabled={state.running}
            onClick={onOutline}
            data-testid="conceive-outline"
          >
            生成框架
          </Button>
          <Button type="button" variant="quiet" onClick={onSave}>
            存入存档
          </Button>
        </div>
      </section>
      {state.activePanel === "organize" ? (
        <section id="conceive-organize-panel" className="desk-card p-4 sm:p-6" data-testid="conceive-organize-panel">
          {state.brief ? (
            <BriefView brief={state.brief} />
          ) : (
            <p className="text-ink-soft">整理后，要求会出现在这里。</p>
          )}
        </section>
      ) : null}
      {state.activePanel === "search" ? (
        <section id="conceive-search" className="desk-card p-4 sm:p-6" data-testid="conceive-search">
          <h3 className="text-lg">检索文献</h3>
          <p className="mt-1 text-sm text-ink-soft">每行一个检索词。只会把这些词发给 OpenAlex。</p>
          <label className="mt-3 block">
            检索词
            <textarea
              className="desk-input mt-2 w-full p-2"
              rows={4}
              data-testid="conceive-search-queries"
              value={state.queries}
              onChange={(event) => setConceive((current) => ({ ...current, queries: event.target.value }))}
            />
          </label>
          <Button type="button" className="mt-2" variant="quiet" onClick={onSearch} data-testid="conceive-search-run">
            开始检索
          </Button>
          <LiteratureList results={state.literature} />
        </section>
      ) : null}
      {state.activePanel === "outline" ? (
        <section id="conceive-outline-result" className="desk-card p-4 sm:p-6" data-testid="conceive-outline-result">
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
              {state.outline.requirementsConflict ? <p>长度限制有冲突，这个草案不算已满足要求。</p> : null}
              <ol className="mt-3 list-decimal pl-5">
                {state.outline.sections.map((section) => (
                  <li key={section.heading} className="mt-3">
                    <p className="text-ink">{section.heading}</p>
                    <p>目的：{section.purpose}</p>
                    <p>拟写：{section.content}</p>
                    <p>证据：{section.evidence}</p>
                    <p>篇幅：{section.length}</p>
                    {section.openQuestions.length ? <p>待决：{section.openQuestions.join("；")}</p> : null}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="text-ink-soft">点「生成框架」后，可行方向与分节框架会出现在这里。</p>
          )}
        </section>
      ) : null}
    </div>
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
              来自{item.source === "school" ? "要求" : item.source === "user" ? "补充" : item.source === "model" ? "模型建议" : "未标明"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2">关键词：{brief.keywords.map((item) => `${item.term}（${item.source}）`).join("、") || "还没有"}</p>
      {brief.conflicts.map((item) => (
        <p key={item} className="mt-2 rounded-xl border border-line bg-desk/60 px-3 py-2 text-sm">
          {item}
        </p>
      ))}
      {brief.missing.map((item) => (
        <p key={item}>还缺：{item}</p>
      ))}
    </div>
  );
}

function LiteratureList({ results }: { results: LiteratureQueryResult[] }) {
  if (!results.length) return null;
  return (
    <div className="mt-4">
      <h3 className="text-lg">文献</h3>
      <p className="text-sm text-ink-soft">来源 OpenAlex。结果不能代表全部中文学术文献。没有补写缺失字段。</p>
      {results.map((result) => (
        <section key={result.query} className="mt-3">
          <p>
            检索词「{result.query}」· {result.retrievedAt} ·{" "}
            {result.status === "ok" ? "有结果" : result.status === "not_found" ? "未找到" : result.status === "quota" ? "额度不足" : "服务失败"}
          </p>
          <p className="text-ink-soft">{result.message}</p>
          <ul className="mt-2 space-y-2">
            {result.items.map((item) => (
              <li key={item.openalexId} className="rounded-xl border border-line bg-desk/60 px-3 py-2 text-sm">
                <p>{item.title}</p>
                <p className="text-sm text-ink-soft">
                  {item.authors.join(", ") || "作者未返回"} · {item.year ?? "年份未返回"} · {item.venue || "来源未返回"} ·{" "}
                  {item.doi ? `DOI ${item.doi}` : "没有 DOI"} · {item.citedByCount ?? "引用数未返回"}
                </p>
                <a className="underline" href={item.url}>
                  {item.openalexId}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ConceiveRail({ state }: { state: ConceiveState }) {
  return (
    <aside className="desk-card p-5">
      <h2 className="text-lg">起稿</h2>
      <p className="mt-2 text-ink-soft">先整理要求，再出框架。</p>
      {state.outline ? <p className="mt-3">{state.outline.sections.length} 节框架在中间。</p> : null}
    </aside>
  );
}

function ArchiveReader({ record, onBack }: { record: PaperRecord; onBack: () => void }) {
  const [tab, setTab] = useState<"input" | "current" | "notes">("input");
  const blocks = tab === "current" ? record.currentBlocks || record.confirmed?.blocks || [] : record.confirmed?.blocks || [];
  return (
    <section className="desk-card p-4 sm:p-6" data-testid="archive-reader">
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="quiet" onClick={onBack}>
          返回列表
        </Button>
        {record.mode === "revise" ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setTab("input")}>
              确认输入版
            </Button>
            <Button type="button" variant="ghost" onClick={() => setTab("current")}>
              改稿
            </Button>
            <Button type="button" variant="ghost" onClick={() => setTab("notes")}>
              分析
            </Button>
          </>
        ) : null}
      </div>
      <h2 className="mt-4 text-2xl">{record.title}</h2>
      {record.mode === "conceive" && record.conceive ? (
        <div className="mt-4 space-y-3">
          <p>要求：{record.conceive.requirementText}</p>
          <p>补充：{record.conceive.notes}</p>
          {record.conceive.outline ? <p>框架：{record.conceive.outline.theme}</p> : <p>还没有框架。</p>}
          {record.conceive.literature.map((item) => (
            <p key={item.query}>
              {item.query}：{item.status === "ok" ? `${item.items.length} 条` : item.message}
            </p>
          ))}
        </div>
      ) : tab === "notes" ? (
        <div className="mt-4">
          <p>{record.analysisCurrent?.summary || record.analysisOriginal?.summary || "还没有诊断与分析。"}</p>
          {record.analysisCurrent && record.analysisOriginal && record.analysisCurrent.summary !== record.analysisOriginal.summary ? (
            <p className="mt-2 text-ink-soft">{record.analysisOriginal.summary}</p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {record.suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                {suggestion.quote} — {suggestion.problem}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <article className="manuscript mt-4">
          {blocks.map((block) => (
            <p key={block.id} className="mb-3 whitespace-pre-wrap">
              {block.text}
            </p>
          ))}
        </article>
      )}
    </section>
  );
}
