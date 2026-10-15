# 页缘

页缘是一个在浏览器里使用的论文工作台，用来起稿、改稿和把过程留在本机。

改稿先确认解析，再诊断，再按约束改写，最后由你逐段接受或撤销。起稿先整理要求和方向，再出框架。文献检索只发送检索词。没有接入查重或 AI 检测，页面上写的是「未进行外部查重／AI 检测」。

正文在你确认之前不会发给模型。模型请求从本机的 Next.js 接口发到 [OpenRouter](https://openrouter.ai/docs/quickstart)。默认模型是 `~openai/gpt-sol-latest`，可以在设置里改成别的明确标识。

## 本地运行

需要 Node.js 22。

```bash
npm install
cp .env.example .env.local
```

在 `.env.local` 里填写：

```bash
OPENROUTER_API_KEY=你的密钥
```

可选：`OPENALEX_API_KEY`。不填也能检索 OpenAlex，只是匿名额度更紧。

```bash
npm run dev
```

开发服务在 [http://localhost:4721](http://localhost:4721)。不要改用 3000、5173 或 8080。

```bash
npm test
```

## 没有密钥时

上传、粘贴、解析、段落对照和 IndexedDB 存档仍然可用。点击诊断、改写、分析或生成框架会得到明确失败，正文保持确认输入版。页面上的「样例」和「本地整理」会标明自己不是模型结果。

页面里另填的密钥只留在这次会话的内存中，不写入 localStorage，也不会被服务端密钥悄悄覆盖。存档备份不含密钥。

## 目录

- `app/`：页面和短请求接口
- `components/`：上传、正文、建议、存档
- `lib/document/`：解析、编号、保护项、分块、导出
- `lib/analysis/`：校验、重叠对照、建议定位
- `lib/workflows/`：起稿与改稿
- `lib/providers/`：OpenRouter 与 OpenAlex
- `skills/yeyuan-revise/`、`skills/yeyuan-conceive/`：可单独运行的技能，不绑定某一个安装目录
- `docs/`：开发时参考过的技能资料，不是网页本身

自动长文测试覆盖到 4 万字：段落不丢、分块不超过单块预算、检查点按块保存。超过 4 万字会停住，不截断。真实模型改写仍需要 `OPENROUTER_API_KEY`。
