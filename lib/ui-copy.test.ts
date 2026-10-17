import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(tsx|ts)$/.test(name) ? [full] : [];
  });
}

describe("interface copy", () => {
  it("does not call literal overlap a detection rate", () => {
    const sources = [...files("components"), ...files("app")].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(sources).not.toMatch(/查重率|AI\s*检测率|GPTZero|知网|Turnitin/);
    const ui = files("components").map((file) => readFileSync(file, "utf8")).join("\n");
    expect(ui).not.toMatch(/未进行外部查重／AI 检测/);
    expect(ui).not.toMatch(/未做查重；不绕过检测/);
    expect(ui).not.toMatch(/密钥只留在这次会话里/);
    expect(sources).not.toMatch(/查重率|绕过检测器|绕过 AI 检测/);
  });

  it("merges diagnose/analyze into one 诊断与分析 action on the revise desk", () => {
    const desk = readFileSync("components/desk/desk-app.tsx", "utf8");
    expect(desk).not.toMatch(/诊断确认稿|分析当前稿/);
    expect(desk).toMatch(/data-testid="revise-analyze"/);
    expect(desk).toMatch(/>\s*诊断与分析\s*</);
    expect(desk).toMatch(/诊断与分析结果/);
    expect(desk).toMatch(/data-testid="manuscript-collapse"/);
    expect(desk).toMatch(/data-testid="download-revise-docx"/);
    expect(desk).toMatch(/data-testid="download-analysis-docx"/);
    expect(desk).toMatch(/>\s*下载改稿\s*</);
    expect(desk).toMatch(/>\s*下载分析\s*</);
    expect(desk).not.toMatch(/下载建议修改稿|下载已确认稿|附上人工智能使用说明/);
    expect(desk).not.toMatch(/接受已通过的修改/);
    expect(desk).toMatch(/\["current", "改稿"\]/);
    expect(desk).not.toMatch(/解析预览|锁定术语|parse-preview/);
    expect(desk).toMatch(/data-testid="revise-options"/);
    expect(desk).toMatch(/文章类型/);
    expect(desk).toMatch(/改写档位/);
    expect(desk).toMatch(/目标用途/);
    expect(desk).toMatch(/>\s*确认输入\s*</);
    expect(desk).not.toMatch(/保存确认输入版/);
    expect(desk).not.toMatch(/data-testid="missing-key-notice"/);
    expect(desk).toMatch(/还没有可用密钥。可在设置里添加，或由部署方配置/);
    expect(desk).not.toMatch(/本地解析和存档仍可用/);
    expect(desk).not.toMatch(/data-testid="desk-work-status"/);
    expect(desk).not.toMatch(/已完成标题|待复核/);
    expect(desk).not.toMatch(/data-testid="desk-status-layout-toggle"/);
    expect(desk).not.toMatch(/竖向排列|横向排列|pagebond\.statusVertical/);
    expect(desk).not.toMatch(/desk-callout mt-3 flex flex-wrap items-start/);
    expect(desk).not.toMatch(/改写流水线会先做/);
    expect(desk).not.toMatch(/data-testid="revise-disclaimer"/);
    expect(desk).not.toMatch(/无服务器数据库，但会离开浏览器/);
    expect(desk).not.toMatch(/已用自动长文测试验证到/);
    expect(desk).not.toMatch(/确认输入版会从浏览器发到本机服务/);
    expect(desk).not.toMatch(/费用估算/);
    expect(desk).not.toMatch(/\["current", "当前稿"\]/);
  });


  it("keeps short missing-key copy on settings", () => {
    const settings = readFileSync("components/settings/api-key-panel.tsx", "utf8");
    expect(settings).toMatch(/还没有可用密钥。可在此添加，或由部署方配置/);
    expect(settings).not.toMatch(/QWEN_API_KEY \/ DEEPSEEK_API_KEY/);
  });


  it("hides interface/model editor from settings UI", () => {
    const settings = readFileSync("components/settings/api-key-panel.tsx", "utf8");
    expect(settings).not.toMatch(/接口与模型/);
    expect(settings).not.toMatch(/llm-base-url-input/);
    expect(settings).not.toMatch(/模型标识/);
    expect(settings).toMatch(/data-testid="api-key-input"/);
    expect(settings).toMatch(/添加密钥/);
  });


  it("offers a Chinese settings entry instead of scroll-to-notes", () => {
    const landing = readFileSync("components/landing/home-shell.tsx", "utf8");
    const deskSrc = readFileSync("components/desk/desk-app.tsx", "utf8");
    expect(landing).not.toMatch(/Scroll to notes/);
    expect(readFileSync("components/desk/desk-app.tsx", "utf8")).not.toMatch(/核对通过后，点开始工作/);
    expect(landing).toMatch(/data-testid="open-settings-entry"/);
    expect(landing).toMatch(/>\s*settings\s*</);
    expect(landing).toMatch(/pagebond:open-settings/);
    expect(deskSrc).toMatch(/pagebond:open-settings/);
  });


  it("scrolls to desk app after confirm input", () => {
    const deskSrc = readFileSync("components/desk/desk-app.tsx", "utf8");
    expect(deskSrc).toMatch(/async function confirmRevise/);
    expect(deskSrc).toMatch(/getElementById\("app"\)/);
    expect(deskSrc).toMatch(/>\s*确认输入\s*</);
  });


  it("strips session-key and no-bypass tip microcopy from settings rail", () => {
    const deskSrc = readFileSync("components/desk/desk-app.tsx", "utf8");
    expect(deskSrc).not.toMatch(/密钥只留在这次会话里/);
    expect(deskSrc).not.toMatch(/未做查重；不绕过检测/);
    expect(deskSrc).not.toMatch(/文章润色,去AI化/);
    expect(deskSrc).not.toMatch(/data-testid="revise-disclaimer"/);
    expect(deskSrc).toMatch(/WorkbenchRail/);
    expect(deskSrc).toMatch(/HomeCards/);
    expect(deskSrc).toMatch(/ComingSoonPanel/);
    const rail = readFileSync("components/desk/workbench-rail.tsx", "utf8");
    const home = readFileSync("components/desk/home-cards.tsx", "utf8");
    expect(rail).toMatch(/data-testid="workbench-rail"/);
    expect(home).toMatch(/data-testid="desk-home"/);
    expect(home).toMatch(/即将推出/);
  });


  it("auto-sets consent on confirm input to current scopeKey", () => {
    const deskSrc = readFileSync("components/desk/desk-app.tsx", "utf8");
    expect(deskSrc).toMatch(/const consentKey =/);
    expect(deskSrc).toMatch(/contentVersion\(confirmed\.blocks\)/);
    expect(deskSrc).toMatch(/consent: consentKey/);
    expect(deskSrc).not.toMatch(/consent: event\.target\.checked \? scopeKey/);
  });


  it("switches to analysis tab after diagnose/analyze", () => {
    const deskSrc = readFileSync("components/desk/desk-app.tsx", "utf8");
    expect(deskSrc).toMatch(/view: "analysis" as const/);
    expect(deskSrc).toMatch(/state\.view === "analysis"/);
  });


  it("removes long manuscript plagiarism callout from desk pane", () => {
    const pane = readFileSync("components/manuscript/manuscript-pane.tsx", "utf8");
    const desk = readFileSync("components/desk/desk-app.tsx", "utf8");
    expect(pane).not.toMatch(/下面只标出哪些表达变了/);
    expect(pane).not.toMatch(/未进行外部查重／AI 检测。下面只标出/);
    expect(desk).not.toMatch(/未做查重；不绕过检测/);
  });


  it("offers per-segment compare focus with side-by-side panels", () => {
    const pane = readFileSync("components/manuscript/manuscript-pane.tsx", "utf8");
    expect(pane).toMatch(/data-testid="compare-focus"/);
    expect(pane).toMatch(/data-testid="compare-segment-select"/);
    expect(pane).toMatch(/data-testid="compare-side-by-side"/);
    expect(pane).toMatch(/选择段落/);
    expect(pane).toMatch(/原文/);
    expect(pane).toMatch(/改文/);
    expect(pane).toMatch(/block\.kind !== "heading"/);
    expect(pane).toMatch(/changedSentencePairs/);
    expect(pane).not.toMatch(/const kind = item\.kind === "heading"/);
  });


it("conceives into a focused work surface without 修正要求文本", () => {
    const desk = readFileSync("components/desk/desk-app.tsx", "utf8") + "\n" + readFileSync("components/conceive/conceive-panel.tsx", "utf8");
    expect(desk).not.toMatch(/修正要求文本/);
    expect(desk).toMatch(/data-testid="conceive-setup"/);
    expect(desk).toMatch(/data-testid="conceive-work"/);
    expect(desk).toMatch(/data-testid="conceive-back"/);
    expect(desk).not.toMatch(/data-testid="conceive-clear"/);
    expect(desk).toMatch(/>\s*返回\s*</);
    expect(desk).not.toMatch(/清除已提交要求/);
    expect(desk).toMatch(/entryChoice|title: "构思"/);
  });



  it("removes sample entry points and SuggestionRail plagiarism line", () => {
    const desk = readFileSync("components/desk/desk-app.tsx", "utf8");
    const rail = readFileSync("components/suggestions/suggestion-rail.tsx", "utf8");
    expect(desk).not.toMatch(/看一份样例，不调用模型/);
    expect(desk).not.toMatch(/填入样例要求/);
    expect(desk).not.toMatch(/查看样例批注|关闭样例批注/);
    expect(rail).not.toMatch(/未进行外部查重／AI 检测/);
    expect(desk).not.toMatch(/未做查重；不绕过检测/);
  });


  it("scrolls desk via window.document helpers without shadowing parseProse", () => {
    const desk = readFileSync("components/desk/desk-app.tsx", "utf8");
    expect(desk).toMatch(/function scrollDeskApp/);
    expect(desk).toMatch(/function scrollDeskBlock/);
    expect(desk).toMatch(/window\.document\.getElementById/);
    expect(desk).toMatch(/typeof window === "undefined"/);
    expect(desk).not.toMatch(/const document = parseProse/);
    expect(desk).toMatch(/const parsedDoc = parseProse/);
  });


it("merges conceive organize into one button and separates framework from search", () => {
    const desk = readFileSync("components/desk/desk-app.tsx", "utf8") + "\n" + readFileSync("components/conceive/conceive-panel.tsx", "utf8");
    expect(desk).toMatch(/data-testid="conceive-organize"/);
    expect(desk).toMatch(/整理要求/);
    expect(desk).not.toMatch(/整理要求与方向/);
    expect(desk).not.toMatch(/只做本地整理/);
    expect(desk).not.toMatch(/onLocal/);
    expect(desk).toMatch(/data-testid="conceive-outline"/);
    expect(desk).toMatch(/data-testid="conceive-outline-result"/);
    expect(desk).toMatch(/data-testid="conceive-search"/);
    expect(desk).toMatch(/data-testid="conceive-search-run"/);
    expect(desk).toMatch(/检索/);
    expect(desk).toMatch(/已改为本地整理|还没有可用密钥|生成本地/);
    expect(desk).toMatch(/data-testid="conceive-organize-panel"/);
    expect(desk).toMatch(/"ideate"/);
    expect(desk).toMatch(/"search"/);
    expect(desk).toMatch(/"write"/);
    expect(desk).not.toMatch(/searchOpen/);
    expect(desk).toMatch(/data-testid="conceive-work"/);
    expect(desk).toMatch(/data-testid="conceive-write"/);
    expect(desk).toMatch(/data-testid="conceive-outline-directions"/);
    expect(desk).not.toMatch(/name="outline-direction"/);
    expect(desk).not.toMatch(/name="direction"/);
    expect(desk).not.toMatch(/scrollConceivePanel/);
    expect(desk).toMatch(/await persist\(reviseRecord\(next, "pending"\), "revise"\);\s*scrollDeskApp\(\)/);
    expect(desk).toMatch(/\/api\/conceive\/requirements/);
    expect(desk).toMatch(/data-testid="conceive-tabs"|title: "构思"/);
    expect(desk).toMatch(/\/api\/conceive\/draft/);
    expect(desk).toMatch(/WRITE_FIELD_OPTIONS|conceive-field-natural/);
  });



it("shows conceive 想法补充 only on work surface after intake", () => {
    const desk = readFileSync("components/desk/desk-app.tsx", "utf8") + "\n" + readFileSync("components/conceive/conceive-panel.tsx", "utf8");
    expect(desk).toMatch(/把论文要求放在这里/);
    expect(desk).not.toMatch(/把论文要求或想法放在这里/);
    const setupStart = desk.indexOf('data-testid="conceive-setup"');
    const workStart = desk.indexOf('data-testid="conceive-work"');
    expect(setupStart).toBeGreaterThan(0);
    expect(workStart).toBeGreaterThan(setupStart);
    expect(desk.slice(setupStart, workStart)).not.toMatch(/想法补充/);
    expect(desk.slice(setupStart, workStart)).not.toMatch(/conceive-notes/);
    expect(desk.slice(workStart, workStart + 2500)).toMatch(/想法补充/);
    expect(desk.slice(workStart, workStart + 2500)).toMatch(/data-testid="conceive-notes"/);
  });



  it("hides direction radio cards from organize brief", () => {
    const desk = readFileSync("components/desk/desk-app.tsx", "utf8") + "\n" + readFileSync("components/conceive/conceive-panel.tsx", "utf8");
    const prompts = readFileSync("lib/prompts/conceive.ts", "utf8");
    expect(desk).toMatch(/data-testid="conceive-brief"/);
    expect(desk).not.toMatch(/name="direction"/);
    expect(desk).not.toMatch(/name="outline-direction"/);
    expect(desk).not.toMatch(/onDirection/);
    expect(desk).not.toMatch(/仅展示/);
    expect(desk).not.toMatch(/框架已自动采用第一条/);
    expect(desk).toMatch(/>\s*可行方向\s*</);
    expect(desk).toMatch(/data-testid="conceive-outline-directions"/);
    expect(desk).toMatch(/item\.question/);
    expect(desk).toMatch(/brief\.directions\[0\]\?\.title/);
    expect(prompts).toMatch(/发散思考/);
    expect(prompts).not.toMatch(/directions 留空数组/);
    expect(desk).toMatch(/function scrollElementToViewportCenter/);
    expect(desk).toMatch(/durationMs = 1000/);
    expect(desk).toMatch(/function scheduleOutlinePanelScroll/);
    expect(desk).toMatch(/scheduleOutlinePanelScroll\(\)/);
    expect(desk).not.toMatch(/outlineWasRunning/);
    expect(desk).not.toMatch(/setTimeout\(\(\) => \{\s*const el = window\.document\.getElementById\("conceive-outline-result"\)/);
    expect(desk).not.toMatch(/setTimeout\(\(\) => \{\s*const el = window\.document\.getElementById\("revise-options"\)/);
  });

  it("scrolls 确认选项 into view after revise paste or file load", () => {
    const desk = readFileSync("components/desk/desk-app.tsx", "utf8");
    expect(desk).toMatch(/function scheduleReviseOptionsScroll/);
    expect(desk).toMatch(/getElementById\("revise-options"\)/);
    expect(desk).toMatch(/id="revise-options"/);
    expect(desk).toMatch(/scheduleReviseOptionsScroll\(\)/);
    expect(desk).toMatch(/scrollElementToViewportCenter\(el, 1000\)/);
    const calls = desk.split("scheduleReviseOptionsScroll()").length - 1;
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("conceives without auto-archive except explicit 存入存档", () => {
    const desk = readFileSync("components/desk/desk-app.tsx", "utf8") + "\n" + readFileSync("components/conceive/conceive-panel.tsx", "utf8");
    expect(desk).toMatch(/onSave=\{\(\) => void saveConceive\(\)\}/);
    expect(desk).not.toMatch(/await saveConceive/);
    expect(desk).not.toMatch(/if \(outline && conceive\.paperId\)/);
    expect(desk).toMatch(/>\s*存入存档\s*</);
    expect(desk).toMatch(/data-testid="conceive-back"/);
    expect(desk).not.toMatch(/清除已提交要求/);
  });

});
