import type { Metadata } from "next";
import { PricingPageShell } from "@/components/pricing/pricing-cards";

export const metadata: Metadata = {
  title: "会员与定价 · PAGEBOND",
  description: "Pagebond 会员档位占位页。暂未开通支付。",
};

export default function PricingPage() {
  return <PricingPageShell />;
}
