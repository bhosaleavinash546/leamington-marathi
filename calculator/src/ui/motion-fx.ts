/**
 * CostVision Motion Effects — Framer Motion (vanilla DOM)
 *
 * Uses the `motion` package — Framer Motion's official vanilla DOM library —
 * for hover, press, scroll, and inView interactions.
 *
 * Companion to animations.ts (GSAP). This layer adds:
 *  • spring hover lift on buttons, nav, cards, tiles
 *  • press squeeze on every clickable element
 *  • inView stagger reveals
 *  • scroll-linked hero parallax
 *  • input focus ring scale
 *  • tab / ticker hover
 *  • cursor glow that follows the pointer
 */

import { animate, hover, press, inView, scroll, stagger } from 'motion';

// ── Spring option presets (string-based to satisfy TS overloads) ──────────────
const OPT_SNAPPY  = { type: 'spring' as const, bounce: 0.55, duration: 0.35 };
const OPT_BOUNCY  = { type: 'spring' as const, bounce: 0.65, duration: 0.45 };
const OPT_SMOOTH  = { type: 'spring' as const, bounce: 0.25, duration: 0.50 };
const OPT_STIFF   = { type: 'spring' as const, bounce: 0.40, duration: 0.25 };

// ── Entry point ───────────────────────────────────────────────────────────────

/** Call once from init(), after GSAP initCVAnimations() */
export function initMotionFX(): void {
  _applyButtonHoverPress();
  _applyNavHover();
  _applyCardHover();
  _applyPickerTileHover();
  _applyInputFocusScale();
  _applyTabHover();
  _applyFABHoverPress();
  _applyCursorGlow();
  _applyHeroParallax();
  _applyTickerHover();
}

/** Trigger motion inView reveals whenever a section of content renders */
export function motionInViewReveal(containerSelector: string): void {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(
    '.dash-kpi-card, .dash-chart-card, .dash-tile, .comm-card, .news-card, .help-card, .summary-card'
  ));
  items.forEach((el, i) => {
    inView(el, () => {
      animate(
        el,
        { opacity: [0, 1], y: [24, 0], scale: [0.94, 1] },
        { delay: i * 0.06, ...OPT_BOUNCY }
      );
    }, { amount: 0.15 });
  });
}

/** Animate result rows sliding in from left */
export function motionRevealRows(containerSelector: string): void {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(
    `${containerSelector} tr:not(:first-child), ${containerSelector} .breakdown-row, ${containerSelector} .cost-row`
  ));
  if (!rows.length) return;
  animate(
    rows,
    { opacity: [0, 1], x: [-16, 0] },
    { delay: stagger(0.04), ...OPT_SMOOTH }
  );
}

/** Spring-open a modal or drawer panel */
export function motionOpenPanel(el: HTMLElement): void {
  el.style.display = 'flex';
  animate(el, { opacity: [0, 1], scale: [0.92, 1], y: [30, 0] }, OPT_BOUNCY);
}

/** Spring-close a panel then hide it */
export function motionClosePanel(el: HTMLElement, onDone?: () => void): void {
  animate(el, { opacity: [1, 0], scale: [1, 0.92], y: [0, 24] }, {
    duration: 0.25, ease: 'easeIn',
    onComplete: () => { el.style.display = 'none'; onDone?.(); }
  });
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Event-delegation wrapper: return matched ancestor or null */
function _closest(e: PointerEvent, selector: string): HTMLElement | null {
  // e.target may be the Document, Window or a text node (e.g. pointer events that
  // bubble to document) — none of which implement Element.closest. Guard for it.
  const t = e.target;
  if (!(t instanceof Element)) return null;
  return t.closest<HTMLElement>(selector) ?? null;
}

function _applyButtonHoverPress(): void {
  // Hover: lift + scale using CSS selector (matches elements at bind time)
  // We re-bind on every view change via re-calling this pattern,
  // but for buttons that always exist in the DOM we can bind once.
  // For dynamic buttons we use the pointerenter delegation below.
  document.addEventListener('pointerenter', (e: Event) => {
    const btn = _closest(e as PointerEvent, '.btn, .btn-primary, .btn-secondary, .btn-sm');
    if (!btn) return;
    animate(btn, { scale: 1.055, y: -2 }, OPT_SNAPPY);
  }, { capture: true, passive: true });

  document.addEventListener('pointerleave', (e: Event) => {
    const btn = _closest(e as PointerEvent, '.btn, .btn-primary, .btn-secondary, .btn-sm');
    if (!btn) return;
    animate(btn, { scale: 1, y: 0 }, OPT_SMOOTH);
  }, { capture: true, passive: true });

  // Press: quick squeeze via pointerdown/up delegation
  document.addEventListener('pointerdown', (e: Event) => {
    const btn = _closest(e as PointerEvent, '.btn, .btn-primary, .btn-secondary, .btn-sm');
    if (!btn) return;
    animate(btn, { scale: 0.93 }, { duration: 0.08, ease: 'easeIn' });
  }, { capture: true, passive: true });

  document.addEventListener('pointerup', (e: Event) => {
    const btn = _closest(e as PointerEvent, '.btn, .btn-primary, .btn-secondary, .btn-sm');
    if (!btn) return;
    animate(btn, { scale: 1 }, OPT_BOUNCY);
  }, { capture: true, passive: true });
}

function _applyNavHover(): void {
  document.addEventListener('pointerenter', (e: Event) => {
    const nav = _closest(e as PointerEvent, '.nav-action-btn, .nav-tab-btn, .nav-tab');
    if (!nav) return;
    animate(nav, { scale: 1.08, y: -1 }, OPT_STIFF);
  }, { capture: true, passive: true });

  document.addEventListener('pointerleave', (e: Event) => {
    const nav = _closest(e as PointerEvent, '.nav-action-btn, .nav-tab-btn, .nav-tab');
    if (!nav) return;
    animate(nav, { scale: 1, y: 0 }, OPT_SMOOTH);
  }, { capture: true, passive: true });
}

function _applyCardHover(): void {
  document.addEventListener('pointerenter', (e: Event) => {
    const card = _closest(e as PointerEvent, '.dash-kpi-card, .dash-chart-card, .dash-tile');
    if (!card) return;
    animate(card, { y: -5, scale: 1.018 }, OPT_SNAPPY);
  }, { capture: true, passive: true });

  document.addEventListener('pointerleave', (e: Event) => {
    const card = _closest(e as PointerEvent, '.dash-kpi-card, .dash-chart-card, .dash-tile');
    if (!card) return;
    animate(card, { y: 0, scale: 1 }, OPT_SMOOTH);
  }, { capture: true, passive: true });
}

function _applyPickerTileHover(): void {
  document.addEventListener('pointerenter', (e: Event) => {
    const tile = _closest(e as PointerEvent, '.cpicker-tile');
    if (!tile) return;
    animate(tile, { scale: 1.07, y: -4 }, OPT_BOUNCY);
  }, { capture: true, passive: true });

  document.addEventListener('pointerleave', (e: Event) => {
    const tile = _closest(e as PointerEvent, '.cpicker-tile');
    if (!tile) return;
    animate(tile, { scale: 1, y: 0 }, OPT_SMOOTH);
  }, { capture: true, passive: true });

  document.addEventListener('pointerdown', (e: Event) => {
    const tile = _closest(e as PointerEvent, '.cpicker-tile');
    if (!tile) return;
    animate(tile, { scale: 0.94 }, { duration: 0.1, ease: 'easeIn' });
  }, { capture: true, passive: true });

  document.addEventListener('pointerup', (e: Event) => {
    const tile = _closest(e as PointerEvent, '.cpicker-tile');
    if (!tile) return;
    animate(tile, { scale: 1 }, OPT_BOUNCY);
  }, { capture: true, passive: true });
}

function _applyInputFocusScale(): void {
  document.addEventListener('focusin', (e) => {
    const field = (e.target as HTMLElement)?.closest<HTMLElement>('input, select, textarea');
    if (!field) return;
    animate(field, { scale: 1.012 }, OPT_SNAPPY);
  });
  document.addEventListener('focusout', (e) => {
    const field = (e.target as HTMLElement)?.closest<HTMLElement>('input, select, textarea');
    if (!field) return;
    animate(field, { scale: 1 }, OPT_SMOOTH);
  });
}

function _applyTabHover(): void {
  document.addEventListener('pointerenter', (e: Event) => {
    const tab = _closest(e as PointerEvent, '.rtab, .tab-btn, .result-tab');
    if (!tab) return;
    animate(tab, { y: -2 }, OPT_STIFF);
  }, { capture: true, passive: true });

  document.addEventListener('pointerleave', (e: Event) => {
    const tab = _closest(e as PointerEvent, '.rtab, .tab-btn, .result-tab');
    if (!tab) return;
    animate(tab, { y: 0 }, OPT_SMOOTH);
  }, { capture: true, passive: true });

  document.addEventListener('pointerdown', (e: Event) => {
    const tab = _closest(e as PointerEvent, '.rtab, .tab-btn, .result-tab');
    if (!tab) return;
    animate(tab, { scale: 0.95 }, { duration: 0.08, ease: 'easeIn' });
  }, { capture: true, passive: true });

  document.addEventListener('pointerup', (e: Event) => {
    const tab = _closest(e as PointerEvent, '.rtab, .tab-btn, .result-tab');
    if (!tab) return;
    animate(tab, { scale: 1 }, OPT_BOUNCY);
  }, { capture: true, passive: true });
}

function _applyFABHoverPress(): void {
  const fab = document.getElementById('ai-chat-fab');
  if (!fab) return;
  hover(fab, () => {
    animate(fab, { scale: 1.15, rotate: 8 }, OPT_BOUNCY);
    return () => animate(fab, { scale: 1, rotate: 0 }, OPT_SMOOTH);
  });
  press(fab, () => {
    animate(fab, { scale: 0.88 }, { duration: 0.1, ease: 'easeIn' });
    return () => animate(fab, { scale: 1 }, OPT_BOUNCY);
  });
}

function _applyCursorGlow(): void {
  const glow = document.createElement('div');
  glow.id = 'cv-cursor-glow';
  glow.style.cssText = [
    'position:fixed', 'pointer-events:none', 'z-index:99997',
    'width:260px', 'height:260px', 'border-radius:50%',
    'background:radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 68%)',
    'transform:translate(-50%,-50%)', 'will-change:transform',
    'opacity:0', 'transition:opacity .4s ease',
  ].join(';');
  document.body.appendChild(glow);

  document.addEventListener('pointermove', (e: PointerEvent) => {
    animate(glow, { x: e.clientX, y: e.clientY }, { duration: 0.55, ease: 'linear' });
    glow.style.opacity = '1';
  }, { passive: true });

  document.addEventListener('pointerleave', () => { glow.style.opacity = '0'; });
}

function _applyHeroParallax(): void {
  const hero = document.querySelector<HTMLElement>('.hero-section, .home-hero, #home-view');
  if (!hero) return;
  const img   = hero.querySelector<HTMLElement>('.hero-img, .hero-image, .hero-car-img, .hero-car');
  const title = hero.querySelector<HTMLElement>('.hero-heading, .hero-title, h1');
  const sub   = hero.querySelector<HTMLElement>('.hero-sub, .hero-subtext, .hero-subtitle');

  scroll((p: number) => {
    if (img)   animate(img,   { y: p * 55 },                          { duration: 0 });
    if (title) animate(title, { y: p * -28, opacity: 1 - p * 1.3 },  { duration: 0 });
    if (sub)   animate(sub,   { y: p * -16, opacity: 1 - p * 1.5 },  { duration: 0 });
  }, { target: hero, offset: ['start start', 'end start'] });
}

function _applyTickerHover(): void {
  document.addEventListener('pointerenter', (e: Event) => {
    const item = _closest(e as PointerEvent, '.comm-ticker-item, .ticker-item');
    if (!item) return;
    animate(item, { scale: 1.06, y: -2 }, OPT_STIFF);
  }, { capture: true, passive: true });

  document.addEventListener('pointerleave', (e: Event) => {
    const item = _closest(e as PointerEvent, '.comm-ticker-item, .ticker-item');
    if (!item) return;
    animate(item, { scale: 1, y: 0 }, OPT_SMOOTH);
  }, { capture: true, passive: true });
}
