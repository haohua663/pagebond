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
  researchQuestion: z.string(),
  terms: z.array(z.string()),
  facts: z.array(z.object({ blockId: z.string(), text: z.string(), kind: z.string() })),
  summary: z.string(),
  suggestions: z.array(suggestion),
});

export const rewriteSchema = z.object({
  paragraphs: z.array(z.object({ id: z.string(), text: z.string(), reason: z.string() })),
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
  required: ["researchQuestion", "terms", "facts", "summary", "suggestions"],
  properties: {
    researchQuestion: { type: "string" },
    terms: { type: "array", items: { type: "string" } },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["blockId", "text", "kind"],
        properties: { blockId: { type: "string" }, text: { type: "string" }, kind: { type: "string" } },
      },
    },
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

export type DiagnoseOutput = z.infer<typeof diagnoseSchema>;
export type RewriteOutput = z.infer<typeof rewriteSchema>;
export type AnalyzeOutput = z.infer<typeof analyzeSchema>;
export type RequirementsOutput = z.infer<typeof requirementsSchema>;
export type OutlineOutput = z.infer<typeof outlineSchema>;
