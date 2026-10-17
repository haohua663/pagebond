"use client";

import { HoverEffect, type HoverCardItem } from "@/components/ui/card-hover-effect";

export type HomeCardId =
  | "translate"
  | "revise"
  | "conceive"
  | "draw"
  | "present"
  | "archive";

const ITEMS: (HoverCardItem & { id: HomeCardId })[] = [
  {
    id: "translate",
    title: "翻译",
    description: "中英学术互译。",
  },
  {
    id: "revise",
    title: "改稿",
    description: "润色、去 AI 腔，对照改写已有文稿。",
  },
  {
    id: "conceive",
    title: "起稿",
    description: "构思、检索、写作。",
  },
  {
    id: "draw",
    title: "绘图",
    description: "学术图件方案、图注与示意图。",
  },
  {
    id: "present",
    title: "演示",
    description: "摘要/提纲生成汇报大纲与 HTML 幻灯。",
  },
  {
    id: "archive",
    title: "存档",
    description: "本机备份、历史稿件与导入导出。",
  },
];

export function HomeCards({ onSelect }: { onSelect: (id: HomeCardId) => void }) {
  return (
    <section data-testid="desk-home" aria-label="工作台主页" className="min-w-0">
      <div className="mb-2 px-2">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">选择一项工作</h2>
        <p className="mt-1 text-sm text-ink-soft">翻译、改稿、起稿、绘图、演示与存档可用。</p>
      </div>
      <HoverEffect
        items={ITEMS}
        onSelect={(item) => {
          if (item.id) onSelect(item.id as HomeCardId);
        }}
      />
    </section>
  );
}

export function ComingSoonPanel({ title }: { title: string }) {
  return (
    <section className="desk-card p-8" data-testid="coming-soon">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="mt-3 text-ink-soft">即将推出</p>
    </section>
  );
}
