export type DeckSlideKind = "title" | "section" | "body" | "close";

export type DeckLayout =
  | "title-hero"
  | "section-bleed"
  | "body-stack"
  | "body-split"
  | "body-band"
  | "body-grid"
  | "body-chart"
  | "close-field";

export type DeckVisualType = "bars" | "flow" | "callout" | "compare" | "steps" | "none";

export type DeckVisualItem = {
  label: string;
  value?: number;
};

export type DeckVisual = {
  type?: DeckVisualType | string;
  metric?: string;
  caption?: string;
  items?: DeckVisualItem[];
};

export type DeckSlide = {
  id: string;
  title: string;
  bullets: string[];
  notes?: string;
  kind?: DeckSlideKind | string;
  layout?: DeckLayout | string;
  visual?: DeckVisual | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeKind(kind: string | undefined, index: number, total: number): DeckSlideKind {
  if (kind === "title" || kind === "section" || kind === "body" || kind === "close") return kind;
  if (index === 0) return "title";
  if (index === total - 1) return "close";
  return "body";
}

function resolveLayout(slide: DeckSlide, kind: DeckSlideKind, index: number): DeckLayout {
  const raw = typeof slide.layout === "string" ? slide.layout : "";
  const allowed: DeckLayout[] = [
    "title-hero",
    "section-bleed",
    "body-stack",
    "body-split",
    "body-band",
    "body-grid",
    "body-chart",
    "close-field",
  ];
  if ((allowed as string[]).includes(raw)) return raw as DeckLayout;
  if (kind === "title") return "title-hero";
  if (kind === "section") return "section-bleed";
  if (kind === "close") return "close-field";
  const visualType = slide.visual?.type;
  if (visualType === "bars" || visualType === "callout") return "body-chart";
  if (visualType === "compare") return "body-split";
  if (visualType === "steps" || visualType === "flow") return "body-band";
  const cycle: DeckLayout[] = ["body-chart", "body-grid", "body-split", "body-band", "body-stack"];
  return cycle[Math.max(0, index - 1) % cycle.length];
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** Infer a visual when the model omitted one — keeps slides from being sparse bullet lists. */
function ensureVisual(slide: DeckSlide, kind: DeckSlideKind): DeckVisual {
  const v = slide.visual;
  if (v && v.type && v.type !== "none") {
    return {
      type: v.type,
      metric: v.metric,
      caption: v.caption,
      items: Array.isArray(v.items) ? v.items : [],
    };
  }
  const bullets = (slide.bullets || []).map((b) => b.trim()).filter(Boolean);
  if (kind === "title" || kind === "close") {
    return { type: "none", items: [] };
  }
  if (kind === "section") {
    return {
      type: "steps",
      items: bullets.slice(0, 4).map((label) => ({ label })),
    };
  }
  if (bullets.length >= 3) {
    return {
      type: "bars",
      caption: "示意强度（非实测）",
      items: bullets.slice(0, 4).map((label, i) => ({
        label: label.length > 18 ? `${label.slice(0, 16)}…` : label,
        value: 88 - i * 18,
      })),
    };
  }
  if (bullets.length === 2) {
    return {
      type: "compare",
      items: [{ label: bullets[0] }, { label: bullets[1] }],
    };
  }
  return {
    type: "callout",
    metric: "→",
    caption: bullets[0] || slide.title,
    items: [],
  };
}

function renderBarsSvg(items: DeckVisualItem[]): string {
  const rows = items.slice(0, 5);
  if (!rows.length) return "";
  const h = 28 + rows.length * 42;
  const bars = rows
    .map((item, i) => {
      const y = 16 + i * 42;
      const w = Math.round((clamp01(item.value ?? 50) / 100) * 220);
      return `<text x="0" y="${y}" class="chart-label">${escapeHtml(item.label)}</text>
      <rect x="0" y="${y + 8}" width="240" height="14" rx="7" class="chart-track"/>
      <rect x="0" y="${y + 8}" width="${w}" height="14" rx="7" class="chart-bar"/>`;
    })
    .join("");
  return `<svg class="viz-svg" viewBox="0 0 260 ${h}" role="img" aria-label="示意柱状图">${bars}</svg>`;
}

function renderFlowSvg(items: DeckVisualItem[]): string {
  const nodes = items.slice(0, 4).map((i) => i.label);
  if (nodes.length < 2) return "";
  const w = 320;
  const step = w / nodes.length;
  const circles = nodes
    .map((label, i) => {
      const x = step * i + step / 2;
      return `<circle cx="${x}" cy="36" r="16" class="flow-node"/>
      <text x="${x}" y="72" text-anchor="middle" class="flow-label">${escapeHtml(label.length > 10 ? `${label.slice(0, 9)}…` : label)}</text>`;
    })
    .join("");
  const lines = nodes
    .slice(0, -1)
    .map((_, i) => {
      const x1 = step * i + step / 2 + 18;
      const x2 = step * (i + 1) + step / 2 - 18;
      return `<line x1="${x1}" y1="36" x2="${x2}" y2="36" class="flow-edge"/>`;
    })
    .join("");
  return `<svg class="viz-svg" viewBox="0 0 ${w} 90" role="img" aria-label="流程示意">${lines}${circles}</svg>`;
}

function renderStepsHtml(items: DeckVisualItem[]): string {
  const rows = items.slice(0, 5);
  if (!rows.length) return "";
  return `<ol class="step-rail">${rows
    .map(
      (item, i) =>
        `<li><span class="step-n">${String(i + 1).padStart(2, "0")}</span><span class="step-t">${escapeHtml(item.label)}</span></li>`,
    )
    .join("")}</ol>`;
}

function renderCompareHtml(items: DeckVisualItem[]): string {
  const a = items[0]?.label || "对照";
  const b = items[1]?.label || "处理";
  return `<div class="compare">
  <div class="compare-card compare-a"><p class="compare-k">A</p><p class="compare-v">${escapeHtml(a)}</p></div>
  <div class="compare-vs" aria-hidden="true">↔</div>
  <div class="compare-card compare-b"><p class="compare-k">B</p><p class="compare-v">${escapeHtml(b)}</p></div>
</div>`;
}

function renderCalloutHtml(visual: DeckVisual): string {
  const metric = escapeHtml((visual.metric || "★").trim() || "★");
  const caption = escapeHtml((visual.caption || "").trim());
  return `<div class="callout">
  <p class="callout-metric">${metric}</p>
  ${caption ? `<p class="callout-cap">${caption}</p>` : ""}
</div>`;
}

function renderVisual(visual: DeckVisual): string {
  const type = (visual.type || "none") as string;
  const items = visual.items || [];
  if (type === "bars") return `<div class="viz-panel">${renderBarsSvg(items)}${visual.caption ? `<p class="viz-cap">${escapeHtml(visual.caption)}</p>` : ""}</div>`;
  if (type === "flow") return `<div class="viz-panel">${renderFlowSvg(items)}${visual.caption ? `<p class="viz-cap">${escapeHtml(visual.caption)}</p>` : ""}</div>`;
  if (type === "steps") return `<div class="viz-panel">${renderStepsHtml(items)}</div>`;
  if (type === "compare") return `<div class="viz-panel">${renderCompareHtml(items)}</div>`;
  if (type === "callout") return `<div class="viz-panel">${renderCalloutHtml(visual)}</div>`;
  return "";
}

function bulletList(bullets: string[], className: string): string {
  const items = bullets
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((b) => `<li><span>${escapeHtml(b)}</span></li>`)
    .join("");
  return items ? `<ul class="${className}">${items}</ul>` : "";
}

function featureGrid(bullets: string[]): string {
  const cards = bullets
    .slice(0, 6)
    .map(
      (b, i) =>
        `<article class="feat"><span class="feat-n">${String(i + 1).padStart(2, "0")}</span><p>${escapeHtml(b)}</p></article>`,
    )
    .join("");
  return cards ? `<div class="feat-grid">${cards}</div>` : "";
}

/**
 * Self-contained HTML talk deck.
 *
 * ## Skill paths (baked into CSS + SVG templates)
 * - `skills/frontend-slides/SKILL.md` + `STYLE_PRESETS.md`: viewport-fit, density,
 *   Bold Signal mood (charcoal / hot orange / white), anti-generic-template.
 * - `docs/frontend-design/SKILL.md`: distinctive POV, no AI cream defaults.
 * - `skills/third-party/impeccable/reference/bolder.md`: amplify one move.
 * - `skills/third-party/nature-skills/nature-paper2ppt`: argument spine + anti-template rhythm.
 *
 * Model fills title/bullets/visual JSON; this file owns color, type, layouts, SVG.
 * Speaker notes are never rendered (audience-facing only).
 */
export function buildDeckHtml(opts: {
  title: string;
  slides: DeckSlide[];
  talkMinutes?: number;
}): string {
  const docTitle = escapeHtml(opts.title.trim() || "学术汇报");
  const total = opts.slides.length;

  const slidesHtml = opts.slides
    .map((slide, index) => {
      const kind = normalizeKind(
        typeof slide.kind === "string" ? slide.kind : undefined,
        index,
        total,
      );
      const visual = ensureVisual(slide, kind);
      const layout = resolveLayout({ ...slide, visual }, kind, index);
      const bullets = (slide.bullets || []).map((b) => b.trim()).filter(Boolean);
      const heading = escapeHtml(slide.title || `第 ${index + 1} 页`);
      const id = escapeHtml(slide.id || `s${index + 1}`);
      const viz = renderVisual(visual);
      const progress = Math.round(((index + 1) / Math.max(total, 1)) * 100);

      if (layout === "title-hero") {
        const lead = bullets[0] ? escapeHtml(bullets[0]) : "";
        return `<section class="slide layout-title-hero" id="${id}" data-kind="${kind}" data-layout="${layout}">
  <div class="progress" style="width:${progress}%" aria-hidden="true"></div>
  <div class="hero-grid">
    <div class="hero-void" aria-hidden="true">
      <p class="hero-num">${String(index + 1).padStart(2, "0")}</p>
      <svg class="motif" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="1.2"/>
        <path d="M22 76 L60 30 L98 76" fill="none" stroke="currentColor" stroke-width="3"/>
        <circle cx="60" cy="66" r="7" fill="currentColor"/>
      </svg>
    </div>
    <div class="hero-copy">
      <p class="eyebrow">Research talk</p>
      <h1>${heading}</h1>
      ${lead ? `<p class="hero-lead">${lead}</p>` : ""}
      ${bullets.length > 1 ? bulletList(bullets.slice(1, 4), "hero-rest") : ""}
    </div>
  </div>
</section>`;
      }

      if (layout === "section-bleed") {
        return `<section class="slide layout-section-bleed" id="${id}" data-kind="${kind}" data-layout="${layout}">
  <div class="progress" style="width:${progress}%" aria-hidden="true"></div>
  <div class="bleed-rail" aria-hidden="true"></div>
  <div class="bleed-copy">
    <p class="act">${String(index + 1).padStart(2, "0")}</p>
    <h1>${heading}</h1>
    <div class="bleed-row">
      ${bulletList(bullets.slice(0, 4), "bleed-points")}
      ${viz}
    </div>
  </div>
</section>`;
      }

      if (layout === "body-chart") {
        return `<section class="slide layout-body-chart" id="${id}" data-kind="${kind}" data-layout="${layout}">
  <div class="progress" style="width:${progress}%" aria-hidden="true"></div>
  <div class="chart-grid">
    <div class="chart-copy">
      <h1>${heading}</h1>
      ${bulletList(bullets.slice(0, 4), "dense-points")}
    </div>
    <div class="chart-stage">${viz || renderVisual({ type: "bars", items: bullets.slice(0, 3).map((label, i) => ({ label, value: 80 - i * 20 })), caption: "示意" })}</div>
  </div>
</section>`;
      }

      if (layout === "body-grid") {
        return `<section class="slide layout-body-grid" id="${id}" data-kind="${kind}" data-layout="${layout}">
  <div class="progress" style="width:${progress}%" aria-hidden="true"></div>
  <header class="grid-head"><h1>${heading}</h1></header>
  ${featureGrid(bullets)}
  ${viz ? `<div class="grid-viz">${viz}</div>` : ""}
</section>`;
      }

      if (layout === "body-split") {
        return `<section class="slide layout-body-split" id="${id}" data-kind="${kind}" data-layout="${layout}">
  <div class="progress" style="width:${progress}%" aria-hidden="true"></div>
  <aside class="split-side">
    <p class="side-index">${String(index + 1).padStart(2, "0")}</p>
    <h1>${heading}</h1>
  </aside>
  <div class="split-main">
    ${viz || bulletList(bullets, "split-points")}
    ${viz ? bulletList(bullets.slice(0, 3), "split-points") : ""}
  </div>
</section>`;
      }

      if (layout === "body-band") {
        return `<section class="slide layout-body-band" id="${id}" data-kind="${kind}" data-layout="${layout}">
  <div class="progress" style="width:${progress}%" aria-hidden="true"></div>
  <div class="band-top"><h1>${heading}</h1></div>
  <div class="band-bottom">
    ${viz}
    ${bulletList(bullets.slice(0, 4), "band-points")}
  </div>
</section>`;
      }

      if (layout === "close-field") {
        return `<section class="slide layout-close-field" id="${id}" data-kind="${kind}" data-layout="${layout}">
  <div class="progress" style="width:${progress}%" aria-hidden="true"></div>
  <div class="close-frame">
    <h1>${heading}</h1>
    <div class="close-row">
      ${bulletList(bullets.slice(0, 4), "close-points")}
      ${viz && visual.type !== "none" ? viz : ""}
    </div>
  </div>
</section>`;
      }

      // body-stack — dense, NO huge flex void
      return `<section class="slide layout-body-stack" id="${id}" data-kind="${kind}" data-layout="body-stack">
  <div class="progress" style="width:${progress}%" aria-hidden="true"></div>
  <div class="stack-row">
    <div class="stack-copy">
      <h1>${heading}</h1>
      ${bulletList(bullets.slice(0, 5), "dense-points")}
    </div>
    <div class="stack-viz">${viz}</div>
  </div>
</section>`;
    })
    .join("\n");


  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${docTitle}</title>
<style>
  /* frontend-slides STYLE_PRESETS.md viewport base + Bold Signal mood */
  :root {
    --night: #111111;
    --ink: #141414;
    --chalk: #f7f4ef;
    --hot: #ff5a1f;
    --citrus: #d6ff3f;
    --mist: #6b7280;
    --line: rgba(20,20,20,0.12);
    --title-size: clamp(1.5rem, 5vw, 3.4rem);
    --h2-size: clamp(1.25rem, 3.2vw, 2.2rem);
    --body-size: clamp(0.85rem, 1.55vw, 1.15rem);
    --slide-padding: clamp(1rem, 4vw, 3.5rem);
    --sans: "Space Grotesk", "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
    --display: "Archivo Black", "Arial Black", "PingFang SC", "Noto Sans SC", sans-serif;
  }
  html, body { height: 100%; margin: 0; overflow: hidden; background: #000; color: var(--ink); font-family: var(--sans); }
  .deck { height: 100%; position: relative; overflow: hidden; }
  .slide {
    display: none; width: 100vw; height: 100vh; height: 100dvh;
    overflow: hidden; position: relative; flex-direction: column;
  }
  .slide.active { display: flex; }
  .progress {
    position: absolute; left: 0; top: 0; height: 4px; background: var(--hot); z-index: 3;
  }

  .layout-title-hero { background: var(--chalk); padding: 0; }
  .hero-grid { display: grid; grid-template-columns: minmax(8rem, 36%) 1fr; height: 100%; }
  .hero-void {
    background: var(--night); color: var(--hot);
    display: flex; flex-direction: column; justify-content: space-between;
    padding: var(--slide-padding);
  }
  .hero-num { margin: 0; font-family: var(--display); font-size: clamp(2.5rem, 8vw, 5rem); line-height: 1; color: #fff; }
  .motif { width: min(46%, 8.5rem); color: var(--citrus); }
  .hero-copy { padding: var(--slide-padding); display: flex; flex-direction: column; justify-content: center; gap: 0.8rem; }
  .eyebrow { margin: 0; font-size: 0.78rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--hot); font-weight: 700; }
  .layout-title-hero h1 {
    margin: 0; font-family: var(--display); font-size: var(--title-size);
    line-height: 1.08; letter-spacing: -0.02em; max-width: 12em;
  }
  .hero-lead { margin: 0; font-size: clamp(1rem, 1.8vw, 1.25rem); color: #333; max-width: 30rem; line-height: 1.4; }
  .hero-rest { margin: 0; padding: 0; list-style: none; color: var(--mist); font-size: var(--body-size); }
  .hero-rest li { margin: 0.35rem 0; }

  .layout-section-bleed { background: var(--night); color: #f5f5f5; flex-direction: row; padding: 0; }
  .bleed-rail { width: clamp(0.9rem, 1.8vw, 1.4rem); background: var(--hot); flex-shrink: 0; }
  .bleed-copy { padding: var(--slide-padding); flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 1rem; }
  .act { margin: 0; color: var(--citrus); letter-spacing: 0.22em; font-weight: 700; font-size: 0.85rem; }
  .layout-section-bleed h1 { margin: 0; font-family: var(--display); font-size: var(--title-size); max-width: 12em; line-height: 1.1; }
  .bleed-row { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 1.5rem; align-items: center; }
  .bleed-points { margin: 0; padding: 0; list-style: none; color: #c9cdd6; font-size: var(--body-size); }
  .bleed-points li { margin: 0.45rem 0; }

  .layout-body-chart, .layout-body-stack { background: var(--chalk); padding: var(--slide-padding); justify-content: center; }
  .chart-grid, .stack-row {
    display: grid; grid-template-columns: 1.05fr 0.95fr; gap: clamp(1rem, 3vw, 2.5rem);
    height: 100%; align-items: center;
  }
  .chart-copy h1, .stack-copy h1, .grid-head h1, .band-top h1, .split-side h1 {
    margin: 0 0 1rem; font-family: var(--display); font-size: var(--h2-size); line-height: 1.15;
  }
  .dense-points, .band-points, .split-points, .close-points {
    margin: 0; padding: 0; list-style: none;
  }
  .dense-points li, .band-points li, .split-points li, .close-points li {
    margin: 0; padding: 0.55rem 0 0.55rem 0.9rem; border-top: 1px solid var(--line);
    font-size: var(--body-size); line-height: 1.4; position: relative;
  }
  .dense-points li:last-child, .band-points li:last-child, .split-points li:last-child { border-bottom: 1px solid var(--line); }
  .dense-points li::before, .band-points li::before {
    content: ""; position: absolute; left: 0; top: 0.95rem; width: 0.38rem; height: 0.38rem; background: var(--hot);
  }

  .layout-body-grid { background: #0e0e0e; color: #f5f5f5; padding: var(--slide-padding); gap: 1rem; }
  .grid-head h1 { color: #fff; }
  .feat-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
    gap: clamp(0.5rem, 1.5vw, 1rem); flex: 1;
  }
  .feat {
    background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 1rem;
    padding: 0.9rem 1rem; min-height: 6.5rem;
  }
  .feat-n { display: block; color: var(--hot); font-weight: 700; font-size: 0.8rem; letter-spacing: 0.08em; margin-bottom: 0.4rem; }
  .feat p { margin: 0; font-size: var(--body-size); line-height: 1.35; color: #e8e8e8; }
  .grid-viz { margin-top: 0.5rem; }

  .layout-body-split {
    background: linear-gradient(90deg, var(--night) 0 36%, var(--chalk) 36% 100%);
    padding: 0; flex-direction: row;
  }
  .split-side {
    width: 36%; padding: var(--slide-padding); color: #fff;
    display: flex; flex-direction: column; justify-content: flex-end; gap: 1rem;
  }
  .side-index { margin: 0 0 auto; color: var(--citrus); letter-spacing: 0.18em; font-weight: 700; }
  .split-main {
    width: 64%; padding: var(--slide-padding);
    display: flex; flex-direction: column; justify-content: center; gap: 1rem;
  }

  .layout-body-band { background: var(--chalk); padding: 0; }
  .band-top {
    background: var(--hot); color: #111; padding: clamp(1.2rem, 4vh, 3rem) var(--slide-padding);
    min-height: 28%; display: flex; align-items: flex-end;
  }
  .band-bottom {
    padding: clamp(1rem, 3vh, 2rem) var(--slide-padding) var(--slide-padding);
    display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; align-items: start; flex: 1;
  }

  .layout-close-field { background: var(--night); color: #f5f5f5; padding: var(--slide-padding); justify-content: center; }
  .close-frame {
    border: 2px solid var(--hot); padding: clamp(1.2rem, 4vh, 3rem);
    width: 100%; max-width: 58rem; margin-left: auto;
  }
  .layout-close-field h1 { margin: 0 0 1rem; font-family: var(--display); font-size: var(--title-size); }
  .close-row { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 1.25rem; align-items: center; }

  .viz-panel { width: 100%; }
  .viz-svg { width: 100%; height: auto; display: block; }
  .viz-cap { margin: 0.5rem 0 0; font-size: 0.75rem; color: var(--mist); }
  .chart-label { font-size: 11px; fill: #333; font-family: var(--sans); }
  .chart-track { fill: #e6e1d8; }
  .chart-bar { fill: var(--hot); }
  .flow-node { fill: var(--hot); }
  .flow-edge { stroke: #999; stroke-width: 2; }
  .flow-label { font-size: 11px; fill: #444; font-family: var(--sans); }
  .step-rail { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.55rem; }
  .step-rail li {
    display: grid; grid-template-columns: 2.2rem 1fr; gap: 0.6rem; align-items: start;
    background: rgba(255,255,255,0.06); border-radius: 0.75rem; padding: 0.65rem 0.75rem;
  }
  .step-n { color: var(--hot); font-weight: 800; font-size: 0.85rem; }
  .step-t { font-size: var(--body-size); line-height: 1.35; }
  .compare { display: grid; grid-template-columns: 1fr auto 1fr; gap: 0.6rem; align-items: stretch; }
  .compare-card { border-radius: 1rem; padding: 1rem; min-height: 7rem; }
  .compare-a { background: #1a1a1a; color: #fff; }
  .compare-b { background: var(--hot); color: #111; }
  .compare-k { margin: 0; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.12em; }
  .compare-v { margin: 0.5rem 0 0; font-size: var(--body-size); line-height: 1.35; }
  .compare-vs { align-self: center; font-weight: 800; color: var(--mist); }
  .callout {
    background: var(--night); color: #fff; border-radius: 1.25rem; padding: 1.25rem 1.4rem;
    border-left: 6px solid var(--citrus);
  }
  .callout-metric { margin: 0; font-family: var(--display); font-size: clamp(2rem, 5vw, 3.4rem); line-height: 1; }
  .callout-cap { margin: 0.7rem 0 0; font-size: var(--body-size); color: #d1d5db; line-height: 1.4; }

  .bar { position: fixed; right: 1rem; bottom: 1rem; display: flex; gap: 0.35rem; z-index: 5; }
  .bar button {
    min-height: 2.5rem; min-width: 2.5rem; border: 0; border-radius: 999px;
    background: var(--hot); color: #111; font-weight: 800; cursor: pointer; font-size: 1.1rem;
  }
  .bar button:focus-visible { outline: 2px solid var(--citrus); outline-offset: 2px; }

  @media (max-width: 800px) {
    .hero-grid, .chart-grid, .stack-row, .bleed-row, .band-bottom, .close-row { grid-template-columns: 1fr; }
    .layout-body-split { background: var(--chalk); flex-direction: column; }
    .split-side, .split-main { width: 100%; }
    .split-side { background: var(--night); min-height: 28%; }
  }
  @media (max-height: 700px) {
    :root { --slide-padding: clamp(0.75rem, 3vw, 2rem); --title-size: clamp(1.25rem, 4.5vw, 2.4rem); }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.2s !important; }
  }
  @media print {
    .bar { display: none; }
    .slide { display: flex !important; page-break-after: always; height: 100vh; }
  }
</style>
</head>
<body>
<main class="deck" id="deck">
${slidesHtml}
</main>
<nav class="bar" aria-label="翻页">
  <button type="button" id="prev" aria-label="上一页">‹</button>
  <button type="button" id="next" aria-label="下一页">›</button>
</nav>
<script>
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var i = 0;
  function show(n) {
    if (!slides.length) return;
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach(function (el, idx) { el.classList.toggle("active", idx === i); });
    try { location.hash = slides[i].id || ("s" + (i + 1)); } catch (e) {}
  }
  function fromHash() {
    var id = (location.hash || "").replace(/^#/, "");
    var idx = slides.findIndex(function (el) { return el.id === id; });
    show(idx >= 0 ? idx : 0);
  }
  document.getElementById("prev").onclick = function () { show(i - 1); };
  document.getElementById("next").onclick = function () { show(i + 1); };
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); show(i + 1); }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); show(i - 1); }
    if (e.key === "Home") { e.preventDefault(); show(0); }
    if (e.key === "End") { e.preventDefault(); show(slides.length - 1); }
  });
  window.addEventListener("hashchange", fromHash);
  fromHash();
})();
</script>
</body>
</html>`;
}
