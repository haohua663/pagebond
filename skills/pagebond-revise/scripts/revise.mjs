#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const prompt = readFileSync(path.join(here, "../prompts/rewrite.md"), "utf8");
const schema = JSON.parse(readFileSync(path.join(here, "../schema/rewrite.json"), "utf8"));

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : fallback;
}

const inputPath = arg("--input");
const outputPath = arg("--output");
const language = arg("--language", "zh");
const model = process.env.PAGEBOND_MODEL || process.env.YEYUAN_MODEL || "~openai/gpt-sol-latest";

if (!inputPath) {
  console.error("用法：node scripts/revise.mjs --input 原稿.md --output 建议修改稿.md --language zh");
  process.exit(2);
}

const source = readFileSync(inputPath, "utf8").replace(/\r\n/g, "\n").trim();
if (!source) {
  console.error("原稿是空的。未调用模型。");
  process.exit(2);
}

const key = process.env.OPENROUTER_API_KEY?.trim();
if (!key) {
  console.error("没有 OPENROUTER_API_KEY。未调用模型，没有写出修改稿。");
  process.exit(2);
}

const blocks = source.split(/\n{2,}/).filter(Boolean).map((text, index) => ({
  id: `p-${String(index + 1).padStart(3, "0")}`,
  text,
}));

const protections = (text) => {
  const found = [];
  const rules = [/\$[^$\n]+\$/g, /“[^”]+”/g, /「[^」]+」/g, /\d+(?:\.\d+)?\s*(?:%|％|人|名|次)/g];
  for (const rule of rules) {
    found.push(...(text.match(rule) || []));
  }
  return found;
};

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
      { role: "system", content: `${prompt}\n语言：${language === "en" ? "英文，不要使用中文 humanizer 规则。" : "中文，使用上面的中文约束。"}` },
      { role: "user", content: `<document>\n${blocks.map((block) => `[${block.id}]\n${block.text}`).join("\n\n")}\n</document>` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "pagebond_rewrite", strict: true, schema } },
  }),
});

if (!response.ok) {
  console.error(`模型没有返回可用结果（${response.status}）。未写出修改稿。`);
  process.exit(1);
}

const payload = await response.json();
const content = payload.choices?.[0]?.message?.content || "";
let parsed;
try {
  parsed = JSON.parse(content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
} catch {
  console.error("模型没有返回可解析的结构。未写出修改稿。");
  process.exit(1);
}

const byId = new Map((parsed.paragraphs || []).map((item) => [item.id, item]));
const lines = ["> 这是建议修改稿。未进行外部查重／AI 检测。", ""];
let reverted = 0;
for (const block of blocks) {
  const item = byId.get(block.id);
  const lost = protections(block.text).filter((piece) => !item?.text?.includes(piece));
  if (!item?.text?.trim() || lost.length) {
    reverted += 1;
    lines.push(block.text, "");
    console.error(`${block.id} 已回退${lost.length ? `：${lost.join("、")}` : ""}`);
    continue;
  }
  lines.push(item.text, "");
}
if (outputPath) writeFileSync(outputPath, lines.join("\n"));
else process.stdout.write(lines.join("\n"));
console.error(`完成。段落 ${blocks.length}，回退 ${reverted}。模型 ${payload.model || model}。`);
