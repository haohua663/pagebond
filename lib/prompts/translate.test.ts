import { describe, expect, it } from "vitest";
import { resolveTranslateDirection, translateMessages, translateSegmentMessages } from "@/lib/prompts/translate";

describe("translate prompts", () => {
  it("detects Chinese as zh-en", () => {
    expect(resolveTranslateDirection("本研究采用混合研究方法。", "auto")).toBe("zh-en");
  });

  it("detects English as en-zh", () => {
    expect(resolveTranslateDirection("This study used a mixed-methods design.", "auto")).toBe("en-zh");
  });

  it("honors explicit direction", () => {
    expect(resolveTranslateDirection("hello", "zh-en")).toBe("zh-en");
  });

  it("includes nature fidelity rules and document fence", () => {
    const { system, user, resolved } = translateMessages(
      "We observed a significant association (p < 0.05).",
      "en-zh",
    );
    expect(resolved).toBe("en-zh");
    expect(system).toContain("不摘要");
    expect(system).toContain("标题");
    expect(system).toContain("公式");
    expect(system).toContain("nature-paper-trans");
    expect(user).toContain("<document>");
  });

  it("segment messages keep ids", () => {
    const { system, user } = translateSegmentMessages([{ id: "p-001", text: "Hello." }], "en-zh");
    expect(system).toContain("segments");
    expect(user).toContain("p-001");
  });
});
