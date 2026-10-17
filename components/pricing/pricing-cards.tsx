"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import Link from "next/link";

type Tier = {
  id: string;
  name: string;
  blurb: string;
  price: string;
  period: string;
  includesLabel: string;
  features: string[];
  highlighted?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "hobby",
    name: "个人版",
    blurb: "适合先试用改稿与起稿的个人作者。",
    price: "免费",
    period: "起步",
    includesLabel: "个人版包含",
    features: [
      "本机改稿 / 起稿 / 存档",
      "会话密钥，正文确认后再发送",
      "基础对照与导出",
      "演示登录可用",
      "社区式支持（稍后）",
      "1 个使用席位",
    ],
  },
  {
    id: "pro",
    name: "专业版",
    blurb: "给需要更多额度与稳定模型路由的写作者。",
    price: "即将公布",
    period: "按月",
    includesLabel: "专业版包含",
    highlighted: true,
    features: [
      "个人版全部能力",
      "更高平台额度（规划中）",
      "双模型路由优先",
      "历史与导出加强",
      "优先邮件支持（规划中）",
      "最多 3 个席位（规划中）",
    ],
  },
  {
    id: "enterprise",
    name: "团队版",
    blurb: "给课题组或机构的统一开通与合规需求。",
    price: "即将公布",
    period: "按年 / 定制",
    includesLabel: "团队版包含",
    features: [
      "专业版全部能力",
      "席位与配额管理（规划中）",
      "专属对接（规划中）",
      "部署与密钥策略协商",
      "不绕过检测的合规说明",
      "无限席位（规划中）",
    ],
  },
];

export function PricingCards() {
  return (
    <div
      className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 md:grid-cols-3"
      data-testid="pricing-cards"
    >
      {TIERS.map((tier) => (
        <article
          key={tier.id}
          data-testid={`pricing-tier-${tier.id}`}
          className={cn(
            "flex flex-col overflow-hidden rounded-3xl border",
            tier.highlighted
              ? "border-white/20 bg-paper text-ink shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
              : "border-white/10 bg-zinc-900 text-paper",
          )}
        >
          <div className={cn("px-6 pb-5 pt-6", tier.highlighted ? "bg-zinc-100/80" : "bg-zinc-800/80")}>
            <h2 className="text-2xl font-semibold tracking-tight">{tier.name}</h2>
            <p
              className={cn(
                "mt-2 min-h-[2.75rem] text-sm leading-relaxed",
                tier.highlighted ? "text-ink-soft" : "text-zinc-400",
              )}
            >
              {tier.blurb}
            </p>
            <p className="mt-5 text-3xl font-semibold tracking-tight">
              {tier.price}
              <span
                className={cn(
                  "ml-2 text-sm font-normal",
                  tier.highlighted ? "text-ink-soft" : "text-zinc-400",
                )}
              >
                / {tier.period}
              </span>
            </p>
            <button
              type="button"
              disabled
              data-testid={`pricing-cta-${tier.id}`}
              className={cn(
                "mt-5 w-full cursor-not-allowed rounded-full px-4 py-2.5 text-sm font-medium",
                tier.highlighted
                  ? "bg-violet-600 text-paper opacity-90"
                  : "border border-white/25 bg-black/40 text-paper",
              )}
            >
              即将开通
            </button>
            <p className={cn("mt-2 text-center text-[11px]", tier.highlighted ? "text-ink-soft" : "text-zinc-500")}>
              暂无支付 · 占位页
            </p>
          </div>
          <div className="flex flex-1 flex-col px-6 pb-7 pt-5">
            <p
              className={cn(
                "text-[11px] font-semibold tracking-[0.16em] uppercase",
                tier.highlighted ? "text-ink-soft" : "text-zinc-500",
              )}
            >
              {tier.includesLabel}
            </p>
            <ul className="mt-4 space-y-3">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm leading-snug">
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      tier.highlighted ? "border-line text-ink-soft" : "border-white/20 text-zinc-400",
                    )}
                  >
                    <Check size={12} strokeWidth={2.5} aria-hidden />
                  </span>
                  <span className={tier.highlighted ? "text-ink" : "text-zinc-200"}>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}

export function PricingPageShell() {
  return (
    <main className="min-h-screen bg-black px-4 py-14 text-paper md:px-8 md:py-20" data-testid="pricing-page">
      <div className="mx-auto mb-10 max-w-6xl text-center">
        <p className="text-xs font-medium tracking-[0.2em] text-zinc-500 uppercase">PAGEBOND</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">会员与定价</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400 md:text-base">
          占位方案，尚未开通支付。当前可用演示登录与本机工作台；正式会员与额度稍后接入（暂无在线支付）。
        </p>
        <p className="mt-4 text-sm text-zinc-500">
          <Link href="/#app" className="text-sky-400 hover:underline">
            返回工作台
          </Link>
          {" · "}
          <Link href="/login" className="hover:text-zinc-300">
            登录
          </Link>
          {" · "}
          <Link href="/signup" className="hover:text-zinc-300">
            注册
          </Link>
        </p>
      </div>
      <PricingCards />
    </main>
  );
}
