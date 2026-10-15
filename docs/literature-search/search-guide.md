# 文献检索工作区（literature-search）

本目录按 [agent-research-skills](https://github.com/lingzhi227/agent-research-skills) 的 `literature-search` 准备。仓库里还没有论文题目、研究问题或文稿，因此检索脚本已就位，**结果表为空**。Hao 给出检索问题之后才能查询数据库。

完整 skill 原文在 [SKILL.md](SKILL.md)。空白检索式在 [search-template.md](search-template.md)。

## Skill 要求的流程

1. 把用户的自然语言问题展开成 2–4 条互补检索式。
2. 用 Semantic Scholar 做主检索（年份 2022–2026，每条最多 20 篇）。
3. 用 arXiv 补近 3 个月预印本。以 2026-10-15 为今天，窗口是 2026-07-15 至 2026-10-15。
4. 需要更广覆盖时用 OpenAlex（2022–2026，至少 5 次引用，每条最多 20 篇）。
5. 合并 JSONL，按标题词集合的 Jaccard 相似度去重，默认阈值 0.8。
6. 排序权重：引用 0.3、新近 0.3、刊物层级 0.2、相关度 0.2。
7. 交出表格，以及带 BibTeX key 的条目。预印本必须标 `(preprint)`。

`paper_db.py merge` 只做去重。它不计算上面的四项权重。排序要在合并结果上另做，并写明每条的预印本状态。

## 现在需要 Hao 提供

一条自然语言检索问题，或论文题目加上关键词。可选：年份、会议或期刊、语言、是否只要同行评审。

在问题到达之前：

- 四个检索脚本在缺少 `--query` 时退出码为 2。
- 未调用 Semantic Scholar、arXiv、OpenAlex、CrossRef。
- 未下载任何 arXiv `.tex`。
- 未生成 `references.bib`。
- 结果表没有行。脚本文档字符串里的 attention / transformer 示例不是本项目的检索式。

已有的 [scientific-writing](../scientific-writing/workspace-guide.md) 工作区仍要求来源经人工核实后才能进入稿件。本目录的检索结果以后也只作为待核对清单。

## 文件

| 路径 | 作用 |
|---|---|
| [SKILL.md](SKILL.md) | 本次安装得到的 skill 原文 |
| [search-template.md](search-template.md) | 空白检索式、年份窗口、排序与空结果表 |
| [scripts/](scripts/) | 随本 skill 下载的 OpenAlex、CrossRef、arXiv 源码脚本 |
| [shared-scripts/](shared-scripts/) | skill 流程要调用、但 supporting files 未附带的四个脚本 |

## 有了问题之后

在本目录执行。把 `QUERY` 换成展开后的检索式。Semantic Scholar 密钥可选；本机没有 skill 所写的 `/Users/lingzhi/Code/keys.md`。

```bash
cd /cursor/stores/self/docs/literature-search

python3 shared-scripts/search_semantic_scholar.py \
  --query "QUERY" --max-results 20 --year-range 2022-2026 \
  -o results_s2.jsonl

python3 shared-scripts/search_arxiv.py \
  --query "QUERY" --max-results 10 \
  --start-date 2026-07-15 --end-date 2026-10-15 \
  --sort-by submittedDate \
  -o results_arxiv.jsonl

python3 scripts/search_openalex.py \
  --query "QUERY" --max-results 20 --year-range 2022-2026 \
  --min-citations 5 -o results_openalex.jsonl

python3 scripts/search_crossref.py \
  --query "QUERY" --rows 10 --output results_crossref.jsonl

python3 shared-scripts/paper_db.py merge \
  --inputs results_s2.jsonl results_arxiv.jsonl results_openalex.jsonl results_crossref.jsonl \
  --output merged.jsonl

python3 shared-scripts/bibtex_manager.py \
  --jsonl merged.jsonl --output references.bib
```

CrossRef 的记录字段和另外三个来源不完全一样。合并前要先看标题是否都在 `title` 字段里；`paper_db.py` 用 `title` 做去重。

下载某篇 arXiv 源码只在 Hao 指定标题或 arXiv id 之后进行：

```bash
python3 scripts/download_arxiv_source.py --arxiv-id ARXIV_ID --metadata --output-dir arxiv_papers/
```

## 刊物层级（skill 原文）

- Tier 1：NeurIPS, ICML, ICLR, ACL, EMNLP, NAACL, CVPR, ICCV, ECCV, KDD, AAAI, IJCAI, SIGIR, WWW
- Tier 2：AISTATS, UAI, COLT, COLING, EACL, WACV, JMLR, TACL
- Tier 3：研讨会与 arXiv 预印本，标 `(preprint)`

## 脚本从哪里来

`npx skills use` 的 supporting files 只包含 `scripts/` 里的三个文件。SKILL.md 里的 Semantic Scholar、arXiv 检索、合并和 BibTeX 命令指向 `~/.claude/skills/deep-research/scripts/`。本机没有这个目录。这四个文件从同一 GitHub 仓库的 `skills/deep-research/scripts/` 取到 `shared-scripts/`，便于问题确定后按 skill 流程执行。deep-research 的其余说明和脚本没有安装。

Python 3.12 下七个脚本 `py_compile` 通过。无 `--query` 时四个检索脚本以及 `bibtex_manager.py` 退出码为 2。`paper_db.py merge` 在缺少 `--inputs` 和 `--output` 时退出码为 2。
