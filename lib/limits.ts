/** Product limits. Lengths that tests have not passed stay unlabeled as supported. */
export const LIMITS = {
  maxFileBytes: 15 * 1024 * 1024,
  /** Target cap from the plan. Exceeding it stops model work instead of truncating. */
  targetChars: 40_000,
  /** Largest document the automated pipeline test keeps intact. */
  verifiedChars: 8_000,
  /** Source chars per rewrite chunk so a reply can cover every paragraph. */
  chunkSourceChars: 1_200,
  archiveReminderCount: 30,
  maxLiteratureQueries: 3,
  literaturePerQuery: 5,
  maxMissingQuestions: 3,
} as const;

export const PROMPT_VERSION = "2026-10-15.1";

/**
 * Default slug from OpenRouter quickstart (checked 2026-10-15).
 * `GET /api/v1/models` lists it with context_length 1050000 and structured_outputs.
 */
export const DEFAULT_MODEL = "~openai/gpt-sol-latest";

export const KNOWN_MODEL = {
  id: DEFAULT_MODEL,
  contextLength: 1_050_000,
  maxCompletionTokens: 128_000,
  structuredOutputs: true,
  promptPerToken: 0.000002,
  completionPerToken: 0.00001,
  longContextFromTokens: 272_000,
  longPromptPerToken: 0.000004,
  longCompletionPerToken: 0.000015,
  checkedOn: "2026-10-15",
  source: "https://openrouter.ai/api/v1/models",
} as const;
