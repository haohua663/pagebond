import { z } from "zod";

const suggestion = z.object({
  id: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
  dimension: z.enum(["structure", "argument", "evidence", "method", "expression", "fact"]),
  version: z.enum(["confirmed-input", "current-draft"]),
  blockId: z.string().min(1),
  quote: z.string().min(1),
  problem: z.string().min(1),
  change: z.string().min(1),
  verify: z.string().min(1),
});

export const diagnoseSchema = z.object({
  // researchQuestion / terms / facts are not shown in the UI; tolerate their absence so a
  // shorter model answer still validates. facts is no longer requested (saves ~30% output).
  researchQuestion: z.string().optional().default(""),
  terms: z.array(z.string()).optional().default([]),
  facts: z.array(z.object({ blockId: z.string(), text: z.string(), kind: z.string() })).optional().default([]),
  summary: z.string(),
  suggestions: z.array(suggestion),
});

export const rewriteSchema = z.object({
  paragraphs: z.array(z.object({ id: z.string(), text: z.string(), reason: z.string() })),
});

export const translateSchema = z.object({
  translation: z.string().min(1),
  direction: z.enum(["en-zh", "zh-en"]).optional(),
});

export const translateSegmentsSchema = z.object({
  segments: z.array(z.object({ id: z.string().min(1), translation: z.string().min(1) })).min(1),
  direction: z.enum(["en-zh", "zh-en"]).optional(),
});

export const drawSchema = z.object({
  figureType: z.enum(["schematic", "chart", "multipanel", "other"]),
  title: z.string(),
  captionZh: z.string(),
  captionEn: z.string(),
  designNotes: z.string(),
  mermaid: z.string(),
  pythonHint: z.string(),
  evidenceMapping: z
    .array(z.object({ element: z.string(), evidence: z.string() }))
    .optional()
    .default([]),
});

export const presentSchema = z.object({
  title: z.string().min(1),
  talkMinutes: z.number().optional(),
  outline: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        bullets: z.array(z.string()).default([]),
        notes: z.string().optional().default(""),
        kind: z.enum(["title", "section", "body", "close"]).optional(),
        layout: z.string().optional(),
        visual: z
          .object({
            type: z.string().optional(),
            metric: z.string().optional(),
            caption: z.string().optional(),
            items: z
              .array(z.object({ label: z.string(), value: z.number().optional() }))
              .optional()
              .default([]),
          })
          .optional(),
      }),
    )
    .min(1),
});

export const analyzeSchema = z.object({
  summary: z.string(),
  dimensions: z.array(
    z.object({
      id: z.enum(["structure", "argument", "evidence", "method", "expression", "fact"]),
      conclusion: z.string(),
      resolved: z.array(z.string()),
      remaining: z.array(z.string()),
      needsMaterial: z.array(z.string()),
    }),
  ),
  suggestions: z.array(suggestion),
});

export const requirementsSchema = z.object({
  requirements: z.array(z.object({ text: z.string(), source: z.enum(["school", "user", "model", "unknown"]) })),
  keywords: z.array(z.object({ term: z.string(), source: z.string() })),
  conflicts: z.array(z.string()),
  missing: z.array(z.string()),
  directions: z.array(
    z.object({
      title: z.string(),
      question: z.string(),
      materials: z.string(),
      method: z.string(),
      workload: z.string(),
      difficulty: z.string(),
    }),
  ),
  assumptions: z.array(z.string()),
  titleFixed: z.boolean(),
});

export const outlineSchema = z.object({
  keywords: z.array(z.object({ term: z.string(), source: z.string() })),
  theme: z.string(),
  scope: z.string(),
  premises: z.array(z.string()),
  writingOrder: z.array(z.string()),
  sections: z.array(
    z.object({
      heading: z.string(),
      purpose: z.string(),
      content: z.string(),
      evidence: z.string(),
      length: z.string(),
      openQuestions: z.array(z.string()),
    }),
  ),
  lengthNote: z.string(),
  literatureQueries: z.array(z.string()),
  assumptions: z.array(z.string()),
  requirementsConflict: z.boolean(),
});

/** Shared JSON Schema for suggestion rows — keep in sync with Zod `suggestion`. */
export const suggestionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "priority", "dimension", "version", "blockId", "quote", "problem", "change", "verify"],
  properties: {
    id: { type: "string" },
    priority: { type: "string", enum: ["high", "medium", "low"] },
    dimension: {
      type: "string",
      enum: ["structure", "argument", "evidence", "method", "expression", "fact"],
    },
    version: { type: "string", enum: ["confirmed-input", "current-draft"] },
    blockId: { type: "string" },
    quote: { type: "string" },
    problem: { type: "string" },
    change: { type: "string" },
    verify: { type: "string" },
  },
} as const;

export const diagnoseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["researchQuestion", "terms", "summary", "suggestions"],
  properties: {
    researchQuestion: { type: "string" },
    terms: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    suggestions: { type: "array", items: suggestionJsonSchema },
  },
} as const;

export const analyzeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "dimensions", "suggestions"],
  properties: {
    summary: { type: "string" },
    dimensions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "conclusion", "resolved", "remaining", "needsMaterial"],
        properties: {
          id: {
            type: "string",
            enum: ["structure", "argument", "evidence", "method", "expression", "fact"],
          },
          conclusion: { type: "string" },
          resolved: { type: "array", items: { type: "string" } },
          remaining: { type: "array", items: { type: "string" } },
          needsMaterial: { type: "array", items: { type: "string" } },
        },
      },
    },
    suggestions: { type: "array", items: suggestionJsonSchema },
  },
} as const;

export const rewriteJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["paragraphs"],
  properties: {
    paragraphs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "reason"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

export const translateJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["translation"],
  properties: {
    translation: { type: "string" },
    direction: { type: "string", enum: ["en-zh", "zh-en"] },
  },
} as const;

export const translateSegmentsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["segments"],
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "translation"],
        properties: {
          id: { type: "string" },
          translation: { type: "string" },
        },
      },
    },
    direction: { type: "string", enum: ["en-zh", "zh-en"] },
  },
} as const;

export const drawJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["figureType", "title", "captionZh", "captionEn", "designNotes", "mermaid", "pythonHint", "evidenceMapping"],
  properties: {
    figureType: { type: "string", enum: ["schematic", "chart", "multipanel", "other"] },
    title: { type: "string" },
    captionZh: { type: "string" },
    captionEn: { type: "string" },
    designNotes: { type: "string" },
    mermaid: { type: "string" },
    pythonHint: { type: "string" },
    evidenceMapping: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["element", "evidence"],
        properties: {
          element: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
  },
} as const;

export const presentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "outline"],
  properties: {
    title: { type: "string" },
    talkMinutes: { type: "number" },
    outline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "bullets"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
          kind: { type: "string", enum: ["title", "section", "body", "close"] },
          layout: { type: "string" },
          visual: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string" },
              metric: { type: "string" },
              caption: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label"],
                  properties: {
                    label: { type: "string" },
                    value: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export type DiagnoseOutput = z.infer<typeof diagnoseSchema>;
export type RewriteOutput = z.infer<typeof rewriteSchema>;
export type AnalyzeOutput = z.infer<typeof analyzeSchema>;
export type RequirementsOutput = z.infer<typeof requirementsSchema>;
export type OutlineOutput = z.infer<typeof outlineSchema>;

export const conceiveDraftSchema = z.object({
  heading: z.string().min(1),
  markdown: z.string().min(1),
  openGaps: z.array(z.string()).default([]),
  citedIds: z.array(z.string()).default([]),
});

export type ConceiveDraftOutput = z.infer<typeof conceiveDraftSchema>;

export type TranslateOutput = z.infer<typeof translateSchema>;
export type DrawOutput = z.infer<typeof drawSchema>;
export type PresentOutput = z.infer<typeof presentSchema>;
