---
name: pagebond-conceive
description: 从论文要求、开题或想法整理出关键词、方向和章节框架。用户提到起稿、开题、写作框架、论文要求或 pagebond 构思时使用。先整理要求，再出框架。文献只发送检索词，不编造题名、作者、年份或 DOI。
compatibility: 需要 Node.js 18+。模型调用需要环境变量 LLM_API_KEY (or OPENROUTER_API_KEY)。OpenAlex 可不填密钥。不依赖固定的技能安装目录。
---

# pagebond 起稿

起稿不写整篇论文。没有密钥时只做本地整理，并标明未调用模型。

## 何时使用

- 用户给出要求、开题或一段想法，想要可执行的章节框架
- 用户要关键词和方向，而不是代写正文
- 用户希望核对公开文献，但不能编参考文献

## 步骤

1. 读 `prompts/outline.md` 和 `schema/outline.json`。
2. 运行：

```bash
node scripts/conceive.mjs --input 要求.md --notes 补充.txt --output 框架.md
```

3. 第一段输出是要求与缺口，第二段才是框架。题目已经写明时不要强迫重选。
4. 需要文献时加 `--search`。脚本只把检索词发给 OpenAlex，字段只用返回值。检索失败时框架文件仍然保留。

## 不要做

- 不要编造文献、数据、伦理批件或已经完成的实验结果
- 不要把尚未做的采集写成结果
- 不要在要求互相冲突时把草案说成已满足要求
- 综述和理论文章不要套实验结构

网页里的同一套边界在仓库 `lib/workflows/conceive.ts` 和 `lib/providers/openalex.ts`。
