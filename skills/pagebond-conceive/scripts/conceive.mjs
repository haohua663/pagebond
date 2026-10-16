#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const prompt = readFileSync(path.join(here, "../prompts/outline.md"), "utf8");
const schema = JSON.parse(readFileSync(path.join(here, "../schema/outline.json"), "utf8"));

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : fallback;
}

const inputPath = arg("--input");
const notesPath = arg("--notes");
const outputPath = arg("--output");
const doSearch = process.argv.includes("--search");
const model = process.env.QWEN_MODEL || process.env.LLM_MODEL || process.env.PAGEBOND_MODEL || process.env.YEYUAN_MODEL || "qwen3.7-plus-2026-05-26";

if (!inputPath && !notesPath) {
  console.error("用法：node scripts/conceive.mjs --input 要求.md --notes 补充.txt --output 框架.md");
  process.exit(2);
}

const requirementText = inputPath ? readFileSync(inputPath, "utf8") : "";
const notes = notesPath ? readFileSync(notesPath, "utf8") : "";
if (!requirementText.trim() && !notes.trim()) {
  console.error("要求和补充都是空的。");
  process.exit(2);
}

function localOutline() {
  const lines = `${requirementText}\n${notes}`
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 3);
  const queries = lines
    .flatMap((line) => line.split(/[，,、]/))
    .map((item) => item.replace(/^题目[:：]/, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 24)
    .slice(0, 3);
  return {
    origin: "local",
    requirements: lines.filter((line) => /必须|不得|不少于|字数|截止/.test(line)).slice(0, 8),
    missing: requirementText.includes("字") ? [] : ["没有看到字数。"],
    directions: [],
    theme: lines[0] || "未命名",
    sections: [
      {
        heading: "问题与范围",
        purpose: "写清要回答的问题。",
        content: "只覆盖要求里写明的内容。",
        evidence: "要求原文。",
        length: "按用户字数，没有就不编。",
      },
    ],
    literatureQueries: queries,
    requirementsConflict: false,
  };
}

function render(outline, literature, banner) {
  const parts = [
    `> ${banner}`,
    "",
    `# ${outline.theme}`,
    "",
    "## 要求",
    ...(outline.requirements || []).map((item) => `- ${item}`),
    "",
    "## 缺口",
    ...(outline.missing || []).map((item) => `- ${item}`),
    "",
    "## 章节",
    ...(outline.sections || []).map(
      (section) => `### ${section.heading}\n目的：${section.purpose}\n拟写：${section.content}\n证据：${section.evidence}\n篇幅：${section.length}`,
    ),
    "",
    "## 检索词",
    ...(outline.literatureQueries || []).map((item) => `- ${item}`),
  ];
  if (literature) {
    parts.push("", "## 文献", literature);
  }
  return `${parts.join("\n")}\n`;
}

const key = (process.env.QWEN_API_KEY || process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY)?.trim();
const baseUrl = (process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
let outline = localOutline();
let banner = "本地整理，未调用模型。这不是已完成的论文。";

if (!key) {
  console.error("没有 QWEN_API_KEY / LLM_API_KEY（或 OPENROUTER_API_KEY）。未调用模型。");
  if (outputPath) writeFileSync(outputPath, render(outline, "", banner));
  process.exit(2);
}

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "X-OpenRouter-Title": "pagebond",
  },
  body: JSON.stringify({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: `<document>\n${requirementText}\n\n${notes}\n</document>` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "pagebond_outline", strict: true, schema } },
  }),
});

if (!response.ok) {
  console.error(`模型没有返回框架（${response.status}）。保留本地框架。`);
} else {
  try {
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content || "";
    outline = { ...JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()), origin: "model" };
    banner = `模型框架。实际模型 ${payload.model || model}。文献字段不会在这里编造。`;
  } catch {
    console.error("框架结构没有通过解析。保留本地框架。");
  }
}

let literature = "";
if (doSearch) {
  const queries = (outline.literatureQueries || []).filter((item) => typeof item === "string" && item.length < 180).slice(0, 3);
  const blocks = [];
  for (const query of queries) {
    try {
      const url = `https://api.openalex.org/works?${new URLSearchParams({ search: query, per_page: "5" })}`;
      const found = await fetch(url, { headers: { "User-Agent": "pagebond/0.1 (mailto:dev@localhost)" } });
      if (found.status === 429) {
        blocks.push(`- ${query}：额度不足`);
        continue;
      }
      if (!found.ok) {
        blocks.push(`- ${query}：服务失败`);
        continue;
      }
      const data = await found.json();
      const results = data.results || [];
      if (!results.length) {
        blocks.push(`- ${query}：未找到`);
        continue;
      }
      for (const work of results) {
        if (!work.title || !work.id) continue;
        const authors = (work.authorships || []).map((item) => item.author?.display_name).filter(Boolean).join(", ");
        const doi = typeof work.doi === "string" ? work.doi.replace(/^https?:\/\/doi\.org\//, "") : "";
        blocks.push(`- ${work.title} | ${authors || "作者未返回"} | ${work.publication_year ?? "年份未返回"} | ${doi || "没有 DOI"} | ${work.id}`);
      }
    } catch {
      blocks.push(`- ${query}：服务失败`);
    }
  }
  literature = blocks.join("\n");
}

const markdown = render(outline, literature, banner);
if (outputPath) writeFileSync(outputPath, markdown);
else process.stdout.write(markdown);
if (!key) process.exit(2);
