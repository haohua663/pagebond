import { describe, expect, it } from "vitest";
import { emptyOptions } from "@/lib/document/types";
import { parseProse } from "@/lib/document/structure";
import { ensureJsonPrompt, languageRules } from "@/lib/prompts/shared";
import { humanizeMessages, rewriteMessages } from "@/lib/prompts/revise";
import { buildOpenRouterBody } from "@/lib/providers/openrouter";
import { DEFAULT_MODEL } from "@/lib/limits";
import { resolveCredential } from "@/lib/providers/credentials";

describe("prompts and credentials", () => {
  it("uses humanizer rules for Chinese and a separate constraint for English", () => {
    expect(languageRules("zh", "中文")).toMatch(/humanizer-zh/);
    expect(languageRules("en", "English text")).not.toMatch(/humanizer-zh/);
    expect(languageRules("en", "English text")).toMatch(/association/);
  });

  it("forbids fabricated sources and detection scores in the rewrite prompt", () => {
    const doc = parseProse("一段中文。");
    const messages = rewriteMessages(doc.blocks, { ...emptyOptions(), language: "zh" }, []);
    expect(messages.system).toMatch(/不要编造文献/);
    expect(messages.system).toMatch(/查重率/);
    expect(messages.system).toMatch(/humanizer-zh/);
  });


  it("frames humanize as naturalness, not detector evasion", () => {
    const doc = parseProse("一段中文。");
    const messages = humanizeMessages(doc.blocks, { ...emptyOptions(), language: "zh" }, []);
    expect(messages.system).toMatch(/人话化|行文自然度/);
    expect(messages.system).toMatch(/不是查重/);
    expect(messages.system).toMatch(/不要输出查重率/);
    expect(messages.system).toMatch(/humanizer-zh/);
  });

  it("sends the documented model slug and prefers a session key over the server key", () => {
    const body = buildOpenRouterBody(
      {
        model: DEFAULT_MODEL,
        system: "s",
        user: "u",
        schemaName: "pagebond_rewrite",
        schema: { type: "object" },
        key: "secret",
      },
      true,
    );
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(resolveCredential("session-key", "server-key")).toEqual({ source: "session", key: "session-key" });
    expect(resolveCredential("  ", "server-key")).toEqual({ source: "server", key: "server-key" });
    expect(resolveCredential("", "")).toEqual({ source: "none", key: null });
  });
});

describe("ensureJsonPrompt", () => {
  it("injects the word json when missing", () => {
    const out = ensureJsonPrompt("只返回结果。", "正文");
    expect(out.system).toMatch(/json/i);
    expect(out.system).toMatch(/JSON object/);
  });

  it("appends schema guidance for json_object providers", () => {
    const out = ensureJsonPrompt("系统", "用户", { type: "object", required: ["summary"] });
    expect(out.system).toMatch(/must match this schema/i);
    expect(out.system).toContain('"summary"');
  });

  it("puts json_object body messages through ensureJsonPrompt", () => {
    const body = buildOpenRouterBody(
      {
        model: "deepseek-flash",
        system: "只返回结果。",
        user: "正文",
        schemaName: "pagebond_diagnose",
        schema: { type: "object", required: ["summary"] },
        key: "secret",
        baseUrl: "https://api.deepseek.com",
      },
      false,
    );
    const messages = body.messages as { role: string; content: string }[];
    const blob = messages.map((m) => m.content).join("\n");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(blob).toMatch(/json/i);
    expect(blob).toContain("summary");
  });
});

