# 报告规范路由（非打分）

本地选择器更新日期：2026-10-01。它只给出候选 ID，**不证明**质量、完整性、合规或录用。Hao 确认实际设计后，必须打开官方声明、清单、解释文件、相关扩展和目标刊物说明。无本地匹配时去 [EQUATOR](https://www.equator-network.org/) 查找，不要硬套最近的一条。

当前稿件设计：`unresolved-design` → `NO_PRIMARY_LOCAL_MATCH`。

## 主路径

| `study_design` | 主 guideline | 方案稿 | 常见扩展 |
|---|---|---|---|
| `randomized_trial`, `pilot_randomized_trial` | CONSORT 2025 | SPIRIT 2025 | CONSORT-AI / SPIRIT-AI（加 `--ai`） |
| `systematic_review`, `meta_analysis` | PRISMA 2020 | （本地无 protocol 主路径） | 见官方 PRISMA / EQUATOR 扩展 |
| `cohort`, `case_control`, `cross_sectional`, `observational` | STROBE | — | 按设计选 STROBE 分表 |
| `diagnostic_accuracy` | STARD 2015 | — | STARD-AI（`--ai`） |
| `prediction_model`, `diagnostic_prediction_model`, `prognostic_prediction_model` | TRIPOD+AI 2024 | — | TRIPOD-LLM（`--ai --llm`） |
| `case_report` | CARE 2013 | — | — |
| `animal_in_vivo` | ARRIVE 2.0 | — | — |
| `quality_improvement` | SQUIRE 2.0 | — | — |
| `health_economic_evaluation` | CHEERS 2022 | — | — |
| `qualitative` | SRQR 2014 | — | 核是否更适合 COREQ 等 |

学位论文、综述、方法学论文或工程报告可能没有上述匹配。那时不要假装是临床试验或观察性研究。

## 官方入口

| ID | 名称 | URL |
|---|---|---|
| `consort-2025` | CONSORT 2025 | https://www.consort-spirit.org/ |
| `spirit-2025` | SPIRIT 2025 | https://www.consort-spirit.org/ |
| `consort-ai-2020` | CONSORT-AI | https://www.equator-network.org/reporting-guidelines/consort-artificial-intelligence/ |
| `spirit-ai-2020` | SPIRIT-AI | https://www.equator-network.org/reporting-guidelines/spirit-artificial-intelligence/ |
| `prisma-2020` | PRISMA 2020 | https://www.prisma-statement.org/prisma-2020 |
| `strobe-2007` | STROBE | https://www.strobe-statement.org/checklists/ |
| `stard-2015` | STARD 2015 | https://resources.equator-network.org/reporting-guidelines/stard |
| `stard-ai-2025` | STARD-AI | https://www.nature.com/articles/s41591-025-03953-8 |
| `tripod-ai-2024` | TRIPOD+AI | https://www.tripod-statement.org/ |
| `tripod-llm-2025` | TRIPOD-LLM | https://www.tripod-statement.org/ |
| `care-2013` | CARE | https://www.care-statement.org/checklist |
| `arrive-2.0-2020` | ARRIVE 2.0 | https://arriveguidelines.org/arrive-guidelines |
| `squire-2.0-2015` | SQUIRE 2.0 | https://www.squire-statement.org/index.cfm?fuseaction=page.viewPage&pageID=471&nodeID=1 |
| `cheers-2022` | CHEERS 2022 | https://www.ispor.org/heor-resources/good-practices/article/consolidated-health-economic-evaluation-reporting-standards-2022-cheers-2022-statement-updated-reporting-guidance-for-health-economic-evaluations |
| `srqr-2014` | SRQR | https://www.equator-network.org/reporting-guidelines/srqr/ |

确认设计后：

```bash
python3 scripts/select_reporting_guidelines.py select --study-design <design>
# 需要时追加 --protocol --ai --llm --routinely-collected --qualitative-component
```

完整选择器输出见 [audit-logs/guideline-routes.json](audit-logs/guideline-routes.json)。
