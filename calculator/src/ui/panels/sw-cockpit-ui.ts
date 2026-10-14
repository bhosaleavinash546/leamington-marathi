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
import { swSpendProfile, swQuoteCheck, swUnitEconomics, swEvidence, type SWQuote } from '../../engine/sw-cockpit.js';
import { swSchedule } from '../../engine/sw-schedule.js';
import {
  waterfallChart, treemapChart, tornadoChart, distributionChart, spendChart, scenarioChart, wireCharts, CHART_CSS, type Money,
} from './sw-charts.js';
import type { SWScenarioRow, SWScenarioFigures } from '../../engine/sw-scenarios.js';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const reduced = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

// ── Tabs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type CockpitTab = 'setup' | 'scope' | 'overview' | 'vehicle' | 'risk' | 'spend' | 'modules' | 'supplier' | 'scenarios' | 'rates' | 'report';

export const COCKPIT_TABS: Array<{ id: CockpitTab; label: string; group: 'Inputs' | 'Results' | 'Method'; key: string }> = [
  { id: 'setup', label: 'Setup', group: 'Inputs', key: '1' },
  { id: 'scope', label: 'Scope', group: 'Inputs', key: '2' },
  { id: 'overview', label: 'Overview', group: 'Results', key: '3' },
  { id: 'vehicle', label: 'Vehicle', group: 'Results', key: '4' },
  { id: 'risk', label: 'Risk', group: 'Results', key: '5' },
  { id: 'spend', label: 'Spend & schedule', group: 'Results', key: '6' },
  { id: 'modules', label: 'Modules', group: 'Results', key: '7' },
  { id: 'supplier', label: 'Supplier check', group: 'Results', key: '8' },
  { id: 'scenarios', label: 'Scenarios', group: 'Results', key: '9' },
  { id: 'rates', label: 'Rates & method', group: 'Method', key: '0' },
  // Eleven tabs, ten digits: the report is one click away and its exports sit in the header.
  { id: 'report', label: 'Report', group: 'Method', key: '' },
];

export function tabsHTML(active: CockpitTab): string {
  let group = '';
  return `<div class="swk-tabs" role="tablist" aria-label="Software costing">${COCKPIT_TABS.map(t => {
    const sep = t.group !== group ? `<span class="swk-tabgrp" aria-hidden="true">${esc(t.group)}</span>` : '';
    group = t.group;
    return `${sep}<button type="button" role="tab" id="swk-t-${t.id}" class="swk-tab${t.id === active ? ' is-on' : ''}"
      aria-selected="${t.id === active}" aria-controls="swk-p-${t.id}" tabindex="${t.id === active ? 0 : -1}" data-swk-tab="${t.id}"
      ${t.key ? `aria-keyshortcuts="Alt+${t.key}" title="${esc(`${t.label} (Alt+${t.key})`)}"` : ''}>${esc(t.label)}</button>`;
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
      if (on && !was && !reduced()) void import('../animations.js').then(a => a.swEnter(p)).catch(() => {});
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
    const t = COCKPIT_TABS.find(x => x.key !== '' && x.key === e.key);
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
      <span class="swk-hist" role="group" aria-label="Undo and redo">
        <button type="button" class="swk-btn swk-icon" id="swk-undo" disabled aria-keyshortcuts="Control+Z Meta+Z" title="Undo (${MOD}Z)"><span aria-hidden="true">↶</span><span class="sr-only">Undo</span></button>
        <button type="button" class="swk-btn swk-icon" id="swk-redo" disabled aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" title="Redo (${MOD}⇧Z)"><span aria-hidden="true">↷</span><span class="sr-only">Redo</span></button>
      </span>
      <button type="button" class="swk-btn swk-icon" id="swk-keys-btn" aria-keyshortcuts="Shift+?" title="Keyboard shortcuts (?)" aria-haspopup="dialog"><span aria-hidden="true">?</span><span class="sr-only">Keyboard shortcuts</span></button>
      <button type="button" class="swk-btn" data-swk-go="supplier">Check a quote</button>
      <button type="button" class="swk-btn" data-swk-click="sw-excel-btn">Excel</button>
      <button type="button" class="swk-btn swk-btn-primary" data-swk-click="sw-pdf-btn">PDF report</button>
    </div>
  </div>`;
}

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';

/** The keyboard map: a native modal <dialog> (Esc closes, focus returns), listing every shortcut the cockpit answers. */
export function shortcutsDialogHTML(): string {
  const row = (k: string, what: string) => `<tr><th scope="row"><kbd>${k}</kbd></th><td>${esc(what)}</td></tr>`;
  return `<dialog class="swk-dialog" id="swk-keys" aria-labelledby="swk-keys-h">
    <div class="swk-dialog-h"><h3 id="swk-keys-h">Keyboard shortcuts</h3><button type="button" class="swk-btn" data-close>Close</button></div>
    <table class="swk-keys"><tbody>
      ${row(`${MOD}Z`, 'Undo the last change')}
      ${row(`${MOD}⇧Z · Ctrl+Y`, 'Redo')}
      ${row('Alt+1 … Alt+0', 'Go to a tab (Setup … Rates & method)')}
      ${row('← → · Home · End', 'Move between tabs when a tab has focus')}
      ${row('/', 'Find a module (opens Scope)')}
      ${row('B', 'Pin the current programme as the scenario baseline')}
      ${row('?', 'Show this list')}
      ${row('Esc', 'Close this list')}
    </tbody></table>
    <p class="swk-sub">Every change recosts the programme within a quarter of a second; undo walks back through those costed states.</p>
  </dialog>`;
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
    { key: 'run', label: 'Running per vehicle-year', value: m2(u.perVehicleYear), raw: u.perVehicleYear, sub: `map ${u.subscriptionYears} yr · cloud ${u.serviceYears} yr · + ${moneyM(u.fixedPerYear)} / yr fixed`, goodWhenDown: true },
    { key: 'total', label: 'Programme total', value: moneyM(s.grandTotal), raw: s.grandTotal, sub: `≈ P${mc.headlinePercentile} · P50 ${moneyM(mc.p50)} · P90 ${moneyM(mc.p90)}`, goodWhenDown: true },
  ];
}

export function railHTML(r: SWProgramResult | null, money: Money, moneyM: Money): string {
  if (!r) return `<div class="swk-rail-empty">Costing the default programme…</div>`;
  return railFigures(r, money, moneyM).map(f => `<div class="swk-fig${f.hero ? ' swk-hero' : ''}" data-fig="${f.key}">
      <div class="swk-fig-l">${esc(f.label)}</div>
      <div class="swk-fig-v"><span class="swk-v">${esc(f.value)}</span><span class="swk-delta" aria-hidden="true"></span></div>
      <div class="swk-fig-s" title="${esc(f.sub)}">${esc(f.sub)}</div>
    </div>`).join('') + `<div class="swk-rail-ev" id="swk-rail-ev">${railEvidence(r, moneyM)}</div>
    <button type="button" class="swk-rail-more" aria-expanded="false" aria-controls="swk-rail">All figures</button>
    <div class="swk-rail-msg" id="swk-rail-msg" role="alert" hidden></div>
    <div class="sr-only" id="swk-rail-say" aria-live="polite"></div>`;
}

/** The rail's evidence line: how much of the total rests on unsourced figures (independent review gap 1). */
function railEvidence(r: SWProgramResult, moneyM: Money): string {
  const ev = swEvidence(r);
  return `<span><strong>${moneyM(ev.byGrade.unsourced)} (${Math.round(ev.unsourcedShare * 100)} %)</strong> of the total rests on unsourced catalogue figures.</span>
    <button type="button" class="swk-link" data-swk-go="rates">See the evidence</button>`;
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
    sub.textContent = f.sub; sub.title = f.sub;
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
    if (!reduced()) void import('../animations.js').then(a => a.swValueChanged(v)).catch(() => {});
  }
  const ev = rail.querySelector<HTMLElement>('#swk-rail-ev');
  if (ev) ev.innerHTML = railEvidence(r, moneyM);
  // One polite sentence for a screen reader when the answer moves (independent review gap 10).
  const say = rail.querySelector<HTMLElement>('#swk-rail-say');
  if (say && !opts.quiet) say.textContent = `Per vehicle ${figs[0].value}, programme total ${figs[4].value}.`;
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
    <section class="swk-card"><h3 class="swk-h">How sure the total is</h3><p class="swk-sub">${mc.iterations.toLocaleString('en-GB')} seeded trials; each line's range follows its evidence grade (correlated). The headline is not the median — see below.</p>
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
      <label class="swk-q"><span>Quoted royalty (£ per vehicle built)</span><input id="swk-q-pv" type="number" min="0" step="0.01" inputmode="decimal" data-no-live></label>
      <label class="swk-q"><span>Quoted service (£ per vehicle per year)</span><input id="swk-q-pvy" type="number" min="0" step="0.01" inputmode="decimal" data-no-live></label>
      <label class="swk-q"><span>Quoted fixed (£ per year)</span><input id="swk-q-fixed" type="number" min="0" step="10000" inputmode="decimal" data-no-live></label>
      <label class="swk-q"><span>Supplier's person-months (optional)</span><input id="swk-q-pm" type="number" min="0" step="1" inputmode="decimal" data-no-live></label>
    </div>
    <details class="swk-qdom"><summary>Quotes by domain (optional)</summary><div class="swk-qgrid">${cats.map(([c, l]) =>
      `<label class="swk-q"><span>${esc(l)} (£)</span><input class="swk-q-cat" data-cat="${c}" type="number" min="0" step="10000" data-no-live></label>`).join('')}</div></details>
    <div id="swk-quote-out" aria-live="polite"><p class="swk-empty">No quote entered yet.</p></div></section>`;
}

export function readQuote(root: HTMLElement): SWQuote {
  const num = (id: string) => { const v = parseFloat((root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? '').trim()); return Number.isFinite(v) && v > 0 ? v : undefined; };
  const byCategory: Partial<Record<SWCategory, number>> = {};
  root.querySelectorAll<HTMLInputElement>('.swk-q-cat').forEach(i => { const v = parseFloat(i.value); if (v > 0) byCategory[i.dataset.cat as SWCategory] = v; });
  return { nreGBP: num('swk-q-nre'), perVehicleGBP: num('swk-q-pv'), perVehicleYearGBP: num('swk-q-pvy'), fixedPerYearGBP: num('swk-q-fixed'), quotedPM: num('swk-q-pm'), byCategory };
}

export function supplierResultHTML(r: SWProgramResult, quote: SWQuote, money: Money, moneyM: Money): string {
  const q = swQuoteCheck(r, quote);
  const rows = [q.nre, q.perVehicle, q.perVehicleYear, q.fixedPerYear, ...q.byCategory].filter(Boolean) as NonNullable<typeof q.nre>[];
  const target = `<p class="swk-implied"><strong>Negotiation target:</strong> a fair Tier-1 price for this scope is <strong>${esc(moneyM(q.target.nre))}</strong> of engineering
      at ${esc(money(q.target.ratePerPM))} per person-month (${esc(q.target.basis)}).</p>`;
  if (!rows.length) return `<p class="swk-empty">No quote entered yet.</p>${target}`;
  const unitFmt = (u: string) => (u === 'perVehicle' ? (n: number) => swMoney(n, 2) : moneyM);
  const fmtOf = (k: string) => unitFmt(rows.find(x => x.key === k)?.unit ?? 'total');
  return `<div class="swk-qrows">${rows.map(x => { const max = Math.max(x.should, x.quoted) || 1; return `<div class="swk-qrow">
      <div class="swk-qrow-h"><strong>${esc(x.label)}</strong><span class="swk-gap ${x.gap > 0 ? 'is-bad' : 'is-good'}">${x.gap > 0 ? '+' : '−'}${esc(fmtOf(x.key)(Math.abs(x.gap)))} (${x.gapPct >= 0 ? '+' : ''}${x.gapPct.toFixed(0)} %)</span></div>
      <div class="swk-qbar"><span class="swk-qb swk-qb-s" style="width:${(x.should / max * 100).toFixed(1)}%"></span><span class="swk-qlab">Should-cost ${esc(fmtOf(x.key)(x.should))}</span></div>
      <div class="swk-qbar"><span class="swk-qb swk-qb-q" style="width:${(x.quoted / max * 100).toFixed(1)}%"></span><span class="swk-qlab">Quote ${esc(fmtOf(x.key)(x.quoted))}</span></div>
    </div>`; }).join('')}</div>
    ${q.impliedRatePerPM ? `<p class="swk-implied">The NRE quote, less tool licences and homologation, buys the ${Math.round(r.summary.totalEffortPersonMonths).toLocaleString('en-GB')} person-months costed here at
      <strong>${esc(money(q.impliedRatePerPM))} per person-month</strong> — <strong>×${q.rateMultiple!.toFixed(2)}</strong> the should-cost loaded rate of ${esc(money(q.loadedRatePerPM))}
      (hub rate × development source × burden). The difference is the supplier's overhead, margin, risk allowance and any scope or effort difference${q.gapSplit ? '' : ': ask for its person-month breakdown'}.</p>` : ''}
    ${q.gapSplit && q.nre ? `<div class="swk-kv"><div><span>Quote − target</span><strong>${esc(moneyM(q.nre.quoted - q.target.nre))}</strong></div>
      <div><span>Effort gap</span><strong>${esc(moneyM(q.gapSplit.effortGap))}</strong></div>
      <div><span>Rate gap</span><strong>${esc(moneyM(q.gapSplit.rateGap))}</strong></div>
      <div><span>Supplier's £ / PM</span><strong>${esc(money(q.gapSplit.quotedRatePerPM))}</strong></div></div>
      <p class="swk-note">Effort gap = (supplier PM − should-cost PM) × the Tier-1 target rate; rate gap = (supplier £/PM − target £/PM) × supplier PM. Challenge the larger one first.</p>` : ''}
    ${target}`;
}

// ── Scenarios ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ScenarioMode = 'saved' | 'source' | 'hub' | 'reuse';

export function scenariosPanelHTML(): string {
  const gen = (m: ScenarioMode, l: string) => `<button type="button" class="swk-seg" data-sc-mode="${m}" aria-pressed="${m === 'saved'}">${esc(l)}</button>`;
  return `<section class="swk-card">
    <div class="swk-sc-top">
      <div><h3 class="swk-h">Scenarios</h3>
        <p class="swk-sub">Pin a baseline, then compare. Each row is costed on its own inputs. The change column is against the baseline, and "What differs" lists the inputs behind it.</p></div>
      <div class="swk-sc-actions">
        <span class="swk-sc-base" id="swk-sc-base" aria-live="polite">Baseline: the current programme</span>
        <button type="button" class="swk-btn" id="swk-sc-pin" aria-keyshortcuts="B" title="Pin the current programme as the baseline (B)">Pin current as baseline</button>
      </div>
    </div>
    <form class="swk-sc-save" id="swk-sc-save" data-no-live>
      <label for="swk-sc-name" class="sr-only">Scenario name</label>
      <input id="swk-sc-name" type="text" maxlength="60" placeholder="Name this scenario, e.g. India hub · heavy reuse" data-no-live autocomplete="off">
      <button type="submit" class="swk-btn swk-btn-primary">Save current</button>
      <span class="swk-sc-msg" id="swk-sc-msg" role="status"></span>
    </form>
    <div class="swk-segs" role="group" aria-label="Compare">
      <span class="swk-segs-l">Compare</span>${gen('saved', 'Saved scenarios')}${gen('source', 'Development sources')}${gen('hub', 'Hubs')}${gen('reuse', 'Reuse levels')}
    </div>
    <div id="swk-sc-out"></div>
  </section>`;
}

const FIG_COLS: Array<[keyof SWScenarioFigures, string, 'pv' | 'm' | 'p2' | 'pm']> = [
  ['perVehicle', 'Per vehicle', 'pv'], ['total', 'Programme total', 'm'], ['nre', 'Engineering', 'm'],
  ['perVehicleBuilt', 'Royalty / vehicle built', 'p2'], ['perVehicleYear', 'Running / vehicle-year', 'p2'], ['p90', 'P90 total', 'm'], ['effortPM', 'Effort', 'pm'],
];

/** The comparison: a per-vehicle bar per scenario, then the table with the change against the baseline. */
export function scenarioResultHTML(rows: SWScenarioRow[], money: Money, moneyM: Money, opts: { savedIds: Set<string>; baselineName: string }): string {
  if (rows.length < 2) return `<p class="swk-empty">Nothing to compare yet. Save the current programme under a name, change an input, save again — or pick Development sources, Hubs or Reuse levels above.</p>`;
  const f = (k: 'pv' | 'm' | 'p2' | 'pm', v: number) => k === 'pv' ? money(v) : k === 'p2' ? swMoney(v, 2) : k === 'pm' ? `${Math.round(v).toLocaleString('en-GB')} PM` : moneyM(v);
  const signed = (k: 'pv' | 'm' | 'p2' | 'pm', d: number) => Math.abs(d) < (k === 'p2' ? 0.005 : 0.5) ? '—' : `${d > 0 ? '▲' : '▼'} ${f(k, Math.abs(d))}`;
  const ok = rows.filter(r => r.figures);
  const chart = scenarioChart('sc', ok.map(r => ({ key: r.id, label: r.name, value: r.figures!.perVehicle, base: !r.delta })), 'Per vehicle, all-in', money);
  // Phone: the same figures as a list that reflows (the SVG would shrink its text to ~5 px).
  const maxPv = Math.max(1, ...ok.map(r => r.figures!.perVehicle));
  const bars = `<ol class="swk-sc-bars" aria-label="Per vehicle by scenario">${ok.map(r => `<li class="${r.delta ? '' : 'is-base'}"><span>${esc(r.name)}${r.delta ? '' : ' (baseline)'}</span>
    <span class="v">${esc(money(r.figures!.perVehicle))}${r.delta ? ` · ${r.delta.perVehicle >= 0 ? '+' : '−'}${esc(money(Math.abs(r.delta.perVehicle)))}` : ''}</span>
    <span class="b" style="width:${(r.figures!.perVehicle / maxPv * 100).toFixed(1)}%" aria-hidden="true"></span></li>`).join('')}</ol>`;
  const head = `<tr><th scope="col">Scenario · what differs</th>${FIG_COLS.map(([, l]) => `<th scope="col" class="n">${esc(l)}</th>`).join('')}</tr>`;
  const body = rows.map(r => {
    const isBase = r.figures && !r.delta;
    const cells = r.figures ? FIG_COLS.map(([k, , u]) => {
      const d = r.delta?.[k];
      const cls = d == null || Math.abs(d) < 1e-9 ? '' : d > 0 ? ' is-up' : ' is-down';
      return `<td class="n"><span class="swk-sc-v">${esc(f(u, r.figures![k]))}</span>${d == null ? '' : `<span class="swk-sc-d${cls}">${esc(signed(u, d))}</span>`}</td>`;
    }).join('') : `<td colspan="${FIG_COLS.length}" class="swk-sc-err">Not costed: ${esc(r.error ?? 'invalid inputs')}</td>`;
    const saved = opts.savedIds.has(r.id);
    const acts = [
      r.kind !== 'baseline' && r.kind !== 'current' ? `<button type="button" class="swk-link" data-sc-load="${esc(r.id)}">Load</button>` : '',
      !isBase ? `<button type="button" class="swk-link" data-sc-base="${esc(r.id)}">Use as baseline</button>` : '',
      saved ? `<button type="button" class="swk-link swk-link-del" data-sc-del="${esc(r.id)}" aria-label="Delete ${esc(r.name)}">Delete</button>` : '',
    ].filter(Boolean).join('');
    const diff = isBase ? '' : r.differs.length ? `<ul class="swk-sc-diff">${r.differs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="swk-sc-diff swk-muted">same inputs</span>';
    return `<tr class="${isBase ? 'is-base' : ''}"><th scope="row"><span class="swk-sc-name">${esc(r.name)}${isBase ? ' <span class="swk-pill">baseline</span>' : ''}${r.kind === 'current' ? ' <span class="swk-pill swk-pill-q">current</span>' : ''}</span>
      ${diff}${acts ? `<span class="swk-sc-acts">${acts}</span>` : ''}</th>${cells}</tr>`;
  }).join('');
  return `${chart}${bars}
    <div class="swk-sc-tw" tabindex="0" role="region" aria-label="Scenario comparison table"><table class="swk-sc-t"><caption class="sr-only">Scenarios against the baseline ${esc(opts.baselineName)}; ▲ costs more, ▼ costs less</caption><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
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
/* Single-series marks take the app's one accent; multi-series charts keep the validated categorical palette. */
.swk-g-bar{position:absolute;inset:0 auto 0 0;background:var(--sw-accent);border-radius:5px}
.swk-g-bar.is-over{background:var(--sw-warn)}
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
.swk-icon{min-width:32px;padding:6px 9px;font-size:.9rem;line-height:1}
.swk-rail-ev{grid-column:1/-1;background:var(--sw-surface);padding:6px 14px;font-size:.74rem;color:var(--sw-text-secondary);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.swk-rail-ev strong{color:var(--sw-text-primary)}
.swk-rail-more{display:none}
.swk-burden-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.swk-burden-row label{display:flex;flex-direction:column;gap:4px;font-size:.74rem;color:var(--sw-text-secondary);flex:1 1 120px}
.swk-burden-out{font-size:1rem;font-weight:700;color:var(--sw-text-primary);font-variant-numeric:tabular-nums;padding:6px 4px}
.swk-fieldnote{font-size:.72rem;color:var(--sw-text-secondary);margin:6px 0 0;max-width:95ch}
.swk-sc-bars{display:none;list-style:none;margin:6px 0;padding:0;flex-direction:column;gap:8px}
.swk-sc-bars li{display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-size:.78rem;color:var(--sw-text-body)}
.swk-sc-bars .b{grid-column:1/-1;height:10px;border-radius:0 4px 4px 0;background:var(--sw-accent)}
.swk-sc-bars li.is-base .b{background:var(--swc-ink)}
.swk-sc-bars .v{font-variant-numeric:tabular-nums;color:var(--sw-text-primary)}
@media (max-width:900px){.swk-tabs{-webkit-mask-image:linear-gradient(90deg,#000 80%,transparent);mask-image:linear-gradient(90deg,#000 80%,transparent);padding-right:24px}}
@media (max-width:700px){
  .swk-rail-more{display:block;grid-column:1/-1;font:inherit;font-size:.76rem;font-weight:600;padding:8px;border:none;background:var(--sw-surface);color:var(--sw-accent);cursor:pointer}
  .swk-rail:not(.is-open) .swk-fig:not(.swk-hero):not([data-fig="total"]){display:none}
  .swk-rail:not(.is-open) .swk-rail-ev{display:none}
  .swk-head-r .swk-btn:not(.swk-icon):not(.swk-btn-primary){display:none}
}
@media (max-width:600px){.swk-sc-bars{display:flex}#swk-sc-out figure.swc{display:none}}
.swk-btn:disabled{opacity:.45;cursor:default}
.swk-btn:disabled:hover{border-color:var(--sw-border)}
.swk-btn:focus-visible,.swk-seg:focus-visible,.swk-domain:focus-visible,.swk-link:focus-visible{outline:2px solid var(--sw-accent);outline-offset:2px}
.swk-hist{display:inline-flex;gap:4px}
.swk-dialog{border:1px solid var(--sw-border);border-radius:12px;background:var(--sw-surface);color:var(--sw-text-body);padding:16px 18px;max-width:min(520px,calc(100vw - 32px));
  opacity:1;transform:none;transition:opacity 200ms cubic-bezier(.22,.61,.36,1),transform 200ms cubic-bezier(.22,.61,.36,1),overlay 200ms allow-discrete,display 200ms allow-discrete}
.swk-dialog:not([open]){opacity:0;transform:translateY(6px)}
@starting-style{.swk-dialog[open]{opacity:0;transform:translateY(6px)}}
.swk-dialog::backdrop{background:rgba(0,0,0,.45)}
.swk-dialog-h{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px}
.swk-dialog-h h3{margin:0;font-size:1rem;color:var(--sw-text-primary)}
.swk-keys{border-collapse:collapse;width:100%;font-size:.82rem}
.swk-keys th,.swk-keys td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--sw-border)}
.swk-keys th{white-space:nowrap;font-weight:400}
kbd{font:inherit;font-size:.76rem;padding:1px 6px;border:1px solid var(--sw-border);border-bottom-width:2px;border-radius:5px;background:var(--sw-surface-alt);color:var(--sw-text-primary);font-variant-numeric:tabular-nums}
.swk-domains{display:flex;flex-wrap:wrap;gap:8px}
.swk-domain{font:inherit;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 12px 8px 30px;position:relative;min-width:150px;
  border:1px solid var(--sw-border);border-radius:10px;background:var(--sw-surface);color:var(--sw-text-primary);cursor:pointer;text-align:left;
  transition:border-color var(--dur-hover,200ms) ease,background-color var(--dur-hover,200ms) ease}
.swk-domain i{position:absolute;left:11px;top:12px;width:10px;height:10px;border-radius:3px}
.swk-domain[aria-pressed="false"]{color:var(--sw-text-secondary);background:var(--sw-surface-alt)}
.swk-domain[aria-pressed="false"] i{opacity:.35}
.swk-domain[aria-pressed="true"]{border-color:color-mix(in srgb,var(--sw-accent) 55%,var(--sw-border))}
.swk-domain:hover{border-color:var(--sw-accent)}
.swk-domain-n{font-size:.8rem;font-weight:650}
.swk-domain-c{font-size:.7rem;color:var(--sw-text-secondary);font-variant-numeric:tabular-nums}
.swk-setup{display:flex;flex-direction:column;gap:14px}
.swk-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.swk-row-l{font-size:.74rem;color:var(--sw-text-secondary);font-weight:600;margin-right:4px}
.swk-link{font:inherit;font-size:.74rem;background:none;border:none;padding:2px 4px;color:var(--sw-accent);cursor:pointer;text-decoration:underline;text-underline-offset:2px;white-space:nowrap}
.swk-link-del{color:var(--sw-bad)}
.swk-sc-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.swk-sc-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.swk-sc-base{font-size:.76rem;color:var(--sw-text-secondary)}
.swk-sc-save{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0 10px}
.swk-sc-save input{font:inherit;font-size:.8rem;padding:7px 10px;border:1px solid var(--sw-border);border-radius:7px;background:var(--sw-surface);color:var(--sw-text-primary);min-width:min(320px,100%);flex:1 1 240px}
.swk-sc-msg{font-size:.74rem;color:var(--sw-text-secondary)}
.swk-segs{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}
.swk-segs-l{font-size:.74rem;color:var(--sw-text-secondary);font-weight:600;margin-right:4px}
.swk-seg{font:inherit;font-size:.76rem;font-weight:600;padding:6px 11px;border-radius:999px;border:1px solid var(--sw-border);background:var(--sw-surface);color:var(--sw-text-secondary);cursor:pointer;transition:border-color var(--dur-hover,200ms) ease,color var(--dur-hover,200ms) ease}
.swk-seg[aria-pressed="true"]{border-color:var(--sw-accent);color:var(--sw-text-primary);background:var(--sw-accent-bg)}
.swk-sc-tw{overflow-x:auto;margin-top:10px;border:1px solid var(--sw-border);border-radius:10px}
.swk-sc-tw:focus-visible{outline:2px solid var(--sw-accent);outline-offset:2px}
.swk-sc-t{border-collapse:collapse;width:100%;font-size:.76rem;min-width:860px}
.swk-sc-t th,.swk-sc-t td{padding:7px 10px;border-bottom:1px solid var(--sw-border);text-align:left;vertical-align:top;color:var(--sw-text-body)}
.swk-sc-t thead th{font-size:.66rem;letter-spacing:.04em;text-transform:uppercase;color:var(--sw-text-secondary);background:var(--sw-surface-alt);font-weight:600}
.swk-sc-t tbody th{font-weight:400;color:var(--sw-text-body);min-width:240px;max-width:340px}
.swk-sc-name{display:block;font-weight:650;color:var(--sw-text-primary)}
.swk-sc-t .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.swk-sc-t tr.is-base{background:var(--sw-accent-bg)}
.swk-sc-v{display:block;color:var(--sw-text-primary);font-weight:600}
.swk-sc-d{display:block;font-size:.7rem;color:var(--sw-text-secondary)}
.swk-sc-d.is-up{color:var(--sw-bad)}.swk-sc-d.is-down{color:var(--sw-good)}
.swk-sc-diff{margin:4px 0 0;padding-left:14px;display:flex;flex-direction:column;gap:1px;font-size:.72rem;color:var(--sw-text-secondary)}
span.swk-sc-diff{display:block;padding-left:0}
.swk-sc-err{color:var(--sw-bad)}
.swk-sc-acts{display:flex;flex-wrap:wrap;gap:2px 6px;margin-top:4px}
.swk-pill{display:inline-block;font-size:.62rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:1px 6px;border-radius:999px;border:1px solid currentColor;color:var(--sw-text-secondary);vertical-align:1px}
.swk-pill-q{color:var(--sw-accent)}
.swk-muted{color:var(--sw-text-muted)}
/* Phone: the rail scrolls with the page (sticky it would cover half the screen) and shows the answer first. */
@media (max-width:700px){.swk-rail{position:static}.swk-head{align-items:flex-start}}
@media (prefers-reduced-motion: reduce){.swk-delta,.swk-qb,.swk-dialog{transition:none}}
`;

export { wireCharts };
