/**
 * CostVision motion — ONE restrained system (motion review, Oct 2026).
 *
 * The app ran four animation systems at once — CSS, GSAP, the `motion` package and hand-written rAF — and they fought:
 * buttons scaled, tilted and sprang and got two click ripples, cards tilted in 3-D while the CSS said "read-outs do
 * not move", entrances bounced (back.out / elastic) and the total counted up twice. An engineering tool's motion
 * should say what changed and get out of the way, as Linear / Stripe / Vercel do:
 *
 * - ENTER: opacity + at most 6–8 px of travel, 150–260 ms, one ease-out curve. No scale, no bounce, no stagger longer
 *   than ~0.15 s in total.
 * - HOVER: colour / shadow only, in CSS (calculator.css / saas-polish.css). Nothing in JS listens to mousemove.
 * - EXIT: faster than the enter (ease-in).
 * - Money never animates its value (CAD to COST proposal v2, M2): the headline used to count up, and live runs read
 *   £16.42, £38.72 and £49.96 off it before the true £24.09 / £41.46 / £53.06 — one of them was quoted in a review.
 * - Reduced motion: every hook returns at once, read LIVE (the OS setting can change while the page is open).
 *
 * Durations and the curve mirror the CSS tokens (--dur-micro 150 ms, --dur-hover 200 ms, --dur-page 260 ms,
 * --ease-std / --ease-decel).
 */

import { gsap } from 'gsap';

export const DUR = { micro: 0.15, base: 0.2, page: 0.26 } as const;
const EASE_OUT = 'power2.out';
const EASE_IN = 'power2.in';

// What entrance tweens may clear when they finish. Never 'all': that wipes JS-managed inline styles (display toggles,
// chart sizing) and pops hidden elements back into view.
const CLEAR_PROPS = 'opacity,visibility,transform';

/** The OS "reduce motion" setting, read live. */
export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Fade a set of elements in with a few pixels of rise. */
function enter(targets: gsap.TweenTarget, opts: { y?: number; x?: number; stagger?: number; delay?: number; duration?: number } = {}): void {
  gsap.fromTo(targets,
    { opacity: 0, y: opts.y ?? 6, x: opts.x ?? 0 },
    { opacity: 1, y: 0, x: 0, duration: opts.duration ?? DUR.base, ease: EASE_OUT, delay: opts.delay ?? 0,
      stagger: opts.stagger ?? 0, clearProps: CLEAR_PROPS, overwrite: 'auto' });
}

// ── One-time setup ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Nothing to set up any more: page load is not animated (a header cascade only delays the first click), and hover
 *  feedback is CSS. Kept so the call site stays stable. */
export function initCVAnimations(): void { /* intentionally empty — see the file header */ }

// ── Views ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export function onViewShown(view: 'home' | 'picker' | 'costing' | 'news'): void {
  if (reducedMotion()) return;
  const sel = view === 'picker' ? '#commodity-picker-view .cpicker-grid, #commodity-picker-view .cpicker-header'
    : view === 'costing' ? '#wf-panel-header, .input-panel, .results-area'
    : view === 'news' ? '#news-view .news-header, #news-view .news-grid'
    : '';
  const els = sel ? document.querySelectorAll<HTMLElement>(sel) : [];
  if (els.length) enter(els, { y: 4, duration: DUR.page });
}

export function onDashboardRendered(): void {
  if (reducedMotion()) return;
  const els = document.querySelectorAll<HTMLElement>('.dash-kpi-card, .dash-chart-card, .dash-tiles-col .dash-tile');
  if (els.length) enter(els, { stagger: Math.min(0.02, 0.15 / els.length) });
}

export function onTableRendered(): void {
  if (reducedMotion()) return;
  const tbody = document.getElementById('dash-recent-tbody');
  if (tbody) enter(tbody, { y: 0, duration: DUR.micro });
}

// ── Results ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The results content fades in once. The tab bar is never animated — a stranded tween once left it empty. */
export function onResultsReady(): void {
  if (reducedMotion()) return;
  const panes = document.querySelectorAll<HTMLElement>('#results-breakdown');
  if (panes.length) enter(panes, { y: 4 });
}

/** The headline total: the hero fades in; its figure is final from the first frame (no count-up — see the header). */
export function animateResultHero(): void {
  const hero = document.getElementById('cv-result-hero');
  if (!hero || reducedMotion()) return;
  enter(hero, { y: 0, duration: 0.16 });
}

/** Calculate pressed: a brief accent ring (CSS `.cv-pulse`, coloured by the theme's accent). */
export function pulseCalculate(): void {
  if (reducedMotion()) return;
  const btn = document.getElementById('calc-btn');
  if (!btn) return;
  btn.classList.remove('cv-pulse');
  void btn.offsetWidth;                            // restart the animation
  btn.classList.add('cv-pulse');
  btn.addEventListener('animationend', () => btn.classList.remove('cv-pulse'), { once: true });
}

// ── AI chat drawer ──────────────────────────────────────────────────────────────────────────────────────────────────

export function onChatToggled(open: boolean): void {
  const drawer = document.getElementById('ai-chat-drawer');
  if (!drawer) return;
  if (reducedMotion()) {
    drawer.style.display = open ? 'flex' : 'none';
    return;
  }
  if (open) {
    drawer.style.display = 'flex';
    enter(drawer, { y: 8, duration: DUR.base });
  } else {
    gsap.to(drawer, { opacity: 0, y: 6, duration: DUR.micro, ease: EASE_IN,
      onComplete: () => { drawer.style.display = 'none'; gsap.set(drawer, { clearProps: CLEAR_PROPS }); } });
  }
}

export function onChatMessageAdded(): void {
  if (reducedMotion()) return;
  const last = document.getElementById('ai-chat-messages')?.lastElementChild as HTMLElement | null;
  if (last) enter(last, { y: 4, duration: DUR.base });
}

// ── Software costing cockpit (sw-cockpit-ui.ts, sw-charts.ts) ──────────────────────────────────────────────────────
// The same curve and durations as every other view (independent review, Oct 2026: the cockpit ran its own WAAPI
// motion). Every hook returns at once under reduced motion.

/** A tab panel entering: 6 px rise, 200 ms. */
export function swEnter(el: Element): void {
  if (reducedMotion()) return;
  enter(el, { y: 6 });
}
/** A figure whose value just changed: a 4 px rise out of a dimmed state, 200 ms. */
export function swValueChanged(el: Element): void {
  if (reducedMotion()) return;
  gsap.fromTo(el, { opacity: 0.35, y: 4 }, { opacity: 1, y: 0, duration: DUR.base, ease: EASE_OUT, clearProps: CLEAR_PROPS, overwrite: 'auto' });
}
/** Chart marks on first render: each grows out of its baseline (a clip, never a scale), ≤ 150 ms of stagger in all. */
export function swRevealMarks(marks: Element[], columns: boolean[]): void {
  if (reducedMotion() || !marks.length) return;
  const step = Math.min(0.012, 0.15 / marks.length);
  marks.forEach((m, i) => gsap.fromTo(m,
    { clipPath: columns[i] ? 'inset(100% 0% 0% 0%)' : 'inset(0% 100% 0% 0%)' },
    { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.page, delay: i * step, ease: EASE_OUT, clearProps: 'clipPath' }));
}
/** A chart mark on a live update: from its previous geometry to the new one, 220 ms. */
export function swMorphMark(el: Element, from: Record<string, string>, to: Record<string, string>): void {
  if (reducedMotion()) return;
  gsap.fromTo(el, { attr: from }, { attr: to, duration: 0.22, ease: EASE_OUT, overwrite: 'auto' });
}
