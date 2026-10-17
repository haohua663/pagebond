/** Product limits. Lengths that tests have not passed stay unlabeled as supported. */
export const LIMITS = {
  maxFileBytes: 15 * 1024 * 1024,
  /** Target cap from the plan. Exceeding it stops model work instead of truncating. */
  targetChars: 40_000,
  /** Translate workbench input cap (~6 万汉字). */
  translateChars: 60_000,
  /** Largest document the automated pipeline test keeps intact. */
  verifiedChars: 40_000,
  /** Source chars per rewrite chunk so a reply can cover every paragraph. */
  chunkSourceChars: 1_200,
  archiveReminderCount: 30,
  maxLiteratureQueries: 3,
  literaturePerQuery: 5,
  maxMissingQuestions: 3,
} as const;

export const PROMPT_VERSION = "2026-10-16.2";

/** Daily / default model: Qwen3.7-Plus pinned snapshot (override with QWEN_MODEL or LLM_MODEL). */
export const DAILY_MODEL_DEFAULT = "qwen3.7-plus-2026-05-26";

/** Deep optional model for analyze (override with DEEPSEEK_MODEL). */
export const DEEP_MODEL_DEFAULT = "deepseek-v4-pro";

/**
 * Default model id shown in settings and used when no route-specific env is set.
 * Dual routing prefers QWEN_MODEL / DEEPSEEK_MODEL per route.
 */
export const DEFAULT_MODEL = DAILY_MODEL_DEFAULT;

/**
 * Known model metadata for cost hints. Price fields are placeholders until re-checked
 * against the active gateway; unknown ids skip numeric estimates.
 */
export const KNOWN_MODEL = {
  id: DEFAULT_MODEL,
  contextLength: 262_144,
  maxCompletionTokens: 65_536,
  structuredOutputs: true,
  promptPerToken: 0,
  completionPerToken: 0,
  longContextFromTokens: 128_000,
  longPromptPerToken: 0,
  longCompletionPerToken: 0,
  checkedOn: "2026-10-16",
  source: "aliyun-dashscope-qwen3.7-plus",
} as const;
