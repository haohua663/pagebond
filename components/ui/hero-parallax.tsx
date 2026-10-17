"use client";

import React from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
  type MotionValue,
} from "motion/react";

export type HeroProduct = {
  title: string;
  accent: string;
  lines: string[];
};

const DEFAULT_PRODUCTS: HeroProduct[] = [
  {
    title: "Outline",
    accent: "linear-gradient(145deg, #fcfcfb 0%, #e9e8e3 55%, #d9d4cb 100%)",
    lines: ["I. Question", "II. Claim", "III. Evidence"],
  },
  {
    title: "Draft desk",
    accent: "linear-gradient(160deg, #f7f5f0 0%, #ebe6dc 45%, #cfc8bc 100%)",
    lines: ["Paste manuscript", "Lock key terms", "Review by block"],
  },
  {
    title: "Suggestions",
    accent: "linear-gradient(135deg, #faf9f6 0%, #e4e1d8 50%, #b8b0a4 100%)",
    lines: ["Tighten claim", "Clarify method", "Bridge sections"],
  },
  {
    title: "Compare",
    accent: "linear-gradient(150deg, #fcfcfb 0%, #f0eee8 40%, #a8c98a 100%)",
    lines: ["Original ↔ Current", "Accept / edit", "Keep your voice"],
  },
  {
    title: "Archive",
    accent: "linear-gradient(145deg, #f5f3ee 0%, #e8e4db 50%, #9a9388 100%)",
    lines: ["Version snapshots", "Export markdown", "Export docx"],
  },
  {
    title: "Conceive",
    accent: "linear-gradient(160deg, #fbfaf7 0%, #ece9e2 55%, #d4cfc6 100%)",
    lines: ["Requirements brief", "Local outline", "First structure"],
  },
  {
    title: "Literature",
    accent: "linear-gradient(140deg, #f8f7f3 0%, #e2ddd4 50%, #c4bdb2 100%)",
    lines: ["Literature hints", "Cite carefully", "Stay on question"],
  },
  {
    title: "Protections",
    accent: "linear-gradient(155deg, #fcfcfb 0%, #efece6 45%, #9ee86f55 100%)",
    lines: ["Confirm before send", "Chunk long docs", "You stay in control"],
  },
  {
    title: "Paper cards",
    accent: "linear-gradient(145deg, #faf9f5 0%, #e9e5dc 60%, #b5aea2 100%)",
    lines: ["Working title", "Article type", "Status on desk"],
  },
  {
    title: "Rewrite rail",
    accent: "linear-gradient(150deg, #f7f6f2 0%, #e6e2d9 50%, #8f887c 100%)",
    lines: ["Block-level edits", "Manual override", "Accept passed"],
  },
  {
    title: "Intake",
    accent: "linear-gradient(135deg, #fcfcfb 0%, #f1efe9 40%, #d8d2c8 100%)",
    lines: ["PDF · DOCX · MD", "Paste text", "Parse structure"],
  },
  {
    title: "Settings",
    accent: "linear-gradient(160deg, #f5f4f0 0%, #e0dcd3 55%, #6b665c 100%)",
    lines: ["API key", "Model choice", "Cost estimate"],
  },
  {
    title: "Structure",
    accent: "linear-gradient(145deg, #fbfaf8 0%, #ebe8e1 50%, #c9c3b8 100%)",
    lines: ["Headings", "Paragraphs", "Local notes"],
  },
  {
    title: "Voice",
    accent: "linear-gradient(150deg, #f9f8f4 0%, #e8e4db 45%, #a39c90 100%)",
    lines: ["Your wording", "Locked terms", "No surprise rewrite"],
  },
  {
    title: "Ship",
    accent: "linear-gradient(140deg, #fcfcfb 0%, #f0ede6 40%, #9ee86f88 100%)",
    lines: ["Stronger draft", "Clearer path", "Ready to revise"],
  },
];

function scrollToApp() {
  const el = document.getElementById("app");
  if (!el) return;
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export const HeroParallax = ({
  products = DEFAULT_PRODUCTS,
}: {
  products?: HeroProduct[];
}) => {
  const reduceMotion = useReducedMotion();
  const firstRow = products.slice(0, 5);
  const secondRow = products.slice(5, 10);
  const thirdRow = products.slice(10, 15);
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const springConfig = { stiffness: 300, damping: 30, bounce: 100 };

  const translateX = useSpring(
    useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 600]),
    springConfig,
  );
  const translateXReverse = useSpring(
    useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : -600]),
    springConfig,
  );
  const rotateX = useSpring(
    useTransform(scrollYProgress, [0, 0.25], [reduceMotion ? 0 : 12, 0]),
    springConfig,
  );
  const opacity = useSpring(
    useTransform(scrollYProgress, [0, 0.25], [reduceMotion ? 1 : 0.35, 1]),
    springConfig,
  );
  const rotateZ = useSpring(
    useTransform(scrollYProgress, [0, 0.25], [reduceMotion ? 0 : 14, 0]),
    springConfig,
  );
  const translateY = useSpring(
    useTransform(
      scrollYProgress,
      [0, 0.25],
      [reduceMotion ? 0 : -280, reduceMotion ? 0 : 180],
    ),
    springConfig,
  );

  return (
    <div
      ref={ref}
      className="hero-parallax relative flex h-[170vh] flex-col self-auto overflow-hidden bg-desk py-16 antialiased [perspective:1000px] [transform-style:preserve-3d] md:h-[180vh] md:py-24"
    >
      <Header onOpenApp={scrollToApp} />
      <motion.div
        style={
          reduceMotion
            ? { opacity: 1 }
            : { rotateX, rotateZ, translateY, opacity }
        }
        className="relative z-10"
      >
        <motion.div className="mb-12 flex flex-row-reverse space-x-12 space-x-reverse md:mb-16 md:space-x-16">
          {firstRow.map((product) => (
            <ProductCard
              product={product}
              translate={translateX}
              key={product.title}
              reduceMotion={!!reduceMotion}
            />
          ))}
        </motion.div>
        <motion.div className="mb-12 flex flex-row space-x-12 md:mb-16 md:space-x-16">
          {secondRow.map((product) => (
            <ProductCard
              product={product}
              translate={translateXReverse}
              key={product.title}
              reduceMotion={!!reduceMotion}
            />
          ))}
        </motion.div>
        <motion.div className="flex flex-row-reverse space-x-12 space-x-reverse md:space-x-16">
          {thirdRow.map((product) => (
            <ProductCard
              product={product}
              translate={translateX}
              key={product.title}
              reduceMotion={!!reduceMotion}
            />
          ))}
        </motion.div>
      </motion.div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-32 bg-gradient-to-b from-transparent to-desk"
      />
    </div>
  );
};

export const Header = ({ onOpenApp }: { onOpenApp: () => void }) => {
  return (
    <div className="relative left-0 top-0 z-30 mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-24">
      <p className="mb-6 text-sm font-semibold tracking-[0.2em] text-ink uppercase">
        PAGEBOND
      </p>
      <h1 className="max-w-4xl font-serif text-3xl leading-[1.08] font-semibold tracking-tight text-ink md:text-6xl lg:text-7xl lg:leading-[1.05]">
        From first ideas to stronger papers.
      </h1>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-ink-soft md:text-xl">
        起稿、改稿、存档 — draft, revise, and archive on a quiet desk.
        <br />
        <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
          <span>Confirm</span>
          <span>before anything reaches the model.</span>
        </span>
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onOpenApp}
          className="inline-flex h-12 min-h-11 cursor-pointer items-center justify-center rounded-xl bg-ink px-6 text-base font-medium text-paper transition-colors hover:bg-ink/90"
        >
          Open the desk
        </button>
        <a
          href="#app"
          className="inline-flex h-12 min-h-11 items-center justify-center text-base text-ink transition-colors hover:text-ink/70"
          onClick={(e) => {
            e.preventDefault();
            onOpenApp();
          }}
        >
          进入工作台
        </a>
      </div>
    </div>
  );
};

export const ProductCard = ({
  product,
  translate,
  reduceMotion,
}: {
  product: HeroProduct;
  translate: MotionValue<number>;
  reduceMotion: boolean;
}) => {
  return (
    <motion.div
      style={reduceMotion ? undefined : { x: translate }}
      whileHover={reduceMotion ? undefined : { y: -16 }}
      key={product.title}
      className="group/product relative h-64 w-[18rem] shrink-0 md:h-80 md:w-[26rem]"
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-3xl border border-line bg-paper shadow-[0_3px_8px_rgba(0,0,0,0.12)]"
        style={{ background: product.accent }}
      >
        <div className="flex h-full flex-col justify-between p-5 md:p-7">
          <div className="space-y-2">
            <div className="h-2 w-16 rounded-full bg-ink/15" />
            <div className="h-2 w-28 rounded-full bg-ink/10" />
            <div className="mt-4 space-y-2">
              {product.lines.map((line) => (
                <p
                  key={line}
                  className="font-serif text-sm leading-relaxed text-ink/70 md:text-base"
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
          <h2 className="text-lg font-medium text-ink md:text-xl">
            {product.title}
          </h2>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-3xl bg-ink/0 transition-colors group-hover/product:bg-ink/5" />
    </motion.div>
  );
};
