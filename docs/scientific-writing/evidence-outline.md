# 证据大纲

按 skill：大纲只能来自已记录、且应由人打开核实过的证据。当前 `source_manifest.json` 只有未核实占位符 `E001`，`claims.csv` 的 `C001` 也未绑定真实文本，因此**没有可写入正文的大纲条目**。

## 目标或问题

unresolved。缺少经验证的研究问题。

## 各节用途

| 节 | 用途 | 可写内容 |
|---|---|---|
| Abstract | 与完成后的正文匹配 | 无 |
| Introduction | 从已核实来源建立背景与缺口 | 无 |
| Methods | 报告实际做过的事 | 无 |
| Results | 按声明顺序与分析人群报告 | 无 |
| Discussion | 只解释受支持的结果，并保留不确定性 | 无 |
| Declarations | 只插入已核实或明确不适用的声明 | 无 |
| References | 只列出已打开并核对过的条目 | 无 |

IMRAD 是否适用取决于设计和目标刊物；在设计和venue未决前不锁定结构。

## Claim 与 evidence ID

- Claims：无已核实 `C` 记录。
- Evidence：无已核实 `E` 记录。
- 占位符 `C001` / `E001` 不得出现在投稿正文中。

起草时每一条事实或数值应单独成行，并带：

```text
[claim:C001] [evidence:E001,E002]
```

`claims.csv` 存规范化行文本的 SHA-256，不存原文。人必须先打开来源再把 verification 标为 verified。

## 方法与结果 ID

- `M001`、`O001`、`R001`、`N001` 均为模板占位，本地一致性检查已拒绝。
- 分析意图（confirmatory / exploratory / descriptive / post hoc）未决。
- 不确定性未估计。

## 未决议题（不要写进正文）

1. 研究问题、设计、人群、干预/暴露、结局与时间点均未知。
2. 无已核实的先前文献，不能写“已有研究”。
3. 无方法或结果可调和。
4. 无阴性、无效、不良或不确定发现可报告——同时也不得把缺失说成“无效应”。
5. 报告规范未选；本地路由不能代替官方清单。
6. 作者、资助、伦理、数据可得性、AI 披露均未核实。
7. 图表：不需要，也无源数据。

## 适用的报告主题

未选 guideline。`reporting_coverage.json` 的 `guideline_id` 仍是 `[[TODO:guideline-id]]`，coverage check 失败。Hao 确认设计后，打开官方文件，再把各主题标为 addressed（附稿件位置）、not_applicable（附理由）或 missing。
