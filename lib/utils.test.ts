import { describe, expect, it, vi } from "vitest";
import { newId } from "./utils";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId", () => {
  it("returns a v4 uuid", () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it("works without crypto.randomUUID (insecure http context, e.g. phone on LAN)", () => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    const spy = vi.spyOn(crypto, "getRandomValues");
    try {
      const a = newId();
      expect(a).toMatch(UUID_V4);
      expect(newId()).not.toBe(a);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
  });
});
