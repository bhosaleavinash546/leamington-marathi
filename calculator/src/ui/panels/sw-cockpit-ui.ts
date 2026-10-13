/**
 * Software costing COCKPIT (Oct 2026 review — "make it a world-class SaaS tool"): the programme header, the live
 * summary rail, the tab bar, and the result views that read the engine (overview charts, risk, spend, supplier check).
 * Pure builders `(data) → HTML` plus small wiring functions; the panel (sw-should-cost-ui.ts) owns the state and calls
 * these. Every figure is the engine's result — nothing here computes money.
 *
 * Motion (app policy — 150–260 ms, power2-out, no bounce, reduced motion = none):
 *  - a rail value that changes cross-fades with a 4 px rise (200 ms) and shows a signed delta chip for 2.4 s;
 *  - a tab panel enters with a 6 px rise (200 ms);
 *  - charts reveal once and morph on live updates (sw-charts.ts).
 */

import type { SWProgramResult, SWCategory } from '../../engine/sw-should-cost.js';
import { swMoney } from './sw-currency.js';
import { swSpendProfile, swQuoteCheck, swUnitEconomics, type SWQuote } from '../../engine/sw-cockpit.js';
import { swSchedule } from '../../engine/sw-schedule.js';
import {
  waterfallChart, treemapChart, tornadoChart, distributionChart, spendChart, wireCharts, CHART_CSS, type Money,
} from './sw-charts.js';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const reduced = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

// ── Tabs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type CockpitTab = 'setup' | 'scope' | 'overview' | 'vehicle' | 'risk' | 'spend' | 'modules' | 'supplier' | 'rates' | 'report';

export const COCKPIT_TABS: Array<{ id: CockpitTab; label: string; group: 'Inputs' | 'Results' | 'Method'; key: string }> = [
  { id: 'setup', label: 'Setup', group: 'Inputs', key: '1' },
  { id: 'scope', label: 'Scope', group: 'Inputs', key: '2' },
  { id: 'overview', label: 'Overview', group: 'Results', key: '3' },
  { id: 'vehicle', label: 'Vehicle', group: 'Results', key: '4' },
  { id: 'risk', label: 'Risk', group: 'Results', key: '5' },
  { id: 'spend', label: 'Spend & schedule', group: 'Results', key: '6' },
  { id: 'modules', label: 'Modules', group: 'Results', key: '7' },
  { id: 'supplier', label: 'Supplier check', group: 'Results', key: '8' },
  { id: 'rates', label: 'Rates & method', group: 'Method', key: '9' },
  { id: 'report', label: 'Report', group: 'Method', key: '0' },
];

export function tabsHTML(active: CockpitTab): string {
  let group = '';
  return `<div class="swk-tabs" role="tablist" aria-label="Software costing">${COCKPIT_TABS.map(t => {
    const sep = t.group !== group ? `<span class="swk-tabgrp" aria-hidden="true">${esc(t.group)}</span>` : '';
    group = t.group;
    return `${sep}<button type="button" role="tab" id="swk-t-${t.id}" class="swk-tab${t.id === active ? ' is-on' : ''}"
      aria-selected="${t.id === active}" aria-controls="swk-p-${t.id}" tabindex="${t.id === active ? 0 : -1}" data-swk-tab="${t.id}"
      title="${esc(`${t.label} (Alt+${t.key})`)}">${esc(t.label)}</button>`;
  }).join('')}</div>`;
}

/** Show one tab panel; arrows / Home / End move between tabs (WAI-ARIA tabs pattern); Alt+digit jumps. */
export function wireTabs(root: HTMLElement, onChange?: (t: CockpitTab) => void): (t: CockpitTab) => void {
  const select = (t: CockpitTab, focus = false) => {
    root.querySelectorAll<HTMLButtonElement>('[data-swk-tab]').forEach(b => {
      const on = b.dataset.swkTab === t;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    root.querySelectorAll<HTMLElement>('.swk-panel[role="tabpanel"]').forEach(p => {
      const on = p.id === `swk-p-${t}`;
      const was = !p.hidden;
      p.hidden = !on;
      if (on && !was && !reduced() && typeof p.animate === 'function') {
        p.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE });
      }
    });
    onChange?.(t);
  };
  const bar = root.querySelector<HTMLElement>('.swk-tabs');
  bar?.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-swk-tab]');
    if (b) select(b.dataset.swkTab as CockpitTab);
  });
  bar?.addEventListener('keydown', e => {
    const ids = COCKPIT_TABS.map(t => t.id);
    const cur = ids.indexOf((document.activeElement as HTMLElement)?.dataset?.swkTab as CockpitTab);
    if (cur < 0) return;
    const to = e.key === 'ArrowRight' ? (cur + 1) % ids.length : e.key === 'ArrowLeft' ? (cur - 1 + ids.length) % ids.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : -1;
    if (to >= 0) { e.preventDefault(); select(ids[to], true); }
  });
  root.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const t = COCKPIT_TABS.find(x => x.key === e.key);
    if (t) { e.preventDefault(); select(t.id, true); }
  });
  return select;
}

// ── Header ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export function headHTML(): string {
  return `<div class="swk-head">
    <div class="swk-head-l">
      <div class="swk-eyebrow">Should-cost · vehicle software</div>
      <h2 class="swk-title">Software programme</h2>
      <p class="swk-context" id="swk-context">Default programme</p>
    </div>
    <div class="swk-head-r">
      <span class="swk-live" id="swk-live" role="status"><i aria-hidden="true"></i><span>Live</span></span>
      <button type="button" class="swk-btn" data-swk-go="supplier">Check a quote</button>
      <button type="button" class="swk-btn" data-swk-click="sw-excel-btn">Excel</button>
      <button type="button" class="swk-btn swk-btn-primary" data-swk-click="sw-pdf-btn">PDF report</button>
    </div>
  </div>`;
}

export function contextLine(r: SWProgramResult, hubLabel: string): string {
  const p = r.inputs;
  const pt = p.powertrain ? `${p.powertrain} · ` : '';
  const src = p.devSource === 'OEM_Internal' ? 'in-house' : p.devSource === 'Tier1_Supplier' ? 'Tier-1 supplier' : 'start-up / OSS';
  return `${pt}${hubLabel} hub · ${src} · ${p.annualProductionVolume.toLocaleString('en-GB')} vehicles a year × ${p.programLifeYears} years · ${r.modules.length} modules`;
}

// ── Rail ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

interface RailFig { key: string; label: string; value: string; raw: number; sub: string; goodWhenDown: boolean; hero?: boolean }

/** The rail leads with the three figures purchasing compares — one-off engineering, the royalty in each vehicle's
 *  piece price, and the running cost per vehicle in service (costing review #9) — then the programme total. */
function railFigures(r: SWProgramResult, money: Money, moneyM: Money): RailFig[] {
  const s = r.summary;
  const u = swUnitEconomics(r);
  const sch = swSchedule(r);
  const mc = r.monteCarlo;
  // Royalties and running costs are pounds and pence a vehicle — whole pounds would hide them.
  const m2 = (n: number) => swMoney(n, 2);
  return [
    { key: 'pv', label: 'Per vehicle, all-in', value: money(s.perVehicle), raw: s.perVehicle, sub: `P10–P90 ${money(mc.p10PerVehicle)} – ${money(mc.p90PerVehicle)}`, goodWhenDown: true, hero: true },
    { key: 'nre', label: 'Engineering, one-off', value: moneyM(s.nreTotal), raw: s.nreTotal, sub: `${Math.round(s.totalEffortPersonMonths).toLocaleString('en-GB')} PM · ≈ ${Math.round(sch.averageTeam)} engineers × ${Math.round(sch.developmentMonths)} mo`, goodWhenDown: true },
    { key: 'built', label: 'Royalty per vehicle built', value: m2(u.perVehicleBuilt), raw: u.perVehicleBuilt, sub: 'in the piece price', goodWhenDown: true },
    { key: 'run', label: 'Running per vehicle-year', value: m2(u.perVehicleYear), raw: u.perVehicleYear, sub: `+ ${moneyM(u.fixedPerYear)} a year fixed`, goodWhenDown: true },
    { key: 'total', label: 'Programme total', value: moneyM(s.grandTotal), raw: s.grandTotal, sub: `headline ≈ P${mc.headlinePercentile} · P90 ${moneyM(mc.p90)}`, goodWhenDown: true },
  ];
}

export function railHTML(r: SWProgramResult | null, money: Money, moneyM: Money): string {
  if (!r) return `<div class="swk-rail-empty">Costing the default programme…</div>`;
  return railFigures(r, money, moneyM).map(f => `<div class="swk-fig${f.hero ? ' swk-hero' : ''}" data-fig="${f.key}">
      <div class="swk-fig-l">${esc(f.label)}</div>
      <div class="swk-fig-v"><span class="swk-v">${esc(f.value)}</span><span class="swk-delta" aria-hidden="true"></span></div>
      <div class="swk-fig-s">${esc(f.sub)}</div>
    </div>`).join('') + `<div class="swk-rail-msg" id="swk-rail-msg" role="alert" hidden></div>`;
}

const lastRaw = new Map<string, number>();

/** Update the rail in place: changed values cross-fade and carry a signed delta chip; the screen reader hears one line. */
export function updateRail(rail: HTMLElement, r: SWProgramResult, money: Money, moneyM: Money, opts: { quiet?: boolean } = {}): void {
  if (!rail.querySelector('.swk-fig')) { rail.innerHTML = railHTML(r, money, moneyM); }
  const figs = railFigures(r, money, moneyM);
  for (const f of figs) {
    const el = rail.querySelector<HTMLElement>(`[data-fig="${f.key}"]`);
    if (!el) continue;
    const v = el.querySelector<HTMLElement>('.swk-v')!, sub = el.querySelector<HTMLElement>('.swk-fig-s')!, chip = el.querySelector<HTMLElement>('.swk-delta')!;
    const before = lastRaw.get(f.key);
    lastRaw.set(f.key, f.raw);
    const changed = v.textContent !== f.value;
    v.textContent = f.value;
    sub.textContent = f.sub;
    // A quiet render (currency switch, first paint) is not a change the engineer made: drop any chip still showing,
    // or a £ delta would sit beside a € figure.
    if (opts.quiet) { window.clearTimeout(Number(chip.dataset.t || 0)); chip.className = 'swk-delta'; chip.textContent = ''; continue; }
    if (!changed || before === undefined) continue;
    const d = f.raw - before;
    if (Math.abs(d) < 1e-9) continue;
    const up = d > 0;
    const good = up !== f.goodWhenDown;
    const fmtD = f.key === 'pv' ? money(Math.abs(d)) : f.key === 'built' || f.key === 'run' ? swMoney(Math.abs(d), 2) : moneyM(Math.abs(d));
    chip.textContent = `${up ? '▲' : '▼'} ${fmtD}`;
    chip.className = `swk-delta is-on ${good ? 'is-good' : 'is-bad'}`;
    window.clearTimeout(Number(chip.dataset.t || 0));
    chip.dataset.t = String(window.setTimeout(() => { chip.classList.remove('is-on'); chip.textContent = ''; }, 2400));
    if (!reduced() && typeof v.animate === 'function') {
      v.animate([{ opacity: 0.35, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE });
    }
  }
  const msg = rail.querySelector<HTMLElement>('#swk-rail-msg');
  if (msg) msg.hidden = true;
  rail.classList.remove('is-stale');
}

/** The inputs cannot be costed: say why on the rail, keep the last good figures dimmed. */
export function railError(rail: HTMLElement, message: string): void {
  const msg = rail.querySelector<HTMLElement>('#swk-rail-msg');
  rail.classList.add('is-stale');
  if (msg) { msg.textContent = message; msg.hidden = false; }
}

// ── Result views ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function overviewHTML(r: SWProgramResult, _money: Money, moneyM: Money): string {
  const s = r.summary;
  const items = [
    { key: 'dev', label: 'Development', value: s.totalDevelopment, group: 'nre' as const },
    { key: 'test', label: 'Testing (SIL / MIL / HIL)', value: s.totalTesting, group: 'nre' as const },
    { key: 'integ', label: 'Integration', value: s.totalIntegration, group: 'nre' as const },
    { key: 'cyber', label: 'Cybersecurity', value: s.totalCybersecurity, group: 'nre' as const },
    { key: 'calib', label: 'Calibration', value: s.totalCalibration, group: 'nre' as const },
    { key: 'ml', label: 'ML data', value: s.totalMLData, group: 'nre' as const },
    { key: 'tools', label: 'Tool licences', value: s.totalToolchain, group: 'nre' as const },
    { key: 'homol', label: 'Homologation', value: s.totalHomologation, group: 'nre' as const },
    { key: 'maint', label: 'Maintenance', value: s.totalMaintenance, group: 'life' as const },
    { key: 'lic', label: 'Licences & royalties', value: s.totalLicensing, group: 'life' as const },
    { key: 'cloud', label: 'Cloud', value: s.totalCloud, group: 'life' as const },
  ];
  const lifecycle = s.totalMaintenance + s.totalCloud + s.totalLicensing;
  const lifeShare = s.grandTotal > 0 ? lifecycle / s.grandTotal : 0;
  const nodes = r.modules.map(m => ({ key: m.moduleId, label: m.moduleName.replace(/\s*\(.*?\)\s*/g, ' ').trim(), value: m.grandTotal, group: m.category, groupLabel: m.categoryLabel }));
  const top = [...r.modules].sort((a, b) => b.grandTotal - a.grandTotal).slice(0, 3);
  const callouts = [
    `<li><strong>${(lifeShare * 100).toFixed(0)} %</strong> of the programme is lifecycle (maintenance, licences, cloud) — ${lifeShare > 0.5 ? 'the running cost, not the engineering, sets this price' : 'engineering is the larger share'}.</li>`,
    `<li>The three largest modules — ${top.map(m => `${esc(m.moduleName)} (${esc(moneyM(m.grandTotal))})`).join(', ')} — are ${(top.reduce((a, m) => a + m.grandTotal, 0) / (s.grandTotal || 1) * 100).toFixed(0)} % of the total.</li>`,
    `<li>Monte Carlo: the headline sits at about P${r.monteCarlo.headlinePercentile}; P90 is ${esc(moneyM(r.monteCarlo.p90))} (+${(s.grandTotal > 0 ? (r.monteCarlo.p90 / s.grandTotal - 1) * 100 : 0).toFixed(0)} %).</li>`,
  ];
  return `<div class="swk-grid2">
      <section class="swk-card"><h3 class="swk-h">How the total builds up</h3><p class="swk-sub">One-off engineering, then what is paid every production year.</p>${waterfallChart('wf', items, s.grandTotal, moneyM)}</section>
      <section class="swk-card"><h3 class="swk-h">Where the money is</h3><p class="swk-sub">Each block is a module, sized by its programme cost; select one to see it on the vehicle.</p>${treemapChart('tm', nodes, moneyM)}</section>
    </div>
    <section class="swk-card"><h3 class="swk-h">What this says</h3><ul class="swk-callouts">${callouts.join('')}</ul></section>`;
}

export function riskHTML(r: SWProgramResult, _money: Money, moneyM: Money): string {
  const mc = r.monteCarlo;
  const rows = r.sensitivity.filter(x => x.unit === '£M').map(x => ({ label: x.parameter.replace(/\s*\(.*\)$/, ''), low: x.low, base: x.base, high: x.high,
    lowLabel: x.parameter.match(/\((.*) vs/)?.[1], highLabel: x.parameter.match(/vs (.*)\)$/)?.[1] }));
  return `<div class="swk-grid2">
    <section class="swk-card"><h3 class="swk-h">What moves the total</h3><p class="swk-sub">Each driver set to its low and high case, everything else held.</p>${tornadoChart('tor', rows, moneyM)}</section>
    <section class="swk-card"><h3 class="swk-h">How sure the total is</h3><p class="swk-sub">${mc.iterations.toLocaleString('en-GB')} seeded trials over the cost-bucket ranges (CostVision engineering estimates, correlated). The headline is not the median.</p>
      ${distributionChart('mc', mc.histogram, { p10: mc.p10, p50: mc.p50, p90: mc.p90, headline: r.summary.grandTotal, headlinePct: mc.headlinePercentile }, moneyM)}</section>
  </div>`;
}

export function spendHTML(r: SWProgramResult, _money: Money, moneyM: Money): string {
  const p = swSpendProfile(r);
  const kinds: Array<[string, string]> = [['engineering', 'Engineering'], ['maintenance', 'Maintenance'], ['licences', 'Licences'], ['royalties', 'Royalties'], ['cloud', 'Cloud']];
  const years = p.years.map(y => ({ label: y.label, total: y.total, parts: { engineering: y.engineering, maintenance: y.maintenance, licences: y.licences, royalties: y.royalties, cloud: y.cloud } as Record<string, number> }));
  const sch = swSchedule(r);
  const peak = p.years.reduce((a, y) => (y.total > a.total ? y : a), p.years[0]);
  return `<section class="swk-card"><h3 class="swk-h">Spend per year</h3><p class="swk-sub">${esc(p.note)} Peak year: ${esc(peak.label)} at ${esc(moneyM(peak.total))}.</p>
      ${spendChart('sp', years, kinds, p.sopIndex, moneyM)}</section>
    <section class="swk-card"><h3 class="swk-h">Schedule and team</h3>
      <p class="swk-sub">COCOMO II.2000 duration per module (modules developed in parallel). Average team ${Math.round(sch.averageTeam)} engineers over ${Math.round(sch.developmentMonths)} months.
      ${sch.overrunning.length ? `<strong>${sch.overrunning.length} module${sch.overrunning.length === 1 ? '' : 's'} need longer than the development window at nominal staffing.</strong>` : 'Every module fits the development window at nominal staffing.'}</p>
      <div class="swk-gantt" role="list">${sch.rows.slice(0, 12).map(x => `<div class="swk-g-row" role="listitem">
        <span class="swk-g-n">${esc(x.name)}</span>
        <span class="swk-g-track"><span class="swk-g-bar${x.tdevMonths > sch.developmentMonths ? ' is-over' : ''}" style="width:${Math.min(100, x.tdevMonths / Math.max(sch.developmentMonths, sch.longestMonths) * 100).toFixed(1)}%"></span>
          <span class="swk-g-win" style="left:${Math.min(100, sch.developmentMonths / Math.max(sch.developmentMonths, sch.longestMonths) * 100).toFixed(1)}%" aria-hidden="true"></span></span>
        <span class="swk-g-v">${x.tdevMonths.toFixed(0)} mo · ${x.avgStaff.toFixed(1)} FTE</span></div>`).join('')}</div>
      <p class="swk-sub">${esc(sch.basis)}</p></section>`;
}

// ── Supplier check ───────────────────────────────────────────────────────────────────────────────────────────────────

export function supplierFormHTML(cats: Array<[SWCategory, string]>): string {
  return `<section class="swk-card"><h3 class="swk-h">Check a supplier quote</h3>
    <p class="swk-sub">Enter what the supplier quoted for the scope costed here. The check compares it with this should-cost and works out the £ per person-month the quote implies for the engineering effort.</p>
    <div class="swk-qgrid">
      <label class="swk-q"><span>Quoted engineering / NRE (£)</span><input id="swk-q-nre" type="number" min="0" step="10000" inputmode="decimal" data-no-live></label>
      <label class="swk-q"><span>Quoted licence / royalty (£ per vehicle)</span><input id="swk-q-pv" type="number" min="0" step="1" inputmode="decimal" data-no-live></label>
    </div>
    <details class="swk-qdom"><summary>Quotes by domain (optional)</summary><div class="swk-qgrid">${cats.map(([c, l]) =>
      `<label class="swk-q"><span>${esc(l)} (£)</span><input class="swk-q-cat" data-cat="${c}" type="number" min="0" step="10000" data-no-live></label>`).join('')}</div></details>
    <div id="swk-quote-out" aria-live="polite"><p class="swk-empty">No quote entered yet.</p></div></section>`;
}

export function readQuote(root: HTMLElement): SWQuote {
  const num = (id: string) => { const v = parseFloat((root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? '').trim()); return Number.isFinite(v) && v > 0 ? v : undefined; };
  const byCategory: Partial<Record<SWCategory, number>> = {};
  root.querySelectorAll<HTMLInputElement>('.swk-q-cat').forEach(i => { const v = parseFloat(i.value); if (v > 0) byCategory[i.dataset.cat as SWCategory] = v; });
  return { nreGBP: num('swk-q-nre'), perVehicleGBP: num('swk-q-pv'), byCategory };
}

export function supplierResultHTML(r: SWProgramResult, quote: SWQuote, money: Money, moneyM: Money): string {
  const q = swQuoteCheck(r, quote);
  const rows = [q.nre, q.perVehicle, ...q.byCategory].filter(Boolean) as NonNullable<typeof q.nre>[];
  if (!rows.length) return '<p class="swk-empty">No quote entered yet.</p>';
  const fmtOf = (k: string) => (k === 'perVehicle' ? money : moneyM);
  return `<div class="swk-qrows">${rows.map(x => { const max = Math.max(x.should, x.quoted) || 1; return `<div class="swk-qrow">
      <div class="swk-qrow-h"><strong>${esc(x.label)}</strong><span class="swk-gap ${x.gap > 0 ? 'is-bad' : 'is-good'}">${x.gap > 0 ? '+' : '−'}${esc(fmtOf(x.key)(Math.abs(x.gap)))} (${x.gapPct >= 0 ? '+' : ''}${x.gapPct.toFixed(0)} %)</span></div>
      <div class="swk-qbar"><span class="swk-qb swk-qb-s" style="width:${(x.should / max * 100).toFixed(1)}%"></span><span class="swk-qlab">Should-cost ${esc(fmtOf(x.key)(x.should))}</span></div>
      <div class="swk-qbar"><span class="swk-qb swk-qb-q" style="width:${(x.quoted / max * 100).toFixed(1)}%"></span><span class="swk-qlab">Quote ${esc(fmtOf(x.key)(x.quoted))}</span></div>
    </div>`; }).join('')}</div>
    ${q.impliedRatePerPM ? `<p class="swk-implied">The NRE quote, less tool licences and homologation, buys the ${Math.round(r.summary.totalEffortPersonMonths).toLocaleString('en-GB')} person-months costed here at
      <strong>${esc(money(q.impliedRatePerPM))} per person-month</strong> — <strong>×${q.rateMultiple!.toFixed(2)}</strong> the should-cost loaded rate of ${esc(money(q.loadedRatePerPM))}
      (hub rate × development source × overhead). The difference is the supplier's overhead, margin, risk allowance and any scope or effort difference: ask for its person-month breakdown.</p>` : ''}`;
}

// ── Styles ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export const COCKPIT_CSS = CHART_CSS + `
.sw-cockpit{display:flex;flex-direction:column;gap:14px}
.sw-cockpit .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.swk-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;padding:4px 2px 0}
.swk-eyebrow{font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:var(--sw-accent);font-weight:700}
.swk-title{margin:2px 0 2px;font-size:1.3rem;font-weight:750;color:var(--sw-text-primary);letter-spacing:-.01em}
.swk-context{margin:0;font-size:.8rem;color:var(--sw-text-secondary)}
.swk-head-r{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.swk-btn{font:inherit;font-size:.78rem;font-weight:600;padding:7px 12px;border-radius:8px;border:1px solid var(--sw-border);background:var(--sw-surface);color:var(--sw-text-primary);cursor:pointer;transition:border-color var(--dur-hover,200ms) ease,background-color var(--dur-hover,200ms) ease}
.swk-btn:hover{border-color:var(--sw-accent)}
.swk-btn-primary{background:var(--sw-accent);border-color:var(--sw-accent);color:var(--sw-on-accent)}
.swk-live{display:inline-flex;align-items:center;gap:6px;font-size:.72rem;color:var(--sw-text-secondary);margin-right:4px}
.swk-live i{width:7px;height:7px;border-radius:50%;background:var(--sw-good)}
.swk-live.is-busy i{background:var(--sw-warn)}
.swk-rail{position:sticky;top:0;z-index:4;display:grid;grid-template-columns:1.35fr repeat(4,minmax(0,1fr));gap:1px;background:var(--sw-border);
  border:1px solid var(--sw-border);border-radius:12px;overflow:hidden;box-shadow:0 6px 18px -12px rgba(0,0,0,.45)}
@media (max-width:900px){.swk-rail{grid-template-columns:repeat(2,minmax(0,1fr))}.swk-hero{grid-column:1/-1}}
.swk-fig{background:var(--sw-surface);padding:10px 14px;min-width:0}
.swk-fig-l{font-size:.68rem;letter-spacing:.04em;text-transform:uppercase;color:var(--sw-text-secondary);font-weight:600}
.swk-fig-v{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.swk-v{font-size:1.2rem;font-weight:750;color:var(--sw-text-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
.swk-hero .swk-v{font-size:1.8rem}
.swk-fig-s{font-size:.7rem;color:var(--sw-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.swk-delta{font-size:.7rem;font-weight:700;padding:1px 6px;border-radius:999px;opacity:0;transform:translateY(3px);transition:opacity 180ms cubic-bezier(.22,.61,.36,1),transform 180ms cubic-bezier(.22,.61,.36,1);font-variant-numeric:tabular-nums}
.swk-delta.is-on{opacity:1;transform:none}
.swk-delta.is-good{color:var(--sw-good);background:color-mix(in srgb,var(--sw-good) 14%,transparent)}
.swk-delta.is-bad{color:var(--sw-bad);background:color-mix(in srgb,var(--sw-bad) 14%,transparent)}
.swk-rail.is-stale .swk-fig{opacity:.55}
.swk-rail-msg{grid-column:1/-1;background:var(--sw-surface);color:var(--sw-bad);font-size:.78rem;padding:8px 14px;font-weight:600}
.swk-rail-empty{grid-column:1/-1;background:var(--sw-surface);padding:16px;color:var(--sw-text-secondary);font-size:.82rem}
.swk-tabs{display:flex;gap:2px;align-items:center;overflow-x:auto;border-bottom:1px solid var(--sw-border);scrollbar-width:thin}
.swk-tabgrp{font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--sw-text-muted);padding:0 6px 0 12px;white-space:nowrap}
.swk-tabgrp:first-child{padding-left:2px}
.swk-tab{font:inherit;font-size:.8rem;font-weight:600;color:var(--sw-text-secondary);background:none;border:none;border-bottom:2px solid transparent;padding:9px 10px;cursor:pointer;white-space:nowrap;transition:color var(--dur-hover,200ms) ease,border-color var(--dur-hover,200ms) ease}
.swk-tab:hover{color:var(--sw-text-primary)}
.swk-tab.is-on{color:var(--sw-text-primary);border-bottom-color:var(--sw-accent)}
.swk-tab:focus-visible{outline:2px solid var(--sw-accent);outline-offset:-2px;border-radius:6px}
.swk-panel{display:flex;flex-direction:column;gap:14px;min-width:0}
.swk-panel[hidden]{display:none}
.swk-stack{display:flex;flex-direction:column;gap:14px;min-width:0}
.swk-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:14px}
.swk-card{background:var(--sw-surface);border:1px solid var(--sw-border);border-radius:12px;padding:14px 16px;min-width:0}
.swk-h{margin:0;font-size:.95rem;font-weight:700;color:var(--sw-text-primary)}
.swk-sub{margin:3px 0 10px;font-size:.76rem;color:var(--sw-text-secondary);max-width:80ch}
.swk-callouts{margin:6px 0 0;padding-left:18px;font-size:.82rem;color:var(--sw-text-body);display:flex;flex-direction:column;gap:6px}
.swk-empty{font-size:.8rem;color:var(--sw-text-secondary);margin:8px 0 0}
.swk-gantt{display:flex;flex-direction:column;gap:5px;margin:6px 0 8px}
.swk-g-row{display:grid;grid-template-columns:minmax(0,220px) 1fr auto;gap:10px;align-items:center;font-size:.74rem}
.swk-g-n{color:var(--sw-text-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.swk-g-track{position:relative;height:10px;background:var(--sw-surface-alt);border-radius:5px}
.swk-g-bar{position:absolute;inset:0 auto 0 0;background:var(--swc-1);border-radius:5px}
.swk-g-bar.is-over{background:var(--swc-2)}
.swk-g-win{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--sw-text-primary)}
.swk-g-v{color:var(--sw-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.swk-qgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 14px;margin:8px 0}
.swk-q{display:flex;flex-direction:column;gap:4px;font-size:.76rem;color:var(--sw-text-body);font-weight:600}
.swk-q input{font:inherit;font-weight:400;padding:7px 10px;border:1px solid var(--sw-border);border-radius:7px;background:var(--sw-surface);color:var(--sw-text-primary)}
.swk-qdom summary{cursor:pointer;font-size:.76rem;color:var(--sw-text-secondary)}
.swk-qrows{display:flex;flex-direction:column;gap:12px;margin-top:10px}
.swk-qrow-h{display:flex;justify-content:space-between;gap:10px;font-size:.8rem;color:var(--sw-text-primary)}
.swk-gap{font-weight:700;font-variant-numeric:tabular-nums}.swk-gap.is-bad{color:var(--sw-bad)}.swk-gap.is-good{color:var(--sw-good)}
.swk-qbar{position:relative;height:20px;margin-top:4px}
.swk-qb{position:absolute;left:0;top:3px;height:14px;border-radius:0 4px 4px 0;transition:width 220ms cubic-bezier(.22,.61,.36,1)}
.swk-qb-s{background:var(--swc-1)}.swk-qb-q{background:var(--swc-2)}
.swk-qlab{position:relative;font-size:.72rem;color:var(--sw-text-primary);padding-left:6px;line-height:20px;mix-blend-mode:normal;text-shadow:0 0 3px var(--sw-surface)}
.swk-implied{font-size:.8rem;color:var(--sw-text-body);margin:12px 0 0;max-width:85ch}
.swk-scopebar{display:flex;gap:8px 12px;flex-wrap:wrap;align-items:center;padding:10px 12px;border:1px solid var(--sw-border);border-radius:10px;background:var(--sw-surface)}
.swk-scopebar input[type=search]{font:inherit;font-size:.8rem;padding:6px 10px;border:1px solid var(--sw-border);border-radius:7px;background:var(--sw-surface-alt);color:var(--sw-text-primary);min-width:220px}
.swk-scopebar select{font:inherit;font-size:.76rem;padding:5px 8px;border:1px solid var(--sw-border);border-radius:7px;background:var(--sw-surface);color:var(--sw-text-primary)}
.swk-scopebar .swk-count{font-size:.74rem;color:var(--sw-text-secondary);margin-left:auto}
.sw-module-row.swk-hit-none{display:none}
@media (prefers-reduced-motion: reduce){.swk-delta,.swk-qb{transition:none}}
`;

export { wireCharts };
