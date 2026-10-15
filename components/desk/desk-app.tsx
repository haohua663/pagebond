"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArchivePanel } from "@/components/archive/archive-panel";
import { ManuscriptPane } from "@/components/manuscript/manuscript-pane";
import { SuggestionRail } from "@/components/suggestions/suggestion-rail";
import { Button } from "@/components/ui/button";
import { IntakeWell } from "@/components/upload/intake-well";
import { locateSuggestion, localStructureNotes, type Suggestion } from "@/lib/analysis/suggestions";
import type { BlockCheck } from "@/lib/analysis/validate";
import { contentVersion } from "@/lib/analysis/version";
import { applyLockedTerms } from "@/lib/analysis/validate";
import { missingProtections } from "@/lib/document/protect";
import { planChunks } from "@/lib/document/chunk";
import { exportDocxBlob, exportMarkdown } from "@/lib/document/export-doc";
import { parseUploadedFile } from "@/lib/document/parse-source";
import { blocksToPlain, parseProse } from "@/lib/document/structure";
import { documentChars } from "@/lib/document/stats";
import type { DocumentBlock, IntakeOptions, ParsedDocument } from "@/lib/document/types";
import { ARTICLE_TYPE_LABEL, emptyOptions } from "@/lib/document/types";
import { DEFAULT_MODEL, KNOWN_MODEL, LIMITS, PROMPT_VERSION } from "@/lib/limits";
import { estimateCost } from "@/lib/providers/openrouter";
import type { LiteratureQueryResult } from "@/lib/providers/openalex";
import { SAMPLE_CONCEIVE, SAMPLE_REVISE, SAMPLE_SUGGESTIONS } from "@/lib/sample";
import { fromBackup, toBackup } from "@/lib/storage/backup";
import { idbList, idbPut, idbRemove } from "@/lib/storage/idb";
import type { AnalysisSnapshot, PaperRecord } from "@/lib/storage/types";
import { localOutline, localRequirements, type OutlineDraft, type RequirementsBrief } from "@/lib/workflows/conceive";
import { acceptPassed, draftBlocks, type AcceptState } from "@/lib/workflows/revise";
import { runRewriteChunks } from "@/lib/workflows/run-revise";
import type { TaskStatus } from "@/lib/workflows/task";
import { downloadText, prefersReducedMotion } from "@/lib/utils";

type Mode = "revise" | "conceive" | "archive";
type KeySource = "session" | "server" | "none";

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
  view: "original" | "compare" | "current";
  modelError: string | null;
  diagnosisSummary: string | null;
  status: TaskStatus;
  running: boolean;
  saveState: "未保存" | "已保存" | "尚未保存";
  consent: string;
  showSample: boolean;
  activeId: string | null;
  aiNote: boolean;
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
  modelError: string | null;
  running: boolean;
  saveState: "未保存" | "已保存" | "尚未保存";
  consent: string;
  showSample: boolean;
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
    showSample: false,
    activeId: null,
    aiNote: false,
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
    modelError: null,
    running: false,
    saveState: "未保存",
    consent: "",
    showSample: false,
  };
}

async function postJson(url: string, body: unknown, sessionKey: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionKey.trim()) headers["X-Yeyuan-Session-Key"] = sessionKey.trim();
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  return (await response.json().catch(() => ({ ok: false, message: "响应无法读取。" }))) as {
    ok: boolean;
    message?: string;
    code?: string;
    [key: string]: unknown;
  };
}

export function DeskApp() {
  const [mode, setMode] = useState<Mode>("revise");
  const [revise, setRevise] = useState<ReviseState>(freshRevise);
  const [conceive, setConceive] = useState<ConceiveState>(freshConceive);
  const [records, setRecords] = useState<PaperRecord[]>([]);
  const [opened, setOpened] = useState<PaperRecord | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [sessionKey, setSessionKey] = useState("");
  const [serverKey, setServerKey] = useState<KeySource>("none");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const generation = useRef(1);
  const taskId = useRef("");
  const cancelRevise = useRef(false);
  const reviseRef = useRef(revise);
  const conceiveRef = useRef(conceive);
  reviseRef.current = revise;
  conceiveRef.current = conceive;

  useEffect(() => {
    const stored = window.localStorage.getItem("yeyuan.model");
    if (stored?.trim()) setModel(stored.trim());
    void fetch("/api/health")
      .then((response) => response.json())
      .then((data: { keySource?: KeySource }) => setServerKey(data.keySource === "server" ? "server" : "none"))
      .catch(() => setServerKey("none"));
    void idbList()
      .then(setRecords)
      .catch(() => setRecords([]));
  }, []);

  const keySource: KeySource = sessionKey.trim() ? "session" : serverKey;
  const keyLabel =
    keySource === "session" ? "这次用你填写的会话密钥，不会被服务端密钥覆盖。" : keySource === "server" ? "这次用服务端环境变量 OPENROUTER_API_KEY。" : "没有密钥。模型调用会失败，本地解析和存档仍可用。";

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
      downloadText(`${record.title || "页缘"}-尚未保存.json`, JSON.stringify(toBackup([record]), null, 2), "application/json");
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
      } else {
        setConceive((current) => ({
          ...current,
          loaded,
          error: parsed.document.blocks.length ? null : parsed.document.warnings[0]?.message || "没有读到正文。",
          brief: null,
          outline: null,
        }));
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : "文件无法解析。");
    }
  }

  function usePaste(which: "revise" | "conceive") {
    const text = which === "revise" ? revise.paste : conceive.paste;
    const document = parseProse(text);
    const loaded: Loaded = {
      fileName: "粘贴的文字",
      source: "paste",
      rawText: text,
      parsed: document,
      editText: blocksToPlain(document.blocks) || text,
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
        error: document.warnings.find((item) => item.code === "empty")?.message ?? null,
      }));
    } else {
      setConceive((current) => ({ ...current, loaded, brief: null, outline: null, error: null }));
    }
  }

  function lockDocument(base: ParsedDocument, source: ParsedDocument, options: IntakeOptions): ParsedDocument {
    const lockedTitles = new Set(source.outline.filter((item) => options.lockedBlockIds.includes(item.id)).map((item) => item.text));
    const lockedIds = new Set(base.outline.filter((item) => lockedTitles.has(item.text)).map((item) => item.id));
    let locking = false;
    let level = 9;
    const blocks = base.blocks.map((block) => {
      if (block.kind === "heading" && lockedIds.has(block.id)) {
        locking = true;
        level = block.level;
        return { ...block, locked: true };
      }
      if (block.kind === "heading" && locking && block.level <= level) locking = false;
      return locking ? { ...block, locked: true } : block;
    });
    return { ...base, blocks: applyLockedTerms(blocks, options.lockedTerms) };
  }

  async function confirmRevise() {
    if (!revise.loaded) return;
    const confirmed = lockDocument(parseProse(revise.loaded.editText), revise.loaded.parsed, revise.options);
    if (!confirmed.blocks.length) {
      setRevise((current) => ({ ...current, error: "确认稿是空的。" }));
      return;
    }
    const paperId = revise.paperId || crypto.randomUUID();
    const nextTask = crypto.randomUUID();
    taskId.current = nextTask;
    generation.current += 1;
    const notes = localStructureNotes(confirmed, revise.options.articleType);
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
    };
    setRevise(next);
    await persist(reviseRecord(next, "pending"), "revise");
  }

  const currentBlocks = useMemo(() => {
    if (!revise.confirmed) return [];
    return draftBlocks(revise.confirmed.blocks, revise.checks, revise.accept, revise.manual);
  }, [revise]);

  const scopeKey = `${model}:${revise.confirmed ? contentVersion(revise.confirmed.blocks) : ""}:${revise.options.level}:${revise.options.language}`;

  async function diagnose() {
    if (!revise.confirmed) return;
    if (revise.consent !== scopeKey) {
      setRevise((current) => ({ ...current, modelError: "先勾选外发说明。范围或模型变了之后需要再确认一次。" }));
      return;
    }
    if (documentChars(revise.confirmed.blocks) > LIMITS.targetChars) {
      setRevise((current) => ({ ...current, modelError: "超过 4 万字目标上限，没有截断，也没有发送。" }));
      return;
    }
    setRevise((current) => ({ ...current, running: true, modelError: null, status: "running" }));
    const data = await postJson(
      "/api/revise/diagnose",
      { blocks: revise.confirmed.blocks, options: revise.options, model },
      sessionKey,
    );
    if (!data.ok) {
      setRevise((current) => ({
        ...current,
        running: false,
        status: "failed",
        modelError: data.message || "诊断没有完成。未调用到可用模型。",
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
        diagnosisSummary: summary,
        analysisOriginal,
        suggestions: [...current.suggestions.filter((item) => item.origin === "local"), ...modelNotes],
        modelError: null,
      };
      void persist(reviseRecord(next, "review"), "revise");
      return next;
    });
  }

  async function rewrite() {
    if (!revise.confirmed) return;
    if (revise.consent !== scopeKey) {
      setRevise((current) => ({ ...current, modelError: "先勾选外发说明。范围或模型变了之后需要再确认一次。" }));
      return;
    }
    if (documentChars(revise.confirmed.blocks) > LIMITS.targetChars) {
      setRevise((current) => ({ ...current, modelError: "超过 4 万字目标上限，没有截断，也没有发送。" }));
      return;
    }
    const identity = { paperId: revise.paperId, taskId: revise.taskId || crypto.randomUUID(), generation: generation.current };
    taskId.current = identity.taskId;
    cancelRevise.current = false;
    const plan = planChunks(revise.confirmed.blocks, model);
    setRevise((current) => ({ ...current, running: true, modelError: null, status: "running", checks: [], accept: {} }));
    const checkpoints: PaperRecord["checkpoints"] = [];
    const result = await runRewriteChunks({
      plan,
      identity,
      current: () => ({ paperId: reviseRef.current.paperId, taskId: taskId.current, generation: generation.current }),
      cancelled: () => cancelRevise.current,
      rewriteChunk: async (index) => {
        const chunk = plan.chunks[index];
        const data = await postJson("/api/revise/rewrite", { blocks: chunk.blocks, options: reviseRef.current.options, model }, sessionKey);
        if (!data.ok) throw new Error(data.message || "改写失败");
        return { checks: data.checks as BlockCheck[], integrity: data.integrity as "passed" | "failed" };
      },
      onCheckpoint: async (checkpoint, checks) => {
        checkpoints.push(checkpoint);
        const state = reviseRef.current;
        if (!state.confirmed) return;
        const merged = [...state.checks.filter((item) => !checks.some((check) => check.id === item.id)), ...checks];
        const next = { ...state, checks: merged, status: checkpoint.status };
        const record = reviseRecord(next, checkpoint.status);
        record.checkpoints = checkpoints;
        await persist(record, "revise");
      },
    });
    setRevise((current) => {
      const next = {
        ...current,
        running: false,
        checks: result.checks,
        status: result.status,
        modelError:
          result.status === "failed"
            ? "改写没有完成。未通过的段落保持原文，不能把整篇标成已完成。"
            : result.status === "cancelled"
              ? "已停止。已保存的段落还在。"
              : plan.overVerified
                ? "已超过自动测试验证过的篇幅。结果可用，但不标成长文已支持。"
                : null,
      };
      const record = reviseRecord(next, result.status);
      record.checkpoints = checkpoints;
      void persist(record, "revise");
      return next;
    });
  }

  async function analyzeCurrent() {
    if (!revise.confirmed) return;
    if (revise.consent !== scopeKey) {
      setRevise((current) => ({ ...current, modelError: "先勾选外发说明。" }));
      return;
    }
    setRevise((current) => ({ ...current, running: true, modelError: null }));
    const data = await postJson(
      "/api/revise/analyze",
      { original: revise.confirmed.blocks, current: currentBlocks, options: revise.options, model },
      sessionKey,
    );
    if (!data.ok) {
      setRevise((current) => ({ ...current, running: false, modelError: data.message || "当前稿分析没有完成。" }));
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
        analysisCurrent: snapshot,
        suggestions: [...current.suggestions.filter((item) => item.version !== "current-draft"), ...suggestions],
      };
      void persist(reviseRecord(next), "revise");
      return next;
    });
  }

  function openSuggestion(suggestion: Suggestion) {
    if (revise.showSample) {
      setRevise((current) => ({ ...current, modelError: "样例批注只演示样式，不定位到你的稿件。" }));
      return;
    }
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
    document.getElementById(`block-${found.id}`)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
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

  async function runRequirements(forceLocal: boolean) {
    const text = conceive.loaded?.editText || conceive.paste;
    if (!text.trim() && !conceive.notes.trim()) {
      setConceive((current) => ({ ...current, error: "要求文件和补充至少要有一项。" }));
      return;
    }
    if (!forceLocal && conceive.consent !== `conceive:${model}:${text}`) {
      setConceive((current) => ({ ...current, modelError: "先勾选外发说明。" }));
      return;
    }
    setConceive((current) => ({ ...current, running: true, modelError: null }));
    if (forceLocal) {
      const brief = localRequirements(text, conceive.notes);
      setConceive((current) => ({ ...current, running: false, brief, modelError: "这是本地整理，未调用模型。" }));
      return;
    }
    const data = await postJson(
      "/api/conceive/requirements",
      { requirementText: text, notes: conceive.notes, model, options: { articleType: "course" } },
      sessionKey,
    );
    if (!data.ok) {
      const brief = localRequirements(text, conceive.notes);
      setConceive((current) => ({
        ...current,
        running: false,
        brief,
        modelError: `${data.message || "模型没有完成要求整理。"} 下面这份是本地整理，不是模型结果。`,
      }));
      return;
    }
    setConceive((current) => ({ ...current, running: false, brief: data.brief as RequirementsBrief, modelError: null }));
  }

  async function runOutline() {
    const text = conceive.loaded?.editText || conceive.paste;
    const brief = conceive.brief ?? localRequirements(text, conceive.notes);
    if (conceive.consent !== `conceive:${model}:${text}`) {
      setConceive((current) => ({ ...current, modelError: "先勾选外发说明。" }));
      return;
    }
    setConceive((current) => ({ ...current, running: true }));
    const previous = conceive.outline;
    const data = await postJson(
      "/api/conceive/outline",
      {
        requirementText: text,
        notes: conceive.notes,
        directionTitle: conceive.direction,
        assumptions: brief.assumptions,
        model,
        options: { articleType: "course" },
      },
      sessionKey,
    );
    if (!data.ok) {
      const outline = previous ?? localOutline(brief, { directionTitle: conceive.direction, assumptions: brief.assumptions });
      setConceive((current) => ({
        ...current,
        running: false,
        outline,
        queries: outline.literatureQueries.join("\n"),
        modelError: `${data.message || "模型没有写出框架。"} 已保留${previous ? "原来的" : "本地"}框架。`,
      }));
      return;
    }
    const outline = data.outline as OutlineDraft;
    setConceive((current) => ({
      ...current,
      running: false,
      outline,
      queries: outline.literatureQueries.join("\n"),
      modelError: null,
    }));
  }

  async function searchLiterature() {
    const queries = conceive.queries
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, LIMITS.maxLiteratureQueries);
    const outline = conceive.outline;
    const data = await postJson("/api/literature", { queries }, sessionKey);
    if (!data.ok) {
      setConceive((current) => ({
        ...current,
        literature: [],
        outline,
        modelError: data.message || "检索失败。框架还在。",
      }));
      return;
    }
    setConceive((current) => ({ ...current, literature: data.results as LiteratureQueryResult[], outline, modelError: null }));
    if (outline && conceive.paperId) {
      await saveConceive(outline, data.results as LiteratureQueryResult[]);
    }
  }

  async function saveConceive(outline = conceive.outline, literature = conceive.literature) {
    const text = conceive.loaded?.editText || conceive.paste;
    const paperId = conceive.paperId || crypto.randomUUID();
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

  function exportRevise(kind: "suggestion" | "confirmed") {
    if (!revise.confirmed) return;
    const blocks =
      kind === "confirmed"
        ? currentBlocks
        : revise.confirmed.blocks.map((block) => {
            const check = revise.checks.find((item) => item.id === block.id);
            if (check?.status === "passed" && check.changed) return { ...block, text: check.suggestedText };
            return block;
          });
    const markdown = exportMarkdown(blocks, {
      kind,
      unsupported: revise.confirmed.unsupported,
      includeAiNote: revise.aiNote,
    });
    downloadText(kind === "confirmed" ? "已确认稿.md" : "建议修改稿.md", markdown);
  }

  async function exportDocx() {
    if (!revise.confirmed) return;
    const blob = await exportDocxBlob(currentBlocks, revise.confirmed.title);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "正文修改稿.docx";
    link.click();
    URL.revokeObjectURL(url);
  }

  const needsReview = revise.checks.filter((check) => check.status === "needs-review").length;
  const doneChapters = revise.confirmed?.outline.length
    ? revise.confirmed.outline.filter((item) => revise.checks.some((check) => check.id === item.id && check.status === "passed")).length
    : 0;
  const cost = revise.confirmed ? estimateCost(documentChars(revise.confirmed.blocks), 3, model) : null;
  const verifiedNote =
    revise.confirmed && documentChars(revise.confirmed.blocks) > LIMITS.verifiedChars
      ? `这篇大约 ${documentChars(revise.confirmed.blocks)} 字，超过已验证的 ${LIMITS.verifiedChars} 字。可以分块处理，但不标成长文已支持。`
      : `已用自动长文测试验证到 ${LIMITS.verifiedChars} 字。超过这个长度会停住，不截断。`;
  const analysisStale =
    revise.analysisCurrent && contentVersion(currentBlocks) !== revise.analysisCurrent.version
      ? "当前稿已变化，旧分析不再当作当前结论。"
      : null;

  const viewing = opened;
  const showReviseWork = mode === "revise" && !viewing;
  const showConceiveWork = mode === "conceive" && !viewing;

  return (
    <div className="min-h-screen bg-desk text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-paper focus:p-3">
        跳到正文
      </a>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-desk/95 px-4 py-3 text-sm">
        <p className="text-lg">页缘</p>
        <p>阶段：{mode === "archive" || viewing ? "查看存档" : revise.running || conceive.running ? "处理中" : revise.confirmed ? "已确认输入" : "等待文稿"}</p>
        <p>已完成标题标记 {doneChapters}</p>
        <p>待复核 {needsReview}</p>
        <p>保存：{mode === "conceive" ? conceive.saveState : revise.saveState}</p>
        <button
          type="button"
          className="min-h-11 cursor-pointer px-2 underline"
          onClick={() => {
            cancelRevise.current = true;
            generation.current += 1;
          }}
        >
          停止
        </button>
        <button type="button" className="min-h-11 cursor-pointer px-2 underline lg:hidden" onClick={() => setSuggestionsOpen((value) => !value)}>
          {suggestionsOpen ? "收起建议" : "建议"}
        </button>
        <button type="button" className="ml-auto min-h-11 cursor-pointer px-2 underline" onClick={() => setSettingsOpen(true)}>
          设置
        </button>
      </header>
      <div className="desk-grid">
        <nav aria-label="模式" className="flex gap-2 lg:flex-col">
          {(
            [
              ["revise", "改稿"],
              ["conceive", "起稿"],
              ["archive", "存档"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-testid={`mode-${id}`}
              aria-pressed={mode === id}
              className={`min-h-11 cursor-pointer border-l-4 px-3 text-left ${mode === id ? "border-lime bg-paper" : "border-transparent"}`}
              onClick={() => {
                setMode(id);
                setOpened(null);
              }}
            >
              {label}
            </button>
          ))}
          <p className="mt-3 hidden text-sm text-ink-soft lg:block">{keyLabel}</p>
          {showReviseWork && revise.confirmed ? (
            <div className="mt-4 hidden lg:block">
              <p className="text-sm text-ink-soft">目录</p>
              <ul className="mt-2 space-y-1">
                {revise.confirmed.outline.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="min-h-11 cursor-pointer text-left"
                      onClick={() => document.getElementById(`block-${item.id}`)?.scrollIntoView({ block: "center" })}
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
              onDiagnose={() => void diagnose()}
              onRewrite={() => void rewrite()}
              onAnalyze={() => void analyzeCurrent()}
              onExport={exportRevise}
              onDocx={() => void exportDocx()}
              onAccept={(id) => setRevise((current) => ({ ...current, accept: { ...current.accept, [id]: "accepted" }, view: "current" }))}
              onRevert={(id) => setRevise((current) => ({ ...current, accept: { ...current.accept, [id]: "reverted" } }))}
              onManual={manualEdit}
              onAcceptAll={() =>
                setRevise((current) => ({ ...current, accept: acceptPassed(current.checks, current.accept), view: "current" }))
              }
              cost={cost}
              verifiedNote={verifiedNote}
              scopeKey={scopeKey}
              analysisStale={analysisStale}
              currentBlocks={currentBlocks}
              onClear={() => {
                generation.current += 1;
                cancelRevise.current = true;
                setRevise((current) => ({ ...freshRevise(), paste: current.paste, options: current.options }));
              }}
            />
          ) : null}
          {showConceiveWork ? (
            <ConceiveMain
              state={conceive}
              setConceive={setConceive}
              onFile={(file) => void readFile(file, "conceive")}
              onUsePaste={() => usePaste("conceive")}
              onRequirements={() => void runRequirements(false)}
              onLocal={() => void runRequirements(true)}
              onOutline={() => void runOutline()}
              onSearch={() => void searchLiterature()}
              onSave={() => void saveConceive()}
              model={model}
            />
          ) : null}
          {mode === "archive" && !viewing ? (
            <ArchivePanel
              records={records}
              onOpen={(record) => setOpened(record)}
              onDelete={async (id) => {
                await idbRemove(id);
                if (revise.paperId === id) setRevise((current) => ({ ...current, paperId: "" }));
                await refreshArchive();
              }}
              onExport={() => downloadText("页缘备份.json", JSON.stringify(toBackup(records), null, 2), "application/json")}
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
        <div className={suggestionsOpen ? "block lg:block" : "hidden lg:block"}>
          {showReviseWork ? (
            <SuggestionRail
              suggestions={revise.showSample ? SAMPLE_SUGGESTIONS : revise.suggestions}
              notice={
                revise.showSample
                  ? `这是样例批注，不是你的稿件，也不是模型输出。样例里有一句：${SAMPLE_REVISE.split("\n").filter(Boolean)[0]}`
                  : analysisStale
              }
              onOpen={openSuggestion}
            />
          ) : null}
          {showConceiveWork ? <ConceiveRail state={conceive} /> : null}
          {mode === "archive" ? (
            <aside className="border border-line bg-paper p-4 text-ink-soft">只查看存档时不调用模型，页边也不重新生成。</aside>
          ) : null}
        </div>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        model={model}
        sessionKey={sessionKey}
        keyLabel={keyLabel}
        onModel={(value) => {
          setModel(value);
          window.localStorage.setItem("yeyuan.model", value);
          generation.current += 1;
        }}
        onSessionKey={setSessionKey}
      />
    </div>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  model,
  sessionKey,
  keyLabel,
  onModel,
  onSessionKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: string;
  sessionKey: string;
  keyLabel: string;
  onModel: (value: string) => void;
  onSessionKey: (value: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/20" />
        <Dialog.Content className="fixed top-1/2 left-1/2 w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 bg-paper p-5">
          <Dialog.Title className="text-xl">设置</Dialog.Title>
          <Dialog.Description className="mt-2 text-ink-soft">{keyLabel}</Dialog.Description>
          <label className="mt-4 block" htmlFor="model-slug">
            模型标识
            <input
              id="model-slug"
              className="mt-1 w-full border border-line bg-desk p-2"
              value={model}
              onChange={(event) => onModel(event.target.value)}
            />
          </label>
          <p className="mt-2 text-sm text-ink-soft">
            默认 {DEFAULT_MODEL}，来自 OpenRouter 文档，上下文约 {KNOWN_MODEL.contextLength.toLocaleString()} token。换别的标识后，价格需要另外核对。
          </p>
          <label className="mt-4 block" htmlFor="session-key">
            本次会话密钥
            <input
              id="session-key"
              type="password"
              autoComplete="off"
              className="mt-1 w-full border border-line bg-desk p-2"
              value={sessionKey}
              onChange={(event) => onSessionKey(event.target.value)}
            />
          </label>
          <p className="mt-2 text-sm text-ink-soft">只留在这个页面的内存里，不写入浏览器存储，也不进存档。</p>
          <Dialog.Close className="mt-4 inline-flex min-h-11 cursor-pointer items-center bg-ink px-4 text-paper">关闭</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ReviseMain({
  state,
  setRevise,
  onFile,
  onUsePaste,
  onConfirm,
  onDiagnose,
  onRewrite,
  onAnalyze,
  onExport,
  onDocx,
  onAccept,
  onRevert,
  onManual,
  onAcceptAll,
  onClear,
  cost,
  verifiedNote,
  scopeKey,
  analysisStale,
  currentBlocks,
}: {
  state: ReviseState;
  setRevise: Dispatch<SetStateAction<ReviseState>>;
  onFile: (file: File) => void;
  onUsePaste: () => void;
  onConfirm: () => void;
  onDiagnose: () => void;
  onRewrite: () => void;
  onAnalyze: () => void;
  onExport: (kind: "suggestion" | "confirmed") => void;
  onDocx: () => void;
  onAccept: (id: string) => void;
  onRevert: (id: string) => void;
  onManual: (id: string, text: string) => void;
  onAcceptAll: () => void;
  onClear: () => void;
  cost: { lowUsd: number | null; highUsd: number | null; note: string } | null;
  verifiedNote: string;
  scopeKey: string;
  analysisStale: string | null;
  currentBlocks: DocumentBlock[];
}) {
  const loaded = state.loaded;
  return (
    <div className="space-y-4">
      {!state.confirmed ? (
        <IntakeWell
          testId="intake-revise"
          title="把已经写好的论文放在这里"
          detail="先在本地解析。你确认输入版之前，正文不会发给模型。"
          fileName={loaded?.source === "file" ? loaded.fileName : ""}
          error={state.error}
          paste={state.paste}
          onPaste={(value) => setRevise((current) => ({ ...current, paste: value }))}
          onUsePaste={onUsePaste}
          onFile={onFile}
        />
      ) : null}
      {loaded && !state.confirmed ? (
        <Preview
          loaded={loaded}
          options={state.options}
          onEdit={(editText) => setRevise((current) => ({ ...current, loaded: current.loaded ? { ...current.loaded, editText } : current.loaded }))}
          onOptions={(options) => setRevise((current) => ({ ...current, options }))}
          onConfirm={onConfirm}
        />
      ) : null}
      {state.confirmed ? (
        <section className="border border-line bg-paper p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-ink">
              {loaded?.fileName} · {state.options.language === "en" ? `${state.confirmed.stats.words} 词` : `${state.confirmed.stats.chars} 字`} ·{" "}
              {loaded?.source === "paste" ? "当前是粘贴" : "当前是文件"}
            </p>
            <Button type="button" variant="quiet" onClick={onClear}>
              换一篇
            </Button>
          </div>
          <p className="mt-2 text-sm text-ink-soft">{verifiedNote}</p>
          <p className="mt-2 text-sm text-ink">未进行外部查重／AI 检测。</p>
          {state.modelError ? (
            <p role="alert" data-testid="model-error" className="mt-3 border-l-4 border-ink bg-sunk px-3 py-2">
              {state.modelError}
            </p>
          ) : null}
          {analysisStale ? <p className="mt-2 text-ink">{analysisStale}</p> : null}
          <label className="mt-3 flex min-h-11 items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={state.consent === scopeKey}
              onChange={(event) => setRevise((current) => ({ ...current, consent: event.target.checked ? scopeKey : "" }))}
            />
            <span>开始后，确认输入版会从浏览器发到本机服务，再经 OpenRouter 到实际模型。没有服务器数据库，但正文会离开这台浏览器。</span>
          </label>
          {cost ? (
            <p className="mt-2 text-sm text-ink-soft">
              费用估算：{cost.lowUsd === null ? cost.note : `大约 ${cost.lowUsd} 到 ${cost.highUsd} 美元。${cost.note}`}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" disabled={state.running} onClick={onDiagnose}>
              诊断确认稿
            </Button>
            <Button type="button" variant="quiet" disabled={state.running} onClick={onRewrite}>
              受约束改写
            </Button>
            <Button type="button" variant="quiet" disabled={state.running} onClick={onAnalyze}>
              分析当前稿
            </Button>
            <Button type="button" variant="lime" onClick={onAcceptAll}>
              接受已通过的修改
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="稿件版本">
            {(
              [
                ["original", "原稿"],
                ["compare", "逐段对照"],
                ["current", "当前稿"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={state.view === id}
                className={`min-h-11 cursor-pointer border-b-2 px-3 ${state.view === id ? "border-lime" : "border-transparent"}`}
                onClick={() => setRevise((current) => ({ ...current, view: id }))}
              >
                {label}
              </button>
            ))}
          </div>
          {state.diagnosisSummary ? <p className="mt-4 border-l-4 border-lime pl-3">{state.diagnosisSummary}</p> : null}
          {state.analysisCurrent ? (
            <div className="mt-4 space-y-2">
              <p>{state.analysisCurrent.summary}</p>
              {state.analysisCurrent.dimensions.map((dimension) => (
                <p key={dimension.id}>
                  {dimension.id}：{dimension.conclusion}
                  {dimension.resolved.length ? ` 已解决：${dimension.resolved.join("、")}` : ""}
                  {dimension.remaining.length ? ` 仍在：${dimension.remaining.join("、")}` : ""}
                  {dimension.needsMaterial.length ? ` 要补材料：${dimension.needsMaterial.join("、")}` : ""}
                </p>
              ))}
            </div>
          ) : null}
          <div className="mt-4">
            <ManuscriptPane
              view={state.view}
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
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="quiet" onClick={() => onExport("suggestion")}>
              下载建议修改稿
            </Button>
            <Button type="button" variant="quiet" onClick={() => onExport("confirmed")}>
              下载已确认稿
            </Button>
            <Button type="button" variant="quiet" onClick={onDocx}>
              下载 docx
            </Button>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5"
                checked={state.aiNote}
                onChange={(event) => setRevise((current) => ({ ...current, aiNote: event.target.checked }))}
              />
              附上人工智能使用说明
            </label>
          </div>
          <Button type="button" variant="ghost" className="mt-2" onClick={() => setRevise((current) => ({ ...current, showSample: !current.showSample }))}>
            {state.showSample ? "关闭样例批注" : "查看样例批注"}
          </Button>
        </section>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setRevise((current) => ({ ...current, showSample: !current.showSample }))}>
          {state.showSample ? "关闭样例" : "看一份样例，不调用模型"}
        </Button>
      )}
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

function Preview({
  loaded,
  options,
  onEdit,
  onOptions,
  onConfirm,
}: {
  loaded: Loaded;
  options: IntakeOptions;
  onEdit: (value: string) => void;
  onOptions: (options: IntakeOptions) => void;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const preview = loaded.parsed.blocks.map((block) => block.text).join("\n").slice(0, 400);
  return (
    <section className="border border-line bg-paper p-4 sm:p-6" data-testid="parse-preview">
      <h2 className="text-xl">解析预览</h2>
      <p className="mt-2 text-ink-soft">
        {loaded.fileName} · {loaded.parsed.stats.chars} 字 · {loaded.parsed.stats.words} 词 · 当前用的是{loaded.source === "paste" ? "粘贴" : "文件"}
      </p>
      {loaded.parsed.warnings.map((warning) => (
        <p key={warning.code} className="mt-2 border-l-4 border-lime pl-3">
          {warning.message}
        </p>
      ))}
      {loaded.parsed.unsupported.length ? (
        <ul className="mt-2 list-disc pl-5 text-ink-soft">
          {loaded.parsed.unsupported.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-sm text-ink-soft">目录</p>
      <ul className="mt-1">
        {loaded.parsed.outline.length ? loaded.parsed.outline.map((item) => <li key={item.id}>{item.text}</li>) : <li>没有识别到标题。</li>}
      </ul>
      <p className="manuscript mt-3 whitespace-pre-wrap">{preview}</p>
      <button type="button" className="mt-2 min-h-11 cursor-pointer underline" onClick={() => setOpen((value) => !value)}>
        {open ? "收起全文" : "展开全文"}
      </button>
      {open ? <pre className="manuscript mt-2 whitespace-pre-wrap">{loaded.parsed.blocks.map((block) => block.text).join("\n\n")}</pre> : null}
      <label className="mt-4 block" htmlFor="confirm-edit">
        修正解析文本。保存后成为确认输入版，不覆盖最初抽取的文字。
        <textarea
          id="confirm-edit"
          className="manuscript mt-2 w-full border border-line p-3"
          rows={8}
          value={loaded.editText}
          onChange={(event) => onEdit(event.target.value)}
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          文章类型
          <select
            className="mt-1 min-h-11 w-full border border-line bg-paper px-2"
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
            className="mt-1 min-h-11 w-full border border-line bg-paper px-2"
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
            className="mt-1 min-h-11 w-full border border-line bg-paper px-2"
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
            className="mt-1 min-h-11 w-full border border-line px-2"
            value={options.purpose}
            onChange={(event) => onOptions({ ...options, purpose: event.target.value })}
          />
        </label>
      </div>
      <label className="mt-3 block">
        锁定术语，用逗号分开
        <input
          className="mt-1 min-h-11 w-full border border-line px-2"
          value={options.lockedTerms.join("，")}
          onChange={(event) =>
            onOptions({
              ...options,
              lockedTerms: event.target.value
                .split(/[，,]/)
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <fieldset className="mt-3">
        <legend>锁定章节</legend>
        {loaded.parsed.outline.map((item) => (
          <label key={item.id} className="mt-1 flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5"
              checked={options.lockedBlockIds.includes(item.id)}
              onChange={(event) => {
                const lockedBlockIds = event.target.checked
                  ? [...options.lockedBlockIds, item.id]
                  : options.lockedBlockIds.filter((id) => id !== item.id);
                onOptions({ ...options, lockedBlockIds });
              }}
            />
            {item.text}
          </label>
        ))}
      </fieldset>
      <Button type="button" className="mt-4" onClick={onConfirm}>
        保存确认输入版
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
  onLocal,
  onOutline,
  onSearch,
  onSave,
  model,
}: {
  state: ConceiveState;
  setConceive: Dispatch<SetStateAction<ConceiveState>>;
  onFile: (file: File) => void;
  onUsePaste: () => void;
  onRequirements: () => void;
  onLocal: () => void;
  onOutline: () => void;
  onSearch: () => void;
  onSave: () => void;
  model: string;
}) {
  const text = state.loaded?.editText || state.paste;
  return (
    <div className="space-y-4">
      <IntakeWell
        testId="intake-conceive"
        title="把论文要求或想法放在这里"
        detail="要求和补充至少有一项。切换到改稿不会清掉这里的内容。"
        fileName={state.loaded?.source === "file" ? state.loaded.fileName : ""}
        error={state.error}
        paste={state.paste}
        onPaste={(value) => setConceive((current) => ({ ...current, paste: value }))}
        onUsePaste={onUsePaste}
        onFile={onFile}
        extra={
          <label className="mt-4 block" htmlFor="conceive-notes">
            想法补充
            <textarea
              id="conceive-notes"
              data-testid="conceive-notes"
              className="manuscript mt-2 w-full border border-line p-3"
              rows={4}
              value={state.notes}
              onChange={(event) => setConceive((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
        }
      />
      {state.loaded ? (
        <label className="block border border-line bg-paper p-4">
          修正要求文本
          <textarea
            className="manuscript mt-2 w-full border border-line p-3"
            rows={6}
            value={state.loaded.editText}
            onChange={(event) =>
              setConceive((current) => ({
                ...current,
                loaded: current.loaded ? { ...current.loaded, editText: event.target.value } : current.loaded,
              }))
            }
          />
        </label>
      ) : null}
      <section className="border border-line bg-paper p-4">
        <label className="flex min-h-11 items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 size-5"
            checked={state.consent === `conceive:${model}:${text}`}
            onChange={(event) =>
              setConceive((current) => ({ ...current, consent: event.target.checked ? `conceive:${model}:${text}` : "" }))
            }
          />
          <span>整理要求和生成框架时，这些文字会经本机服务发到 OpenRouter。文献检索只发送检索词。</span>
        </label>
        {state.modelError ? (
          <p role="alert" className="mt-3 border-l-4 border-ink bg-sunk px-3 py-2">
            {state.modelError}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" disabled={state.running} onClick={onRequirements}>
            整理要求与方向
          </Button>
          <Button type="button" variant="quiet" onClick={onLocal}>
            只做本地整理
          </Button>
          <Button type="button" variant="quiet" disabled={state.running} onClick={onOutline}>
            生成框架
          </Button>
          <Button type="button" variant="quiet" onClick={onSave}>
            存入存档
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConceive((current) => ({ ...current, paste: SAMPLE_CONCEIVE, showSample: true }))}>
            填入样例要求
          </Button>
        </div>
        {state.brief ? <BriefView brief={state.brief} direction={state.direction} onDirection={(direction) => setConceive((current) => ({ ...current, direction }))} /> : null}
        {state.outline ? (
          <div className="mt-4">
            <h3 className="text-lg">框架 {state.outline.origin === "local" ? "（本地，未调用模型）" : ""}</h3>
            <p className="mt-2">{state.outline.theme}</p>
            <p className="text-ink-soft">{state.outline.scope}</p>
            <p className="mt-2">{state.outline.lengthNote}</p>
            {state.outline.requirementsConflict ? <p>关键限制有冲突，这个草案不算已满足要求。</p> : null}
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
            <label className="mt-4 block">
              检索词。每行一个。只会把这些词发给 OpenAlex。
              <textarea
                className="mt-2 w-full border border-line p-2"
                rows={4}
                value={state.queries}
                onChange={(event) => setConceive((current) => ({ ...current, queries: event.target.value }))}
              />
            </label>
            <Button type="button" className="mt-2" variant="quiet" onClick={onSearch}>
              检索文献
            </Button>
            <LiteratureList results={state.literature} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function BriefView({
  brief,
  direction,
  onDirection,
}: {
  brief: RequirementsBrief;
  direction: string;
  onDirection: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-lg">要求 {brief.origin === "local" ? "（本地整理，未调用模型）" : ""}</h3>
      <ul className="mt-2 list-disc pl-5">
        {brief.requirements.map((item) => (
          <li key={`${item.source}-${item.text}`}>
            {item.text} <span className="text-ink-soft">来自{item.source === "school" ? "要求" : item.source === "user" ? "补充" : item.source === "model" ? "模型建议" : "未标明"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2">关键词：{brief.keywords.map((item) => `${item.term}（${item.source}）`).join("、") || "还没有"}</p>
      {brief.conflicts.map((item) => (
        <p key={item} className="mt-2 border-l-4 border-lime pl-3">
          {item}
        </p>
      ))}
      {brief.missing.map((item) => (
        <p key={item}>还缺：{item}</p>
      ))}
      {brief.directions.map((item) => (
        <label key={item.title} className="mt-3 flex min-h-11 items-start gap-2 border border-line p-3">
          <input type="radio" className="mt-1 size-5" name="direction" checked={direction === item.title} onChange={() => onDirection(item.title)} />
          <span>
            <span className="block">{item.title}</span>
            <span className="text-ink-soft">
              {item.question} 材料：{item.materials} 方法：{item.method} 工作量：{item.workload} 困难：{item.difficulty}
            </span>
          </span>
        </label>
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
              <li key={item.openalexId} className="border-l-4 border-lime pl-3">
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
    <aside className="border border-line bg-paper p-4">
      <h2 className="text-lg">起稿</h2>
      <p className="mt-2 text-ink-soft">先整理要求，再出框架。文献失败不会清掉框架。</p>
      {state.showSample ? <p className="mt-3 border-l-4 border-lime pl-3">样例要求已填入输入框，还没有调用模型。</p> : null}
      {state.outline ? <p className="mt-3">{state.outline.sections.length} 节框架在中间。</p> : <p className="mt-3">框架还没有生成。</p>}
    </aside>
  );
}

function ArchiveReader({ record, onBack }: { record: PaperRecord; onBack: () => void }) {
  const [tab, setTab] = useState<"input" | "current" | "notes">("input");
  const blocks = tab === "current" ? record.currentBlocks || record.confirmed?.blocks || [] : record.confirmed?.blocks || [];
  return (
    <section className="border border-line bg-paper p-4 sm:p-6" data-testid="archive-reader">
      <p className="border-l-4 border-lime pl-3">只查看，不调用模型。</p>
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
              当前稿
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
          <p>{record.analysisOriginal?.summary || "还没有原稿诊断。"}</p>
          <p className="mt-2">{record.analysisCurrent?.summary || "还没有当前稿分析。"}</p>
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
