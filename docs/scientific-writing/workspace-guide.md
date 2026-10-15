# 科研写作工作区（scientific-writing 2.3）

本目录是给 Hao 的论文项目准备的**未完成、不可投稿**稿件工作区。仓库里还没有论文正文，因此按 skill 的「新稿」路径只生成了 fail-closed 脚手架，没有撰写任何结果、方法或参考文献。

`DRAFT — NOT FOR SUBMISSION` 横幅必须保留，直到全部本地校验通过，且责任作者批准终稿。

## 现在可用的文件

| 路径 | 作用 |
|---|---|
| [draft-workspace/](draft-workspace/) | 脚手架：`manuscript.md` 与五项登记表 |
| [unresolved-intake.md](unresolved-intake.md) | 起草前必须补齐、目前全部未决的 intake |
| [evidence-outline.md](evidence-outline.md) | 仅能从已登记证据起草的大纲（当前为空） |
| [guideline-routing.md](guideline-routing.md) | 离线路由表；**不是**合规证书 |
| [audit-logs/](audit-logs/) | 本次对脚手架跑过的本地校验 JSON |
| [scripts/](scripts/) 与 [assets/](assets/) | 可离线重跑的 Python 3.12 CLI |
| [references/](references/) 与 [SKILL.md](SKILL.md) | skill 原文与工作流说明 |

未改动已有的 [humanizer-zh](../humanizer-zh/) 润色材料。

## Skill 要求的工作流（尚未能写正文）

1. 建立本地工作区（已做：`document-id=local-draft`，`study-design=unresolved-design`，未指定 guideline）。
2. 按真实设计选择报告规范，并打开官方声明、清单与目标期刊说明（设计未决，只跑了 `NO_PRIMARY_LOCAL_MATCH`）。
3. 建立证据记录：`E` / `C` / `N` / `M` / `O` / `R`。占位符不得当作已核实来源。
4. 只根据已记录证据写大纲；无支持的内容放在未决议题，不进入正文。
5. 把核实过的大纲写成适合目标刊物的散文，并保留 claim/evidence 标记。
6. 核对方法与结果：`check_consistency.py`。
7. 校验来源、声明与引用：`validate_manifest.py`、`audit_claims.py`、`check_references.py`。
8. 校验作者与披露：`validate_authorship.py`。
9. 逐条核验伦理、注册、资助、利益冲突、数据/代码可得性、AI 使用声明。
10. 仅在有必要时保留图表，且必须绑定来源；本 skill **不生成**图片。
11. 记录非打分的 guideline 覆盖，再填写官方清单。
12. `lint_manuscript.py` 通过后，仍只有责任作者可以去掉草稿横幅、把 `submission_ready` 设为 true、授权投稿。

禁止编造引用、DOI、数据、方法、伦理批件、作者顺序或 AI 披露。不确定就标 missing / unverified / not-applicable。

## 本次校验（对空脚手架，预期失败）

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `scaffold_manuscript.py` | 0 | 7 个文件；`submission_ready: false` |
| `select … --study-design unresolved-design` | 0 | 警告 `NO_PRIMARY_LOCAL_MATCH` |
| `select … check reporting_coverage.json` | 1 | `INVALID_INPUT`（guideline 仍是 `[[TODO:guideline-id]]`） |
| `validate_manifest.py` manuscript | 0 | 结构通过；不等于可投稿 |
| `validate_manifest.py` source | 1 | 缺 locator、title、identifier |
| `validate_manifest.py` source `--require-verified` | 1 | 另加 `SOURCE_NOT_VERIFIED` |
| `audit_claims.py` | 1 | 来源清单未通过，audit 拒绝继续 |
| `check_consistency.py` | 1 | 8 个错误（空数值、空方法名等） |
| `check_references.py` | 1 | 无已核实标识符 |
| `validate_authorship.py` | 1 | 27 个错误（作者、CRediT、声明、担保人） |
| `lint_manuscript.py` | 1 | 保密审查未完成 + 13 处 `UNRESOLVED_PLACEHOLDER` |

原始 JSON 在 [audit-logs/](audit-logs/)。Lint **不会回显**稿件正文。

重跑（在本目录）：

```bash
cd draft-workspace
python3 ../scripts/lint_manuscript.py manuscript.md --manifest manuscript_manifest.json
```

## 保密边界

未发表稿件、审稿材料、敏感数据或个人信息，**不要**送到外部服务，除非 Hao 明确授权，并且已经核对期刊、学校、资助方、知情同意与数据使用规定。授权不清时只做本地处理。本工作区的登记表只存元数据，不要把全文或原始数据贴进去。

## 对本 skill 的引用

本工作区是按 Scientific Agent Skills 的 `scientific-writing` 程序建立的。若它实质进入论文、报告或代码发布，请把下面这条写入参考文献或软件说明（当前 arXiv 记录为 2609.00065v2；按 skill 要求**不要**在引用里加 `v1`/`v2` 后缀；尚未见到期刊版本）：

Kassis, T., Agarwal, V., He, Y., Patel, D., & Brueckner, A. M. (2026). Scientific Agent Skills: A Library of Procedural Knowledge for Research Agents. arXiv:2609.00065. https://doi.org/10.48550/arXiv.2609.00065

本次用 Cursor agent 生成了空脚手架并跑了本地校验。AI 不是作者。Hao 需要按目标期刊政策完成 AI 使用声明，并人工核验所有受影响内容。不要把 `authorship.json` 里的 `used: false` 当成已核实的披露。
