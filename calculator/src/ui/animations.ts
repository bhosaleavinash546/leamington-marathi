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
 * - ONE "reward" beat: the headline total counts up once.
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

/** The headline total: the hero fades in and its figure counts up ONCE — the single reward beat. */
export function animateResultHero(): void {
  const hero = document.getElementById('cv-result-hero');
  if (!hero || reducedMotion()) return;
  enter(hero, { y: -6, duration: DUR.page });

  const totalEl = hero.querySelector<HTMLElement>('.crh-total');
  if (!totalEl) return;
  const full = totalEl.innerHTML;                 // may contain the ±% span
  const m = (totalEl.textContent ?? '').match(/([^\d-]*)([\d,]+(?:\.\d+)?)/);
  if (!m) return;
  const target = parseFloat(m[2].replace(/,/g, ''));
  if (!isFinite(target) || target <= 0) return;
  const dec = m[2].includes('.') ? (m[2].split('.')[1] ?? '').length : 0;
  const prefix = m[1];
  const proxy = { v: target * 0.6 };
  gsap.to(proxy, {
    v: target, duration: 0.45, ease: EASE_OUT,
    onUpdate: () => {
      totalEl.textContent = prefix + proxy.v.toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    },
    onComplete: () => { totalEl.innerHTML = full; },
  });
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
