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

  it("lists concrete humanizer-zh AI-writing patterns for Chinese humanize drafts", () => {
    const doc = parseProse("一段中文。");
    const system = humanizeMessages(doc.blocks, { ...emptyOptions(), language: "zh" }, []).system;
    for (const pattern of [
      /值得注意的是/,
      /综上所述/,
      /总而言之/,
      /此外/,
      /意义拔高|拔高/,
      /三段式/,
      /不仅……而且/,
      /不是……而是/,
      /破折号/,
      /研究表明/,
      /专家认为/,
      /宣传腔/,
      /同义词/,
      /句长/,
      /空泛收尾|展望/,
      /过度对冲/,
      /客服腔|对话腔/,
      /直接陈述/,
    ]) {
      expect(system).toMatch(pattern);
    }
    expect(system).not.toMatch(/blader\/humanizer/);
  });

  it("uses the English humanizer checklist for English drafts and keeps academic constraints", () => {
    const doc = parseProse("An English paragraph about results.");
    const system = humanizeMessages(doc.blocks, { ...emptyOptions(), language: "en" }, []).system;
    expect(system).toMatch(/blader\/humanizer/);
    expect(system).toMatch(/It is worth noting/);
    expect(system).toMatch(/not only X but also Y/);
    expect(system).toMatch(/pivotal/);
    expect(system).toMatch(/Experts argue/);
    expect(system).toMatch(/vary sentence length/i);
    expect(system).toMatch(/association/);
    expect(system).not.toMatch(/值得注意的是/);
  });

  it("keeps fidelity rules and forbids echoing block ids or kind tags in humanize and rewrite", () => {
    const doc = parseProse("一段中文。");
    const options = { ...emptyOptions(), language: "zh" as const };
    for (const system of [
      humanizeMessages(doc.blocks, options, []).system,
      rewriteMessages(doc.blocks, options, []).system,
    ]) {
      expect(system).toMatch(/公式、直接引语、数字与单位、引用标记、参考文献/);
      expect(system).toMatch(/标题（heading 段落）和段首的结构标记/);
      expect(system).toMatch(/不要补写文献和数据/);
      expect(system).toMatch(/\[p-002\]/);
      expect(system).toMatch(/\(list\)/);
    }
  });

  it("adds a lighter anti-AI-tell reminder to rewrite without the full checklist", () => {
    const doc = parseProse("一段中文。");
    const zh = rewriteMessages(doc.blocks, { ...emptyOptions(), language: "zh" }, []).system;
    expect(zh).toMatch(/不要引入 AI 写作痕迹/);
    expect(zh).toMatch(/值得注意的是/);
    expect(zh).not.toMatch(/humanizer-zh 清单/);
    const en = rewriteMessages(parseProse("English text.").blocks, { ...emptyOptions(), language: "en" }, []).system;
    expect(en).toMatch(/Do not introduce AI-writing tells/);
  });

  it("protects terms, author judgments and length in humanize (zh and en)", () => {
    const zh = humanizeMessages(parseProse("一段中文。").blocks, { ...emptyOptions(), language: "zh" }, []).system;
    expect(zh).toMatch(/专业术语、研究方法名称.*一律原样保留/);
    expect(zh).toMatch(/作者判断、立场、局限或结论的句子可以压缩措辞，但不能整句删掉/);
    expect(zh).toMatch(/纯套话才能删/);
    expect(zh).toMatch(/75%~80%/);
    const en = humanizeMessages(parseProse("English text.").blocks, { ...emptyOptions(), language: "en" }, []).system;
    expect(en).toMatch(/Keep technical terms, method names/);
    expect(en).toMatch(/never deleted whole/);
    expect(en).toMatch(/75-80%/);
  });

  it("lists half-inflated tails as deletable filler and hedges uncited 研究表明", () => {
    const zh = humanizeMessages(parseProse("一段中文。").blocks, { ...emptyOptions(), language: "zh" }, []).system;
    for (const pattern of [
      /以推进\/助力\/赋能\/服务于……转型\/发展\/建设/,
      /为……贡献力量\/提供参考\/奠定基础/,
      /理论、方法与实践层面继续讨论/,
      /有一定参考价值/,
      /「可见，」「因此，」/,
      /没有引用标记的「研究表明」.*改成带保留的「有研究显示」/,
      /纯套话尾巴不算信息/,
      /守住/,
    ]) {
      expect(zh).toMatch(pattern);
    }
    const en = humanizeMessages(parseProse("English text.").blocks, { ...emptyOptions(), language: "en" }, []).system;
    expect(en).toMatch(/provide a basis for further research/);
    expect(en).toMatch(/pave the way/);
    expect(en).toMatch(/filler tails .* is fine/);
  });

  it("keeps the humanize prompt compact enough to send per chunk", () => {
    const doc = parseProse("一段中文。");
    const system = humanizeMessages(doc.blocks, { ...emptyOptions(), language: "zh" }, []).system;
    expect(system.length).toBeLessThan(2600);
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

