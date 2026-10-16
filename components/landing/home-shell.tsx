"use client";

import { DeskApp } from "@/components/desk/desk-app";
import { HeroParallax } from "@/components/ui/hero-parallax";
import { InfiniteMovingCards } from "@/components/ui/infinite-moving-cards";

const PAPER_QUOTES = [
  {
    quote:
      "Start with the question you can actually answer — then let the outline follow.",
    name: "Desk note",
    title: "Conceive",
  },
  {
    quote:
      "改稿不是重写整篇：按块审阅，锁住术语，保留你自己的语气。",
    name: "工作台备忘",
    title: "Revise",
  },
  {
    quote:
      "A stronger paper often comes from clearer section bridges, not more adjectives.",
    name: "Structure cue",
    title: "Suggestions",
  },
  {
    quote:
      "确认之前不把正文发给模型 — confirm first, then send only what you chose.",
    name: "PAGEBOND",
    title: "Protections",
  },
  {
    quote:
      "Archive versions as you go. Tomorrow-you will thank today-you.",
    name: "Archive tip",
    title: "Snapshots",
  },
  {
    quote:
      "Evidence belongs next to the claim it supports — keep them within sight.",
    name: "Method note",
    title: "Drafting",
  },
  {
    quote:
      "从想法到成稿：先结构，再段落，最后润色。",
    name: "写作顺序",
    title: "Flow",
  },
  {
    quote:
      "Export when ready — markdown for git, docx for the journal portal.",
    name: "Ship checklist",
    title: "Export",
  },
];

export function HomeShell() {
  return (
    <div className="min-h-screen bg-desk text-ink">
      <HeroParallax />

      <section
        id="app"
        aria-label="PAGEBOND desk"
        className="relative scroll-mt-8 border-t border-line bg-desk"
      >
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-4 px-4 pb-2 pt-8 md:px-8">
          <div className="flex items-end gap-3.5">
            <svg
              viewBox="0 0 48 36"
              className="h-11 w-auto shrink-0 text-ink md:h-12"
              aria-hidden
              focusable="false"
            >
              <rect x="2" y="2" width="10" height="32" rx="5" fill="currentColor" />
              <rect x="16" y="2" width="10" height="32" rx="5" fill="currentColor" />
              <g transform="rotate(14 37 18)">
                <rect x="30" y="2" width="10" height="32" rx="5" fill="currentColor" />
              </g>
            </svg>
            <div>
              <p className="text-[0.7rem] font-medium tracking-[0.18em] text-ink-soft uppercase md:text-xs">
                Workbench
              </p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
                Your desk
              </h2>
            </div>
          </div>
          <button
            type="button"
            data-testid="open-settings-entry"
            className="cursor-pointer self-end pb-1 text-sm text-ink-soft hover:text-ink"
            onClick={() => {
              document.getElementById("app")?.scrollIntoView({ behavior: "smooth", block: "start" });
              window.dispatchEvent(new Event("pagebond:open-settings"));
            }}
          >
            Settings
          </button>
        </div>
        <DeskApp />
      </section>

      <footer className="border-t border-line bg-paper">
        <div id="footer-cards" className="scroll-mt-8 py-16 md:py-24">
          <div className="mx-auto mb-10 max-w-7xl px-4 md:px-8">
            <p className="text-xs font-medium tracking-[0.2em] text-ink-soft uppercase">
              PAGEBOND
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink md:text-3xl">
              Notes from the desk
            </h2>
            <p className="mt-3 max-w-xl text-sm text-ink-soft md:text-base">
              Writing cues — not product reviews. Keep the question close; revise
              in small steps.
            </p>
          </div>
          <div className="flex justify-center px-2">
            <InfiniteMovingCards
              items={PAPER_QUOTES}
              direction="left"
              speed="slow"
              className="w-full"
            />
          </div>
        </div>

        <div className="border-t border-line bg-desk">
          <p className="mx-auto max-w-7xl px-4 py-8 text-sm text-ink-soft md:px-8">
            Found an issue? Email me at:{" "}
            <a
              href="mailto:haohua663@gmail.com"
              className="text-ink underline-offset-4 hover:underline"
            >
              haohua663@gmail.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
