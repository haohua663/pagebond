import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pricing placeholder", () => {
  it("ships three Chinese tiers and 即将开通 CTAs without Stripe checkout", () => {
    const page = readFileSync("app/pricing/page.tsx", "utf8");
    const cards = readFileSync("components/pricing/pricing-cards.tsx", "utf8");
    expect(page).toMatch(/PricingPageShell/);
    expect(cards).toMatch(/个人版/);
    expect(cards).toMatch(/专业版/);
    expect(cards).toMatch(/团队版/);
    expect(cards).toMatch(/即将开通/);
    expect(cards).toMatch(/data-testid="pricing-cards"/);
    expect(cards).not.toMatch(/checkout\.session|loadStripe|@stripe/i);
    const rail = readFileSync("components/desk/workbench-rail.tsx", "utf8");
    expect(rail).toMatch(/href="\/pricing"/);
    expect(rail).toMatch(/会员 \/ 定价/);
  });
});
