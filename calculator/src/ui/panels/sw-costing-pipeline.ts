/**
 * Costing studio — the software costing played step by step on the SUV skeleton (Chief Engineer review, Oct 2026).
 *
 * Seven steps (src/engine/sw-costing-steps.ts) — scope → effort → verification → rate → NRE → lifecycle → per vehicle —
 * each showing the figure the engine computed and lighting the vehicle components of the modules it concerns. "Play"
 * walks the steps (one fade per step, the motion system's 200 ms; the 1.4 s dwell is reading time, and the walk stops
 * on any click); arrows and the step buttons move by hand. Reduced motion: no auto-play, the last step shown.
 * Every figure comes from the result — this module formats, it never computes money.
 */

import { swCostingSteps, type SWCostingStep, type StepRate, type StepFormat } from '../../engine/sw-costing-steps.js';
import type { SWProgramResult } from '../../engine/sw-should-cost.js';
import { renderVehicleMapHTML, wireVehicleMap, VEHICLE_MAP_CSS, type SkeletonState } from './sw-vehicle-skeleton.js';
// The OS "reduce motion" setting, read live — the same test as animations.ts, without pulling GSAP into this chunk.
const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

const DWELL_MS = 1400;

export interface StudioInput {
  result: SWProgramResult;
  rate:   StepRate;
  fmt:    StepFormat;
}

export function skeletonStateFor(result: SWProgramResult): SkeletonState {
  return {
    powertrain: result.inputs.powertrain,
    modules: result.modules.map(m => ({ id: m.moduleId, name: m.moduleName, category: m.category,
      categoryLabel: m.categoryLabel, asil: m.asilUsed, cost: m.grandTotal })),
  };
}

function stepsHTML(steps: SWCostingStep[], active: number): string {
  return steps.map((s, i) => `
    <li class="swp-step${i === active ? ' is-active' : ''}${i < active ? ' is-done' : ''}">
      <button type="button" class="swp-step-btn" data-swp-step="${i}" aria-current="${i === active ? 'step' : 'false'}">
        <span class="swp-n" aria-hidden="true">${i + 1}</span>
        <span class="swp-t">${esc(s.title)}</span>
        <span class="swp-v">${esc(s.value)}</span>
      </button>
    </li>`).join('');
}

export function renderStudioHTML(inp: StudioInput, active: number, state: SkeletonState): string {
  const steps = swCostingSteps(inp.result, inp.rate, inp.fmt);
  const s = steps[active];
  return `<section class="swp-studio" aria-labelledby="swp-title">
  <div class="swp-head">
    <div>
      <h3 id="swp-title" class="swp-title">How this software was costed</h3>
      <p class="swp-sub">Seven steps, each with the engine's own figure. The SUV shows the vehicle components each step concerns.</p>
    </div>
    <div class="swp-ctrl" role="group" aria-label="Walk through the costing">
      <button type="button" class="swp-btn" data-swp="prev" aria-label="Previous step">‹</button>
      <button type="button" class="swp-btn swp-play" data-swp="play" aria-label="Play the costing walk-through">▶ Play</button>
      <button type="button" class="swp-btn" data-swp="next" aria-label="Next step">›</button>
    </div>
  </div>
  <ol class="swp-steps">${stepsHTML(steps, active)}</ol>
  <div class="swp-now" aria-live="polite"><strong>${active + 1}. ${esc(s.title)} — ${esc(s.value)}.</strong> ${esc(s.detail)}</div>
  <div class="swp-map">${renderVehicleMapHTML({ ...state, focusModules: state.focusModules ?? s.modules }, inp.fmt.money)}</div>
</section>`;
}

/** Mount (or re-mount) the studio in `host`. Returns a disposer that stops a running walk. */
export function mountSWStudio(container: HTMLElement, inp: StudioInput): () => void {
  ensureStyles();
  // A fresh root per mount: the listeners below die with it when the results re-render.
  const host = document.createElement('div');
  container.replaceChildren(host);
  const steps = swCostingSteps(inp.result, inp.rate, inp.fmt);
  let active = steps.length - 1;
  const base = skeletonStateFor(inp.result);
  let colourBy: SkeletonState['colourBy'] = 'scope';
  /** Modules the user picked by clicking a component; a step change clears it. */
  let userFocus: string[] | undefined;
  const current = (): SkeletonState => ({ ...base, colourBy, focusModules: userFocus ?? steps[active].modules });
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    host.querySelector('.swp-play')?.replaceChildren(document.createTextNode('▶ Play'));
  };
  const draw = (fade = false) => {
    host.innerHTML = renderStudioHTML(inp, active, current());
    if (timer) host.querySelector('.swp-play')?.replaceChildren(document.createTextNode('❚❚ Pause'));
    if (fade && !reducedMotion()) {
      host.querySelectorAll<HTMLElement>('.swp-now, .swv-comp.swv-lit').forEach(el => el.classList.add('swp-enter'));
    }
  };
  const go = (i: number, fade = true) => { active = Math.max(0, Math.min(steps.length - 1, i)); userFocus = undefined; draw(fade); };
  const tick = () => {
    if (active >= steps.length - 1) { stop(); return; }
    go(active + 1);
    timer = setTimeout(tick, DWELL_MS);
  };

  host.addEventListener('click', e => {
    const t = e.target as Element;
    const ctl = t.closest?.('[data-swp]')?.getAttribute('data-swp');
    const stepBtn = t.closest?.('[data-swp-step]')?.getAttribute('data-swp-step');
    if (ctl === 'play') {
      if (timer) { stop(); return; }
      if (reducedMotion()) { go(steps.length - 1, false); return; }
      active = -1;
      timer = setTimeout(tick, 0);
      return;
    }
    if (ctl || stepBtn != null) stop();
    if (ctl === 'prev') go(active - 1);
    else if (ctl === 'next') go(active + 1);
    else if (stepBtn != null) go(Number(stepBtn));
  });
  host.addEventListener('keydown', e => {
    if (!(e.target as Element).closest?.('.swp-steps')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault(); stop();
      go(active + (e.key === 'ArrowRight' ? 1 : -1));
      host.querySelector<HTMLElement>(`[data-swp-step="${active}"]`)?.focus();
    }
  });
  // Clicking a component shows only its modules; clicking it again (or a mode button) keeps the rest as it was.
  wireVehicleMap(host, current, s => {
    colourBy = s.colourBy;
    userFocus = s.focusModules && s.focusModules !== steps[active].modules ? s.focusModules : undefined;
    draw();
  }, inp.fmt.money);

  draw();
  return stop;
}

let _styled = false;
function ensureStyles(): void {
  if (_styled || typeof document === 'undefined') return;
  _styled = true;
  const st = document.createElement('style');
  st.id = 'sw-studio-styles';
  st.textContent = VEHICLE_MAP_CSS + STUDIO_CSS;
  document.head.appendChild(st);
}

export const STUDIO_CSS = `
.swp-studio{border:1px solid var(--sw-border);border-radius:14px;background:var(--sw-surface-alt);padding:16px 18px;margin:0 0 18px}
.swp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.swp-title{margin:0;font-size:1rem;font-weight:750;color:var(--sw-text-primary)}
.swp-sub{margin:2px 0 0;font-size:.76rem;color:var(--sw-text-secondary)}
.swp-ctrl{display:flex;gap:6px}
.swp-btn{font:inherit;font-size:.78rem;font-weight:600;padding:6px 12px;border-radius:8px;border:1px solid var(--sw-border);background:var(--sw-surface);color:var(--sw-text-primary);cursor:pointer;transition:background-color var(--dur-hover,200ms) ease,border-color var(--dur-hover,200ms) ease}
.swp-btn:hover{border-color:var(--sw-accent)}
.swp-play{background:var(--sw-accent);border-color:var(--sw-accent);color:var(--sw-on-accent,#fff);min-width:84px}
.swp-steps{list-style:none;margin:14px 0 10px;padding:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;counter-reset:none}
@media (max-width:900px){.swp-steps{grid-template-columns:repeat(2,minmax(0,1fr))}}
.swp-step-btn{width:100%;text-align:left;font:inherit;border:1px solid var(--sw-border);background:var(--sw-surface);border-radius:10px;padding:8px 10px;cursor:pointer;display:grid;grid-template-columns:auto 1fr;column-gap:8px;row-gap:2px;color:var(--sw-text-body);transition:border-color var(--dur-hover,200ms) ease,background-color var(--dur-hover,200ms) ease}
.swp-n{grid-row:span 2;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;border:1.5px solid var(--sw-text-muted);color:var(--sw-text-secondary)}
.swp-t{font-size:.72rem;font-weight:600;color:var(--sw-text-secondary)}
.swp-v{font-size:.84rem;font-weight:750;color:var(--sw-text-primary);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.swp-step.is-done .swp-n{background:var(--sw-accent-bg);border-color:var(--sw-accent);color:var(--sw-accent)}
.swp-step.is-active .swp-step-btn{border-color:var(--sw-accent);background:var(--sw-accent-bg);box-shadow:0 0 0 2px var(--sw-accent-border)}
.swp-step.is-active .swp-n{background:var(--sw-accent);border-color:var(--sw-accent);color:var(--sw-on-accent,#fff)}
.swp-now{font-size:.8rem;color:var(--sw-text-body);background:var(--sw-surface);border:1px solid var(--sw-border);border-radius:10px;padding:10px 12px;min-height:3.2em}
.swp-map{margin-top:12px}
.swp-map .swv-wrap{margin:0}
.swp-enter{animation:swp-in 200ms cubic-bezier(.2,.7,.3,1) both}
@keyframes swp-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
`;
