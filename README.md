# pagebond

pagebond 是一个在浏览器里使用的论文工作台，用来起稿、改稿和把过程留在本机。

改稿先确认解析，再诊断与分析，再按约束改写，最后由你逐段接受或撤销。起稿先整理要求和方向，再出框架。文献检索只发送检索词。没有接入查重或 AI 检测，页面上写的是「未进行外部查重／AI 检测」。

正文在你确认之前不会发给模型。模型请求从本机的 Next.js 接口发到兼容 [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat) 的网关。

## 双模型路由

| 用途 | 路由 | 默认模型 | 环境变量 |
| --- | --- | --- | --- |
| 日常：人话化、润色改写、要求整理、框架 | `daily` | `qwen3.7-plus-2026-05-26` | `QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL` |
| 深度：诊断与分析 | `deep` | `deepseek-v4-pro` | `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` |

解析顺序：该路由专用钥匙 → 通用 `LLM_*`（及旧名 `OPENROUTER_API_KEY`）→ 明确 `NO_KEY`。只配 Qwen 可跑日常；只配 DeepSeek 可跑诊断与分析。日常路径对 Qwen/百炼默认关闭 `enable_thinking`。

## 本地运行

需要 Node.js 22。

```bash
npm install
cp .env.example .env.local
```

在 `.env.local` 里填写（钥匙稍后再给也可以；缺哪条路由用到时会报错）：

```bash
QWEN_API_KEY=
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.7-plus-2026-05-26

DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro

# 可选回退
# LLM_API_KEY=
# LLM_BASE_URL=
# LLM_MODEL=
```

仍可用旧名 `OPENROUTER_API_KEY`（仅当未设置 `LLM_API_KEY` 且无专用钥匙时）。

可选：`OPENALEX_API_KEY`。不填也能检索 OpenAlex，只是匿名额度更紧。

平台密钥相关（可选，有默认值）：

```bash
PAGEBOND_DAILY_REQUEST_LIMIT=20
PAGEBOND_DAILY_TOKEN_LIMIT=200000
PAGEBOND_RATE_LIMIT_PER_MINUTE=12
```

浏览器只请求本机 `/api/...`；服务端用对应路由的密钥调兼容接口，不会把密钥下发到页面。访客用 HttpOnly cookie 记匿名额度；用户在设置里自带的会话密钥不占平台日额度。日额度按上海时区日历日重置。

```bash
npm run dev
```

开发服务在 [http://localhost:4721](http://localhost:4721)。不要改用 3000、5173 或 8080。

```bash
npm test
```

## 设置里的 API 密钥

打开右上角「设置」。API 密钥是单独的一屏：粘贴兼容 OpenAI 的 API 密钥，点「添加密钥」。也可改 Base URL 与模型标识。pagebond 会向当前 Base URL 核对密钥（OpenRouter 走 `/key`，其他网关试 `/models`），通过后才留在这次页面会话的内存里。添加完成后点「开始工作」，回到改稿或起稿。

服务端更推荐用 `.env.local` 的 `QWEN_*` / `DEEPSEEK_*` 分流；设置里的会话密钥是临时 BYOK，会覆盖该次请求的平台钥匙。

密钥不写入 localStorage，也不进存档。刷新页面后需要再添加。Base URL 与模型会记在本机 localStorage。

### 示例：阿里云百炼 Qwen（日常）

```bash
QWEN_API_KEY=sk-...
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.7-plus-2026-05-26
```

### 示例：DeepSeek（深度）

```bash
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
```

### 通用 OpenAI 兼容回退

```bash
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

## 没有密钥时

上传、粘贴、解析、段落对照和 IndexedDB 存档仍然可用。点击诊断与分析、改写或生成框架会得到明确失败，正文保持确认输入版。失败提示里可以转到设置添加密钥，或由部署方配置服务端环境变量。页面上的「样例」和「本地整理」会标明自己不是模型结果。若平台日额度用尽，会提示次日重置或改用自带密钥。

## 目录

- `app/`：页面和短请求接口
- `components/`：上传、正文、建议、存档
- `lib/document/`：解析、编号、保护项、分块、导出
- `lib/analysis/`：校验、重叠对照、建议定位
- `lib/workflows/`：起稿与改稿
- `lib/providers/`：OpenAI 兼容 LLM 客户端、双路由配置与 OpenAlex
- `skills/pagebond-revise/`、`skills/pagebond-conceive/`：可单独运行的技能，不绑定某一个安装目录
- `docs/`：开发时参考过的技能资料，不是网页本身

自动长文测试覆盖到 4 万字：段落不丢、分块不超过单块预算、检查点按块保存。超过 4 万字会停住，不截断。真实模型改写仍需要对应路由的 API 密钥（或 `LLM_API_KEY` 回退）。
