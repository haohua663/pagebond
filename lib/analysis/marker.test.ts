import { leadingMarker } from "@/lib/analysis/validate";
import { it, expect } from "vitest";
it("markers", () => {
  expect(leadingMarker("1.2 研究方法")).toBe("1.2");
  expect(leadingMarker("（一）背景")).toBe("（一）");
  expect(leadingMarker("第三章 结论")).toBe("第三章");
  expect(leadingMarker("2023年的数据显示")).toBe("");
  expect(leadingMarker("1. Introduction")).toBe("1.");
  expect(leadingMarker("- item")).toBe("-");
  expect(leadingMarker("一、引言")).toBe("一、");
  expect(leadingMarker("The study shows")).toBe("");
});
