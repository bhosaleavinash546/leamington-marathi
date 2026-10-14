/**
 * Automotive Software Should-Cost — UI Panel
 * Self-contained panel: renders HTML, wires events, shows results.
 * Implements all 10 audit recommendations:
 *  Rec1: Separate annualIPLicenceGBP (engine)
 *  Rec2: Monte Carlo P10/P50/P90
 *  Rec3: Programme milestone phases
 *  Rec4: OEM/Tier1/Startup decomposition
 *  Rec5: AI LLM narrative insights
 *  Rec6: Excel export (6-sheet)
 *  Rec7: Calibration cost bucket (engine)
 *  Rec8: ASIL assignment validation warnings
 *  Rec9: Dark mode CSS variables
 *  Rec10: Saved configurations (localStorage)
 */

import type {
  ASILLevel, SWComplexity, SWReuse, SWRegion, DevSource,
  SWProgramInputs, SWProgramResult, SWModuleInput, SWPowertrain, SWCal, SWCategory,
} from '../../engine/sw-should-cost.js';
import {
  computeSWProgram, defaultSWProgramInputs, SW_MODULES, swRegionFor, SW_DEFAULT_OVERHEAD, swLibraryBaseRate, normaliseSWRegion, swLoadedRate, swOverhead,
  SW_DEFAULT_BURDEN, SW_BURDEN_BASIS, SW_DEFAULT_SUBSCRIPTION_YEARS, SW_SUBSCRIPTION_BASIS, SW_DEFAULT_SERVICE_YEARS, SW_SERVICE_BASIS, SW_POST_EOP_YEARS, SW_POST_EOP_SHARE, SW_POST_EOP_BASIS, SW_DEVELOPMENT_BASIS,
  SW_TOOL_SEAT_GBP, SW_TOOL_SEAT_BASIS, SW_MAINT_BASIS, SW_HOMOLOGATION_BASIS,
  applyPowertrainScope, SW_POWERTRAIN_SCOPE, SW_POWERTRAIN_MODULE_IDS, calFor, SW_CALS, devSourceComparison, swRateBasis, SW_DEFAULT_DEVELOPMENT_MONTHS, SW_COCOMO, SW_COCOMO_EXPONENT,
} from '../../engine/sw-should-cost.js';
import { baseRateOverride, SW_BASE_RATE_FIELDS } from './sw-rate-field.js';
import { hubOptionsHTML, hubRatesTableHTML, hubLabel, HUB_RATES_CSS } from './sw-hub-rates.js';
import { mountSWStudio } from './sw-costing-pipeline.js';
import {
  headHTML, railHTML, tabsHTML, wireTabs, updateRail, railError, contextLine, overviewHTML, riskHTML, spendHTML,
  supplierFormHTML, readQuote, supplierResultHTML, wireCharts, COCKPIT_CSS, type CockpitTab,
  shortcutsDialogHTML, scenariosPanelHTML, scenarioResultHTML, type ScenarioMode,
} from './sw-cockpit-ui.js';
import { compareScenarios, devSourceSet, hubSet, reuseSet, type SWScenarioIn } from '../../engine/sw-scenarios.js';
import {
  evidenceCardHTML, bandMethodHTML, domainTableHTML, moduleTableHTML, sourceTableHTML, makeBuyHTML, exportCardHTML,
  benchmarksHTML, insightsHTML, buildInsights, VIEWS_CSS,
} from './sw-cockpit-views.js';
import { DOMAIN_SLOT, setChartWidth } from './sw-charts.js';
import { swRateCheck, swEvidence, swMakeBuy } from '../../engine/sw-cockpit.js';
import type { StepRate, StepFormat } from '../../engine/sw-costing-steps.js';
import { resolveRateLibrary } from '../../engine/sw-rate-library.js';
import { renderActualsHTML, wireActuals } from './sw-actuals.js';
import { swMoney, swMoneyM, swCur, setSWCurrency } from './sw-currency.js';
import type { SWRateEntry, RateConfidence, SWRateLibrary } from '../../engine/sw-rate-library.js';
import { runValidation } from '../../engine/sw-validation.js';
import { projectStore } from '../project-store.js';
import { quotesCardHTML, wireQuotesCard, customModulesCardHTML, wireCustomModulesCard, QUOTES_CSS, type QuotesHost } from './sw-quotes-ui.js';
import { exportFilename } from '../../export/filename.js';
import { readReportOptions, reportOptionProblem, prepareReport, fillReportScope, wireReportOptions, REPORT_OPTIONS_CSS, type ReportContext } from './sw-report-export.js';

// Saved configs are stored as projects of this kind — server-backed when the
// user is logged in, localStorage when not.
const SW_PROJECT_KIND = 'sw_should_cost';

/**
 * Load the organisation's active SW rate library (admin-uploaded company rates)
 * and apply it to the inputs so calculations use approved numbers. Falls back to
 * the engine's built-in rate library when offline / not signed in / no company set.
 */
async function syncSWRateLibrary(): Promise<void> {
  try {
    const token = localStorage.getItem('auth_token') ?? sessionStorage.getItem('auth_token');
    if (!token) return;
    const res = await fetch('/api/rate-library/sw/active', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json() as { rateLibrary?: unknown; source?: string };
    _swInputs.rateLibrary = (data.rateLibrary && typeof data.rateLibrary === 'object')
      ? data.rateLibrary as typeof _swInputs.rateLibrary
      : undefined;
    // An untyped rate field shows the ACTIVE book's hub rate (it rendered before the book arrived).
    refreshRateFields();
    refreshSWBookViews();
  } catch { /* offline / not authed — keep engine defaults */ }
}

function swAuthHeader(): Record<string, string> {
  const t = localStorage.getItem('auth_token') ?? sessionStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Company SW rate controls in the provenance panel: status for all, admin tools for admins. */
async function renderSWRateAdmin(): Promise<void> {
  const host = document.getElementById('sw-rate-admin');
  if (!host) return;
  let st: { source?: string; hasCompany?: boolean; isAdmin?: boolean } = {};
  try {
    const res = await fetch('/api/rate-library/sw/status', { headers: swAuthHeader() });
    if (res.ok) st = await res.json(); else { host.innerHTML = ''; return; }
  } catch { host.innerHTML = ''; return; }

  const badge = st.source === 'company'
    ? '<span style="background:#059669;color:#fff;border-radius:10px;padding:2px 9px;font-size:0.68rem;font-weight:700">Company rates active</span>'
    : '<span style="background:#64748b;color:#fff;border-radius:10px;padding:2px 9px;font-size:0.68rem;font-weight:700">Built-in defaults</span>';
  const admin = st.isAdmin ? `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
      <button id="swra-template" class="sw-mode-btn">⬇ Template</button>
      <label class="sw-mode-btn" style="cursor:pointer">⬆ Upload<input id="swra-file" type="file" accept=".xlsx" style="display:none"></label>
      <button id="swra-toggle" class="sw-mode-btn">${st.source === 'company' ? 'Use built-in' : 'Use company'}</button>
      <button id="swra-reset" class="sw-mode-btn" style="color:#dc2626">↺ Reset</button>
    </div><div id="swra-msg" style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:6px"></div>`
    : `<div style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:6px">SW rates are set by an administrator.</div>`;
  host.innerHTML = `<div style="border:1px solid var(--sw-border);border-radius:8px;padding:10px 12px;background:var(--sw-surface)">
      <span style="font-weight:700;font-size:0.78rem;color:var(--sw-text-primary)">Company SW Rates</span> ${badge}
      ${st.hasCompany ? '' : '<span style="font-size:0.68rem;color:var(--sw-text-muted)"> · none uploaded</span>'}${admin}</div>`;

  if (!st.isAdmin) return;
  const msg = (t: string, ok = true) => { const m = document.getElementById('swra-msg'); if (m) { m.textContent = t; m.style.color = ok ? '#059669' : '#dc2626'; } };
  const refresh = async () => { await syncSWRateLibrary(); await renderSWRateAdmin(); };

  document.getElementById('swra-template')?.addEventListener('click', async () => {
    const res = await fetch('/api/rate-library/sw/template', { headers: swAuthHeader() });
    if (!res.ok) { msg('Admin only.', false); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob());
    a.download = 'costvision-sw-rate-template.xlsx'; a.click();
  });
  document.getElementById('swra-file')?.addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    msg('Uploading & validating…');
    const fd = new FormData(); fd.append('file', f);
    try {
      const res = await fetch('/api/rate-library/sw/upload', { method: 'POST', headers: swAuthHeader(), body: fd });
      const d = await res.json();
      if (!res.ok) { msg('Rejected: ' + ((d.errors ?? [d.error]).slice(0, 2).join('; ')), false); return; }
      msg('Uploaded and activated.'); await refresh();
    } catch { msg('Upload failed.', false); }
  });
  document.getElementById('swra-toggle')?.addEventListener('click', async () => {
    const next = st.source === 'company' ? 'builtin' : 'company';
    const res = await fetch('/api/rate-library/sw/source', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...swAuthHeader() }, body: JSON.stringify({ source: next }) });
    if (!res.ok) { msg((await res.json()).error ?? 'Switch failed.', false); return; }
    await refresh();
  });
  document.getElementById('swra-reset')?.addEventListener('click', async () => {
    const res = await fetch('/api/rate-library/sw/reset', { method: 'POST', headers: swAuthHeader() });
    if (res.ok) await refresh(); else msg('Reset failed.', false);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SavedConfig {
  id:        string;
  name:      string;
  createdAt: string;
  inputs:    SWProgramInputs;
}

// ─── Module-level state ───────────────────────────────────────────────────────

let _swResult: SWProgramResult | null = null;
let _swInputs: SWProgramInputs = defaultSWProgramInputs();
/** The vehicle demo currently loaded (drives the "detailed report" banner). */
let _swActiveVehicle: string | null = null;
let _savedConfigs: SavedConfig[] = [];

const STORAGE_KEY = 'cv-sw-saved-configs';

// Rec 9: cache AI narratives by prompt so re-running an identical configuration
// is instant and does not re-bill the API. Cleared on page reload.
const _aiCache = new Map<string, string>();

async function loadSavedConfigs(): Promise<void> {
  try {
    // One-time migration: move any legacy localStorage configs into the store
    // (logged-out only — logged-in migration would need an explicit upload UX).
    if (projectStore.mode() === 'local') {
      const legacy = localStorage.getItem(STORAGE_KEY);
      if (legacy) {
        try {
          for (const c of JSON.parse(legacy) as SavedConfig[]) {
            await projectStore.save({ id: c.id, kind: SW_PROJECT_KIND, name: c.name, data: c.inputs });
          }
        } catch { /* ignore malformed legacy data */ }
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    const list = await projectStore.list(SW_PROJECT_KIND);
    _savedConfigs = list.map(p => ({
      id: p.id, name: p.name,
      createdAt: p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-GB') : '',
      inputs: p.data as SWProgramInputs,
    }));
  } catch {
    _savedConfigs = [];
  }
}


// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s: string | number): string {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fmt(n: number, dp = 2): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** £ → "€392.3M" in the page's display currency (P3 #15). */
function fmtM(n: number): string {
  return swMoneyM(n);
}

// ─── ASIL helpers ─────────────────────────────────────────────────────────────

const ASIL_RANK: Record<ASILLevel, number> = { QM: 0, A: 1, B: 2, C: 3, D: 4 };

// ─── Category metadata ────────────────────────────────────────────────────────

/** Domain names are the engine's own (one vocabulary on every screen and export); a domain's colour is its chart slot. */
const CAT_META: Record<string, { label: string; icon: string; color: string }> = Object.fromEntries(
  (['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const).map(c => [c, {
    label: SW_MODULES.find(m => m.category === c)?.categoryLabel ?? c,
    icon: `<i class="swk-dot" aria-hidden="true" style="background:var(--swc-${(DOMAIN_SLOT[c] ?? 0) + 1})"></i>`,
    color: `var(--swc-${(DOMAIN_SLOT[c] ?? 0) + 1})`,
  }]));

// ─── Render panel HTML ────────────────────────────────────────────────────────

// Rec #1: Rate library provenance — every rate shown with its source, date and
// confidence so the model is defensible, not a black box of constants.
/** The rate book the costing uses: the organisation's company rates when set, else the built-in book (P2 #13 — the
 *  panel always showed the built-in book). */
function activeSWBook(): { lib: SWRateLibrary; company: boolean } {
  return { lib: resolveRateLibrary(_swInputs.rateLibrary), company: !!_swInputs.rateLibrary };
}

function rateLibraryRowsHTML(lib: SWRateLibrary): string {
  // White text on these passes AA (4.5:1): the old #d97706 / #059669 fills gave 3.0 / 3.8 (axe, Oct 2026).
  const confBadge = (c: RateConfidence) => `<span class="swk-pill${c === 'Low' ? ' swk-pill-warn' : ''}">${c}</span>`;
  const rows = (title: string, entries: [string, SWRateEntry][]) =>
    `<tr><td colspan="4" style="font-weight:700;color:var(--sw-text-primary);padding-top:8px">${esc(title)}</td></tr>` +
    entries.map(([k, e]) => `<tr>
      <td style="white-space:nowrap">${esc(k)}</td>
      <td class="sw-num">${e.value}</td>
      <td>${confBadge(e.confidence)} <span style="font-size:0.7rem;color:var(--sw-text-muted)">${esc(e.asOf)}</span></td>
      <td style="font-size:0.7rem;color:var(--sw-text-secondary)">${esc(e.source)}${e.note ? ` <em>(${esc(e.note)})</em>` : ''}</td>
    </tr>`).join('');
  const ent = <T extends string>(rec: Record<T, SWRateEntry>) => Object.entries(rec) as [string, SWRateEntry][];
  // Engineer rates are in the hub table above (each hub's own build-up); these are the unitless factors.
  return rows('Development source multipliers', ent(lib.devSourceMultipliers))
    + rows('ASIL development multipliers (ISO 26262)', ent(lib.asilDevMultipliers))
    + rows('ASIL test/verification multipliers', ent(lib.asilTestMultipliers))
    + rows('Complexity multipliers', ent(lib.complexityMultipliers))
    + rows('Reuse factors', ent(lib.reuseFactors));
}

function rateLibraryBadgeHTML(lib: SWRateLibrary, company: boolean): string {
  // Only the hub rates are sourced; the effort factors are mostly unsourced (independent review: the badge said "every rate sourced").
  return `<span class="swk-pill">${company ? 'Company rates' : 'Built-in'} v${esc(lib.version)}</span>
      <span style="font-size:0.72rem;font-weight:400;color:var(--sw-text-secondary)">reviewed ${esc(lib.lastReviewed)} · hub rates sourced; effort factors labelled by confidence · every rate overridable</span>`;
}

/** Re-draw what depends on the active book once it has loaded (it arrives after the panel renders). */
function refreshSWBookViews(): void {
  const { lib, company } = activeSWBook();
  const rowsEl = document.getElementById('sw-ratelib-rows');
  if (rowsEl) rowsEl.innerHTML = rateLibraryRowsHTML(lib);
  const hubsEl = document.getElementById('sw-hub-rates');
  if (hubsEl) hubsEl.innerHTML = hubRatesTableHTML(lib, n => swMoney(n, 0), _swInputs.region);
  refreshHubPickers();
  const badgeEl = document.getElementById('sw-ratelib-badge');
  if (badgeEl) badgeEl.innerHTML = rateLibraryBadgeHTML(lib, company);
  const valEl = document.getElementById('sw-validation-wrap');
  if (valEl) valEl.innerHTML = renderValidationHTML();
}

function renderRateLibraryHTML(): string {
  const { lib, company } = activeSWBook();
  return `
  <details class="sw-config-card" style="background:var(--sw-surface-alt);border:1px solid var(--sw-border);border-radius:10px;padding:0;margin-bottom:14px">
    <summary style="cursor:pointer;padding:12px 18px;font-weight:700;font-size:0.82rem;color:var(--sw-text-primary);display:flex;align-items:center;gap:8px;list-style:none">
      <span>Rate Library &amp; Provenance</span>
      <span id="sw-ratelib-badge" style="display:contents">${rateLibraryBadgeHTML(lib, company)}</span>
    </summary>
    <div style="padding:0 18px 16px;overflow-x:auto">
      <div id="sw-rate-admin" style="margin-bottom:12px"></div>
      <h4 class="sw-ratelib-h">Software engineering hubs — each country's own rate</h4>
      <div id="sw-hub-rates" style="overflow-x:auto;margin-bottom:14px">${hubRatesTableHTML(lib, n => swMoney(n, 0), _swInputs.region)}</div>
      <h4 class="sw-ratelib-h">Effort factors</h4>
      <table class="sw-data-table" style="font-size:0.76rem">
        <thead><tr><th>Rate</th><th class="sw-num">Value</th><th>Confidence / As-of</th><th>Source</th></tr></thead>
        <tbody id="sw-ratelib-rows">${rateLibraryRowsHTML(lib)}
        </tbody>
      </table>
      <p style="font-size:0.72rem;color:var(--sw-text-secondary);margin-top:8px">Type your own engineer rate on Setup to replace the hub's book rate. Confidence reflects how well-anchored each figure is to a published or surveyed source — not all rates are equal; treat <strong>Low</strong> figures as directional.</p>
    </div>
  </details>`;
}

// Rec #2: model validation — publish the back-test variance vs published
// programmes so the model states its own error instead of presenting a number
// as truth. See docs/sw-cost-validation.md.
function renderValidationHTML(): string {
  const rep = runValidation(undefined, undefined, _swInputs.rateLibrary);
  // Variance against UNVERIFIED figures: text ink, the sign and the band mark — no good / bad colour.
  const vColor = (_v: number) => 'var(--sw-text-primary)';
  const sign = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;

  const rows = rep.cases.map(c => `<tr>
    <td>${esc(c.programme)}</td>
    <td class="sw-num">${fmtM(c.publishedTotalGBP)}</td>
    <td class="sw-num">${fmtM(c.modelledTotalGBP)}</td>
    <td class="sw-num" style="color:${vColor(c.totalVariancePct)};font-weight:700">${sign(c.totalVariancePct)} ${c.withinBand ? '✓' : '✗'}</td>
    <td style="font-size:0.7rem;color:var(--sw-text-muted)" title="Source: ${esc(c.source)}">${esc(c.source)}</td>
  </tr>`).join('');

  return `
  <details class="sw-config-card" style="background:var(--sw-surface-alt);border:1px solid var(--sw-border);border-radius:10px;padding:0;margin-bottom:14px">
    <summary style="cursor:pointer;padding:12px 18px;font-weight:700;font-size:0.82rem;color:var(--sw-text-primary);display:flex;align-items:center;gap:8px;flex-wrap:wrap;list-style:none">
      <span>Model Validation</span>
      <span class="swk-pill swk-pill-warn">${rep.verifiedCount} of ${rep.caseCount} figures sourced</span>
      <span style="font-size:0.7rem;font-weight:400;color:var(--sw-text-muted)">Total MAPE ${rep.mapeTotal.toFixed(0)}% vs unverified published figures — not evidence of accuracy</span>
    </summary>
    <div style="padding:0 18px 16px;overflow-x:auto">
      <table class="sw-data-table" style="font-size:0.76rem">
        <thead><tr><th>Programme</th><th class="sw-num">Published</th><th class="sw-num">Modelled</th><th class="sw-num">Variance</th><th>Source</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:0.7rem;color:var(--sw-text-muted);margin-top:8px">
        Back-test of total SW investment against 7 premium-EV programmes (each run with that programme's region, dev source, volume and life).
        <strong>None of the ${rep.caseCount} published figures has a source link</strong>, and two could not be traced at all — so a
        small variance here proves nothing; replace a figure with a sourced one (sw-benchmarks.ts) before relying on this panel.
        ${rep.perVehicleInconsistent} of ${rep.caseCount} published per-vehicle figures do not reconcile with their own published total over
        the volume and life used here, so per-vehicle is not compared.
      </p>
    </div>
  </details>`;
}

// ─── Software domains — ONE input pane (cockpit round 2, Oct 2026) ──────────────────────────────────────────────
// The six-step guided wizard and the "full setup" form were two UIs over one set of inputs, kept in step by hand
// (three bugs came from that: F2, F3, F5). They are merged: Setup holds "Start from…", the programme fields and the
// domain chips; Scope holds the modules. Everything recosts live.

type SWCat = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
const ALL_CATS: SWCat[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const DOMAIN_INFO: Record<SWCat, { plain: string; typicalAsil: string }> = {
  A: { plain: 'Battery management (BMS), charging, thermal, motor & inverter control', typicalAsil: 'mostly ASIL-C/D' },
  B: { plain: 'Driver assistance: cameras, radar, sensor fusion, lane-keep, AEB', typicalAsil: 'up to ASIL-D' },
  C: { plain: 'Touchscreen, navigation, voice assistant, connectivity, HMI', typicalAsil: 'QM / ASIL-A' },
  D: { plain: 'Body, chassis & gateway controllers that coordinate the vehicle', typicalAsil: 'ASIL-B/C' },
  E: { plain: 'AUTOSAR, RTOS, diagnostics, comms — the software platform layer', typicalAsil: 'ASIL-B' },
  F: { plain: 'Secure boot, encryption, intrusion detection (ISO 21434)', typicalAsil: 'ASIL-B/C' },
  G: { plain: 'Over-the-air (OTA) updates, cloud backend, fleet analytics', typicalAsil: 'QM' },
};

let _swTab: CockpitTab = 'setup';
let _swSelectTab: ((t: CockpitTab) => void) | null = null;
const PT_LABEL: Record<SWPowertrain, string> = { ICE: 'ICE — combustion', MHEV: 'MHEV — 48 V mild hybrid', PHEV: 'PHEV — plug-in hybrid', BEV: 'BEV — battery-electric' };
const catOf = (moduleId: string): SWCat | undefined => SW_MODULES.find(d => d.id === moduleId)?.category as SWCat | undefined;

/** Domain chips: each names a software domain, says how many of its modules are in scope, and switches the domain. */
function domainChipsHTML(): string {
  return `<div class="swk-domains" role="group" aria-label="Software domains in scope">${ALL_CATS.map(c => {
    const mods = _swInputs.modules.filter(m => catOf(m.moduleId) === c);
    const on = mods.filter(m => m.enabled).length;
    return `<button type="button" class="swk-domain" data-domain="${c}" aria-pressed="${on > 0}" title="${esc(`${DOMAIN_INFO[c].plain} — typically ${DOMAIN_INFO[c].typicalAsil}`)}">
      <i aria-hidden="true" style="background:var(--swc-${DOMAIN_SLOT[c] + 1})"></i><span class="swk-domain-n">${esc(CAT_META[c].label)}</span>
      <span class="swk-domain-c" data-domain-count="${c}">${on} of ${mods.length} in scope</span></button>`;
  }).join('')}</div>`;
}

/** Switch a whole domain in the Scope table. On = the modules the powertrain scope and the catalogue switch on by
 *  default (premium options stay as they are); off = none. The engine then costs whatever the table says. */
function setDomain(cat: SWCat, on: boolean): void {
  readConfig();
  const scoped = _swInputs.powertrain ? applyPowertrainScope(_swInputs.modules, _swInputs.powertrain) : _swInputs.modules;
  for (const m of _swInputs.modules) {
    if (catOf(m.moduleId) !== cat) continue;
    const def = SW_MODULES.find(d => d.id === m.moduleId)!;
    const pt = SW_POWERTRAIN_MODULE_IDS.has(m.moduleId);
    const sc = scoped.find(x => x.moduleId === m.moduleId)!;
    m.enabled = on && (pt ? sc.enabled : def.defaultEnabled === false ? m.enabled : true);
    const cb = document.querySelector<HTMLInputElement>(`.sw-mod-enable[data-id="${m.moduleId}"]`);
    if (cb) cb.checked = m.enabled;
  }
  updateCatCounts();
  scheduleLive();
}

/** Write a programme's inputs into every field on Setup and Scope — loading a scenario, undo / redo and a powertrain
 *  change all go through here, so the form always shows what is costed. */
function writeInputsToForm(p: SWProgramInputs): void {
  const set = (id: string, v: string | number | undefined | null) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = v == null ? '' : String(v);
  };
  const tick = (id: string, v: boolean) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.checked = v; };
  set('sw-region', p.region);
  set('sw-dev-source', p.devSource);
  set('sw-powertrain', p.powertrain ?? '');
  set('sw-platform-vol', p.platformAnnualVolume);
  set('sw-prog-life', p.programLifeYears);
  set('sw-vol', p.annualProductionVolume);
  const b = p.burden ?? SW_DEFAULT_BURDEN;
  set('sw-burden-emp', b.employmentPct); set('sw-burden-co', b.companyPct); set('sw-burden-cap', b.capitalPct);
  const out = document.getElementById('sw-overhead');
  if (out) out.textContent = `× ${swOverhead(p).toFixed(2)}`;
  set('sw-sub-years', p.subscriptionYears); set('sw-svc-years', p.connectedServiceYears); set('sw-cloud-fixed', p.cloudFixedPerYearGBP);
  set('sw-tool-seat', p.toolSeatGBPPerYear); set('sw-wage-esc', p.wageEscalationPct); set('sw-discount', p.discountRatePct);
  set('sw-csms-types', p.csmsTypesSharing);
  set('sw-post-years', p.postProductionSupportYears);
  set('sw-post-share', p.postProductionSupportShare != null ? Math.round(p.postProductionSupportShare * 100) : null);
  set('sw-effort-cal', p.effortCalibration);
  set('sw-dev-months', p.developmentMonths);
  set('sw-connected', p.connectedVehicleShare != null ? Math.round(p.connectedVehicleShare * 100) : null);
  set('sw-senior-frac', p.teamSeniorFraction);
  tick('sw-inc-maint', p.includeMaintenanceCost);
  tick('sw-inc-cloud', p.includeCloudCost);
  tick('sw-homolog', p.includeHomologation ?? true);
  const br = document.getElementById('sw-base-rate') as HTMLInputElement | null;
  if (br) {
    if (p.baseRateGBP) { br.value = String(p.baseRateGBP); br.dataset.typed = '1'; }
    else delete br.dataset.typed;
  }
  refreshRateFields();
  for (const m of p.modules) {
    const def = SW_MODULES.find(d => d.id === m.moduleId);
    const q = <T extends HTMLElement>(cls: string) => document.querySelector<T>(`.${cls}[data-id="${m.moduleId}"]`);
    const cb = q<HTMLInputElement>('sw-mod-enable'); if (cb) cb.checked = m.enabled;
    const a = q<HTMLSelectElement>('sw-asil-sel');
    if (a) {
      a.value = m.asil;
      const warn = a.parentElement?.querySelector<HTMLElement>('.sw-asil-warn');
      if (warn && def) warn.style.display = ASIL_RANK[m.asil] < ASIL_RANK[def.defaultAsil] ? '' : 'none';
    }
    const c = q<HTMLSelectElement>('sw-comp-sel'); if (c) c.value = m.complexity;
    const r = q<HTMLSelectElement>('sw-reuse-sel'); if (r) r.value = m.reuse;
    for (const el of [a, c, r]) if (el?.dataset.default !== undefined) el.classList.toggle('is-set', el.value !== el.dataset.default);
    const cal = q<HTMLSelectElement>('sw-cal-sel'); if (cal && def) cal.value = calFor(def, m);
    const k = q<HTMLInputElement>('sw-ksloc-input'); if (k) k.value = m.sizeKSLOC != null ? String(m.sizeKSLOC) : '';
    const pm = q<HTMLInputElement>('sw-pm-input'); if (pm) pm.value = m.customPersonMonths != null ? String(m.customPersonMonths) : '';
  }
  updateCatCounts();
  // Quotes and your modules live in the inputs, not in catalogue rows — redraw their cards from the programme.
  if (p === _swInputs) mountQuoteCards();
}

// ─── History: undo / redo over costed states ───────────────────────────────────────────────────────────────────────
// Every successful costing records the inputs it priced (the rate book is policy, never history). Undo restores the
// previous costed state into the form and recosts it; a new edit after an undo drops the redo branch.

const HISTORY_MAX = 60;
let _hist: string[] = [];
let _histIdx = -1;

function snapshotOf(p: SWProgramInputs): string {
  const { rateLibrary: _drop, ...rest } = p;
  return JSON.stringify(rest);
}

function recordHistory(): void {
  const snap = snapshotOf(_swInputs);
  if (_hist[_histIdx] === snap) return;
  _hist = _hist.slice(0, _histIdx + 1);
  _hist.push(snap);
  if (_hist.length > HISTORY_MAX) _hist.shift();
  _histIdx = _hist.length - 1;
  updateHistoryButtons();
}

function updateHistoryButtons(): void {
  const u = document.getElementById('swk-undo') as HTMLButtonElement | null;
  const r = document.getElementById('swk-redo') as HTMLButtonElement | null;
  if (u) u.disabled = _histIdx <= 0;
  if (r) r.disabled = _histIdx < 0 || _histIdx >= _hist.length - 1;
}

function restoreHistory(to: number): void {
  if (to < 0 || to >= _hist.length || to === _histIdx) return;
  _histIdx = to;
  const lib = _swInputs.rateLibrary;
  _swInputs = { ...(JSON.parse(_hist[to]) as SWProgramInputs), rateLibrary: lib };
  writeInputsToForm(_swInputs);
  try {
    _swResult = computeSWProgram(_swInputs);
    renderResults(_swResult, { live: true });
  } catch (err) {
    const rail = document.getElementById('swk-rail');
    if (rail) railError(rail, (err as Error).message);
  }
  updateHistoryButtons();
  announce(`Step ${to + 1} of ${_hist.length}`);
}
const undo = () => restoreHistory(_histIdx - 1);
const redo = () => restoreHistory(_histIdx + 1);

/** One polite live region for actions that change the answer without a visible control moving (undo, load). */
function announce(msg: string): void {
  const el = document.getElementById('swk-live');
  const t = el?.querySelector('span');
  if (t && msg) { t.textContent = msg; window.setTimeout(() => { if (t.textContent === msg) t.textContent = 'Live'; }, 2500); }
}

// ─── Scenarios ────────────────────────────────────────────────────────────────────────────────────────────────────

let _scMode: ScenarioMode = 'saved';
let _baseline: { name: string; inputs: SWProgramInputs } | null = null;

const cloneInputs = (p: SWProgramInputs): SWProgramInputs => {
  const lib = p.rateLibrary;
  const { rateLibrary: _drop, ...rest } = p;
  return { ...(JSON.parse(JSON.stringify(rest)) as SWProgramInputs), rateLibrary: lib };
};
/** A saved scenario is costed on the CURRENT rate book (rates are policy, not part of a scenario). */
const withBook = (p: SWProgramInputs): SWProgramInputs => ({ ...cloneInputs(p), region: normaliseSWRegion(String(p.region)) as SWRegion, rateLibrary: _swInputs.rateLibrary });

function scenarioList(): SWScenarioIn[] {
  const cur: SWScenarioIn = { id: 'current', name: 'Current programme', kind: 'current', inputs: cloneInputs(_swInputs) };
  if (_scMode === 'saved') {
    const base: SWScenarioIn = _baseline
      ? { id: 'baseline', name: _baseline.name, kind: 'baseline', inputs: withBook(_baseline.inputs) }
      : { ...cur, kind: 'baseline' };
    return [base, ...(_baseline ? [cur] : []), ..._savedConfigs.map(c => ({ id: c.id, name: c.name, kind: 'saved' as const, inputs: withBook(c.inputs) }))];
  }
  const set = _scMode === 'source' ? devSourceSet(_swInputs) : _scMode === 'hub' ? hubSet(_swInputs) : reuseSet(_swInputs);
  // The generated row that IS the current programme is the baseline; reuse levels have none, so the current one leads.
  const same = set.findIndex(x => snapshotOf(x.inputs) === snapshotOf(_swInputs));
  if (same >= 0) set[same] = { ...set[same], kind: 'baseline', name: `${set[same].name} (current)` };
  return same >= 0 ? set : [{ ...cur, kind: 'baseline' }, ...set];
}

function renderScenarios(): void {
  const out = document.getElementById('swk-sc-out');
  if (!out) return;
  const rows = compareScenarios(scenarioList());
  const baseName = rows.find(r => r.figures && !r.delta)?.name ?? 'Current programme';
  out.innerHTML = scenarioResultHTML(rows, n => swMoney(n, 0), fmtM, { savedIds: new Set(_savedConfigs.map(c => c.id)), baselineName: baseName });
  wireCharts(out);
  const b = document.getElementById('swk-sc-base');
  if (b) b.textContent = _scMode === 'saved' ? `Baseline: ${_baseline ? _baseline.name : 'the current programme'}` : 'Baseline: the current programme';
  document.querySelectorAll<HTMLButtonElement>('[data-sc-mode]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.scMode === _scMode)));
}

/** The pinned scenario baseline is a saved project of its own kind: on the server for a signed-in user (it follows
 *  them to another device), in this browser otherwise — the same store as saved scenarios (project-store.ts). The
 *  old browser-only key is read once and migrated. */
const BASELINE_KIND = 'sw_baseline';
const LEGACY_BASELINE_KEY = 'cv-sw-baseline';
let _baselineId: string | null = null;
function storeBaseline(): void {
  const prevId = _baselineId;
  if (!_baseline) {
    _baselineId = null;
    if (prevId) void projectStore.remove(BASELINE_KIND, prevId).catch(() => { /* offline — the pin lasts for this visit */ });
    return;
  }
  const { rateLibrary: _drop, ...inputs } = _baseline.inputs;
  const id = prevId ?? `swb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  _baselineId = id;
  void projectStore.save({ id, kind: BASELINE_KIND, name: _baseline.name, data: inputs }).catch(() => { /* offline */ });
}
async function restoreBaseline(): Promise<void> {
  try {
    const list = await projectStore.list(BASELINE_KIND);
    const latest = [...list].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0];
    const inputs = latest?.data as SWProgramInputs | undefined;
    if (latest && inputs?.modules) { _baseline = { name: latest.name, inputs }; _baselineId = latest.id; return; }
    // Migrate a pin from the browser-only key (before Oct 2026).
    const raw = localStorage.getItem(LEGACY_BASELINE_KEY);
    if (raw) {
      const b = JSON.parse(raw) as { name: string; inputs: SWProgramInputs };
      if (b?.name && b.inputs?.modules) { _baseline = b; storeBaseline(); }
      localStorage.removeItem(LEGACY_BASELINE_KEY);
    }
  } catch { /* store unavailable — no pin restored */ }
}

function pinBaseline(name?: string, inputs?: SWProgramInputs): void {
  try { readConfig(); } catch { /* the engine reports a bad value */ }
  const at = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  _baseline = { name: name ?? `Pinned ${at}`, inputs: cloneInputs(inputs ?? _swInputs) };
  storeBaseline();
  _scMode = 'saved';
  renderScenarios();
  scMessage(`Baseline set: ${_baseline.name}.`);
}

function scMessage(msg: string): void {
  const el = document.getElementById('swk-sc-msg');
  if (el) el.textContent = msg;
}

/** Load a scenario into the form and recost it (it becomes an undoable step). */
function loadScenarioInputs(p: SWProgramInputs, name: string): void {
  const lib = _swInputs.rateLibrary;
  _swInputs = { ...cloneInputs(p), region: normaliseSWRegion(String(p.region)) as SWRegion, rateLibrary: lib };
  _swActiveVehicle = null;
  writeInputsToForm(_swInputs);
  try {
    _swResult = computeSWProgram(_swInputs);
    renderResults(_swResult, { live: true });
    recordHistory();
  } catch (err) {
    const rail = document.getElementById('swk-rail');
    if (rail) railError(rail, (err as Error).message);
  }
  announce(`Loaded ${name}.`);
}

function wireScenarios(): void {
  const root = document.getElementById('swk-p-scenarios');
  if (!root) return;
  root.querySelector('#swk-sc-pin')?.addEventListener('click', () => pinBaseline());
  root.querySelector('#swk-sc-save')?.addEventListener('submit', e => {
    e.preventDefault();
    const input = root.querySelector<HTMLInputElement>('#swk-sc-name');
    const name = input?.value.trim() ?? '';
    if (!name) { scMessage('Type a name for the scenario first.'); input?.focus(); return; }
    try { readConfig(); } catch { /* reported on the rail */ }
    void saveConfig(name).then(() => { _scMode = 'saved'; renderScenarios(); });
    if (input) input.value = '';
    scMessage(`Saved “${name}”.`);
  });
  root.addEventListener('click', e => {
    const t = (e.target as Element).closest<HTMLElement>('[data-sc-mode],[data-sc-load],[data-sc-base],[data-sc-del]');
    if (!t) return;
    if (t.dataset.scMode) { _scMode = t.dataset.scMode as ScenarioMode; renderScenarios(); return; }
    const id = t.dataset.scLoad ?? t.dataset.scBase ?? t.dataset.scDel!;
    const sc = scenarioList().find(x => x.id === id);
    if (t.dataset.scLoad && sc) { loadScenarioInputs(sc.inputs, sc.name); renderScenarios(); }
    else if (t.dataset.scBase && sc) pinBaseline(sc.name, sc.inputs);
    else if (t.dataset.scDel) { const n = _savedConfigs.find(c => c.id === id)?.name; deleteConfig(id); renderScenarios(); scMessage(n ? `Deleted “${n}”.` : ''); }
  });
}

// ─── Keyboard ──────────────────────────────────────────────────────────────────────────────────────────────────────

let _docKeysWired = false;
const typingIn = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type === 'text' || type === 'search' || type === 'email' || type === 'url';
};

function wireKeyboard(): void {
  if (_docKeysWired) return;
  _docKeysWired = true;
  document.addEventListener('keydown', e => {
    const panel = document.getElementById('sw-panel');
    if (!panel || !document.body.classList.contains('cv-sw')) return;
    const dlg = document.getElementById('swk-keys') as HTMLDialogElement | null;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey && (k === 'z' || k === 'y')) {
      if (typingIn(e.target)) return;              // a text field keeps its own undo
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (mod || e.altKey || typingIn(e.target) || (e.target as HTMLElement)?.tagName === 'SELECT' || dlg?.open) return;
    if (e.key === '?') { e.preventDefault(); openShortcuts(); }
    else if (e.key === '/') {
      e.preventDefault();
      _swSelectTab?.('scope');
      (document.getElementById('swk-scope-q') as HTMLInputElement | null)?.focus();
    } else if (k === 'b' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
      e.preventDefault();
      pinBaseline();
      _swSelectTab?.('scenarios');
    }
  });
}

function openShortcuts(): void {
  const dlg = document.getElementById('swk-keys') as HTMLDialogElement | null;
  if (dlg && !dlg.open && typeof dlg.showModal === 'function') dlg.showModal();
}

/** Scope toolbar: find modules, show only those in scope, and set ASIL / complexity / reuse on every module shown. */
function scopeBarHTML(): string {
  const opt = (vals: string[], label: string, id: string) => `<label class="sr-only" for="${id}">${label}</label><select id="${id}" data-no-live><option value="">${label}…</option>${vals.map(v => `<option value="${v}">${v}</option>`).join('')}</select>`;
  return `<div class="swk-scopebar" role="search">
    <label class="sr-only" for="swk-scope-q">Find a module</label>
    <input id="swk-scope-q" type="search" placeholder="Find a module — e.g. radar, BMS, OTA" data-no-live autocomplete="off">
    <label class="sr-only" for="swk-scope-dom">Domain</label>
    <select id="swk-scope-dom" data-no-live><option value="">All domains</option>${ALL_CATS.map(c => `<option value="${c}">${esc(CAT_META[c].label)}</option>`).join('')}</select>
    <label style="display:flex;gap:6px;align-items:center;font-size:.76rem;color:var(--sw-text-body)"><input id="swk-scope-on" type="checkbox" data-no-live> In scope only</label>
    ${opt(['QM', 'A', 'B', 'C', 'D'], 'ASIL', 'swk-bulk-asil')}${opt(['Low', 'Medium', 'High', 'Very High'], 'Complexity', 'swk-bulk-comp')}${opt(['Fresh', 'Light', 'Medium', 'Heavy', 'Platform'], 'Reuse', 'swk-bulk-reuse')}
    <button type="button" class="swk-btn" id="swk-bulk-apply">Apply</button>
    <button type="button" class="swk-link" id="swk-pick-shown">Select shown</button>
    <button type="button" class="swk-link" id="swk-pick-clear">Clear selection</button>
    <span class="swk-count" id="swk-scope-count" aria-live="polite"></span>
  </div>`;
}

function rateCheckHTML(r: SWProgramResult): string {
  const c = swRateCheck(r);
  const hub = activeSWBook().lib.hubRates[r.inputs.region];
  return `<section class="swk-card"><h3 class="swk-h">The engineering rate in this costing</h3>
    <p class="swk-sub">${esc(hubLabel(r.inputs.region))}: hub rate ${swMoney(hub ? (r.inputs.teamSeniorFraction * hub.senior.value + (1 - r.inputs.teamSeniorFraction) * hub.mid.value) : 0, 0)} / PM
      × development source price × engineering burden ${swOverhead(r.inputs).toFixed(2)} = <strong>${swMoney(c.loadedPerPM, 0)} per person-month</strong>
      (${swMoney(c.perHour, 0)} an hour · ${swMoney(c.perDay, 0)} a day of 8 h).</p>
    ${c.lines.length ? `<ul class="swk-callouts">${c.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function renderSWPanelHTML(): string {
  const inputs = _swInputs;

  const moduleRowsHTML = Object.entries(CAT_META).map(([cat, meta]) => {
    const mods = SW_MODULES.filter(m => m.category === cat);
    const rows = mods.map(def => {
      const inp = inputs.modules.find(m => m.moduleId === def.id)!;
      const asilOpts = (['QM','A','B','C','D'] as ASILLevel[]).map(a =>
        `<option value="${a}" ${inp.asil === a ? 'selected' : ''}>${a}</option>`).join('');
      const compOpts = (['Low','Medium','High','Very High'] as SWComplexity[]).map(c =>
        `<option value="${esc(c)}" ${inp.complexity === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
      const reuseOpts = (['Fresh','Light','Medium','Heavy','Platform'] as SWReuse[]).map(r =>
        `<option value="${r}" ${inp.reuse === r ? 'selected' : ''}>${r}</option>`).join('');
      const cal = calFor(def, inp);
      const calOpts = SW_CALS.map(c => `<option value="${c}" ${cal === c ? 'selected' : ''}>${c === 'none' ? '—' : c}</option>`).join('');
      const tags: string[] = [];
      if (def.hasMLContent) tags.push('<span class="sw-tag sw-tag-ml">ML</span>');
      if (def.hasCloudDependency) tags.push('<span class="sw-tag sw-tag-cloud">Cloud</span>');
      if (def.hasCybersecRequirement) tags.push('<span class="sw-tag sw-tag-sec">SecOps</span>');
      // Rec 8: ASIL downgrade warning — always render the span so the live
      // change handler can toggle it; hide it when not currently downgraded.
      const isDowngrade = ASIL_RANK[inp.asil] < ASIL_RANK[def.defaultAsil];
      const asilWarn = `<span class="sw-asil-warn" style="${isDowngrade ? '' : 'display:none'}" title="⚠ ASIL set below module default (${def.defaultAsil}). Verify safety case.">⚠</span>`;
      return `
      <tr class="sw-module-row" data-module-id="${def.id}">
        <td class="sw-mod-check"><input type="checkbox" class="sw-mod-pick" data-id="${def.id}" data-no-live aria-label="Select ${esc(def.shortName)} for a batch edit"></td>
        <td class="sw-mod-check"><input type="checkbox" class="sw-mod-enable" data-id="${def.id}" ${inp.enabled ? 'checked' : ''} aria-label="Include ${esc(def.shortName)}"></td>
        <td class="sw-mod-name">
          <div style="font-weight:600;font-size:0.82rem;color:var(--sw-text-primary)">${esc(def.shortName)}${def.estimateBasis ? ` <span title="${esc('Estimate: ' + def.estimateBasis)}" style="font-size:0.62rem;font-weight:700;color:var(--amber,#b45309);border:1px solid currentColor;border-radius:4px;padding:0 4px;margin-left:4px">estimate</span>` : ''}${def.royaltyBasis ? ` <span title="${esc('Royalty: ' + def.royaltyBasis)}" style="font-size:0.62rem;font-weight:700;color:var(--sw-text-secondary);border:1px solid currentColor;border-radius:4px;padding:0 4px;margin-left:4px">per-vehicle royalty</span>` : ''}</div>
          <div style="font-size:0.7rem;color:var(--sw-text-muted);margin-top:1px">${esc(def.basePersonMonths)} PM base · ${tags.join(' ')}</div>
        </td>
        <td class="sw-mod-desc" title="${esc(def.description)}" style="font-size:0.72rem;color:var(--sw-text-secondary);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(def.description)}</td>
        <td><select class="sw-sel sw-asil-sel${inp.asil !== def.defaultAsil ? ' is-set' : ''}" data-id="${def.id}" data-default="${def.defaultAsil}" aria-label="${esc(def.shortName)} ASIL (default ${def.defaultAsil})">${asilOpts}</select>${asilWarn}</td>
        <td><select class="sw-sel sw-comp-sel${inp.complexity !== def.defaultComplexity ? ' is-set' : ''}" data-id="${def.id}" data-default="${esc(def.defaultComplexity)}" aria-label="${esc(def.shortName)} complexity (default ${esc(def.defaultComplexity)})">${compOpts}</select></td>
        <td><select class="sw-sel sw-reuse-sel${inp.reuse !== 'Medium' ? ' is-set' : ''}" data-id="${def.id}" data-default="Medium" aria-label="${esc(def.shortName)} reuse (default Medium)">${reuseOpts}</select></td>
        <td><select class="sw-sel sw-cal-sel" data-id="${def.id}" aria-label="${esc(def.shortName)} cybersecurity assurance level" title="ISO/SAE 21434 CAL — drives the cybersecurity uplift (default from the Annex E example table; your TARA decides)">${calOpts}</select></td>
        <td><input type="number" class="sw-ksloc-input" data-id="${def.id}" placeholder="—" value="${inp.sizeKSLOC ?? ''}" min="0.1" step="0.1" style="width:64px" aria-label="${esc(def.shortName)} size, KSLOC" title="Optional: the module's size in thousand source lines. Its nominal effort then comes from COCOMO II (${esc(SW_COCOMO.A)} × KSLOC^${SW_COCOMO_EXPONENT.toFixed(4)}) instead of the catalogue's ${esc(def.basePersonMonths)} PM."></td>
        <td><input type="number" class="sw-pm-input" data-id="${def.id}" aria-label="${esc(def.shortName)} custom person-months" placeholder="auto" value="${inp.customPersonMonths ?? ''}" min="0" step="1" style="width:60px"></td>
      </tr>`;
    }).join('');

    return `
    <div class="sw-cat-group" data-cat="${cat}">
      <div class="sw-cat-header" style="border-left:3px solid ${meta.color}" onclick="this.closest('.sw-cat-group').classList.toggle('sw-collapsed')">
        <span class="sw-cat-icon">${meta.icon}</span>
        <span class="sw-cat-label">${esc(meta.label)}</span>
        <span class="sw-cat-count">${mods.length}/${mods.length} modules</span>
        <span class="sw-cat-chevron">▾</span>
      </div>
      <div class="sw-cat-body sw-table-wrap">
        <table class="sw-module-table">
          <thead>
            <tr>
              <th style="width:24px"><span class="sr-only">Select</span></th>
              <th style="width:24px"><span class="sr-only">In scope</span></th>
              <th>Module</th>
              <th>Description</th>
              <th style="width:80px">ASIL</th>
              <th style="width:100px">Complexity</th>
              <th style="width:90px">Reuse</th>
              <th style="width:76px" title="ISO/SAE 21434 cybersecurity assurance level">CAL</th>
              <th style="width:72px" title="Optional size, thousand source lines — COCOMO II size path (P3 #16)">Size KSLOC</th>
              <th style="width:70px">Custom PM</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  const regionOpts = hubOptionsHTML(inputs.region, activeSWBook().lib, n => swMoney(n, 0), inputs.teamSeniorFraction);

  const sourceOpts = ([
    ['OEM_Internal','OEM Internal Teams'],['Tier1_Supplier','Tier 1 Supplier'],['Startup_OSS','Startup / OSS'],
  ] as [DevSource, string][]).map(([v,l]) =>
    `<option value="${v}" ${inputs.devSource === v ? 'selected' : ''}>${esc(l)}</option>`).join('');

  return `
<div id="sw-panel" class="sw-cockpit">
  ${headHTML()}
  <div id="swk-rail" class="swk-rail" aria-label="Live programme figures">${railHTML(_swResult, n => swMoney(n, 0), fmtM)}</div>
  ${tabsHTML(_swTab)}
  <section class="swk-panel" id="swk-p-setup" role="tabpanel" aria-labelledby="swk-t-setup"${_swTab === 'setup' ? '' : ' hidden'}>
  <div class="swk-setup">
  <section class="swk-card">
    <h3 class="swk-h">Start from</h3>
    <p class="swk-sub">A vehicle programme or a quick setting fills the fields below. Change anything afterwards — the figures above follow, and ↶ undoes it.</p>
    <div class="swk-row" style="margin-bottom:8px"><span class="swk-row-l">Vehicle programmes</span>
      ${SW_VEHICLE_DEMOS.slice(0, 5).map(v => `<button class="sw-preset-btn sw-vehicle-btn" data-vehicle="${v.id}" title="${esc(v.desc)}">${v.label}</button>`).join('')}
    </div>
    <details class="swk-more"><summary>${SW_VEHICLE_DEMOS.length - 5} more drivetrain variants</summary>
      <div class="swk-row" style="margin:8px 0">${SW_VEHICLE_DEMOS.slice(5).map(v => `<button class="sw-preset-btn sw-vehicle-btn" data-vehicle="${v.id}" title="${esc(v.desc)}">${v.label}</button>`).join('')}</div>
    </details>
    <div class="swk-row"><span class="swk-row-l">Quick set</span>
    <button class="sw-preset-btn" data-preset="aggressive" title="Heavy reuse everywhere, developed in China; module ASIL and complexity unchanged">Heavy reuse · China hub</button>
    <button class="sw-preset-btn" data-preset="baseline" title="Medium reuse, UK hub, module defaults">Baseline · UK hub</button>
    <button class="sw-preset-btn" data-preset="premium" title="Fresh code, complexity raised to at least High (never lowered), California hub">Fresh code · California hub</button>
    <button class="sw-preset-btn" data-preset="offshored" title="Medium reuse, India hub, module defaults">Offshored · India hub</button>
    </div>
  ${(() => {
    const active = _swActiveVehicle ? SW_VEHICLE_DEMOS.find(d => d.id === _swActiveVehicle) : null;
    if (!active?.reportUrl) return '';
    return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:-6px 0 16px;padding:10px 14px;border-radius:8px;border:1px solid rgba(29,78,216,0.30);background:linear-gradient(135deg,rgba(37,99,235,0.10),rgba(37,99,235,0.04))">
      <span style="font-size:1.05rem"></span>
      <span style="flex:1;min-width:180px;font-size:0.78rem;font-weight:600;color:var(--sw-text-primary)">Detailed board-level breakdown for ${esc(active.label)} — a reference example from before the October 2026 model fixes; its figures differ from the live calculation.</span>
      <button type="button" id="sw-demo-report-btn" data-report-url="${esc(active.reportUrl)}" class="swk-btn swk-btn-primary" style="display:flex;align-items:center;gap:6px">
        View reference example →
      </button>
    </div>`;
  })()}
  </section>

  <!-- ── Global Programme Config ──────────────────────────────── -->
  <div class="swk-card sw-programme-card">
    <h3 class="swk-h" style="margin-bottom:10px">Programme</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">
      <div class="sw-field-group">
        <label class="sw-label" for="sw-region">Software engineering hub</label>
        <select id="sw-region" class="sw-config-sel">${regionOpts}</select><div id="sw-hub-basis" style="font-size:0.66rem;color:var(--text-muted);margin-top:3px">${esc(_swHubBasis)}</div>
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-dev-source">Development source</label>
        <select id="sw-dev-source" class="sw-config-sel">${sourceOpts}</select>
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-powertrain">Powertrain</label>
        <select id="sw-powertrain" class="sw-config-sel" title="Switches the powertrain modules in scope (engine SW_POWERTRAIN_SCOPE); you can still tick modules by hand afterwards.">
          <option value="" ${inputs.powertrain ? '' : 'selected'}>— as configured —</option>
          ${(['ICE', 'MHEV', 'PHEV', 'BEV'] as const).map(p => `<option value="${p}" ${inputs.powertrain === p ? 'selected' : ''}>${PT_LABEL[p]}</option>`).join('')}
        </select>
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-platform-vol">Platform volume, all powertrains (veh/yr)</label>
        <input id="sw-platform-vol" type="number" class="sw-config-inp" min="0" step="1000" placeholder="blank = this variant only" value="${inputs.platformAnnualVolume ?? ''}" title="Vehicles per year across every powertrain variant sharing the non-powertrain software. Shared modules are attributed to this variant by its share of that volume.">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-prog-life">Programme life (years)</label>
        <input id="sw-prog-life" type="number" class="sw-config-inp" min="5" max="20" step="1" value="${inputs.programLifeYears}">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-vol">Annual production volume</label>
        <input id="sw-vol" type="number" class="sw-config-inp" min="1000" max="500000" step="1000" value="${inputs.annualProductionVolume}">
      </div>
      <div class="sw-field-group swk-burden" style="grid-column:1/-1">
        <span class="sw-label" id="sw-burden-l">Engineering burden on the hub rate (salary + statutory on-cost)</span>
        <div class="swk-burden-row" role="group" aria-labelledby="sw-burden-l">
          <label for="sw-burden-emp">Employment +%<input id="sw-burden-emp" type="number" class="sw-config-inp" min="0" max="300" step="1" value="${(inputs.burden ?? SW_DEFAULT_BURDEN).employmentPct}" title="${esc(SW_BURDEN_BASIS.employment)}"></label>
          <label for="sw-burden-co">Company +%<input id="sw-burden-co" type="number" class="sw-config-inp" min="0" max="300" step="1" value="${(inputs.burden ?? SW_DEFAULT_BURDEN).companyPct}" title="${esc(SW_BURDEN_BASIS.company)}"></label>
          <label for="sw-burden-cap">Capital +%<input id="sw-burden-cap" type="number" class="sw-config-inp" min="0" max="300" step="1" value="${(inputs.burden ?? SW_DEFAULT_BURDEN).capitalPct}" title="${esc(SW_BURDEN_BASIS.capital)}"></label>
          <output id="sw-overhead" class="swk-burden-out" for="sw-burden-emp sw-burden-co sw-burden-cap" aria-live="polite">× ${swOverhead(inputs).toFixed(2)}</output>
        </div>
        <p class="swk-fieldnote">Employment: pension top-up, bonus, benefits. Company: site, IT, management, training, non-project time. Capital: equipment when not priced separately (tools are their own line). Defaults are labelled estimates — use your own.</p>
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-effort-cal">Effort calibration (×)</label>
        <input id="sw-effort-cal" type="number" class="sw-config-inp" min="0.2" max="5" step="0.01" placeholder="none" value="${inputs.effortCalibration ?? ''}" title="Your own actual ÷ modelled effort (Calibrate to your actuals, below). Blank = the model as published. Scales the model's effort, not a typed custom PM.">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-dev-months">Development duration (months)</label>
        <input id="sw-dev-months" type="number" class="sw-config-inp" min="6" max="180" step="1" placeholder="${SW_DEFAULT_DEVELOPMENT_MONTHS}" value="${inputs.developmentMonths ?? ''}" title="Feasibility to SOP. Development tool licences are paid over this, and the phase timeline follows it. Blank = ${SW_DEFAULT_DEVELOPMENT_MONTHS} months — ${esc(SW_DEVELOPMENT_BASIS)}">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-connected">Connected vehicles (%)</label>
        <input id="sw-connected" type="number" class="sw-config-inp" min="0" max="100" step="1" placeholder="100" value="${inputs.connectedVehicleShare != null ? Math.round(inputs.connectedVehicleShare * 100) : ''}" title="Share of vehicles that use the cloud back-end. Cloud is charged per connected vehicle in service. Blank = 100 %.">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-senior-frac">Senior engineer share (0–1)</label>
        <input id="sw-senior-frac" type="number" class="sw-config-inp" min="0" max="1" step="0.05" value="${inputs.teamSeniorFraction}" title="Share of senior engineers (0–1): blends the hub's mid-level and senior rates. It changes the rate, not the effort.">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-base-rate">Your engineer rate (£/PM, optional)</label>
        <input id="sw-base-rate" type="number" class="sw-config-inp" min="100" max="500000" step="50" value="${inputs.baseRateGBP ?? ''}" placeholder="${Math.round(swLibraryBaseRate(inputs))}"${inputs.baseRateGBP ? ' data-typed="1"' : ''} aria-describedby="sw-base-rate-hint" title="Blank = the hub's own book rate (its mid / senior blend at your senior share), shown greyed. Type your own £ per person-month (152 h, before overhead) to replace it for this hub — it is never scaled by a country factor. Clear it to go back to the book rate.">
        <span class="sw-rate-hint" id="sw-base-rate-hint">${inputs.baseRateGBP ? 'Your rate — clear the field to use the book rate' : 'Blank = hub book rate (shown greyed)'}</span>
      </div>
      <div class="sw-field-group" style="display:flex;flex-direction:column;gap:8px;justify-content:flex-end">
        <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--sw-text-body);cursor:pointer">
          <input type="checkbox" id="sw-inc-maint" ${inputs.includeMaintenanceCost ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer">
          Include maintenance
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--sw-text-body);cursor:pointer">
          <input type="checkbox" id="sw-inc-cloud" ${inputs.includeCloudCost ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer">
          Include cloud
        </label>
      </div>
    </div>
  </div>

  <section class="swk-card">
    <h3 class="swk-h" style="margin-bottom:10px">Lifecycle &amp; compliance</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">
      <div class="sw-field-group"><label class="sw-label" for="sw-sub-years">Map updates per vehicle (years)</label>
        <input id="sw-sub-years" type="number" class="sw-config-inp" min="0" max="20" step="1" placeholder="${SW_DEFAULT_SUBSCRIPTION_YEARS}" value="${inputs.subscriptionYears ?? ''}" title="${esc(SW_SUBSCRIPTION_BASIS)}"></div>
      <div class="sw-field-group"><label class="sw-label" for="sw-svc-years">Connected service per vehicle (years)</label>
        <input id="sw-svc-years" type="number" class="sw-config-inp" min="1" max="25" step="1" placeholder="${SW_DEFAULT_SERVICE_YEARS}" value="${inputs.connectedServiceYears ?? ''}" title="${esc(SW_SERVICE_BASIS)}"></div>
      <div class="sw-field-group"><label class="sw-label" for="sw-cloud-fixed">Fixed cloud platform (£ / year)</label>
        <input id="sw-cloud-fixed" type="number" class="sw-config-inp" min="0" step="10000" placeholder="not entered" value="${inputs.cloudFixedPerYearGBP ?? ''}" title="Base back-end, PKI and environments while any vehicle is served. No public figure — enter your platform's own."></div>
      <div class="sw-field-group"><label class="sw-label" for="sw-tool-seat">Tools (£ per engineer-seat-year)</label>
        <input id="sw-tool-seat" type="number" class="sw-config-inp" min="0" step="500" placeholder="${SW_TOOL_SEAT_GBP}" value="${inputs.toolSeatGBPPerYear ?? ''}" title="${esc(SW_TOOL_SEAT_BASIS)}"></div>
      <div class="sw-field-group"><label class="sw-label" for="sw-wage-esc">Wage escalation, sustaining (% / year)</label>
        <input id="sw-wage-esc" type="number" class="sw-config-inp" min="-10" max="30" step="0.5" placeholder="0" value="${inputs.wageEscalationPct ?? ''}" title="${esc(SW_MAINT_BASIS)}"></div>
      <div class="sw-field-group"><label class="sw-label" for="sw-post-years">Security support after the last build (years)</label>
        <input id="sw-post-years" type="number" class="sw-config-inp" min="0" max="30" step="1" placeholder="${SW_POST_EOP_YEARS}" value="${inputs.postProductionSupportYears ?? ''}" title="${esc(SW_POST_EOP_BASIS)} 0 = none."></div>
      <div class="sw-field-group"><label class="sw-label" for="sw-post-share">… share of the tail team (%)</label>
        <input id="sw-post-share" type="number" class="sw-config-inp" min="0" max="100" step="5" placeholder="${Math.round(SW_POST_EOP_SHARE * 100)}" value="${inputs.postProductionSupportShare != null ? Math.round(inputs.postProductionSupportShare * 100) : ''}" title="${esc(SW_POST_EOP_BASIS)}"></div>
      <div class="sw-field-group"><label class="sw-label" for="sw-discount">Discount rate (% / year, NPV)</label>
        <input id="sw-discount" type="number" class="sw-config-inp" min="0" max="50" step="0.5" placeholder="0 (nominal)" value="${inputs.discountRatePct ?? ''}" title="Blank or 0 = nominal money. A rate discounts every year's spend to today (the headline becomes an NPV)."></div>
      <div class="sw-field-group"><label class="sw-label" for="sw-csms-types">Vehicle types sharing CSMS / SUMS</label>
        <input id="sw-csms-types" type="number" class="sw-config-inp" min="1" max="200" step="1" placeholder="1" value="${inputs.csmsTypesSharing ?? ''}" title="${esc(SW_HOMOLOGATION_BASIS)}"></div>
      <div class="sw-field-group" style="justify-content:flex-end"><label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--sw-text-body)">
        <input type="checkbox" id="sw-homolog" ${(inputs.includeHomologation ?? true) ? 'checked' : ''}> Include homologation (R155 / R156 / ISO 26262)</label></div>
    </div>
  </section>

  <section class="swk-card" id="sw-quotes-card"></section>

  <section class="swk-card">
    <div class="swk-row" style="justify-content:space-between"><h3 class="swk-h">Software in scope</h3>
      <button type="button" class="swk-link" data-goto="scope">Edit modules one by one</button></div>
    <p class="swk-sub">Select a domain to include or exclude all of its modules. Powertrain software follows the powertrain above; set ASIL, complexity and reuse per module on Scope.</p>
    ${domainChipsHTML()}
  </section>

  <section class="swk-card">
    <h3 class="swk-h">Reference reports</h3>
    <p class="swk-sub" id="sw-reports-stale">Static <strong>reference examples</strong> generated before the October 2026 model fixes. Their figures differ from the live costing on this page, which is the current model.</p>
    <div class="swk-row">
      <button class="sw-preset-btn" id="sw-study-btn" title="Open the apple-to-apple powertrain cost study — 5 cars × 4 drivetrains">Powertrain Cost Study</button>
      <button class="sw-preset-btn" id="sw-bench-btn" title="Range Rover L460 competitive benchmark — vs BMW X7 / Audi Q8 / Mercedes GLS / Porsche Cayenne, real drivetrains only">L460 Competitive Benchmark</button>
      <button class="sw-preset-btn" id="sw-deepdive-btn" title="Range Rover L460 module-by-module deep-dive">L460 Deep-Dive</button>
      <button class="sw-preset-btn" id="sw-allmodels-btn" title="Every module priced across five premium SUVs side by side">All-Models Comparison</button>
    </div>
  </section>

  <div class="swk-row" style="justify-content:flex-end">
    <span class="swk-sub" style="margin:0">The figures update as you type.</span>
    <button id="sw-calc-btn" class="swk-btn">Recalculate now</button>
  </div>
  </div>
  </section>

  <section class="swk-panel" id="swk-p-scope" role="tabpanel" aria-labelledby="swk-t-scope"${_swTab === 'scope' ? '' : ' hidden'}>
    ${scopeBarHTML()}
  <!-- ── Module Configuration ─────────────────────────────────── -->
  <div style="font-weight:700;font-size:0.88rem;color:var(--sw-text-primary);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
    <span style="display:flex;align-items:center;gap:6px"><span></span> Module Configuration (${SW_MODULES.length} modules)</span>
    <div style="display:flex;gap:8px">
      <button id="sw-select-all" style="font-size:0.72rem;padding:3px 10px;border-radius:4px;border:1px solid var(--sw-border);background:var(--sw-surface);color:var(--sw-text-body);cursor:pointer">Select All</button>
      <button id="sw-deselect-all" style="font-size:0.72rem;padding:3px 10px;border-radius:4px;border:1px solid var(--sw-border);background:var(--sw-surface);color:var(--sw-text-body);cursor:pointer">Deselect All</button>
    </div>
  </div>

  <div id="sw-modules-container">${moduleRowsHTML}</div>
  <section class="swk-card" id="sw-custom-card" style="margin-top:14px"></section>
  </section>

  <div id="sw-results">
  <section class="swk-panel" id="swk-p-overview" role="tabpanel" aria-labelledby="swk-t-overview"${_swTab === 'overview' ? '' : ' hidden'}>
    <div id="swk-overview" class="swk-stack"></div>
    <div id="sw-insights"></div>
  </section>
  <section class="swk-panel" id="swk-p-vehicle" role="tabpanel" aria-labelledby="swk-t-vehicle"${_swTab === 'vehicle' ? '' : ' hidden'}>
    <div id="sw-studio"></div>
  </section>
  <section class="swk-panel" id="swk-p-risk" role="tabpanel" aria-labelledby="swk-t-risk"${_swTab === 'risk' ? '' : ' hidden'}>
    <div id="swk-risk"></div>
    <div id="swk-bandmethod"></div>
  </section>
  <section class="swk-panel" id="swk-p-spend" role="tabpanel" aria-labelledby="swk-t-spend"${_swTab === 'spend' ? '' : ' hidden'}>
    <div id="swk-spend" class="swk-stack"></div>
  </section>
  <section class="swk-panel" id="swk-p-modules" role="tabpanel" aria-labelledby="swk-t-modules"${_swTab === 'modules' ? '' : ' hidden'}>
    <div id="swk-domains-t"></div>
    <div id="sw-module-table"></div>
  </section>
  <section class="swk-panel" id="swk-p-supplier" role="tabpanel" aria-labelledby="swk-t-supplier"${_swTab === 'supplier' ? '' : ' hidden'}>
    ${supplierFormHTML(Object.entries(CAT_META).map(([c, m]) => [c as SWCategory, m.label]))}
    <div id="swk-makebuy-wrap"></div>
    <div id="swk-source-wrap"></div>
  </section>
  <section class="swk-panel" id="swk-p-scenarios" role="tabpanel" aria-labelledby="swk-t-scenarios"${_swTab === 'scenarios' ? '' : ' hidden'}>
    ${scenariosPanelHTML()}
  </section>
  <section class="swk-panel" id="swk-p-rates" role="tabpanel" aria-labelledby="swk-t-rates"${_swTab === 'rates' ? '' : ' hidden'}>
    <div id="swk-ratecheck"></div>
    <div id="swk-evidence-wrap"></div>
    ${renderRateLibraryHTML()}
    <div id="sw-validation-wrap">${renderValidationHTML()}</div>
    ${renderActualsHTML()}
  </section>
  <section class="swk-panel" id="swk-p-report" role="tabpanel" aria-labelledby="swk-t-report"${_swTab === 'report' ? '' : ' hidden'}>
    ${exportCardHTML()}
    <div id="sw-benchmarks-wrap"></div>
  </section>
  </div><!-- /sw-results -->
  ${shortcutsDialogHTML()}
</div>

<style>
${HUB_RATES_CSS}
${COCKPIT_CSS}
${VIEWS_CSS}
${QUOTES_CSS}
${REPORT_OPTIONS_CSS}
.swk-more{margin:0 0 8px}.swk-more>summary{cursor:pointer;font-size:.76rem;color:var(--sw-text-secondary)}
body.cv-sw #costing-view > .results-panel, body.cv-sw .cv-sticky-actions { display: none !important; }
.sw-ratelib-h{font-size:.8rem;font-weight:700;color:var(--sw-text-primary);margin:4px 0 8px}
/* Rec 9: Dark mode CSS variables */
:root {
  --sw-surface:      #ffffff;
  --sw-surface-alt:  #f8fafc;
  --sw-border:       #e2e8f0;
  --sw-border-light: #f1f5f9;
  --sw-text-primary: #0f172a;
  --sw-text-body:    #374151;
  --sw-text-secondary: #475569;
  --sw-text-muted:   #64748b;
  --sw-accent:       #2563eb;
  --sw-accent-bg:    #eff6ff;
  --sw-accent-border:#bfdbfe;
  /* Result colours that pass WCAG AA (4.5:1) on the panel surfaces in each theme (axe, P3 a11y). */
  --sw-good:         #047857;
  --sw-bad:          #b91c1c;
  --sw-warn:         #b45309;
  --sw-on-accent:    #ffffff;
}
/* Dark follows the APP's theme (black + green; dark is the default), not the OS setting (code review F6: the panel
   went light inside a dark app, or dark inside a light one). Values are the app's own tokens. */
html:not([data-theme="light"]) {
    --sw-surface:      var(--surface, #111513);
    --sw-surface-alt:  var(--bg-secondary, #0c0f0d);
    --sw-border:       var(--border-strong, rgba(178,204,186,.22));
    --sw-border-light: var(--border, rgba(178,204,186,.10));
    --sw-text-primary: var(--text-primary, #eef3ef);
    --sw-text-body:    var(--text-secondary, #a9b6ad);
    --sw-text-secondary: var(--text-secondary, #a9b6ad);
    --sw-text-muted:   var(--text-muted, #85928a);
    --sw-accent:       var(--accent, #22c55e);
    --sw-on-accent:    var(--on-accent, #04130a);
    --sw-good:         var(--green, #2dd4bf);
    --sw-bad:          var(--red, #f87171);
    --sw-warn:         var(--amber, #fbbf24);
    --sw-accent-bg:    var(--accent-light, rgba(34,197,94,.12));
    --sw-accent-border: rgba(34,197,94,.45);
}

.sw-config-sel, .sw-config-inp {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--sw-border);
  border-radius: 6px;
  font-size: 0.8rem;
  background: var(--sw-surface);
  color: var(--sw-text-primary);
}
.sw-config-sel:focus, .sw-config-inp:focus {
  outline: none;
  border-color: var(--sw-accent);
  box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
}
.sw-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--sw-text-body);
  margin-bottom: 5px;
}
.sw-field-group { display: flex; flex-direction: column; }
.sw-config-inp::placeholder { color: var(--sw-text-muted); opacity: 1; font-style: italic; }
.sw-rate-hint { font-size: 0.7rem; color: var(--sw-text-muted); margin-top: 4px; }

.sw-cat-group { margin-bottom: 10px; border-radius: 8px; border: 1px solid var(--sw-border); overflow: hidden; }
.sw-cat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  background: var(--sw-surface-alt);
  cursor: pointer;
  user-select: none;
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--sw-text-primary);
}
.sw-cat-header:hover { background: var(--sw-border-light); }
.sw-cat-icon { font-size: 1rem; }
.sw-cat-label { flex: 1; }
.sw-cat-count { font-size: 0.72rem; font-weight: 500; color: var(--sw-text-muted); }
.sw-cat-chevron { font-size: 0.75rem; color: var(--sw-text-muted); transition: transform 0.2s; }
.sw-collapsed .sw-cat-chevron { transform: rotate(-90deg); }
.sw-collapsed .sw-cat-body { display: none; }

.sw-module-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
.sw-module-table thead th {
  padding: 7px 8px;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--sw-text-muted);
  background: var(--sw-surface-alt);
  border-bottom: 1px solid var(--sw-border);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.sw-module-table tbody tr:hover { background: var(--sw-surface-alt); }
.sw-module-row td { padding: 7px 8px; border-bottom: 1px solid var(--sw-border-light); vertical-align: middle; }
.sw-mod-check { width: 24px; }
.sw-mod-name { min-width: 110px; }

.sw-module-table .sw-asil-sel { min-width: 58px; }
.sw-module-table .sw-comp-sel { min-width: 104px; }
.sw-module-table .sw-reuse-sel { min-width: 92px; }
.sw-module-table .sw-cal-sel { min-width: 74px; }
/* A setting changed from the module's default is marked by weight + accent border, and its label names the default. */
.sw-sel.is-set { border-color: var(--sw-accent); font-weight: 650; }
.sw-sel {
  padding: 4px 6px;
  border: 1px solid var(--sw-border);
  border-radius: 5px;
  font-size: 0.75rem;
  background: var(--sw-surface);
  color: var(--sw-text-primary);
  width: 100%;
}
.sw-sel:focus { outline: none; border-color: var(--sw-accent); }
.sw-pm-input {
  padding: 4px 6px;
  border: 1px solid var(--sw-border);
  border-radius: 5px;
  font-size: 0.75rem;
  background: var(--sw-surface);
  color: var(--sw-text-primary);
  width: 60px;
}
.sw-pm-input:focus { outline: none; border-color: var(--sw-accent); }

.sw-asil-warn {
  margin-left: 4px;
  cursor: help;
  font-size: 0.8rem;
}

.sw-tag {
  display: inline-block;
  padding: 0 5px;
  border-radius: 3px;
  font-size: 0.62rem;
  font-weight: 700;
  margin-right: 2px;
}
/* Tag text passes AA in both themes (light: darker inks; dark: the app's own tokens). */
.sw-tag-ml    { background: #7c3aed1a; color: #6d28d9; border: 1px solid #7c3aed55; }
.sw-tag-cloud { background: #0891b21a; color: #0e7490; border: 1px solid #0891b255; }
.sw-tag-sec   { background: #dc26261a; color: #b91c1c; border: 1px solid #dc262655; }
html:not([data-theme="light"]) .sw-tag-ml    { color: #c4b5fd; }
html:not([data-theme="light"]) .sw-tag-cloud { color: var(--accent3, #2dd4bf); }
html:not([data-theme="light"]) .sw-tag-sec   { color: var(--red, #f87171); }

.sw-preset-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--sw-border);
  background: var(--sw-surface);
  color: var(--sw-text-body);
  font-size: 0.75rem;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s, box-shadow 0.15s, opacity 0.15s, transform 0.15s;
}
.sw-preset-btn:hover { background: var(--sw-border-light); border-color: var(--sw-text-muted); }
.sw-preset-active { background: var(--sw-accent-bg) !important; border-color: var(--sw-accent) !important; color: var(--sw-accent) !important; font-weight: 700; }

.sw-results-section {
  background: var(--sw-surface);
  border: 1px solid var(--sw-border);
  border-radius: 10px;
  padding: 18px 20px;
  margin-bottom: 14px;
}
.sw-section-title {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--sw-text-primary);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sw-data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
.sw-data-table th {
  padding: 8px 10px;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--sw-text-muted);
  background: var(--sw-surface-alt);
  border-bottom: 1px solid var(--sw-border);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.sw-data-table td { padding: 8px 10px; border-bottom: 1px solid var(--sw-border-light); color: var(--sw-text-body); }
.sw-data-table tr:last-child td { border-bottom: none; }
.sw-data-table tbody tr:hover { background: var(--sw-surface-alt); }
.sw-num { text-align: right; font-variant-numeric: tabular-nums; }
.sw-highlight { background: var(--sw-accent-bg) !important; font-weight: 700; color: var(--sw-accent) !important; }

.sw-summary-card {
  background: var(--sw-surface);
  border: 1px solid var(--sw-border);
  border-radius: 10px;
  padding: 16px 18px;
  position: relative;
  overflow: hidden;
}
.sw-card-label { font-size: 0.73rem; font-weight: 600; color: var(--sw-text-muted); margin-bottom: 6px; }
.sw-card-value { font-size: 1.4rem; font-weight: 800; color: var(--sw-text-primary); line-height: 1; }
.sw-card-sub { font-size: 0.72rem; color: var(--sw-text-muted); margin-top: 4px; }

.sw-bar-track { background: var(--sw-border-light); border-radius: 4px; height: 8px; overflow: hidden; margin-top: 4px; }
.sw-bar-fill { height: 100%; border-radius: 4px; }

/* Phase timeline */
.sw-phase-bar {
  display: flex;
  border-radius: 6px;
  overflow: hidden;
  height: 28px;
  margin: 12px 0 8px;
}
.sw-phase-seg {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 700;
  color: #fff;
  min-width: 0;
  transition: opacity 0.2s;
  cursor: default;
  overflow: hidden;
  white-space: nowrap;
}
.sw-phase-seg:hover { opacity: 0.85; }

/* ── Design tokens (Rec #5: design system) ─────────────────────────────────── */
:root {
  --sw-space-1: 4px;  --sw-space-2: 8px;  --sw-space-3: 12px;
  --sw-space-4: 16px; --sw-space-5: 20px; --sw-space-6: 28px;
  --sw-radius-sm: 6px; --sw-radius: 10px; --sw-radius-lg: 14px;
  --sw-shadow-sm: 0 1px 2px rgba(15,23,42,0.06);
  --sw-shadow:    0 4px 14px rgba(15,23,42,0.10);
}

/* ── Reusable components / utilities ───────────────────────────────────────── */
.sw-box {
  background: var(--sw-surface-alt);
  border: 1px solid var(--sw-border);
  border-radius: var(--sw-radius);
  padding: var(--sw-space-3) var(--sw-space-4);
}
.sw-badge { display: inline-block; font-size: 0.68rem; font-weight: 700; border-radius: 4px; padding: 1px 7px; }
.sw-grid { display: grid; gap: var(--sw-space-3); }
.sw-grid-4 { grid-template-columns: repeat(4, 1fr); }
.sw-grid-3 { grid-template-columns: repeat(3, 1fr); }
.sw-grid-2 { grid-template-columns: repeat(2, 1fr); }
.sw-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

/* Tactile lift on summary cards */
.sw-summary-card { box-shadow: var(--sw-shadow-sm); transition: box-shadow 0.18s ease, transform 0.18s ease; }
.sw-summary-card:hover { box-shadow: var(--sw-shadow); }

/* ── Responsive pass (Rec #5) ──────────────────────────────────────────────── */
@media (max-width: 900px) {
  .sw-grid-4 { grid-template-columns: repeat(2, 1fr); }
  .sw-grid-3 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .sw-grid-4, .sw-grid-3, .sw-grid-2 { grid-template-columns: 1fr; }
  .sw-results-section { padding: var(--sw-space-4) var(--sw-space-3); }
  .sw-config-card     { padding: var(--sw-space-4) var(--sw-space-3); }
  .sw-card-value      { font-size: 1.15rem; }
  .sw-data-table      { font-size: 0.72rem; }
  .sw-data-table th, .sw-data-table td { padding: 6px 7px; }
  .sw-section-title   { font-size: 0.84rem; }
}

</style>`;
}

// ─── Read current form state into _swInputs ───────────────────────────────────

function readConfig(): void {
  const get = (id: string) => document.getElementById(id) as HTMLElement | null;

  const region     = (get('sw-region') as HTMLSelectElement)?.value as SWRegion || 'UK';
  const devSrc     = (get('sw-dev-source') as HTMLSelectElement)?.value as DevSource || 'OEM_Internal';
  // A blank or zero life / volume is reported by the engine's validation, not silently replaced (P2 #8).
  const life       = parseInt((get('sw-prog-life') as HTMLInputElement)?.value);
  const vol        = parseInt((get('sw-vol') as HTMLInputElement)?.value);
  const num = (id: string) => { const raw = ((get(id) as HTMLInputElement | null)?.value ?? '').trim(); return raw === '' ? undefined : parseFloat(raw); };
  const seniorFrac = parseFloat((get('sw-senior-frac') as HTMLInputElement)?.value) ?? 0.50;
  const baseRateEl = get('sw-base-rate') as HTMLInputElement | null;
  const maint      = (get('sw-inc-maint') as HTMLInputElement)?.checked ?? true;
  const cloud      = (get('sw-inc-cloud') as HTMLInputElement)?.checked ?? true;

  _swInputs.region                 = region;
  _swInputs.devSource              = devSrc;
  _swInputs.programLifeYears       = life;
  _swInputs.annualProductionVolume = vol;
  // The three burden layers; a bad value goes to the engine's validation (never patched here).
  if (get('sw-burden-emp')) {
    _swInputs.burden = { employmentPct: num('sw-burden-emp') ?? 0, companyPct: num('sw-burden-co') ?? 0, capitalPct: num('sw-burden-cap') ?? 0 };
    _swInputs.overheadMultiplier = Math.round(swOverhead(_swInputs) * 1000) / 1000;
  }
  _swInputs.subscriptionYears      = num('sw-sub-years');
  _swInputs.connectedServiceYears  = num('sw-svc-years');
  _swInputs.cloudFixedPerYearGBP   = num('sw-cloud-fixed');
  _swInputs.toolSeatGBPPerYear     = num('sw-tool-seat');
  _swInputs.wageEscalationPct      = num('sw-wage-esc');
  _swInputs.postProductionSupportYears = num('sw-post-years');
  const postShare = num('sw-post-share');
  _swInputs.postProductionSupportShare = postShare === undefined ? undefined : postShare / 100;
  _swInputs.discountRatePct        = num('sw-discount');
  _swInputs.csmsTypesSharing       = num('sw-csms-types');
  const homolog = get('sw-homolog') as HTMLInputElement | null;
  if (homolog) _swInputs.includeHomologation = homolog.checked;
  const out = get('sw-overhead');
  if (out) out.textContent = `× ${swOverhead(_swInputs).toFixed(2)}`;
  _swInputs.teamSeniorFraction     = Math.min(1, Math.max(0, isNaN(seniorFrac) ? 0.50 : seniorFrac));
  // Only a TYPED base rate overrides the active (company or built-in) rate book — P1 #2.
  _swInputs.baseRateGBP            = baseRateEl ? baseRateOverride(baseRateEl.value, baseRateEl.dataset.typed === '1') : _swInputs.baseRateGBP;
  const platVol = parseInt((get('sw-platform-vol') as HTMLInputElement | null)?.value ?? '');
  _swInputs.platformAnnualVolume   = platVol > 0 ? platVol : undefined;
  _swInputs.includeMaintenanceCost = maint;
  _swInputs.includeCloudCost       = cloud;
  // Blank = uncalibrated; a typed factor goes to the engine, which refuses one outside 0.2–5 (P2 #21).
  const calRaw = ((get('sw-effort-cal') as HTMLInputElement | null)?.value ?? '').trim();
  _swInputs.effortCalibration      = calRaw === '' ? undefined : parseFloat(calRaw);
  // Blank = the defaults (tool timeline; every vehicle connected); a typed value goes to the engine's validation (P3 #17).
  const devRaw = ((get('sw-dev-months') as HTMLInputElement | null)?.value ?? '').trim();
  _swInputs.developmentMonths      = devRaw === '' ? undefined : parseFloat(devRaw);
  const conRaw = ((get('sw-connected') as HTMLInputElement | null)?.value ?? '').trim();
  _swInputs.connectedVehicleShare  = conRaw === '' ? undefined : parseFloat(conRaw) / 100;

  document.querySelectorAll<HTMLInputElement>('.sw-mod-enable').forEach(cb => {
    const m = _swInputs.modules.find(x => x.moduleId === cb.dataset.id);
    if (m) m.enabled = cb.checked;
  });
  document.querySelectorAll<HTMLSelectElement>('.sw-asil-sel').forEach(sel => {
    const m = _swInputs.modules.find(x => x.moduleId === sel.dataset.id);
    if (m) m.asil = sel.value as ASILLevel;
  });
  document.querySelectorAll<HTMLSelectElement>('.sw-comp-sel').forEach(sel => {
    const m = _swInputs.modules.find(x => x.moduleId === sel.dataset.id);
    if (m) m.complexity = sel.value as SWComplexity;
  });
  document.querySelectorAll<HTMLSelectElement>('.sw-reuse-sel').forEach(sel => {
    const m = _swInputs.modules.find(x => x.moduleId === sel.dataset.id);
    if (m) m.reuse = sel.value as SWReuse;
  });
  document.querySelectorAll<HTMLSelectElement>('.sw-cal-sel').forEach(sel => {
    const m = _swInputs.modules.find(x => x.moduleId === sel.dataset.id);
    if (m) m.cal = sel.value as SWCal;
  });
  document.querySelectorAll<HTMLInputElement>('.sw-ksloc-input').forEach(inp => {
    const m = _swInputs.modules.find(x => x.moduleId === inp.dataset.id);
    if (!m) return;
    const v = parseFloat(inp.value);
    m.sizeKSLOC = inp.value.trim() === '' || isNaN(v) ? undefined : v;   // engine validation reports a bad size
  });
  document.querySelectorAll<HTMLInputElement>('.sw-pm-input').forEach(inp => {
    const m = _swInputs.modules.find(x => x.moduleId === inp.dataset.id);
    if (!m) return;
    const v = parseFloat(inp.value);   // 12.5 PM was costed as 12 (parseInt, code review F22)
    m.customPersonMonths = isNaN(v) || inp.value.trim() === '' ? null : v;
  });
}

// ─── Vehicle programme demos ────────────────────────────────────────────────
//
// Four detailed, realistic luxury-SUV software programmes. Each sets the
// programme-level parameters (region, dev source, volume, life, overhead) and a
// tailored module stack: powertrain SW scoped to the actual drivetrain (PHEV vs
// 48V mild-hybrid), plus each OEM's reuse posture (platform sharing / Tier-1).

interface SWVehicleDemo {
  id:              string;
  label:           string;
  desc:            string;
  region:          SWRegion;
  devSource:       DevSource;
  volume:          number;
  life:            number;
  overhead:        number;
  senior:          number;
  reuse:           SWReuse;
  /** The drivetrain — its powertrain modules come from the engine's SW_POWERTRAIN_SCOPE (P1 #5). */
  powertrain:      SWPowertrain;
  /** Other modules to disable (not powertrain — that is the scope's job). */
  disabledModules: string[];
  /** Optional per-module tweaks (complexity/asil) for signature systems. */
  moduleOverrides?: Record<string, Partial<Pick<SWModuleInput, 'asil' | 'complexity' | 'reuse'>>>;
  /** Optional path to a detailed, board-level cost-breakdown report for this programme. */
  reportUrl?: string;
  /** Product facts the scope rests on, each with the page it was checked on (printed in the PDF report). */
  facts?: Array<[string, string]>;
}


export const SW_VEHICLE_DEMOS: SWVehicleDemo[] = [
  {
    id: 'rr_l460', powertrain: 'PHEV', label: 'Range Rover L460 (PHEV)',
    // President review (14 Oct 2026): every product fact below was re-checked against JLR / Meridian / press pages
    // (scripts/sw-research/2026-10-14-rr-phev/verify-demo.md). The old text claimed a "published ≈ £390M" software cost
    // (no source exists), a digital key (not confirmed for the L460) and "heavy Tier-1 outsourcing" (a modelling choice).
    desc: 'Range Rover (L460, 2022 on): JLR MLA-Flex platform, EVA 2.0 electrical architecture, Pivi Pro infotainment with software-over-the-air updates. PHEV: P460e / P550e, 38.2 kWh battery (MY24 on). Premium software from JLR-listed features: Dynamic Response Pro (48 V active roll control), all-wheel steering, Meridian Signature Sound, Cabin Air Purification Pro, head-up display (option), 3D surround camera and Remote Park Assist. Voice: Amazon Alexa. Digital key is not confirmed for the L460 and is out of scope. Tier-1 development is a modelling assumption, not JLR\'s sourcing.',
    region: 'UK', devSource: 'Tier1_Supplier', volume: 75_000, life: 8, overhead: SW_DEFAULT_OVERHEAD, senior: 0.55, reuse: 'Medium',
    reportUrl: 'reports/l460-software-cost-breakdown.html',  // relative to import.meta.env.BASE_URL
    disabledModules: ['digital_key'],  // not confirmed for the L460 (fact check, 14 Oct 2026); PHEV keeps its HV software
    moduleOverrides: {
      bms_core:       { complexity: 'High' },     // PHEV pack smaller than a BEV
      soc_soh_soe:    { complexity: 'High' },
      fast_charge:    { complexity: 'Medium' },   // AC + modest DC
      edu_control:    { complexity: 'High' },
      premium_audio:  { complexity: 'Very High' }, // Meridian Signature Sound (35 speakers, Meridian)
    },
    facts: [
      ['MLA-Flex platform; EVA 2.0 electrical architecture; Pivi Pro with software-over-the-air updates', 'https://media.landrover.com/introducing-new-range-rover-seamlessly-connected-convenience-and-luxury-every-turn'],
      ['PHEV P460e / P550e, 38.2 kWh battery, up to 75 miles WLTP (from MY24)', 'https://www.fleetnews.co.uk/news/manufacturer-news/2023/05/17/range-rover-plug-in-hybrids-updated-with-more-power-and-range'],
      ['Dynamic Response Pro (48 V electronic active roll control); all-wheel steering', 'https://media.landrover.com/introducing-new-range-rover-serene-capability-assurance-and-composure-and-road'],
      ['Meridian Signature Sound System (35 loudspeakers)', 'https://meridian-audio.com/media/news-events/meridian-audio-brings-best-ever-audio-system-for-new-range-rover-to-mark-10-years-of-partnership/'],
      ['Cabin Air Purification Pro (PM2.5 filtration)', 'https://www.landrover.in/range-rover/range-rover/explore.html'],
      ['Head-up display (option), 3D surround camera, Remote Park Assist', 'https://media.landrover.com/introducing-new-range-rover-seamlessly-connected-convenience-and-luxury-every-turn'],
      ['Amazon Alexa is the Pivi Pro voice assistant', 'https://www.landroverusa.com/our-story/news/amazon-alexa.html'],
      ['No published software-cost figure for the L460 was found; no model-level volume is published (JLR reports Range Rover family wholesales)', 'https://media.jaguarlandrover.com/news/2024/04/jlr-full-year-sales-over-20-cent-year-year-reflecting-improved-production-and'],
    ],
  },
  {
    id: 'bmw_x7', powertrain: 'MHEV', label: 'BMW X7 (48V MHEV)',
    desc: 'G07 flagship SUV, CLAR platform, iDrive 8 (BMW OS 8). ICE + 48V mild hybrid. Strong platform reuse across 7-Series/X5/X7. Premium software: Executive Drive Pro (48V active roll) + Integral Active Steering, Bowers & Wilkins Diamond audio, Parking Assistant Professional + 360, Digital Key Plus (UWB), AR-ready HUD.',
    region: 'DE', devSource: 'OEM_Internal', volume: 60_000, life: 8, overhead: SW_DEFAULT_OVERHEAD, senior: 0.55, reuse: 'Heavy',
    reportUrl: 'reports/bmw-x7-software-cost-breakdown.html',
    disabledModules: [],  // powertrain scope: engine SW_POWERTRAIN_SCOPE
    moduleOverrides: {
      digital_key: { complexity: 'Very High' },   // BMW Digital Key Plus (UWB), industry-leading
    },
  },
  {
    id: 'audi_q8', powertrain: 'MHEV', label: 'Audi Q8 (48V MHEV)',
    desc: 'MLB Evo platform, MMI/MIB3 infotainment, VW Group + CARIAD shared software stacks. ICE + 48V mild hybrid. Strong platform reuse (VW.OS carry-across). Premium software: adaptive air suspension + all-wheel steer, Bang & Olufsen 3D, park assist plus + 360, 4-zone climate, HUD.',
    region: 'DE', devSource: 'OEM_Internal', volume: 55_000, life: 9, overhead: SW_DEFAULT_OVERHEAD, senior: 0.55, reuse: 'Heavy',
    reportUrl: 'reports/audi-q8-software-cost-breakdown.html',
    // Core platform middleware genuinely carries across the VW Group → Platform reuse there.
    moduleOverrides: { autosar_classic: { reuse: 'Platform' }, autosar_adaptive: { reuse: 'Platform' }, rtos: { reuse: 'Platform' }, comm_stacks: { reuse: 'Platform' } },
    disabledModules: [],  // powertrain scope: engine SW_POWERTRAIN_SCOPE
  },
  {
    id: 'merc_gls', powertrain: 'MHEV', label: 'Mercedes GLS 450 (48V MHEV)',
    desc: 'X167 flagship, MBUX / NTG6 (infotainment-heavy), EQ Boost 48V mild hybrid. Signature software: E-Active Body Control (48V, camera Road-Surface-Scan), MBUX + "Hey Mercedes" voice, Burmester 3D surround, active parking + 360, MB AR-HUD, 5-zone climate + air purification, digital key.',
    region: 'DE', devSource: 'OEM_Internal', volume: 45_000, life: 9, overhead: SW_DEFAULT_OVERHEAD, senior: 0.55, reuse: 'Medium',
    reportUrl: 'reports/mercedes-gls-software-cost-breakdown.html',
    disabledModules: [],  // powertrain scope: engine SW_POWERTRAIN_SCOPE
    moduleOverrides: {
      ivi_os:            { complexity: 'Very High' },
      voice_assistant:   { complexity: 'Very High' },
      navigation:        { complexity: 'Very High' },
      active_suspension: { complexity: 'Very High' }, // E-Active Body Control, camera-fed 48V
      premium_audio:     { complexity: 'Very High' }, // Burmester high-end 3D
    },
  },
  {
    id: 'porsche_cayenne', powertrain: 'BEV', label: 'Porsche Cayenne Electric (2026)',
    desc: 'E4 platform (PPE, 800V), full BEV, Porsche Driver Experience HMI. Shares PPE middleware with Macan EV / Audi Q6 e-tron (Platform reuse there); bespoke Porsche 4D chassis, Active Ride, 800V high-power charging and Burmester audio at Very-High complexity. Full EV powertrain stack retained.',
    region: 'DE', devSource: 'OEM_Internal', volume: 50_000, life: 8, overhead: SW_DEFAULT_OVERHEAD, senior: 0.60, reuse: 'Medium',
    reportUrl: 'reports/porsche-cayenne-software-cost-breakdown.html',
    disabledModules: [],  // full BEV: BMS / charge / drive software all in scope
    moduleOverrides: {
      // PPE middleware shared with Macan EV / Q6 e-tron → Platform reuse.
      autosar_classic: { reuse: 'Platform' }, autosar_adaptive: { reuse: 'Platform' }, rtos: { reuse: 'Platform' }, comm_stacks: { reuse: 'Platform' },
      // Signature Porsche performance systems → Very-High complexity.
      vehicle_motion:    { complexity: 'Very High' }, // Porsche 4D chassis / torque vectoring
      active_suspension: { complexity: 'Very High' }, // Porsche Active Ride
      fast_charge:       { complexity: 'Very High' }, // 800V high-power DC charging
      premium_audio:     { complexity: 'Very High' }, // Burmester High-End 3D
    },
  },
  {
    id: 'porsche_cayenne_phev', powertrain: 'PHEV', label: 'Porsche Cayenne E-Hybrid (PHEV)',
    desc: 'MLB Evo · PCM · E-Hybrid plug-in powertrain. Same Porsche performance software as the BEV, but the plug-in-hybrid powertrain is retained at reduced scope (smaller pack, lower charging power) — BMS / SOC / drive-unit at High rather than Very-High.',
    region: 'DE', devSource: 'OEM_Internal', volume: 50_000, life: 8, overhead: SW_DEFAULT_OVERHEAD, senior: 0.60, reuse: 'Medium',
    reportUrl: 'reports/porsche-cayenne-phev-software-cost-breakdown.html',
    disabledModules: [],  // PHEV: retains battery/charge/drive SW at reduced scope
    moduleOverrides: {
      autosar_classic: { reuse: 'Platform' }, autosar_adaptive: { reuse: 'Platform' }, rtos: { reuse: 'Platform' }, comm_stacks: { reuse: 'Platform' },
      vehicle_motion: { complexity: 'Very High' }, active_suspension: { complexity: 'Very High' }, premium_audio: { complexity: 'Very High' },
      bms_core: { complexity: 'High' }, soc_soh_soe: { complexity: 'High' }, edu_control: { complexity: 'High' }, fast_charge: { complexity: 'Medium' },
    },
  },
  {
    id: 'porsche_cayenne_mhev', powertrain: 'MHEV', label: 'Porsche Cayenne (48V MHEV)',
    desc: 'MLB Evo · PCM · 48V mild-hybrid powertrain. High-voltage battery / charge / drive modules are not applicable and disabled; 48V regen and battery-thermal retained. Porsche performance software at Very-High complexity.',
    region: 'DE', devSource: 'OEM_Internal', volume: 50_000, life: 8, overhead: SW_DEFAULT_OVERHEAD, senior: 0.60, reuse: 'Medium',
    reportUrl: 'reports/porsche-cayenne-mhev-software-cost-breakdown.html',
    disabledModules: [],  // powertrain scope: engine SW_POWERTRAIN_SCOPE
    moduleOverrides: {
      autosar_classic: { reuse: 'Platform' }, autosar_adaptive: { reuse: 'Platform' }, rtos: { reuse: 'Platform' }, comm_stacks: { reuse: 'Platform' },
      vehicle_motion: { complexity: 'Very High' }, active_suspension: { complexity: 'Very High' }, premium_audio: { complexity: 'Very High' },
    },
  },
  {
    id: 'porsche_cayenne_ice', powertrain: 'ICE', label: 'Porsche Cayenne V8 (ICE)',
    desc: 'MLB Evo · PCM · V8 twin-turbo powertrain. Combustion powertrain software (engine, transmission, after-treatment / OBD — estimates); no electrified-powertrain software. Porsche performance, chassis and infotainment software otherwise identical.',
    region: 'DE', devSource: 'OEM_Internal', volume: 50_000, life: 8, overhead: SW_DEFAULT_OVERHEAD, senior: 0.60, reuse: 'Medium',
    reportUrl: 'reports/porsche-cayenne-ice-software-cost-breakdown.html',
    disabledModules: [],  // powertrain scope: engine SW_POWERTRAIN_SCOPE
    moduleOverrides: {
      autosar_classic: { reuse: 'Platform' }, autosar_adaptive: { reuse: 'Platform' }, rtos: { reuse: 'Platform' }, comm_stacks: { reuse: 'Platform' },
      vehicle_motion: { complexity: 'Very High' }, active_suspension: { complexity: 'Very High' }, premium_audio: { complexity: 'Very High' },
    },
  },
];

// ── Cross-car powertrain variants (apple-to-apple study) ──────────────────────
// Generated from car identity × drivetrain so they match scripts/gen-sw-report.ts
// and the comparison study exactly. Each car keeps the drivetrain it already ships
// as its primary demo above; the other three are appended here.
type Sig = Record<string, Partial<Pick<SWModuleInput, 'asil' | 'complexity' | 'reuse'>>>;
interface StudyCar { id: string; slug: string; flag: string; name: string; region: SWRegion; devSource: DevSource; volume: number; life: number; overhead: number; senior: number; reuse: SWReuse; sig: Sig; skip: string; }
interface StudyDT { key: string; code: string; pt: SWPowertrain; }
const STUDY_CARS: StudyCar[] = [
  { id: 'l460', slug: 'range-rover-l460', flag: '', name: 'Range Rover L460', region: 'UK', devSource: 'Tier1_Supplier', volume: 75_000, life: 8, overhead: SW_DEFAULT_OVERHEAD, senior: 0.55, reuse: 'Medium', sig: { premium_audio: { complexity: 'Very High' } }, skip: 'phev' },
  { id: 'bmw_x7', slug: 'bmw-x7', flag: '', name: 'BMW X7', region: 'DE', devSource: 'OEM_Internal', volume: 60_000, life: 8, overhead: SW_DEFAULT_OVERHEAD, senior: 0.55, reuse: 'Heavy', sig: { digital_key: { complexity: 'Very High' } }, skip: 'mhev' },
  { id: 'audi_q8', slug: 'audi-q8', flag: '', name: 'Audi Q8', region: 'DE', devSource: 'OEM_Internal', volume: 55_000, life: 9, overhead: SW_DEFAULT_OVERHEAD, senior: 0.55, reuse: 'Heavy', sig: { autosar_classic: { reuse: 'Platform' }, autosar_adaptive: { reuse: 'Platform' }, rtos: { reuse: 'Platform' }, comm_stacks: { reuse: 'Platform' } }, skip: 'mhev' },
  { id: 'merc_gls', slug: 'mercedes-gls', flag: '', name: 'Mercedes GLS 450', region: 'DE', devSource: 'OEM_Internal', volume: 45_000, life: 9, overhead: SW_DEFAULT_OVERHEAD, senior: 0.55, reuse: 'Medium', sig: { ivi_os: { complexity: 'Very High' }, voice_assistant: { complexity: 'Very High' }, navigation: { complexity: 'Very High' }, active_suspension: { complexity: 'Very High' }, premium_audio: { complexity: 'Very High' } }, skip: 'mhev' },
];
const STUDY_DTS: StudyDT[] = [
  { key: 'ice', code: 'ICE', pt: 'ICE' }, { key: 'mhev', code: 'MHEV', pt: 'MHEV' },
  { key: 'phev', code: 'PHEV', pt: 'PHEV' }, { key: 'bev', code: 'BEV', pt: 'BEV' },
];for (const c of STUDY_CARS) for (const dt of STUDY_DTS) {
  if (dt.key === c.skip) continue;
  SW_VEHICLE_DEMOS.push({
    id: `${c.id}__${dt.key}`, label: `${c.flag} ${c.name} (${dt.code})`,
    desc: `${c.name} — ${dt.code} powertrain variant (apple-to-apple study): ${SW_POWERTRAIN_SCOPE[dt.pt].note}. Car identity and macro assumptions held constant; only the powertrain-software scope changes.`,
    powertrain: dt.pt,
    region: c.region, devSource: c.devSource, volume: c.volume, life: c.life, overhead: c.overhead, senior: c.senior, reuse: c.reuse,
    reportUrl: `reports/${c.slug}-${dt.key}-software-cost-breakdown.html`,
    disabledModules: [],
    moduleOverrides: { ...c.sig },
  });
}

/** Build a full programme-inputs object for a vehicle demo. */
export function buildVehicleInputs(v: SWVehicleDemo, rateLibrary?: SWProgramInputs['rateLibrary']): SWProgramInputs {
  const b = defaultSWProgramInputs();
  const disabled = new Set(v.disabledModules);
  return {
    ...b,
    region:                 v.region,
    devSource:              v.devSource,
    programLifeYears:       v.life,
    annualProductionVolume: v.volume,
    overheadMultiplier:     v.overhead,
    teamSeniorFraction:     v.senior,
    ...(rateLibrary ? { rateLibrary } : {}),
    powertrain:             v.powertrain,
    // Powertrain modules from the engine's ONE scope (P1 #5), then the car's own disables and signature overrides.
    // Every non-powertrain module is in a demo's scope (incl. the premium-trim ones its description lists) unless the
    // demo disables it — as before; the powertrain modules then come from the scope.
    modules: applyPowertrainScope(b.modules.map(m => ({ ...m, enabled: !disabled.has(m.moduleId), reuse: v.reuse })), v.powertrain).map(m => ({
      ...m,
      ...(v.moduleOverrides?.[m.moduleId] ?? {}),
    })),
  };
}

/** Apply a vehicle demo: set inputs, re-render the panel, and compute immediately. */
function applyVehicleDemo(id: string): void {
  const v = SW_VEHICLE_DEMOS.find(d => d.id === id);
  if (!v) return;
  _swActiveVehicle = id;
  // A demo is costed on the ACTIVE rate book — it used to drop the company book (P1 #2).
  _swInputs = buildVehicleInputs(v, _swInputs.rateLibrary);
  _swResult = null;
  const panel = document.getElementById('sw-panel');
  if (panel?.parentElement) {
    panel.parentElement.innerHTML = renderSWPanelHTML();
    wireSWPanel();
    mountQuoteCards();
  }
  // Auto-run so the demo shows a full result immediately.
  document.getElementById('sw-calc-btn')?.dispatchEvent(new MouseEvent('click'));
}

// ─── Apply preset ─────────────────────────────────────────────────────────────

function applyPreset(preset: string): void {
  const cfg = {
    aggressive: { asil: null,              comp: null,                       reuse: 'Heavy' as SWReuse, region: 'CN' as SWRegion },
    baseline:   { asil: null,              comp: null,                       reuse: 'Medium' as SWReuse, region: 'UK' as SWRegion },
    premium:    { asil: null,              comp: 'High' as SWComplexity,    reuse: 'Fresh'  as SWReuse, region: 'US-CA' as SWRegion },
    offshored:  { asil: null,              comp: null,                       reuse: 'Medium' as SWReuse, region: 'IN' as SWRegion },
  }[preset];
  if (!cfg) return;

  const regionSel = document.getElementById('sw-region') as HTMLSelectElement | null;
  if (regionSel) { regionSel.value = cfg.region; regionSel.dispatchEvent(new Event('change', { bubbles: true })); }

  // A preset never LOWERS a module (code review F11: "Premium" set every module to High, lowering the 20 Very-High
  // ones, and "Aggressive" set ASIL-A on ASIL-D modules). ASIL stays the module's — it is a safety decision.
  const RANK: Record<string, number> = { Low: 0, Medium: 1, High: 2, 'Very High': 3 };
  document.querySelectorAll<HTMLSelectElement>('.sw-comp-sel').forEach(sel => {
    if (cfg.comp && RANK[sel.value] < RANK[cfg.comp]) sel.value = cfg.comp;
  });
  void cfg.asil;
  document.querySelectorAll<HTMLSelectElement>('.sw-reuse-sel').forEach(sel => {
    sel.value = cfg.reuse;
  });
}

// ─── Render results ───────────────────────────────────────────────────────────

/** The engineering-rate step as the studio and the PDF report state it (one source for both). */
function studioRate(result: SWProgramResult): StepRate {
  const hub = activeSWBook().lib.hubRates[result.inputs.region];
  const used = swRateBasis(result.inputs).find(([k]) => k === 'Engineer rate used')?.[1] ?? '';
  // The engine's own loaded rate (source PRICE factor × the burden) — this used the raw effort factor and the old overhead.
  return { perPMGBP: swLoadedRate(result.inputs), hubLabel: hubLabel(result.inputs.region),
    build: `${used.replace(/^\u00a3[\d,]+ — /, '')}; mid ${swMoney(hub?.mid.value ?? 0, 0)} / senior ${swMoney(hub?.senior.value ?? 0, 0)} per person-month (salary + statutory on-cost ÷ productive hours × 152 h), × development source price × ${swOverhead(result.inputs).toFixed(2)} engineering burden.` };
}
const studioFmt: StepFormat = { money: n => n >= 1e6 ? fmtM(n) : swMoney(n, 0), number: (n, dp = 0) => fmt(n, dp) };

function renderResults(result: SWProgramResult, opts: { live?: boolean } = {}): void {
  renderCockpit(result, opts);

  // Costing studio: the seven steps of this costing on the SUV skeleton (sw-costing-pipeline.ts).
  const studioEl = document.getElementById('sw-studio');
  if (studioEl) {
    mountSWStudio(studioEl, { result, rate: studioRate(result), fmt: studioFmt });
  }

  const money = (n: number) => swMoney(n, 0);
  const put = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  put('swk-bandmethod', bandMethodHTML(result, fmtM));
  put('swk-domains-t', domainTableHTML(result, fmtM));
  put('sw-module-table', moduleTableHTML(result, money, fmtM));
  const rep = document.getElementById('sw-rep');
  if (rep) fillReportScope(rep, result);
  put('swk-makebuy-wrap', makeBuyHTML(swMakeBuy(result), fmtM));
  // Each row is the programme RE-COSTED with that source in the active rate book (engine devSourceComparison, P2 #13).
  put('swk-source-wrap', sourceTableHTML(devSourceComparison(result.inputs), result.inputs.devSource, fmtM));
  put('swk-evidence-wrap', evidenceCardHTML(swEvidence(result), fmtM));
  put('sw-benchmarks-wrap', benchmarksHTML(result, money, fmtM));
  put('sw-insights', insightsHTML(buildInsights(result, fmtM)));

  // Results live in their tabs now; nothing scrolls the page (cockpit review: smooth scroll-jumps removed).
  const resultsEl = document.getElementById('sw-results');
  if (resultsEl) resultsEl.style.display = '';
}

/** The cockpit views: rail, context line, overview / risk / spend charts, supplier check and the rate check. */
/** Charts are drawn at the card's width on a narrow screen (sw-charts.ts setChartWidth): the panel width less the
 *  card's padding and border. Hidden tab panels have no width, so the panel's is used. */
function measureChartWidth(): number | null {
  const panel = document.getElementById('sw-panel');
  if (!panel || typeof window === 'undefined' || window.innerWidth > 700) return null;
  return panel.clientWidth - 2 * 17;
}
let _chartResize: ResizeObserver | null = null;
let _chartW: number | null = null;
function watchChartWidth(): void {
  const panel = document.getElementById('sw-panel');
  if (!panel || typeof ResizeObserver === 'undefined') return;
  _chartResize?.disconnect();
  let t: ReturnType<typeof setTimeout> | null = null;
  _chartResize = new ResizeObserver(() => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      const w = measureChartWidth();
      // Redraw only when the drawing width really changed (a scrollbar appearing is not a reflow).
      if ((w == null) !== (_chartW == null) || (w != null && _chartW != null && Math.abs(w - _chartW) > 16)) {
        if (_swResult) renderCockpit(_swResult);
      }
    }, 180);
  });
  _chartResize.observe(panel);
}

function renderCockpit(result: SWProgramResult, opts: { live?: boolean } = {}): void {
  _chartW = measureChartWidth();
  setChartWidth(_chartW);
  const money = (n: number) => swMoney(n, 0);
  const rail = document.getElementById('swk-rail');
  if (rail) updateRail(rail, result, money, fmtM, { quiet: !opts.live });
  if (_swTab === 'scenarios') renderScenarios();
  const ctx = document.getElementById('swk-context');
  if (ctx) ctx.textContent = contextLine(result, hubLabel(result.inputs.region));
  const put = (id: string, html: string) => { const el = document.getElementById(id); if (el) { el.innerHTML = html; wireCharts(el); } };
  put('swk-overview', overviewHTML(result, money, fmtM));
  put('swk-risk', riskHTML(result, money, fmtM));
  put('swk-spend', spendHTML(result, money, fmtM));
  const rc = document.getElementById('swk-ratecheck');
  if (rc) rc.innerHTML = rateCheckHTML(result);
  refreshQuote();
}

function refreshQuote(): void {
  const root = document.getElementById('swk-p-supplier');
  const out = document.getElementById('swk-quote-out');
  if (!root || !out || !_swResult) return;
  out.innerHTML = supplierResultHTML(_swResult, readQuote(root), n => swMoney(n, 0), fmtM);
}

// ── Live recalculation (cockpit review: the engine runs in milliseconds — the Calculate button is no longer needed) ──
let _liveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleLive(): void {
  if (_liveTimer) clearTimeout(_liveTimer);
  document.getElementById('swk-live')?.classList.add('is-busy');
  _liveTimer = setTimeout(() => { _liveTimer = null; runLive(true); }, 250);
}

function runLive(live: boolean): void {
  const rail = document.getElementById('swk-rail');
  document.getElementById('swk-live')?.classList.remove('is-busy');
  try {
    readConfig();
    if (!_swInputs.modules.some(m => m.enabled)) { if (rail) railError(rail, 'No module is in scope — tick at least one module on the Scope tab.'); return; }
    _swResult = computeSWProgram(_swInputs);
    renderResults(_swResult, { live });
    recordHistory();
  } catch (err) {
    // Keep the last good figures, dimmed, and say why (an invalid input is reported, never patched).
    if (rail) railError(rail, (err as Error).message.replace(/^Software cost inputs are not valid — /, 'Check the inputs: '));
  }
}


// ─── Rec 5: AI Analysis ───────────────────────────────────────────────────────

function generateAIInsights(result: SWProgramResult): void {
  const contentEl = document.getElementById('sw-ai-content');
  const btnEl = document.getElementById('sw-ai-btn') as HTMLButtonElement | null;
  if (!contentEl || !btnEl) return;

  btnEl.disabled = true;
  btnEl.textContent = 'Generating analysis…';
  contentEl.style.display = '';
  contentEl.innerHTML = `<div style="text-align:center;padding:16px;color:var(--sw-text-muted)">Analysing programme cost data with AI…</div>`;

  const s = result.summary;
  const top3 = [...result.modules].sort((a,b) => b.grandTotal - a.grandTotal).slice(0,3);
  const nreTotal = s.nreTotal;
  const lifecyclePct = s.grandTotal > 0 ? (s.totalMaintenance + s.totalCloud + s.totalLicensing) / s.grandTotal * 100 : 0;

  const prompt = `You are a senior automotive software engineering cost analyst. Provide a concise executive summary and actionable recommendations for this programme:

PROGRAMME: ${programmeTitle()} (${result.inputs.programLifeYears}-year programme)
Total Programme Cost: ${(s.grandTotal/1e6).toFixed(1)}M GBP
Per Vehicle: £${Math.round(s.perVehicle)}
Engineering effort: ${Math.round(s.totalEffortPersonMonths)} PM (development ${Math.round(s.totalPersonMonths)} PM)
Engineering hub: ${hubLabel(result.inputs.region)} | Source: ${result.inputs.devSource} | Life: ${result.inputs.programLifeYears}yr | Volume: ${(result.inputs.annualProductionVolume/1000).toFixed(0)}k/yr
Active Modules: ${result.modules.length}/${SW_MODULES.length}

COST BREAKDOWN:
- Development: £${(s.totalDevelopment/1e6).toFixed(1)}M (${(s.totalDevelopment/s.grandTotal*100).toFixed(0)}%)
- Testing & Validation: £${(s.totalTesting/1e6).toFixed(1)}M
- Calibration: £${(s.totalCalibration/1e6).toFixed(1)}M
- Toolchain: £${(s.totalToolchain/1e6).toFixed(1)}M
- Cybersecurity: £${(s.totalCybersecurity/1e6).toFixed(1)}M
- NRE Total: £${(nreTotal/1e6).toFixed(1)}M
- Lifecycle (Maint+Cloud+IP): ${lifecyclePct.toFixed(0)}% of total

TOP 3 COST DRIVERS:
${top3.map((m,i) => `${i+1}. ${m.moduleName}: £${(m.grandTotal/1e6).toFixed(1)}M (${(m.grandTotal/s.grandTotal*100).toFixed(1)}%)`).join('\n')}

Provide:
1. A 2-sentence executive summary
2. Top 3 cost-reduction levers, naming the cost bucket each acts on
3. Key risk factors requiring management attention
Use ONLY the figures above. Do NOT state any saving, percentage or amount that is not in the data above — the cost is
calculated by the CostVision engine and this text must not add numbers to it.
Keep response concise and actionable (under 250 words).`;

  const render = (text: string, cached: boolean) => {
    // The response is external content: HTML-escape it first, THEN apply the
    // limited markdown (bold, paragraphs) so a malicious payload can't inject markup.
    const formatted = esc(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p style="margin:0 0 8px">')
      .replace(/\n/g, '<br>');
    contentEl.innerHTML = `
      <div style="background:var(--sw-surface-alt);border:1px solid var(--sw-border);border-radius:8px;padding:14px 18px;font-size:0.82rem;color:var(--sw-text-body);line-height:1.6">
        <p style="margin:0 0 8px">${formatted}</p>
      </div>
      <div style="font-size:0.7rem;color:var(--sw-text-muted);margin-top:6px;text-align:right">Generated by AI · CostVision${cached ? ' · cached' : ''}</div>`;
    btnEl.style.display = 'none';
  };

  // Rec 9: serve identical configurations from cache — instant, no API re-bill.
  const cachedReply = _aiCache.get(prompt);
  if (cachedReply) { render(cachedReply, true); btnEl.disabled = false; btnEl.textContent = 'AI Analysis'; return; }

  // Abort the request if the endpoint hangs so the button can't stick on "Generating…".
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);
  const apiKey = localStorage.getItem('sc-api-key') ?? '';

  fetch('/api/aichat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
    body: JSON.stringify({ message: prompt }),
    signal: ctrl.signal,
  })
  .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
  .then((data: { reply?: string; error?: string; aiUnavailable?: boolean }) => {
    const text = data.reply ?? data.error ?? 'No response from AI service.';
    // Only a real model reply is cached: the "no key" notice was cached and kept showing after a key was added (B19).
    if (data.reply && !data.aiUnavailable) _aiCache.set(prompt, data.reply);
    render(text, false);
  })
  .catch(err => {
    const msg = ctrl.signal.aborted ? 'request timed out after 30s' : String(err);
    contentEl.innerHTML = `<div style="background:color-mix(in srgb, var(--danger) 8%, var(--surface));border:1px solid color-mix(in srgb, var(--danger) 35%, transparent);border-radius:6px;padding:10px 14px;font-size:0.8rem;color:color-mix(in srgb, var(--danger) 80%, var(--text-primary))">⚠ AI analysis unavailable: ${esc(msg)}. Engineering Insights above are still available.</div>`;
    btnEl.disabled = false;
    btnEl.textContent = 'Retry AI Analysis';
  })
  .finally(() => clearTimeout(timeout));
}

// ─── Rec 6: Excel Export ──────────────────────────────────────────────────────

async function exportSWExcel(result: SWProgramResult): Promise<void> {
  // The 360 workbook (src/export/sw-report-xlsx.ts): the same report model as the PDF, totals as live formulas from the
  // Rates sheet through every module to the summary, a Checks sheet against the engine, native charts, the skeletons.
  const options = readReportOptions(document.getElementById('sw-rep'));
  const problem = reportOptionProblem(options);
  if (problem) { showSWError(problem); return; }
  await withReportBusy('Excel workbook', async () => {
    const [{ buildSWReportWorkbook }, { model, images }] = await Promise.all([import('../../export/sw-report-xlsx.js'), prepareReport(result, options, reportContext(result))]);
    const bytes = await buildSWReportWorkbook(model, { images });
    const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = exportFilename(reportSlug(result, options.profile), null, 'xlsx');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  });
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

/** Every manufacturing country on the page's picker → the hub its software is costed at (and why). PDF and Excel. */
function countryHubList(): Array<{ code: string; label: string; hub: string; hubLabel: string; basis: string }> {
  return Array.from(document.querySelectorAll<HTMLOptionElement>('#mfg-region-selector option')).filter(o => o.value).map(o => {
    const h = swRegionFor(o.value);
    return { code: o.value, label: o.textContent?.trim() ?? o.value, hub: h.region, hubLabel: hubLabel(h.region), basis: h.basis ?? '' };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

/** The programme's name in reports: the vehicle demo it came from, else a plain label (never a made-up vehicle). */
function programmeTitle(): string {
  return (_swActiveVehicle ? SW_VEHICLE_DEMOS.find(v => v.id === _swActiveVehicle)?.label : undefined) ?? 'Vehicle software programme';
}

/** What only the screen knows, for every report (PDF and Excel): the title, the checked vehicle text, the page's
 *  countries, the supplier quote, the page currency and the studio's rate line. */
function reportContext(result: SWProgramResult): ReportContext {
  const demo = _swActiveVehicle ? SW_VEHICLE_DEMOS.find(v => v.id === _swActiveVehicle) : undefined;
  const panel = document.getElementById('sw-panel');
  const cur = swCur();
  return {
    title: programmeTitle(), vehicleDesc: demo?.desc, facts: demo?.facts, countries: countryHubList(),
    quote: panel ? readQuote(panel) : {}, currency: { code: cur.code, sym: cur.sym, perGbp: cur.perGbp },
    fmt: { money: (n, dp = 0) => swMoney(n, dp), moneyM: fmtM, number: (n, dp = 0) => fmt(n, dp) },
    stepRate: studioRate(result),
  };
}

function reportSlug(result: SWProgramResult, profile: string): string {
  const demo = _swActiveVehicle ? SW_VEHICLE_DEMOS.find(v => v.id === _swActiveVehicle) : undefined;
  const base = (demo?.label ?? 'sw-should-cost').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base}-${profile === 'vehicle' ? '' : profile + '-'}${String(result.inputs.region).toLowerCase()}`;
}

/** Busy state on both export buttons while a report is built (rasterising the skeletons takes a moment). */
async function withReportBusy(label: string, run: () => Promise<void>): Promise<void> {
  const btns = ['sw-pdf-btn', 'sw-excel-btn'].map(id => document.getElementById(id) as HTMLButtonElement | null);
  const status = document.getElementById('sw-rep-status');
  btns.forEach(b => { if (b) { b.disabled = true; b.setAttribute('aria-busy', 'true'); } });
  if (status) status.textContent = `Building the ${label}…`;
  try { await run(); if (status) status.textContent = `${label[0].toUpperCase()}${label.slice(1)} downloaded.`; }
  catch (e) { if (status) status.textContent = `The ${label} could not be built: ${(e as Error).message}`; throw e; }
  finally { btns.forEach(b => { if (b) { b.disabled = false; b.removeAttribute('aria-busy'); } }); }
}

function exportSWPDF(result: SWProgramResult): void {
  // The 360 report (plan docs/plans/sw-report-360-plan-2026-10-14.md): one model (src/engine/sw-report-model.ts) drawn by
  // src/export/sw-report-pdf.ts — every figure is the result's or the engine re-run; the screen and the report cannot disagree.
  const options = readReportOptions(document.getElementById('sw-rep'));
  const problem = reportOptionProblem(options);
  if (problem) { showSWError(problem); return; }
  void withReportBusy('PDF report', async () => {
    const [{ jsPDF }, { default: autoTable }, { hardenPdfText }, { renderSWReportPdf }, { model, images }] = await Promise.all([
      import('jspdf'), import('jspdf-autotable'), import('../../export/pdf.js'), import('../../export/sw-report-pdf.js'),
      prepareReport(result, options, reportContext(result))]);
    const doc = hardenPdfText(new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }));
    renderSWReportPdf(doc as never, autoTable as never, model, images);
    doc.save(exportFilename(reportSlug(result, options.profile), null, 'pdf'));
  });
}

// ─── Saved Configs ────────────────────────────────────────────────────────────

async function saveConfig(name: string): Promise<void> {
  const id = `cfg-${Date.now()}`;
  const createdAt = new Date().toLocaleDateString('en-GB');
  const inputs = JSON.parse(JSON.stringify(_swInputs)) as SWProgramInputs;
  // Never freeze the rate library into a saved config — rates are organisation
  // policy and must reflect the CURRENT active library on load, not a snapshot.
  delete inputs.rateLibrary;
  _savedConfigs.unshift({ id, name, createdAt, inputs });
  if (_savedConfigs.length > 10) _savedConfigs.pop(); // keep max 10 in view
  updateSavedConfigsUI();                             // optimistic — show immediately
  try { await projectStore.save({ id, kind: SW_PROJECT_KIND, name, data: inputs }); }
  catch { /* offline — kept in view; will persist next time online */ }
}

function deleteConfig(id: string): void {
  _savedConfigs = _savedConfigs.filter(c => c.id !== id);
  updateSavedConfigsUI();
  void projectStore.remove(SW_PROJECT_KIND, id).catch(() => { /* offline */ });
}

/** Saved scenarios live on the Scenarios tab; refresh it when the list changes. */
function updateSavedConfigsUI(): void {
  if (_swTab === 'scenarios') renderScenarios();
}

// ─── Error display ────────────────────────────────────────────────────────────

function showSWError(msg: string): void {
  let errEl = document.getElementById('sw-calc-error');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id = 'sw-calc-error';
    errEl.style.cssText = 'background:color-mix(in srgb, var(--danger) 8%, var(--surface));border:1px solid color-mix(in srgb, var(--danger) 35%, transparent);border-radius:8px;padding:10px 16px;margin:8px 0;font-size:0.82rem;color:color-mix(in srgb, var(--danger) 80%, var(--text-primary));display:flex;align-items:center;gap:8px';
  }
  // Beside the Recalculate button (the rail carries the same reason for the live path).
  const anchor = document.getElementById('sw-calc-btn');
  anchor?.parentElement?.insertBefore(errEl, anchor);
  errEl.setAttribute('role', 'alert');
  errEl.innerHTML = `<span>⚠</span> ${esc(msg)}`;
  errEl.style.display = 'flex';
  // It stays until the next good calculation (WCAG 2.2.1 — no timed message; cockpit UX review #18).
}

// ─── Wire events ──────────────────────────────────────────────────────────────

/** Tabs, header actions, live recalculation, the scope toolbar and the supplier check. */
function wireCockpit(): void {
  const panel = document.getElementById('sw-panel');
  if (!panel) return;
  document.body.classList.add('cv-sw');
  _swSelectTab = wireTabs(panel, t => {
    _swTab = t;
    // The vehicle studio sizes itself on mount; re-mount when its tab is first shown.
    if (t === 'vehicle' && _swResult) renderCockpitStudio(_swResult);
    if (t === 'scenarios') renderScenarios();
  });
  panel.querySelector('.swk-head')?.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLElement>('[data-swk-go],[data-swk-click]');
    if (!b) return;
    if (b.dataset.swkGo) _swSelectTab?.(b.dataset.swkGo as CockpitTab);
    if (b.dataset.swkClick) (document.getElementById(b.dataset.swkClick) as HTMLButtonElement | null)?.click();
  });
  // Live: any input on Setup or Scope re-costs (250 ms debounce). Search / bulk / quote / save-name fields opt out.
  const onEdit = (e: Event) => {
    const t = e.target as HTMLElement;
    if (!t || t.closest('[data-no-live]') || t.hasAttribute('data-no-live')) return;
    if (!t.closest('#swk-p-setup, #swk-p-scope')) return;
    if (t.closest('#sw-actuals-card')) return;
    scheduleLive();
  };
  panel.addEventListener('input', onEdit);
  panel.addEventListener('change', onEdit);
  // Supplier check: recomputed on every keystroke from the current result (no engine run needed).
  panel.querySelector('#swk-p-supplier')?.addEventListener('input', () => refreshQuote());
  // Treemap: a module block opens the vehicle tab with that module's parts lit.
  panel.querySelector('#swk-overview')?.addEventListener('click', e => {
    const id = (e.target as Element).closest<SVGElement>('[data-module]')?.getAttribute('data-module');
    if (id) { _swSelectTab?.('vehicle'); document.querySelector<HTMLElement>(`#sw-studio [data-comp]`)?.focus(); }
  });
  panel.querySelector('#swk-overview')?.addEventListener('keydown', e => {
    if ((e as KeyboardEvent).key === 'Enter' && (e.target as Element).closest('[data-module]')) (e.target as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  wireScopeBar();
  wireScenarios();
  wireKeyboard();
  // Header: undo / redo / shortcuts; Setup: domain chips and "edit modules one by one".
  panel.querySelector('#swk-rail')?.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const more = t.closest<HTMLButtonElement>('.swk-rail-more');
    if (more) { const rail = more.closest('.swk-rail')!; const open = !rail.classList.contains('is-open'); rail.classList.toggle('is-open', open); more.setAttribute('aria-expanded', String(open)); more.textContent = open ? 'Fewer figures' : 'All figures'; return; }
    const go = t.closest<HTMLElement>('[data-swk-go]');
    if (go) _swSelectTab?.(go.dataset.swkGo as CockpitTab);
  });
  panel.querySelector('#swk-undo')?.addEventListener('click', undo);
  panel.querySelector('#swk-redo')?.addEventListener('click', redo);
  panel.querySelector('#swk-keys-btn')?.addEventListener('click', openShortcuts);
  const keysDlg = panel.querySelector<HTMLDialogElement>('#swk-keys');
  keysDlg?.querySelector('[data-close]')?.addEventListener('click', () => keysDlg.close());
  // Esc closes it even when an app-wide Escape handler has already claimed the key; a click on the backdrop too.
  keysDlg?.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); keysDlg.close(); } });
  keysDlg?.addEventListener('click', e => { if (e.target === keysDlg) keysDlg.close(); });
  panel.querySelector('#swk-p-setup')?.addEventListener('click', e => {
    const chip = (e.target as Element).closest<HTMLButtonElement>('[data-domain]');
    if (chip) { setDomain(chip.dataset.domain as SWCat, chip.getAttribute('aria-pressed') !== 'true'); return; }
    if ((e.target as Element).closest('[data-goto="scope"]')) _swSelectTab?.('scope');
  });
  updateHistoryButtons();
}

function renderCockpitStudio(result: SWProgramResult): void {
  const studioEl = document.getElementById('sw-studio');
  if (studioEl && !studioEl.querySelector('.swp-studio')) renderResults(result);
}

function wireScopeBar(): void {
  const q = document.getElementById('swk-scope-q') as HTMLInputElement | null;
  const onlyOn = document.getElementById('swk-scope-on') as HTMLInputElement | null;
  const count = document.getElementById('swk-scope-count');
  const filter = () => {
    const term = (q?.value ?? '').trim().toLowerCase();
    const dom = (document.getElementById('swk-scope-dom') as HTMLSelectElement | null)?.value ?? '';
    let shown = 0, total = 0;
    document.querySelectorAll<HTMLElement>('#sw-modules-container .sw-module-row').forEach(row => {
      total++;
      const text = row.textContent?.toLowerCase() ?? '';
      const enabled = (row.querySelector('.sw-mod-enable') as HTMLInputElement | null)?.checked ?? false;
      const inDom = !dom || row.closest<HTMLElement>('.sw-cat-group')?.dataset.cat === dom;
      const hit = inDom && (!term || text.includes(term)) && (!onlyOn?.checked || enabled);
      row.classList.toggle('swk-hit-none', !hit);
      if (hit) shown++;
    });
    document.querySelectorAll<HTMLElement>('#sw-modules-container .sw-cat-group').forEach(g => {
      const any = !!g.querySelector('.sw-module-row:not(.swk-hit-none)');
      g.style.display = any ? '' : 'none';
      if (term && any) g.classList.remove('sw-collapsed');
    });
    const picked = document.querySelectorAll('#sw-modules-container .sw-mod-pick:checked').length;
    const changed = document.querySelectorAll('#sw-modules-container .sw-sel.is-set').length;
    if (count) count.textContent = `${shown} of ${total} shown · ${picked} selected · ${changed} settings changed from default`;
  };
  document.getElementById('swk-scope-dom')?.addEventListener('change', filter);
  const pickAll = (on: boolean, onlyShown: boolean) => {
    document.querySelectorAll<HTMLElement>('#sw-modules-container .sw-module-row').forEach(row => {
      if (onlyShown && row.classList.contains('swk-hit-none')) return;
      const cb = row.querySelector<HTMLInputElement>('.sw-mod-pick'); if (cb) cb.checked = on;
    });
    filter();
  };
  document.getElementById('swk-pick-shown')?.addEventListener('click', () => pickAll(true, true));
  document.getElementById('swk-pick-clear')?.addEventListener('click', () => pickAll(false, false));
  // Mark a setting changed from the module default; keep the counts live.
  document.getElementById('sw-modules-container')?.addEventListener('change', e => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLSelectElement && t.dataset.default !== undefined) t.classList.toggle('is-set', t.value !== t.dataset.default);
    if (t.matches('.sw-mod-pick, .sw-sel')) filter();
  });
  q?.addEventListener('input', filter);
  onlyOn?.addEventListener('change', filter);
  document.getElementById('swk-bulk-apply')?.addEventListener('click', () => {
    const v = (id: string) => (document.getElementById(id) as HTMLSelectElement | null)?.value ?? '';
    const asil = v('swk-bulk-asil'), comp = v('swk-bulk-comp'), reuse = v('swk-bulk-reuse');
    if (!asil && !comp && !reuse) { if (count) count.textContent = 'Choose an ASIL, complexity or reuse to apply.'; return; }
    let n = 0;
    // The selected modules when any are selected, else every module shown.
    const picked = document.querySelectorAll('#sw-modules-container .sw-mod-pick:checked').length > 0;
    const sel = picked ? '#sw-modules-container .sw-module-row:has(.sw-mod-pick:checked)' : '#sw-modules-container .sw-module-row:not(.swk-hit-none)';
    const setSel = (row: Element, cls: string, v: string) => {
      const s2 = row.querySelector<HTMLSelectElement>(cls); if (!s2) return;
      s2.value = v; if (s2.dataset.default !== undefined) s2.classList.toggle('is-set', v !== s2.dataset.default);
    };
    document.querySelectorAll<HTMLElement>(sel).forEach(row => {
      if (asil) setSel(row, '.sw-asil-sel', asil);
      if (comp) setSel(row, '.sw-comp-sel', comp);
      if (reuse) setSel(row, '.sw-reuse-sel', reuse);
      n++;
    });
    filter();
    if (count) count.textContent = `Applied to ${n} ${picked ? 'selected' : 'shown'} module${n === 1 ? '' : 's'} — ↶ undoes it.`;
    scheduleLive();
  });
  filter();
}

export function wireSWPanel(): void {
  // A base-rate field becomes an override the moment the engineer types in it (sw-rate-field.ts).
  const swPanel = document.getElementById('sw-panel');
  if (swPanel && !swPanel.dataset.rateTypedWired) {
    swPanel.dataset.rateTypedWired = '1';
    swPanel.addEventListener('input', e => {
      const t = e.target as HTMLInputElement;
      // Typing makes the field an override; clearing it goes back to the hub's book rate (shown as the placeholder).
      if ((SW_BASE_RATE_FIELDS as readonly string[]).includes(t.id)) {
        if (t.value.trim() === '') delete t.dataset.typed; else t.dataset.typed = '1';
        refreshRateFields();
      }
    });
    // A new hub or senior share: the untyped rate field follows the hub's book rate; the hub note clears.
    swPanel.addEventListener('change', e => {
      const t = e.target as HTMLInputElement | HTMLSelectElement;
      if (t.id === 'sw-region') {
        _swInputs.region = t.value as SWRegion;
        _swHubBasis = '';
        const basisEl = document.getElementById('sw-hub-basis');
        if (basisEl) basisEl.textContent = '';
        refreshRateFields();
      } else if (t.id === 'sw-senior-frac') {
        const v = parseFloat(t.value);
        if (Number.isFinite(v)) _swInputs.teamSeniorFraction = Math.min(1, Math.max(0, v));
        refreshRateFields();
      }
    });
  }
  // Powertrain select: apply the engine's scope to the modules and redraw the module table (P1 #5).
  document.getElementById('sw-powertrain')?.addEventListener('change', e => {
    const pt = (e.target as HTMLSelectElement).value as SWPowertrain | '';
    if (!pt) return;
    readConfig();
    _swInputs.powertrain = pt;
    _swInputs.modules = applyPowertrainScope(_swInputs.modules, pt);
    writeInputsToForm(_swInputs);
    scheduleLive();
  });
  void renderSWRateAdmin();
  // The calibration card is wired AFTER Calculate (below) and cannot stop the panel if it fails (code review F1).

  queueMicrotask(() => {
    try {
      wireActuals(factor => {
        _swInputs.effortCalibration = factor;
        const f = document.getElementById('sw-effort-cal') as HTMLInputElement | null;
        if (f) f.value = String(factor);
      }, () => { try { readConfig(); } catch { /* the engine reports a bad value */ } return _swInputs; });
    } catch (err) { console.warn('[sw] calibration card not wired:', err); }
  });

  wireCockpit();

  // Calculate button
  const calcBtn = document.getElementById('sw-calc-btn');
  if (calcBtn) {
    calcBtn.addEventListener('click', () => {
      readConfig();

      const enabledCount = _swInputs.modules.filter(m => m.enabled).length;
      if (enabledCount === 0) {
        showSWError('No modules selected. Enable at least one module to run the calculation.');
        return;
      }

      // The engine runs in a few milliseconds: no busy state, no deferred work (cockpit review).
      const rail = document.getElementById('swk-rail');
      try {
        _swResult = computeSWProgram(_swInputs);
        renderResults(_swResult, { live: true });
        recordHistory();
        _swSelectTab?.('overview');
        const errEl = document.getElementById('sw-calc-error');
        if (errEl) errEl.style.display = 'none';
      } catch (err) {
        const msg = (err as Error).message;
        showSWError(`Calculation error: ${msg}`);
        if (rail) railError(rail, msg.replace(/^Software cost inputs are not valid — /, 'Check the inputs: '));
      }
    });
  }

  // Preset buttons (excluding the vehicle demos, which have their own handler)
  // Only the four preset buttons ([data-preset]) — the class is shared by other buttons (the actuals card's Add and
  // template), and clicking those used to run this handler: it retired the vehicle demo and dropped its name from the reports.
  document.querySelectorAll<HTMLButtonElement>('.sw-preset-btn[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('.sw-preset-btn').forEach(b => b.classList.remove('sw-preset-active'));
      btn.classList.add('sw-preset-active');
      // A generic preset is not a vehicle programme — retire the report banner.
      _swActiveVehicle = null;
      document.getElementById('sw-demo-report-btn')?.parentElement?.remove();
      applyPreset(btn.dataset.preset ?? '');
      scheduleLive();
    });
  });

  // Vehicle programme demos — load a full detailed configuration and compute.
  document.querySelectorAll<HTMLButtonElement>('.sw-vehicle-btn').forEach(btn => {
    btn.addEventListener('click', () => applyVehicleDemo(btn.dataset.vehicle ?? ''));
  });

  // "View reference example" — open the detailed board-level breakdown for the demo.
  document.getElementById('sw-demo-report-btn')?.addEventListener('click', evt => {
    const url = (evt.currentTarget as HTMLElement).dataset.reportUrl;
    if (url) window.open(import.meta.env.BASE_URL + url, '_blank', 'noopener');
  });

  // "Powertrain Cost Study" — open the apple-to-apple cross-car comparison.
  document.getElementById('sw-study-btn')?.addEventListener('click', () => {
    window.open(import.meta.env.BASE_URL + 'reports/powertrain-cost-study.html', '_blank', 'noopener');
  });

  // "L460 Competitive Benchmark" — open the board-level benchmark report.
  document.getElementById('sw-bench-btn')?.addEventListener('click', () => {
    window.open(import.meta.env.BASE_URL + 'reports/l460-benchmark.html', '_blank', 'noopener');
  });

  // "L460 Deep-Dive" — open the module-by-module detailed report.
  document.getElementById('sw-deepdive-btn')?.addEventListener('click', () => {
    window.open(import.meta.env.BASE_URL + 'reports/l460-deepdive.html', '_blank', 'noopener');
  });

  // "All-Models Comparison" — open the combined all-models deep-dive.
  document.getElementById('sw-allmodels-btn')?.addEventListener('click', () => {
    window.open(import.meta.env.BASE_URL + 'reports/allmodels-deepdive.html', '_blank', 'noopener');
  });

  // Select/deselect all
  document.getElementById('sw-select-all')?.addEventListener('click', () => {
    document.querySelectorAll<HTMLInputElement>('.sw-mod-enable').forEach(cb => { cb.checked = true; });
    updateCatCounts();
  });
  document.getElementById('sw-deselect-all')?.addEventListener('click', () => {
    document.querySelectorAll<HTMLInputElement>('.sw-mod-enable').forEach(cb => { cb.checked = false; });
    updateCatCounts();
  });

  // Module checkboxes
  document.querySelectorAll<HTMLInputElement>('.sw-mod-enable').forEach(cb => {
    cb.addEventListener('change', updateCatCounts);
  });

  // Rec 8: ASIL dropdowns — live validation warning
  document.querySelectorAll<HTMLSelectElement>('.sw-asil-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const id  = sel.dataset.id!;
      const def = SW_MODULES.find(d => d.id === id);
      if (!def) return;
      const warnEl = sel.parentElement?.querySelector('.sw-asil-warn');
      if (!warnEl) return;
      const isDown = ASIL_RANK[sel.value as ASILLevel] < ASIL_RANK[def.defaultAsil];
      (warnEl as HTMLElement).style.display = isDown ? '' : 'none';
    });
  });

  // Rec 5: AI analysis button
  document.getElementById('sw-ai-btn')?.addEventListener('click', () => {
    if (_swResult) generateAIInsights(_swResult);
    else showSWError('Run the calculation first before generating AI analysis.');
  });

  // Rec 6: Excel export
  document.getElementById('sw-excel-btn')?.addEventListener('click', () => {
    if (_swResult) exportSWExcel(_swResult);
    else showSWError('Run the calculation first before exporting.');
  });

  // PDF export (report options: type, scope, body, metadata)
  const repEl = document.getElementById('sw-rep');
  if (repEl) wireReportOptions(repEl);
  document.getElementById('sw-pdf-btn')?.addEventListener('click', () => {
    if (_swResult) exportSWPDF(_swResult);
    else showSWError('Run the calculation first before exporting the PDF report.');
  });

}

function updateCatCounts(): void {
  document.querySelectorAll<HTMLElement>('.sw-cat-group').forEach(group => {
    const total   = group.querySelectorAll('.sw-mod-enable').length;
    const enabled = group.querySelectorAll<HTMLInputElement>('.sw-mod-enable:checked').length;
    const countEl = group.querySelector('.sw-cat-count');
    if (countEl) countEl.textContent = `${enabled}/${total} modules`;
    const chip = document.querySelector<HTMLElement>(`.swk-domain[data-domain="${group.dataset.cat}"]`);
    if (chip) {
      chip.setAttribute('aria-pressed', String(enabled > 0));
      const c = chip.querySelector('[data-domain-count]');
      if (c) c.textContent = `${enabled} of ${total} in scope`;
    }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render the SW Should-Cost panel into containerEl, wire all events.
 * Call this from switchCommodity('automotive_software').
 */
let _swHubBasis = '';

/** The engineer-rate field: blank with the hub's book rate (at the current senior share) as its greyed placeholder,
 *  so the book rate never looks like a typed value; a typed value is the override. */
function refreshRateFields(): void {
  const v = swLibraryBaseRate(_swInputs);
  for (const id of SW_BASE_RATE_FIELDS) {
    const f = document.getElementById(id) as HTMLInputElement | null;
    if (!f) continue;
    f.placeholder = Number.isFinite(v) ? String(Math.round(v)) : '';
    if (f.dataset.typed !== '1') f.value = '';
    const hint = document.getElementById(`${id}-hint`);
    if (hint) hint.textContent = f.dataset.typed === '1'
      ? 'Your rate — clear the field to go back to the hub book rate'
      : 'Blank = hub book rate (shown greyed)';
  }
}

/** The hub picker re-listed from the active book (a company book changes the rates the options show). */
function refreshHubPickers(): void {
  const sel = document.getElementById('sw-region') as HTMLSelectElement | null;
  if (sel) sel.innerHTML = hubOptionsHTML(_swInputs.region, activeSWBook().lib, n => swMoney(n, 0), _swInputs.teamSeniorFraction);
}

/**
 * The page's display currency changed (main.ts `_applyCurrency`): results, the rate table and the next export follow it
 * (P3 #15). Inputs stay £.
 */
export function applySWCurrency(code: string, sym: string, unitsPerGbp: number): void {
  setSWCurrency(code, sym, unitsPerGbp);
  if (!document.getElementById('sw-panel')) return;
  refreshSWBookViews();
  if (_swResult) renderResults(_swResult);
}

function setSWCountry(mfg: string): void {
  const hub = swRegionFor(mfg);
  _swInputs.region = hub.region;
  _swHubBasis = hub.basis ? `${mfg}: ${hub.basis}` : '';
}

/**
 * The page's country changed: the engineering hub follows it in the INPUTS as well as the drop-downs (P2 #13 — only
 * the advanced drop-down moved, so the wizard still costed the old country). The current result is marked stale.
 */
export function applySWCountry(mfg: string): void {
  setSWCountry(mfg);
  // ONE hub picker since the guided wizard was merged into Setup (cockpit round 2); the INPUTS move too (P2 #13).
  const hubSel = document.getElementById('sw-region') as HTMLSelectElement | null;
  if (hubSel) hubSel.value = _swInputs.region;
  const basisEl = document.getElementById('sw-hub-basis');
  if (basisEl) basisEl.textContent = _swHubBasis;
  refreshRateFields();
}

/** The quotes / licence-register card (Setup) and the your-modules card (Scope) — src/ui/panels/sw-quotes-ui.ts. */
const quotesHost: QuotesHost = {
  get: () => _swInputs,
  set: patch => { Object.assign(_swInputs, patch); for (const k of Object.keys(patch) as Array<keyof SWProgramInputs>) if (patch[k] === undefined) delete _swInputs[k]; scheduleLive(); },
};
function mountQuoteCards(): void {
  const q = document.getElementById('sw-quotes-card');
  if (q) { q.innerHTML = quotesCardHTML(_swInputs); wireQuotesCard(q, quotesHost); }
  const c = document.getElementById('sw-custom-card');
  if (c) { c.innerHTML = customModulesCardHTML(_swInputs); wireCustomModulesCard(c, quotesHost); }
}

export function initSWPanel(containerEl: HTMLElement): void {
  _swInputs = defaultSWProgramInputs();
  void restoreBaseline().then(() => { if (_swTab === 'scenarios') renderScenarios(); });
  // The engineering hub follows the selected manufacturing country (nearest hub, stated).
  setSWCountry((document.getElementById('mfg-region-selector') as HTMLSelectElement | null)?.value ?? 'UK');
  _swResult = null;
  containerEl.innerHTML = renderSWPanelHTML();
  wireSWPanel();
  mountQuoteCards();
  watchChartWidth();
  // The cockpit opens with the default programme already costed (deterministic, milliseconds).
  runLive(false);
  // Load saved configs asynchronously (server or localStorage), then refresh the
  // list in place — the panel renders immediately without waiting on the network.
  void loadSavedConfigs().then(() => { if (_swTab === 'scenarios') renderScenarios(); }).catch(() => { /* non-fatal */ });
  // Apply the organisation's active SW rates (if an admin has uploaded them).
  void syncSWRateLibrary();
}
