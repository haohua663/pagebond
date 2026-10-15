# 脚手架校验摘要

对象：`docs/scientific-writing/draft-workspace/`（空模板，预期失败）。
Python 3.12.3；脚本无网络、无 API key。

| 日志 | 退出码 | 状态 |
|---|---:|---|
| [scaffold.json](scaffold.json) | 0 | pass，`submission_ready: false` |
| [select-unresolved.json](select-unresolved.json) | 0 | pass + `NO_PRIMARY_LOCAL_MATCH` |
| [coverage.json](coverage.json) | 1 | fail `INVALID_INPUT` |
| [validate-manuscript.json](validate-manuscript.json) | 0 | pass（结构） |
| [validate-source.json](validate-source.json) | 1 | fail |
| [validate-source-verified.json](validate-source-verified.json) | 1 | fail |
| [audit-claims.json](audit-claims.json) | 1 | fail `INVALID_INPUT` |
| [consistency.json](consistency.json) | 1 | fail，8 errors |
| [references.json](references.json) | 1 | fail |
| [authorship.json](authorship.json) | 1 | fail，27 errors |
| [lint.json](lint.json) | 1 | fail，15 errors |
| [guideline-routes.json](guideline-routes.json) | — | 全部捆绑设计的路由转储 |

Lint 只报告行号与 issue code，不回显稿件文本。
