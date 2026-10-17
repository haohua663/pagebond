import { describe, expect, it, beforeEach } from "vitest";
import {
  DEMO_LABEL,
  clearDemoSession,
  isDemoSession,
  readDemoSession,
  writeDemoSession,
} from "./demo-session";

describe("demo session stub", () => {
  beforeEach(() => {
    clearDemoSession();
  });

  it("labels itself as 演示登录 and round-trips session", () => {
    expect(DEMO_LABEL).toBe("演示登录");
    expect(readDemoSession()).toBeNull();
    const saved = writeDemoSession({ name: " Hao ", email: "Hao@Example.com" });
    expect(saved.demo).toBe(true);
    expect(saved.name).toBe("Hao");
    expect(saved.email).toBe("hao@example.com");
    expect(isDemoSession(saved)).toBe(true);
    expect(isDemoSession({ name: "x", email: "y@z.com" })).toBe(false);
    expect(readDemoSession()?.email).toBe("hao@example.com");
    clearDemoSession();
    expect(readDemoSession()).toBeNull();
  });
});
