import { describe, expect, it } from "vitest";
import { emptyOptions } from "@/lib/document/types";
import { parseProse } from "@/lib/document/structure";
import { languageRules } from "@/lib/prompts/shared";
import { rewriteMessages } from "@/lib/prompts/revise";
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
    expect(body.model).toBe("~openai/gpt-sol-latest");
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(resolveCredential("session-key", "server-key")).toEqual({ source: "session", key: "session-key" });
    expect(resolveCredential("  ", "server-key")).toEqual({ source: "server", key: "server-key" });
    expect(resolveCredential("", "")).toEqual({ source: "none", key: null });
  });
});
