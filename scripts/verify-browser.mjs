import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.YEYUAN_URL || "http://127.0.0.1:4721";
const out = "/tmp/yeyuan-shots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(base, { waitUntil: "networkidle" });
await page.getByText("把已经写好的论文放在这里").waitFor();
const archiveEmptyBefore = page.getByTestId("archive-empty");
await page.getByTestId("mode-archive").click();
await page.getByTestId("archive-empty").waitFor();
await page.getByTestId("mode-revise").click();

for (const width of [1440, 1024, 768, 375]) {
  await page.setViewportSize({ width, height: width < 800 ? 800 : 900 });
  await page.screenshot({ path: `${out}/empty-${width}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) errors.push(`horizontal overflow at ${width}`);
}

await page.setViewportSize({ width: 1280, height: 900 });
await page.getByTestId("intake-revise-input").setInputFiles({
  name: "feedback.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("引言\n\n课堂反馈与学习投入相关。样本为 128 名学生，满意度从 10% 上升到 15%，差异未显著。\n\n作者写道：“这不是工具，而是一面镜子。”\n"),
});
await page.getByTestId("parse-preview").waitFor();
await page.getByText("128 名").first().waitFor();

await page.getByTestId("mode-conceive").click();
await page.getByText("把论文要求或想法放在这里").waitFor();
await page.getByTestId("intake-conceive-paste").fill("题目：课堂反馈\n字数不少于 8000 字。");
await page.getByTestId("conceive-notes").fill("只用课程发的材料。");
await page.getByTestId("mode-revise").click();
await page.getByText("当前文件：feedback.txt").waitFor();
await page.getByTestId("mode-conceive").click();
const notes = await page.getByTestId("conceive-notes").inputValue();
if (!notes.includes("课程")) errors.push("conceive notes were cleared");
await page.getByTestId("mode-revise").click();

await page.getByRole("button", { name: "保存确认输入版" }).click();
await page.getByRole("button", { name: "诊断确认稿" }).click();
await page.getByTestId("model-error").waitFor();
const message = await page.getByTestId("model-error").innerText();
if (!message.includes("外发说明") && !message.includes("没有可用密钥")) errors.push(`unexpected diagnose message: ${message}`);
await page.getByRole("checkbox").first().check();
await page.getByRole("button", { name: "诊断确认稿" }).click();
await page.getByText("没有可用密钥").waitFor();
await page.screenshot({ path: `${out}/revise-no-key.png`, fullPage: true });

await page.getByTestId("mode-archive").click();
await page.getByRole("button", { name: "打开" }).waitFor();
if (await page.getByTestId("archive-empty").count()) errors.push("archive stayed empty after confirm");

if (errors.length) {
  console.error(errors.join("\n"));
  await browser.close();
  process.exit(1);
}
console.log("browser checks passed");
await browser.close();
