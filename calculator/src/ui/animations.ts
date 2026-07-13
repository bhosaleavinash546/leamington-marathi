/**
 * CostVision UI Animations — GSAP-powered
 *
 * GSAP is the industry-standard animation library for vanilla DOM
 * (equivalent to Framer Motion for React, but more powerful).
 *
 * Exports hook functions called from main.ts at key render points:
 *   initCVAnimations()      — called once after init()
 *   onViewShown(view)       — called when a major view becomes visible
 *   onDashboardRendered()   — called at end of renderDashboard()
 *   onTableRendered()       — called at end of renderRecentTable()
 *   onResultsReady()        — called at end of showResultsArea()
 *   onChatToggled(open)     — called in toggleChat()
 *   onChatMessageAdded()    — called in renderChatMessages()
 *   onToastShown(el)        — called in showToast()
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// ── Shared easing presets ─────────────────────────────────────────────────────
const EASE_OUT   = 'power3.out';
const EASE_BACK  = 'back.out(1.6)';
const EASE_ELAST = 'elastic.out(1, 0.45)';

// What entrance tweens are allowed to clear when they finish. Never 'all':
// that wipes every inline style, including JS-managed ones the tween never
// touched (display toggles, chart sizing) — elements hidden by application
// code pop back visible when the animation completes. Every tween in this
// file animates only autoAlpha/x/y/scale, all covered by these three.
const CLEAR_PROPS = 'opacity,visibility,transform';

// Accessibility: users who ask for reduced motion get none of the decorative
// passes. Every hook below is enter/hover decoration with clearProps, so
// skipping leaves the UI fully visible in its final state.
export const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

// ── ONE-TIME SETUP ────────────────────────────────────────────────────────────

export function initCVAnimations(): void {
  if (PREFERS_REDUCED_MOTION) return;
  _animateHeaderLoad();
  _initButtonRipple();
  _initMagneticFAB();
  _initThemeTransitionOverlay();
  _initCardTilt();
}

// Header + sidebar items cascade in on page load
function _animateHeaderLoad(): void {
  gsap.set('.nav-logo, .anav-item, .header-right > *', { autoAlpha: 0, y: -8 });
  gsap.to('.nav-logo', { autoAlpha: 1, y: 0, duration: 0.5, ease: EASE_OUT, delay: 0.05 });
  gsap.to('.anav-item', {
    autoAlpha: 1, y: 0, duration: 0.4, ease: EASE_OUT,
    stagger: 0.05, delay: 0.15
  });
  gsap.to('.header-right > *', {
    autoAlpha: 1, y: 0, duration: 0.4, ease: EASE_OUT,
    stagger: 0.07, delay: 0.25
  });
}

// Ripple effect on every .btn click
function _initButtonRipple(): void {
  document.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.btn, .btn-primary, .btn-secondary, .btn-sm');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height) * 2.2;
    const r = document.createElement('span');
    r.className = 'cv-ripple-dot';
    r.style.cssText = `position:absolute;border-radius:50%;background:rgba(255,255,255,0.28);
      width:${d}px;height:${d}px;pointer-events:none;
      left:${e.clientX - rect.left - d / 2}px;
      top:${e.clientY - rect.top  - d / 2}px;
      transform:scale(0);z-index:0;`;
    // Ensure parent has overflow:hidden & position:relative
    const cs = getComputedStyle(btn);
    if (cs.overflow !== 'hidden') btn.style.overflow = 'hidden';
    if (cs.position === 'static') btn.style.position = 'relative';
    btn.appendChild(r);
    gsap.to(r, {
      scale: 1, autoAlpha: 0, duration: 0.55, ease: 'power2.out',
      onComplete: () => r.remove()
    });
  });
}

// Floating action button (AI chat fab) — subtle magnetic pull
function _initMagneticFAB(): void {
  const fab = document.getElementById('ai-chat-fab');
  if (!fab) return;
  fab.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = fab.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width  / 2);
    const dy = e.clientY - (rect.top  + rect.height / 2);
    gsap.to(fab, { x: dx * 0.22, y: dy * 0.22, duration: 0.3, ease: 'power2.out' });
  });
  fab.addEventListener('mouseleave', () => {
    gsap.to(fab, { x: 0, y: 0, duration: 0.6, ease: EASE_ELAST });
  });
}

// Smooth colour-flash overlay when theme toggle fires
function _initThemeTransitionOverlay(): void {
  document.querySelector('.theme-toggle')?.addEventListener('click', () => {
    let overlay = document.getElementById('cv-theme-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'cv-theme-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99998;background:var(--bg-primary,#fff)';
      document.body.appendChild(overlay);
    }
    gsap.fromTo(overlay,
      { autoAlpha: 0.5 },
      { autoAlpha: 0, duration: 0.45, ease: 'power2.out' }
    );
  });
}

// 3-D tilt on KPI & chart cards (applied to both static and dynamically-added cards)
function _initCardTilt(): void {
  // Use event delegation so it works after dynamic renders
  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return;   // document/window targets have no .closest
    const card = e.target.closest<HTMLElement>(
      '.dash-kpi-card, .dash-chart-card, .cpicker-tile'
    );
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const rx = -((e.clientY - cy) / (rect.height / 2)) * 3.5;
    const ry =  ((e.clientX - cx) / (rect.width  / 2)) * 3.5;
    gsap.to(card, {
      rotateX: rx, rotateY: ry, scale: 1.025,
      duration: 0.25, ease: 'power2.out',
      transformPerspective: 900, transformOrigin: 'center'
    });
  });
  document.addEventListener('mouseleave', (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return;   // document/window targets have no .closest
    const card = e.target.closest<HTMLElement>(
      '.dash-kpi-card, .dash-chart-card, .cpicker-tile'
    );
    if (!card) return;
    gsap.to(card, { rotateX: 0, rotateY: 0, scale: 1, duration: 0.55, ease: EASE_ELAST });
  }, true);
}

// ── VIEW TRANSITION HOOKS ─────────────────────────────────────────────────────

export function onViewShown(view: 'home' | 'picker' | 'costing' | 'news'): void {
  if (PREFERS_REDUCED_MOTION) return;
  switch (view) {
    case 'picker':  _animatePicker();  break;
    case 'costing': _animateCosting(); break;
    case 'news':    _animateNews();    break;
  }
}

function _animatePicker(): void {
  const tiles = document.querySelectorAll<HTMLElement>('.cpicker-tile');
  if (!tiles.length) return;
  // Kill any existing CSS animation that would conflict
  tiles.forEach(t => { t.style.animation = 'none'; t.style.opacity = '0'; });

  const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });
  tl.from('.cpicker-header, .cpicker-back-btn', { autoAlpha: 0, y: -14, duration: 0.38 }, 0)
    .from('.cpicker-search-wrap, .cpicker-search', { autoAlpha: 0, scale: 0.95, duration: 0.35 }, 0.08)
    .to(tiles, {
      autoAlpha: 1, y: 0, scale: 1, duration: 0.38,
      stagger: { amount: 0.5, from: 'start', grid: 'auto', axis: 'y' },
      clearProps: CLEAR_PROPS
    }, 0.18);

  // Reset opacity set above if no stagger needed
  gsap.set(tiles, { autoAlpha: 0, y: 20, scale: 0.92 });
  gsap.to(tiles, {
    autoAlpha: 1, y: 0, scale: 1, duration: 0.4,
    stagger: { amount: 0.52, from: 'start' },
    ease: EASE_BACK, clearProps: CLEAR_PROPS, delay: 0.1
  });
}

function _animateCosting(): void {
  // `from()` tweens on structural panels can be interrupted by a re-render and
  // strand the panel at low opacity (the "ghosted form" bug). Force-clear on
  // both complete AND interrupt so the final state is always fully visible.
  // NOTE: never clearProps:'all' here — these elements carry JS-managed inline
  // display values (wf-panel-header is display:none outside workflow mode), and
  // 'all' wipes them, leaving the header visible and breaking the grid.
  const panels = document.querySelectorAll<HTMLElement>('#wf-panel-header, .input-panel, .results-area');
  const CLEAR = CLEAR_PROPS;
  const forceVisible = () => gsap.set(panels, { clearProps: CLEAR });
  const tl = gsap.timeline({ defaults: { ease: EASE_OUT }, onComplete: forceVisible, onInterrupt: forceVisible });
  tl.from('#wf-panel-header', { autoAlpha: 0, y: -10, duration: 0.32, clearProps: CLEAR, onInterrupt: forceVisible }, 0)
    .from('.input-panel', { autoAlpha: 0, x: -24, duration: 0.42, clearProps: CLEAR, onInterrupt: forceVisible }, 0.08)
    .from('.results-area', { autoAlpha: 0, x: 18, duration: 0.42, clearProps: CLEAR, onInterrupt: forceVisible }, 0.08);
}

function _animateNews(): void {
  const items = document.querySelectorAll<HTMLElement>('.news-card, .news-item, .news-article');
  if (!items.length) return;
  gsap.from(items, {
    autoAlpha: 0, y: 18, duration: 0.38,
    stagger: { amount: 0.45, from: 'start' },
    ease: EASE_OUT, clearProps: CLEAR_PROPS
  });
}

// ── DASHBOARD HOOK ─────────────────────────────────────────────────────────────

export function onDashboardRendered(): void {
  if (PREFERS_REDUCED_MOTION) return;
  const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });

  // Ticker banner
  tl.from('.comm-ticker-outer', { autoAlpha: 0, y: -12, duration: 0.35 }, 0);

  // KPI cards stagger
  const kpiCards = document.querySelectorAll('.dash-kpi-card');
  if (kpiCards.length) {
    tl.from(kpiCards, {
      autoAlpha: 0, y: 22, scale: 0.94, duration: 0.44,
      stagger: { amount: 0.32 }, clearProps: CLEAR_PROPS
    }, 0.1);
  }

  // Filter bar
  tl.from('.dash-filter-bar', { autoAlpha: 0, y: 8, duration: 0.3 }, 0.22);

  // Dashboard quick-action tiles
  const tiles = document.querySelectorAll('.dash-tiles-col .dash-tile');
  if (tiles.length) {
    tl.from(tiles, {
      autoAlpha: 0, y: 16, scale: 0.92, duration: 0.38,
      stagger: { amount: 0.28 }, ease: EASE_BACK, clearProps: CLEAR_PROPS
    }, 0.28);
  }

  // Chart cards
  tl.from('.dash-chart-card', {
    autoAlpha: 0, y: 18, duration: 0.4, stagger: 0.1, clearProps: CLEAR_PROPS
  }, 0.35);

  // Recent table section
  tl.from('.dash-recent-section, #dash-recent-section', {
    autoAlpha: 0, y: 14, duration: 0.38
  }, 0.45);

  // AI insight panel
  tl.from('.dash-ai-item', {
    autoAlpha: 0, x: 16, duration: 0.35, stagger: 0.08, clearProps: CLEAR_PROPS
  }, 0.55);
}

// ── TABLE ROWS HOOK ───────────────────────────────────────────────────────────

export function onTableRendered(): void {
  if (PREFERS_REDUCED_MOTION) return;
  const tbody = document.getElementById('dash-recent-tbody');
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('tr'));
  if (!rows.length) return;

  gsap.from(rows, {
    autoAlpha: 0, y: 10, duration: 0.3,
    stagger: { amount: Math.min(0.38, rows.length * 0.045) },
    ease: EASE_OUT, clearProps: CLEAR_PROPS
  });
}

// ── RESULTS PANEL HOOK ────────────────────────────────────────────────────────

export function onResultsReady(): void {
  if (PREFERS_REDUCED_MOTION) return;
  const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });

  // Results tab bar. autoAlpha toggles visibility:hidden, so a `from(autoAlpha:0)`
  // that gets interrupted/killed can strand the whole tab bar hidden (the reported
  // "empty tab strip" bug). Guard on presence, clear props on complete, AND force
  // the bar visible again if the tween is ever interrupted.
  const tabEls = document.querySelectorAll('.results-tabs, .rtab');
  if (tabEls.length) {
    const forceVisible = () => gsap.set(tabEls, { clearProps: CLEAR_PROPS });
    tl.from(tabEls, {
      autoAlpha: 0, y: -8, duration: 0.3, stagger: 0.05,
      clearProps: CLEAR_PROPS,
      onInterrupt: forceVisible,
    }, 0);
  }

  // Grand total row — "pop" in
  tl.from('.total-row, .cost-total-row, [data-total], .breakdown-total', {
    autoAlpha: 0, scale: 0.88, duration: 0.46, ease: EASE_BACK, clearProps: CLEAR_PROPS
  }, 0.12);

  // Waterfall chart canvas — grow from bottom
  const wf = document.getElementById('breakdown-waterfall');
  if (wf) {
    tl.from(wf.closest('.chart-wrap, canvas, .breakdown-chart-container') ?? wf, {
      autoAlpha: 0, scaleY: 0.15, transformOrigin: 'bottom center', duration: 0.55,
      clearProps: CLEAR_PROPS
    }, 0.18);
  }

  // Breakdown / bucket rows
  tl.from('.breakdown-row, .cost-row, .stack-row, .bucket-row', {
    autoAlpha: 0, x: -16, duration: 0.32,
    stagger: { amount: 0.28 }, clearProps: CLEAR_PROPS
  }, 0.3);

  // Confidence band
  tl.from('.confidence-band, .confidence-badge, .conf-band', {
    autoAlpha: 0, scale: 0.82, duration: 0.4, ease: EASE_BACK, clearProps: CLEAR_PROPS
  }, 0.44);

  // Sensitivity / insights section
  tl.from('.sensitivity-row, .insight-row, .insight-card', {
    autoAlpha: 0, x: 12, duration: 0.3,
    stagger: { amount: 0.22 }, clearProps: CLEAR_PROPS
  }, 0.52);

  // Regional comparison bars — grow width from 0
  const regionBars = document.querySelectorAll<HTMLElement>('.region-bar-fill, .country-bar, .bar-fill');
  if (regionBars.length) {
    regionBars.forEach(bar => {
      gsap.from(bar, { width: 0, duration: 0.65, ease: 'power2.out', delay: 0.55, clearProps: 'width' });
    });
  }

  // Headline total counts up once (400ms) — the single "reward" moment.
  const totalVal = document.querySelector<HTMLElement>('.summary-card.total-card .card-value');
  const finalText = totalVal?.textContent ?? '';
  const numMatch = finalText.match(/^([^0-9-]*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (totalVal && numMatch) {
    const target = parseFloat(numMatch[2].replace(/,/g, ''));
    if (isFinite(target) && target > 0) {
      const dec = numMatch[2].includes('.') ? (numMatch[2].split('.')[1] ?? '').length : 0;
      const counter = { v: target * 0.4 };
      gsap.to(counter, {
        v: target, duration: 0.4, ease: 'power2.out', delay: 0.15,
        onUpdate: () => {
          totalVal.textContent = numMatch[1] +
            counter.v.toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec }) +
            numMatch[3];
        },
        onComplete: () => { totalVal.textContent = finalText; },
      });
    }
  }
}

// ── CHAT DRAWER HOOK ──────────────────────────────────────────────────────────

export function onChatToggled(open: boolean): void {
  if (PREFERS_REDUCED_MOTION) return;
  const drawer = document.getElementById('ai-chat-drawer');
  if (!drawer) return;

  if (open) {
    drawer.style.display = 'flex';  // ensure visible before animating
    gsap.fromTo(drawer,
      { y: 80, autoAlpha: 0, scale: 0.96 },
      { y: 0,  autoAlpha: 1, scale: 1, duration: 0.45, ease: EASE_BACK, clearProps: CLEAR_PROPS }
    );
    // fab rotates to show X
    gsap.to('#ai-chat-fab', { rotate: 45, duration: 0.35, ease: EASE_BACK });
  } else {
    gsap.to(drawer, {
      y: 40, autoAlpha: 0, scale: 0.96, duration: 0.28, ease: 'power2.in',
      onComplete: () => { drawer.style.display = 'none'; }
    });
    gsap.to('#ai-chat-fab', { rotate: 0, duration: 0.35, ease: EASE_BACK });
  }
}

// ── CHAT MESSAGE HOOK ─────────────────────────────────────────────────────────

export function onChatMessageAdded(): void {
  if (PREFERS_REDUCED_MOTION) return;
  const list = document.getElementById('ai-chat-messages');
  if (!list) return;
  // Animate the last message only
  const last = list.lastElementChild as HTMLElement | null;
  if (!last) return;
  const isAI = last.classList.contains('chat-msg--ai');
  gsap.from(last, {
    autoAlpha: 0,
    x: isAI ? -18 : 18,
    y: 8,
    duration: 0.38,
    ease: EASE_OUT,
    clearProps: CLEAR_PROPS
  });
}

// ── TOAST HOOK ────────────────────────────────────────────────────────────────

export function onToastShown(toast: HTMLElement): void {
  if (PREFERS_REDUCED_MOTION) return;
  // Override the default CSS animation with a GSAP spring
  toast.style.animation = 'none';
  gsap.fromTo(toast,
    { x: 80, autoAlpha: 0 },
    { x: 0,  autoAlpha: 1, duration: 0.48, ease: EASE_BACK }
  );
}

export function dismissToast(toast: HTMLElement, onDone: () => void): void {
  if (PREFERS_REDUCED_MOTION) { onDone(); return; }
  gsap.to(toast, {
    x: 80, autoAlpha: 0, duration: 0.28, ease: 'power2.in',
    onComplete: onDone
  });
}

// ── COMMODITY PRICE PULSE ─────────────────────────────────────────────────────

export function animateCommPriceChange(card: HTMLElement, dir: 'up' | 'down'): void {
  if (PREFERS_REDUCED_MOTION) return;
  const col = dir === 'up' ? '#10b981' : '#ef4444';
  gsap.timeline()
    .to(card, { boxShadow: `0 0 22px 5px ${col}60`, duration: 0.18 })
    .to(card, { boxShadow: 'none',                   duration: 0.7  });
}

// ── PCB / RESULTS SECTION REVEALS ────────────────────────────────────────────

export function onPCBResultShown(): void {
  if (PREFERS_REDUCED_MOTION) return;
  // Called after PCB image analysis result panel is injected
  const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });
  tl.from('.occt-stat', { autoAlpha: 0, y: 12, scale: 0.88, duration: 0.38, stagger: 0.07, clearProps: CLEAR_PROPS }, 0)
    .from('.pcb-result-section', { autoAlpha: 0, y: 16, duration: 0.4, stagger: 0.08, clearProps: CLEAR_PROPS }, 0.18)
    .from('.pcb-confidence-band, .asil-badge', { autoAlpha: 0, scale: 0.82, ease: EASE_BACK, duration: 0.42, clearProps: CLEAR_PROPS }, 0.32);
}

export function onBOMTableShown(): void {
  if (PREFERS_REDUCED_MOTION) return;
  const rows = document.querySelectorAll<HTMLElement>('.bom-row, .bom-line, tr.bom-item');
  if (!rows.length) return;
  gsap.from(rows, {
    autoAlpha: 0, x: -12, duration: 0.28,
    stagger: { amount: 0.4 }, ease: EASE_OUT, clearProps: CLEAR_PROPS
  });
}

// ── SCROLL-TRIGGERED REVEALS ──────────────────────────────────────────────────

/** Call once after long content is rendered (commodity panel, news feed, etc.) */
export function initScrollReveal(root: Element | Document = document): void {
  if (PREFERS_REDUCED_MOTION) return;
  const targets = (root as Element).querySelectorAll<HTMLElement>(
    '.comm-card, .summary-card, .help-card, .news-card, .news-item'
  );
  targets.forEach(el => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 94%',
      once: true,
      onEnter: () => gsap.from(el, {
        autoAlpha: 0, y: 18, duration: 0.4, ease: EASE_OUT, clearProps: CLEAR_PROPS
      })
    });
  });
}

// ── FORM FIELD FOCUS GLOW ─────────────────────────────────────────────────────

export function initFormAnimations(formEl: HTMLElement): void {
  if (PREFERS_REDUCED_MOTION) return;
  formEl.querySelectorAll<HTMLElement>('input, select, textarea').forEach(field => {
    field.addEventListener('focus', () => {
      gsap.to(field, {
        boxShadow: '0 0 0 3px rgba(59,130,246,0.35)',
        duration: 0.22, ease: 'power2.out'
      });
    });
    field.addEventListener('blur', () => {
      gsap.to(field, { boxShadow: 'none', duration: 0.3, ease: 'power2.out' });
    });
  });
}

// ── SIDEBAR COLLAPSE ANIMATION ────────────────────────────────────────────────

export function animateSidebarToggle(collapsed: boolean): void {
  if (PREFERS_REDUCED_MOTION) return;
  const sidebar = document.querySelector<HTMLElement>('.input-panel, .sidebar, #commodity-sidebar');
  if (!sidebar) return;
  if (collapsed) {
    gsap.to(sidebar, { width: '48px', duration: 0.32, ease: 'power2.inOut' });
  } else {
    gsap.to(sidebar, { width: '360px', duration: 0.32, ease: 'power2.inOut' });
  }
}

// ── STAGGER COUNTER ENHANCEMENT ──────────────────────────────────────────────

/** Enhanced number counter — wrap existing countUp with GSAP for smoother easing */
export function animateKPIEntrance(kpiIds: string[]): void {
  kpiIds.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    gsap.from(el.closest('.dash-kpi-card') ?? el, {
      autoAlpha: 0, y: 20, scale: 0.9,
      duration: 0.44, ease: EASE_BACK,
      delay: i * 0.08, clearProps: CLEAR_PROPS
    });
  });
}

// ── WATERFALL BAR NUMBER COUNT-UP ─────────────────────────────────────────────

/** Animate a numeric counter using GSAP — replacement for manual rAF countUp */
export function gsapCountUp(
  el: HTMLElement,
  target: number,
  fmt: (v: number) => string,
  dur = 0.85
): void {
  const proxy = { val: 0 };
  gsap.to(proxy, {
    val: target,
    duration: dur,
    ease: 'power2.out',
    onUpdate: () => { el.textContent = fmt(proxy.val); },
    onComplete: () => { el.textContent = fmt(target); }
  });
}

// ── SIGNATURE MOMENT: result hero entrance + total count-up ───────────────────
// The hero is the payoff of every costing. It rises in and its headline total
// counts up once — the single "reward" beat, then it rests.
export function animateResultHero(): void {
  const hero = document.getElementById('cv-result-hero');
  if (!hero) return;
  if (PREFERS_REDUCED_MOTION) return;
  gsap.fromTo(hero,
    { autoAlpha: 0, y: -10 },
    { autoAlpha: 1, y: 0, duration: 0.4, ease: EASE_OUT, clearProps: 'transform' });
  gsap.fromTo(hero.querySelectorAll('.crh-chips > *, .crh-actions > *'),
    { autoAlpha: 0, y: 4 },
    { autoAlpha: 1, y: 0, duration: 0.32, ease: EASE_OUT, stagger: 0.035, delay: 0.08, clearProps: CLEAR_PROPS });

  // Count up the headline total (parse currency, preserve prefix/suffix)
  const totalEl = hero.querySelector<HTMLElement>('.crh-total');
  if (!totalEl) return;
  const full = totalEl.innerHTML;                 // may contain the ±% span
  const text = totalEl.textContent ?? '';
  const m = text.match(/([^\d-]*)([\d,]+(?:\.\d+)?)/);
  if (!m) return;
  const target = parseFloat(m[2].replace(/,/g, ''));
  if (!isFinite(target) || target <= 0) return;
  const dec = m[2].includes('.') ? (m[2].split('.')[1] ?? '').length : 0;
  const prefix = m[1];
  const proxy = { v: target * 0.35 };
  gsap.to(proxy, {
    v: target, duration: 0.5, ease: 'power2.out', delay: 0.05,
    onUpdate: () => {
      totalEl.textContent = prefix + proxy.v.toLocaleString('en-GB',
        { minimumFractionDigits: dec, maximumFractionDigits: dec });
    },
    onComplete: () => { totalEl.innerHTML = full; },   // restore incl. ±% span
  });
}

// ── Tactile feedback: a quick pulse ring on Calculate (compute is synchronous,
//    so this gives the "it worked" beat the payload can't). ────────────────────
export function pulseCalculate(): void {
  if (PREFERS_REDUCED_MOTION) return;
  const btn = document.getElementById('calc-btn');
  if (!btn) return;
  gsap.fromTo(btn,
    { boxShadow: '0 0 0 0 rgba(79,70,229,0.45)' },
    { boxShadow: '0 0 0 12px rgba(79,70,229,0)', duration: 0.6, ease: 'power2.out', clearProps: 'boxShadow' });
}
