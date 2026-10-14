/**
 * Software cockpit — the views that replaced the round-1 legacy sections (independent review, Oct 2026: a third of the
 * tabs still showed the old product below the fold). Pure `(data) → HTML` builders: every figure is read off the
 * engine's result (sw-should-cost.ts, sw-cockpit.ts); nothing here prices anything.
 *
 * One vocabulary: domain names are the engine's `categoryLabel`; one colour map: a domain is always its chart slot
 * (DOMAIN_SLOT); figures are text ink, colour only marks identity or a good / bad direction beside a word.
 */

import type { SWProgramResult, SWEvidenceGrade, SWBenchmark } from '../../engine/sw-should-cost.js';
import { SW_MC_RANGE_BY_GRADE, SW_MODULES, SW_DEFAULT_SUBSCRIPTION_YEARS, SW_DEFAULT_SERVICE_YEARS } from '../../engine/sw-should-cost.js';
import type { SWEvidence, SWMakeBuy } from '../../engine/sw-cockpit.js';
import type { SWDevSourceRow } from '../../engine/sw-should-cost.js';
import { DOMAIN_SLOT, type Money } from './sw-charts.js';
import { swSchedule } from '../../engine/sw-schedule.js';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)} %`;
const dot = (cat: string) => `<i class="swk-dot" aria-hidden="true" style="background:var(--swc-${(DOMAIN_SLOT[cat] ?? 0) + 1})"></i>`;

// ── Evidence ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const GRADE_LABEL: Record<SWEvidenceGrade, string> = {
  entered: 'Your figures', calibrated: 'Calibrated to your actuals', sourced: 'Published source',
  estimate: 'Labelled estimate', unsourced: 'Unsourced catalogue',
};
const GRADE_ORDER: SWEvidenceGrade[] = ['entered', 'calibrated', 'sourced', 'estimate', 'unsourced'];
const NEXT_STEP: Record<string, string> = {
  effort: 'Enter each module\'s size (KSLOC) or your own person-months on Scope, or calibrate to logged actuals on this tab.',
  cloud: 'Enter your cloud £ per connected vehicle-year, or a supplier quote, and your fixed platform cost on Setup.',
  licences: 'Replace each module\'s annual IP licence with the supplier\'s quote.',
  royalties: 'Enter the supplier\'s per-vehicle quote on Supplier check (map data and OS licences are not published).',
};

/** Where the money's evidence stands: £ by grade (an ordinal scale — one hue, strong to faint), the largest
 *  unsourced lines with the step that would source them, and the default reuse stated with its £. */
export function evidenceCardHTML(ev: SWEvidence, moneyM: Money): string {
  const parts = GRADE_ORDER.map(g => ({ g, v: ev.byGrade[g] })).filter(p => p.v > 0);
  // Neutral-to-warning ramp (independent re-score: the unsourced share was a near-invisible dark green).
  const fill: Record<SWEvidenceGrade, string> = { entered: 'var(--sw-text-primary)', calibrated: 'var(--sw-text-primary)', sourced: 'var(--sw-text-secondary)', estimate: 'var(--sw-text-muted)', unsourced: 'var(--sw-warn)' };
  const bar = parts.map(p => `<span class="swk-ev-seg" style="flex:${p.v} 1 0;background:${fill[p.g]}" title="${esc(`${GRADE_LABEL[p.g]}: ${moneyM(p.v)}`)}"></span>`).join('');
  return `<section class="swk-card" id="swk-evidence"><h3 class="swk-h">How well the total is supported</h3>
    <p class="swk-sub"><strong>${moneyM(ev.byGrade.unsourced)} (${pct(ev.unsourcedShare)})</strong> of ${moneyM(ev.total)} rests on unsourced
      catalogue figures. The uncertainty band draws each grade's own range, so the band is wide where the evidence is thin.</p>
    <div class="swk-ev-bar" role="img" aria-label="${esc(parts.map(p => `${GRADE_LABEL[p.g]} ${moneyM(p.v)}`).join(', '))}">${bar}</div>
    <table class="swk-t"><thead><tr><th scope="col">Evidence</th><th scope="col" class="n">£ in the total</th><th scope="col" class="n">Share</th><th scope="col" class="n">Band drawn (low · high)</th></tr></thead>
      <tbody>${GRADE_ORDER.map(g => `<tr><th scope="row"><i class="swk-ev-key" style="background:${fill[g]}" aria-hidden="true"></i>${GRADE_LABEL[g]}</th>
        <td class="n">${moneyM(ev.byGrade[g])}</td><td class="n">${pct(ev.total > 0 ? ev.byGrade[g] / ev.total : 0)}</td>
        <td class="n">× ${SW_MC_RANGE_BY_GRADE[g][0]} · × ${SW_MC_RANGE_BY_GRADE[g][2]}</td></tr>`).join('')}</tbody></table>
    <h4 class="swk-h4">Largest unsourced lines — and what would source them</h4>
    <ul class="swk-list">${ev.topUnsourced.slice(0, 4).map(t => `<li><strong>${esc(t.label)}: ${moneyM(t.amount)}.</strong> ${esc(NEXT_STEP[t.kind] ?? '')}</li>`).join('')}</ul>
    <p class="swk-note"><strong>Reuse is a stated assumption:</strong> ${ev.reuse.modulesAtMedium} of ${ev.reuse.modules} modules are at the default
      "Medium" reuse (× 0.60 of fresh effort, a CostVision default). Written fresh, the engineering would cost
      ${moneyM(ev.reuse.removedNRE)} more. Set reuse per module on Scope from what you actually carry over.</p>
  </section>`;
}

// ── Risk: how the band is built ──────────────────────────────────────────────────────────────────────────────────────

export function bandMethodHTML(r: SWProgramResult, moneyM: Money): string {
  const mc = r.monteCarlo;
  return `<section class="swk-card"><h3 class="swk-h">How the band is built</h3>
    <p class="swk-sub">${mc.iterations.toLocaleString('en-GB')} seeded trials. Each costed line is drawn from a triangular range set by its evidence
      grade (Rates &amp; method lists them), with a 55 % programme-wide correlation: a slip moves development, test and
      integration together. The ranges are CostVision engineering estimates of how far each grade can be out — not measured.</p>
    <div class="swk-kv">
      <div><span>P10</span><strong>${moneyM(mc.p10)}</strong></div>
      <div><span>P50</span><strong>${moneyM(mc.p50)}</strong></div>
      <div><span>P90</span><strong>${moneyM(mc.p90)}</strong></div>
      <div><span>Headline</span><strong>${moneyM(r.summary.grandTotal)}</strong></div>
    </div>
    <p id="sw-headline-pct" class="swk-note">The headline total (${moneyM(r.summary.grandTotal)}) sits at about <strong>P${mc.headlinePercentile}</strong> of this band, not at
      the median. It adds the most likely value of every line; most of the money rests on unsourced lines whose risk runs upwards, so
      P50 is <strong>${moneyM(mc.p50)}</strong>. Budget at a percentile, not at the headline.</p>
  </section>`;
}

// ── Modules tab ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function domainTableHTML(r: SWProgramResult, moneyM: Money): string {
  const s = r.summary;
  const cats = [...new Set(r.modules.map(m => m.category))].sort();
  const rows = cats.map(c => {
    const mods = r.modules.filter(m => m.category === c);
    const nre = mods.reduce((a, m) => a + m.totalNonRecurring, 0);
    const life = mods.reduce((a, m) => a + m.totalLifecycle, 0);
    const top = [...mods].sort((a, b) => b.grandTotal - a.grandTotal)[0];
    return { c, label: mods[0].categoryLabel, n: mods.length, nre, life, total: nre + life, top: top?.moduleName ?? '—' };
  }).sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map(x => x.total));
  return `<section class="swk-card"><h3 class="swk-h">By domain</h3>
    <p class="swk-sub">Engineering (one-off) and lifecycle per domain; programme-level lines (homologation, a fixed cloud platform) sit outside the domains.</p>
    <div class="swk-tw"><table class="swk-t"><thead><tr><th scope="col">Domain</th><th scope="col" class="n">Modules</th><th scope="col" class="n">Engineering</th>
      <th scope="col" class="n">Lifecycle</th><th scope="col" class="n">Total</th><th scope="col" class="n">Share</th><th scope="col"><span class="sr-only">Bar</span></th><th scope="col">Largest module</th></tr></thead>
      <tbody>${rows.map(x => `<tr><th scope="row">${dot(x.c)}${esc(x.label)}</th><td class="n">${x.n}</td><td class="n">${moneyM(x.nre)}</td><td class="n">${moneyM(x.life)}</td>
        <td class="n"><strong>${moneyM(x.total)}</strong></td><td class="n">${pct(s.grandTotal > 0 ? x.total / s.grandTotal : 0)}</td>
        <td class="swk-barcell"><span class="swk-bar" style="width:${(x.total / max * 100).toFixed(1)}%;background:var(--swc-${(DOMAIN_SLOT[x.c] ?? 0) + 1})"></span></td>
        <td>${esc(x.top)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

const BASIS_LABEL: Record<string, string> = { catalogue: 'Catalogue', size: 'COCOMO (KSLOC)', custom: 'Your PM' };

export function moduleTableHTML(r: SWProgramResult, money: Money, moneyM: Money): string {
  const rank: Record<string, number> = { QM: 0, A: 1, B: 2, C: 3, D: 4 };
  const mods = [...r.modules].sort((a, b) => b.grandTotal - a.grandTotal);
  const downgraded = mods.filter(m => { const d = SW_MODULES.find(x => x.id === m.moduleId); return d && rank[m.asilUsed] < rank[d.defaultAsil]; });
  const cal = r.inputs.effortCalibration !== undefined && r.inputs.effortCalibration !== 1;
  return `<section class="swk-card"><h3 class="swk-h">Every module</h3>
    <p class="swk-sub">${mods.length} modules in scope, largest first. "Effort from" says where the person-months come from — the catalogue figures are unsourced${cal ? ' (here scaled by your calibration)' : ''}.</p>
    ${downgraded.length ? `<p class="swk-note"><span class="swk-pill swk-pill-warn">Check</span> ${downgraded.length} module${downgraded.length === 1 ? ' has' : 's have'} an ASIL below the module default (${esc(downgraded.slice(0, 3).map(m => m.moduleName).join(', '))}${downgraded.length > 3 ? '…' : ''}). Review the safety case (ISO 26262) before sign-off.</p>` : ''}
    <div class="swk-tw"><table class="swk-t swk-t-mods"><thead><tr><th scope="col">Module</th><th scope="col">Domain</th><th scope="col">ASIL</th><th scope="col">Complexity</th>
      <th scope="col">Reuse</th><th scope="col">Effort from</th><th scope="col" class="n">Effort</th><th scope="col" class="n">Engineering</th><th scope="col" class="n">Lifecycle</th>
      <th scope="col" class="n">Total</th><th scope="col" class="n">Per vehicle</th></tr></thead>
      <tbody>${mods.map(m => `<tr><th scope="row">${esc(m.moduleName)}</th><td>${dot(m.category)}${esc(m.categoryLabel)}</td><td>${esc(m.asilUsed)}</td>
        <td>${esc(m.complexityUsed)}</td><td>${esc(m.reuseUsed)}</td><td>${esc(BASIS_LABEL[m.effortBasis] ?? m.effortBasis)}</td>
        <td class="n">${Math.round(m.effortPersonMonths).toLocaleString('en-GB')} PM</td><td class="n">${moneyM(m.totalNonRecurring)}</td>
        <td class="n">${moneyM(m.totalLifecycle)}</td><td class="n"><strong>${moneyM(m.grandTotal)}</strong></td><td class="n">${money(m.perVehicle)}</td></tr>`).join('')}</tbody></table></div>
  </section>`;
}

// ── Supplier tab: by source, make v buy ──────────────────────────────────────────────────────────────────────────────

const SOURCE_NOTES: Record<string, { label: string; risk: string; ip: string; warranty: string }> = {
  OEM_Internal:   { label: 'OEM in-house', risk: 'Full visibility and control', ip: 'IP owned outright', warranty: 'Full in-house warranty liability' },
  Tier1_Supplier: { label: 'Tier-1 supplier', risk: 'Contractual milestone risk', ip: 'IP shared / licensed back', warranty: 'Supplier carries a contractual share' },
  Startup_OSS:    { label: 'Start-up / OSS', risk: 'Execution and talent risk', ip: 'OSS licence terms; limited assignment', warranty: 'Limited indemnity; OEM carries the tail' },
};

export function sourceTableHTML(rows: SWDevSourceRow[], current: string, moneyM: Money): string {
  return `<section class="swk-card" id="sw-source-decomp"><h3 class="swk-h">The whole programme by development source</h3>
    <p class="swk-sub">Each row re-costs this programme with that source in the active rate book. A supplier's price factor = its effort factor ÷ (1 − supplier margin).</p>
    <div class="swk-tw"><table class="swk-t"><thead><tr><th scope="col">Source</th><th scope="col" class="n">Programme total</th><th scope="col" class="n">Price factor</th>
      <th scope="col">Risk</th><th scope="col">IP</th><th scope="col">Warranty</th></tr></thead>
      <tbody>${rows.map(r => { const n = SOURCE_NOTES[r.devSource]; return `<tr${r.devSource === current ? ' class="is-base"' : ''}>
        <th scope="row">${esc(n?.label ?? r.devSource)}${r.devSource === current ? ' <span class="swk-pill swk-pill-q">this costing</span>' : ''}</th>
        <td class="n">${moneyM(r.grandTotal)}</td><td class="n">× ${r.multiplier.toFixed(3)}</td><td>${esc(n?.risk)}</td><td>${esc(n?.ip)}</td><td>${esc(n?.warranty)}</td></tr>`; }).join('')}</tbody></table></div></section>`;
}

export function makeBuyHTML(mb: SWMakeBuy, moneyM: Money): string {
  return `<section class="swk-card" id="swk-makebuy"><h3 class="swk-h">Make or buy, by domain</h3>
    <p class="swk-sub">${esc(mb.basis)} Lifecycle costs (royalties, cloud, maintenance) are the same whoever writes the code in this model and are left out.</p>
    <div class="swk-tw"><table class="swk-t"><thead><tr><th scope="col">Domain</th><th scope="col" class="n">In-house</th><th scope="col" class="n">Tier-1</th>
      <th scope="col" class="n">Start-up / OSS</th><th scope="col" class="n">Tier-1 premium</th></tr></thead>
      <tbody>${mb.rows.sort((a, b) => b.make - a.make).map(x => `<tr><th scope="row">${dot(x.category)}${esc(x.label)}</th><td class="n">${moneyM(x.make)}</td>
        <td class="n">${moneyM(x.tier1)}</td><td class="n">${moneyM(x.startup)}</td><td class="n">${x.make > 0 ? `+${pct(x.tier1 / x.make - 1)}` : '—'}</td></tr>`).join('')}</tbody></table></div>
    <p class="swk-note">Break-even: a Tier-1 is cheaper than in-house only if it needs no more than <strong>${pct(mb.breakEvenEffortShare)}</strong> of the in-house effort for the same scope.</p>
  </section>`;
}

// ── Report tab ───────────────────────────────────────────────────────────────────────────────────────────────────────

export function exportCardHTML(): string {
  return `<section class="swk-card"><h3 class="swk-h">Export</h3>
    <p class="swk-sub">Both exports carry the same figures as this screen, in the page's currency, with the rate basis, the evidence grades and — when you entered one — the supplier quote check.</p>
    <div class="swk-row">
      <button id="sw-excel-btn" class="swk-btn">Excel workbook</button>
      <button id="sw-pdf-btn" class="swk-btn swk-btn-primary">PDF report</button>
    </div></section>
    <section class="swk-card ai-only" id="sw-ai-analysis"><h3 class="swk-h">AI narrative</h3>
      <p class="swk-sub">An executive summary written from this costing's figures. It never sets or changes a figure.</p>
      <div class="swk-row"><button id="sw-ai-btn" class="swk-btn">Write the narrative</button></div>
      <div id="sw-ai-content" style="display:none"></div></section>`;
}

/** Published programme figures — all unverified, so the gap is shown in text ink with its sign; colour would claim a
 *  verdict the evidence cannot support (independent review: a −68 % gap was "good" teal). */
export function benchmarksHTML(r: SWProgramResult, money: Money, moneyM: Money): string {
  const s = r.summary;
  const rows = r.benchmarks.filter((b: SWBenchmark) => b.vehicle !== 'This programme');
  return `<section class="swk-card" id="sw-benchmarks"><h3 class="swk-h">Published programme figures <span class="swk-pill swk-pill-warn">unverified</span></h3>
    <p class="swk-sub">For context only. None of these figures has a source link and two could not be traced; their per-vehicle figures do not reconcile
      with their own totals. Do not quote them, and do not tune the model to them.</p>
    <div class="swk-tw"><table class="swk-t"><thead><tr><th scope="col">Programme</th><th scope="col" class="n">Published total</th><th scope="col" class="n">Per vehicle</th>
      <th scope="col" class="n">This costing v published</th><th scope="col">Source</th></tr></thead>
      <tbody><tr class="is-base"><th scope="row">This costing</th><td class="n">${moneyM(s.grandTotal)}</td><td class="n">${money(s.perVehicle)}</td><td class="n">—</td><td>CostVision model</td></tr>
      ${rows.map(b => { const d = b.totalM > 0 ? (s.grandTotal / 1e6 - b.totalM) / b.totalM * 100 : 0;
        return `<tr><th scope="row">${esc(b.vehicle)}</th><td class="n">${moneyM(b.totalM * 1e6)}</td><td class="n">${money(b.perVehicle)}</td>
          <td class="n">${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(0)} %</td><td><span class="swk-pill swk-pill-warn">unverified</span> ${esc(b.source)}</td></tr>`; }).join('')}</tbody></table></div></section>`;
}

// ── Insights ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SWInsight { level: 'info' | 'check' | 'ok'; title: string; body: string }
const LEVEL_WORD: Record<SWInsight['level'], string> = { info: 'Note', check: 'Check', ok: 'OK' };

export function insightsHTML(list: SWInsight[]): string {
  return `<section class="swk-card"><h3 class="swk-h">Engineering notes</h3>
    <ul class="swk-insights">${list.map(i => `<li><span class="swk-pill${i.level === 'check' ? ' swk-pill-warn' : ''}">${LEVEL_WORD[i.level]}</span>
      <div><strong>${esc(i.title)}</strong><p>${esc(i.body)}</p></div></li>`).join('')}</ul></section>`;
}

/** Notes read off the result — each one states a figure and what to do about it. */
export function buildInsights(r: SWProgramResult, moneyM: Money): SWInsight[] {
  const s = r.summary;
  const out: SWInsight[] = [];
  const top = [...r.modules].sort((a, b) => b.grandTotal - a.grandTotal)[0];
  if (top) out.push({ level: 'info', title: `Largest module: ${top.moduleName}, ${moneyM(top.grandTotal)} (${pct(s.grandTotal > 0 ? top.grandTotal / s.grandTotal : 0)})`,
    body: 'Price a licensed platform or a supplier quote against this figure on Supplier check — no saving is assumed here.' });
  const dReuse = r.modules.filter(m => m.asilUsed === 'D' && (m.reuseUsed === 'Heavy' || m.reuseUsed === 'Platform'));
  if (dReuse.length) out.push({ level: 'check', title: `ASIL-D with ${dReuse[0].reuseUsed} reuse`,
    body: `${dReuse.map(m => m.moduleName).join(', ')}: reused ASIL-D code still needs a safety case for the new context (ISO 26262 SEooC); the model keeps a verification floor.` });
  if (!r.modules.some(m => m.category === 'F')) out.push({ level: 'check', title: 'No cybersecurity (ISO/SAE 21434) modules in scope',
    body: 'UNECE R155 requires a cybersecurity management system for every new vehicle sold in its markets since July 2024.' });
  const hub = r.sensitivity.find(x => x.parameter.startsWith('Engineering hub'));
  if (hub && hub.low < s.grandTotal * 0.97) {
    const name = hub.parameter.replace(/^Engineering hub \((.*) vs .*\)$/, '$1');
    out.push({ level: 'info', title: `The same scope in ${name}: ${moneyM(hub.low)} (−${moneyM(s.grandTotal - hub.low)})`,
      body: 'Re-costed at that hub\'s own book rate. Add your own figure for coordination, knowledge transfer, travel and time-zone risk before comparing.' });
  }
  // Lifecycle: name the bucket that actually leads (P1 #7 — the text once said "cloud" whatever the numbers were).
  const lifecycleTotal = s.totalMaintenance + s.totalCloud + s.totalLicensing;
  const lifeTop = [{ name: 'maintenance', value: s.totalMaintenance }, { name: 'cloud', value: s.totalCloud }, { name: 'licences and royalties', value: s.totalLicensing }]
    .sort((a, b) => b.value - a.value)[0];
  if (s.grandTotal > 0) out.push({ level: lifecycleTotal / s.grandTotal > 0.45 ? 'check' : 'info',
    title: `Lifecycle is ${pct(lifecycleTotal / s.grandTotal)} of the total (${moneyM(lifecycleTotal)})`,
    body: `The largest lifecycle bucket is ${lifeTop.name} at ${moneyM(lifeTop.value)} — review its assumptions first.` });
  // No peer comparison: none of the published programme figures is verified (sw-benchmarks.ts), so it is withheld (P1 #6).
  const sch = swSchedule(r);
  out.push({ level: sch.overrunning.length ? 'check' : 'info', title: `Average team: ${Math.round(sch.averageTeam)} engineers for ${Math.round(sch.developmentMonths)} months`,
    body: `COCOMO II gives the longest module (${sch.longestModule}) ${Math.round(sch.longestMonths)} months` + (sch.overrunning.length
      ? ` — ${sch.overrunning.length} module${sch.overrunning.length === 1 ? '' : 's'} need longer than the development window at nominal staffing.` : ', inside the development window.') });
  const N = r.inputs.subscriptionYears ?? SW_DEFAULT_SUBSCRIPTION_YEARS, S = r.inputs.connectedServiceYears ?? SW_DEFAULT_SERVICE_YEARS;
  out.push({ level: 'info', title: `Service tail: ${S} years of cloud and ${N} of map updates per vehicle`,
    body: `Vehicles built in the last production year are served after the programme ends, so the spend runs ${r.summary.horizonYears - r.inputs.programLifeYears} years past the last build year. Change both on Setup.` });
  return out;
}

export const VIEWS_CSS = `
.swk-dot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:7px;vertical-align:0}
.swk-t{border-collapse:collapse;width:100%;font-size:.78rem}
.swk-t th,.swk-t td{padding:7px 10px;border-bottom:1px solid var(--sw-border);text-align:left;vertical-align:top;color:var(--sw-text-body)}
.swk-t thead th{font-size:.66rem;letter-spacing:.04em;text-transform:uppercase;color:var(--sw-text-secondary);background:var(--sw-surface-alt);font-weight:600;white-space:nowrap}
.swk-t tbody th{font-weight:600;color:var(--sw-text-primary)}
.swk-t .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.swk-t tr.is-base{background:var(--sw-accent-bg)}
.swk-t strong{color:var(--sw-text-primary)}
.swk-tw{overflow-x:auto}
.swk-t-mods{min-width:980px}
.swk-barcell{width:18%;min-width:90px}
.swk-bar{display:block;height:10px;border-radius:0 4px 4px 0;min-width:2px}
.swk-h4{margin:14px 0 6px;font-size:.82rem;font-weight:650;color:var(--sw-text-primary)}
.swk-list{margin:0;padding-left:18px;font-size:.8rem;color:var(--sw-text-body);display:flex;flex-direction:column;gap:5px}
.swk-note{font-size:.78rem;color:var(--sw-text-body);margin:10px 0 0;max-width:90ch}
.swk-ev-bar{display:flex;gap:2px;height:14px;margin:6px 0 10px;border-radius:4px;overflow:hidden}
.swk-ev-seg{background:var(--sw-accent);min-width:3px}
.swk-ev-key{display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--sw-accent);margin-right:7px}
.swk-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;background:var(--sw-border);border:1px solid var(--sw-border);border-radius:10px;overflow:hidden;margin:8px 0}
.swk-kv>div{background:var(--sw-surface);padding:8px 12px;display:flex;flex-direction:column;gap:2px}
.swk-kv span{font-size:.66rem;letter-spacing:.04em;text-transform:uppercase;color:var(--sw-text-secondary)}
.swk-kv strong{font-size:1.05rem;color:var(--sw-text-primary);font-variant-numeric:tabular-nums}
.swk-pill-warn{color:var(--sw-warn)}
.swk-insights{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
.swk-insights li{display:flex;gap:10px;align-items:flex-start}
.swk-insights strong{font-size:.82rem;color:var(--sw-text-primary)}
.swk-insights p{margin:2px 0 0;font-size:.78rem;color:var(--sw-text-body);max-width:90ch}
/* The rate library and validation cards keep their markup; they take the cockpit's card look. */
.sw-cockpit details.sw-config-card{background:var(--sw-surface)!important;border:1px solid var(--sw-border)!important;border-radius:12px!important}
.sw-cockpit details.sw-config-card>summary{font-size:.9rem!important}
html[data-ai="off"] .sw-cockpit .ai-only{display:none!important}
`;
