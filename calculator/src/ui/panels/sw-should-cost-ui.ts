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
  computeSWProgram, defaultSWProgramInputs, SW_MODULES, swRegionFor, SW_DEFAULT_OVERHEAD, swLibraryBaseRate, normaliseSWRegion,
  applyPowertrainScope, SW_POWERTRAIN_SCOPE, SW_POWERTRAIN_MODULE_IDS, calFor, SW_CALS, devSourceComparison, swRateBasis, SW_DEFAULT_DEVELOPMENT_MONTHS, SW_COCOMO, SW_COCOMO_EXPONENT,
} from '../../engine/sw-should-cost.js';
import { baseRateOverride, SW_BASE_RATE_FIELDS } from './sw-rate-field.js';
import { hubOptionsHTML, hubRatesTableHTML, hubLabel, HUB_RATES_CSS } from './sw-hub-rates.js';
import { mountSWStudio, skeletonStateFor } from './sw-costing-pipeline.js';
import {
  headHTML, railHTML, tabsHTML, wireTabs, updateRail, railError, contextLine, overviewHTML, riskHTML, spendHTML,
  supplierFormHTML, readQuote, supplierResultHTML, wireCharts, COCKPIT_CSS, type CockpitTab,
} from './sw-cockpit-ui.js';
import { swRateCheck } from '../../engine/sw-cockpit.js';
import { componentLoad } from './sw-vehicle-skeleton.js';
import { vehicleComponent } from '../../engine/sw-vehicle-map.js';
import { SW_HUB_RATES } from '../../engine/sw-country-rates.js';
import { swSchedule } from '../../engine/sw-schedule.js';
import { resolveRateLibrary } from '../../engine/sw-rate-library.js';
import { renderActualsHTML, wireActuals } from './sw-actuals.js';
import { swMoney, swMoneyM, swConv, swCur, swUnitM, setSWCurrency } from './sw-currency.js';
import type { SWRateEntry, RateConfidence, SWRateLibrary } from '../../engine/sw-rate-library.js';
import { runValidation } from '../../engine/sw-validation.js';
import { buildWorkbook, downloadWorkbook } from '../../export/xlsx-util.js';
import { projectStore } from '../project-store.js';
import { exportFilename } from '../../export/filename.js';

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

function asilColor(asil: ASILLevel): string {
  return { QM: '#64748b', A: '#10b981', B: '#f59e0b', C: '#f97316', D: '#ef4444' }[asil];
}

function asilBadge(asil: ASILLevel): string {
  const c = asilColor(asil);
  return `<span style="background:${c}22;color:${c};border:1px solid ${c}55;border-radius:4px;padding:1px 6px;font-size:0.7rem;font-weight:700">${esc(asil)}</span>`;
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CAT_META: Record<string, { label: string; icon: string; color: string }> = {
  A: { label: 'Powertrain & Battery',    icon: '<svg class="ic" aria-hidden="true"><use href="#i-zap"/></svg>', color: '#22c55e' },
  B: { label: 'ADAS L2/L2+',               icon: '<svg class="ic" aria-hidden="true"><use href="#i-target"/></svg>', color: '#3b82f6' },
  C: { label: 'Infotainment & UX',          icon: '<svg class="ic" aria-hidden="true"><use href="#i-palette"/></svg>', color: '#8b5cf6' },
  D: { label: 'Vehicle Domain Controllers', icon: '<svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg>', color: '#f59e0b' },
  E: { label: 'Middleware & Platform',      icon: '⚙', color: '#06b6d4' },
  F: { label: 'Cybersecurity (ISO 21434)',  icon: '<svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg>', color: '#ef4444' },
  G: { label: 'OTA & Cloud Backend',        icon: '<svg class="ic" aria-hidden="true"><use href="#i-cloud"/></svg>', color: '#a78bfa' },
};

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
  const confColor = (c: RateConfidence) => c === 'High' ? '#047857' : c === 'Medium' ? '#b45309' : '#b91c1c';
  const confBadge = (c: RateConfidence) =>
    `<span style="font-size:0.62rem;font-weight:700;color:#fff;background:${confColor(c)};border-radius:3px;padding:1px 5px">${c}</span>`;
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
  return `<span style="font-size:0.68rem;font-weight:600;color:#fff;background:#2563eb;border-radius:4px;padding:1px 7px">${company ? 'Company rates · ' : 'Built-in · '}v${esc(lib.version)}</span>
      <span style="font-size:0.7rem;font-weight:400;color:var(--sw-text-muted)">reviewed ${esc(lib.lastReviewed)} · every rate sourced &amp; overridable</span>`;
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
      <p style="font-size:0.7rem;color:var(--sw-text-muted);margin-top:8px">Type your own engineer rate in Programme Configuration above to replace the hub's book rate. Confidence reflects how well-anchored each figure is to a published or surveyed source — not all rates are equal; treat <span style="color:#dc2626;font-weight:600">Low</span> figures as directional.</p>
    </div>
  </details>`;
}

// Rec #2: model validation — publish the back-test variance vs published
// programmes so the model states its own error instead of presenting a number
// as truth. See docs/sw-cost-validation.md.
function renderValidationHTML(): string {
  const rep = runValidation(undefined, undefined, _swInputs.rateLibrary);
  const vColor = (v: number) => Math.abs(v) <= 15 ? '#059669' : Math.abs(v) <= rep.band ? '#d97706' : '#dc2626';
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
      <span style="font-size:0.68rem;font-weight:700;color:#fff;background:#b45309;border-radius:4px;padding:1px 7px">${rep.verifiedCount}/${rep.caseCount} figures sourced</span>
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

function renderSavedConfigsHTML(): string {
  const configItems = _savedConfigs.map(c => `
    <div class="sw-saved-item" data-id="${esc(c.id)}">
      <span class="sw-saved-name">${esc(c.name)}</span>
      <span class="sw-saved-date">${esc(c.createdAt)}</span>
      <button class="sw-saved-load" data-id="${esc(c.id)}">Load</button>
      <button class="sw-saved-del" data-id="${esc(c.id)}">✕</button>
    </div>`).join('');

  return `
  <div class="sw-config-card" style="background:var(--sw-surface-alt);border:1px solid var(--sw-border);border-radius:10px;padding:14px 18px;margin-bottom:14px">
    <div style="font-weight:700;font-size:0.82rem;color:var(--sw-text-primary);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>Saved Configurations</span>
      <div style="display:flex;gap:6px">
        <button id="sw-compare-btn" style="font-size:0.72rem;padding:4px 12px;border-radius:5px;border:1px solid var(--sw-border);background:var(--sw-surface);color:var(--sw-text-body);cursor:pointer" title="Compute and compare all saved configurations side by side">Compare All</button>
        <button id="sw-save-config-btn" style="font-size:0.72rem;padding:4px 12px;border-radius:5px;border:1px solid var(--sw-border);background:var(--sw-surface);color:var(--sw-text-body);cursor:pointer">+ Save Current</button>
      </div>
    </div>
    <div id="sw-saved-list">
      ${_savedConfigs.length === 0
        ? '<div style="font-size:0.75rem;color:var(--sw-text-muted);font-style:italic">No saved configurations yet.</div>'
        : configItems}
    </div>
    <div id="sw-compare-out" style="margin-top:12px"></div>
  </div>`;
}

// ─── Guided wizard (Part 4: step-by-step mode, default for new users) ──────────

type SWCat = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
const ALL_CATS: SWCat[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const WIZARD_STEPS = ['Context', 'Domains', 'Complexity & Safety', 'Cost', 'Review', 'Report'];

interface GuidedDomainCfg { complexity: SWComplexity | 'default'; reuse: SWReuse; asil: ASILLevel | 'default'; }

const DOMAIN_INFO: Record<SWCat, { plain: string; typicalAsil: string }> = {
  A: { plain: 'Battery management (BMS), charging, thermal, motor & inverter control', typicalAsil: 'mostly ASIL-C/D' },
  B: { plain: 'Driver assistance: cameras, radar, sensor fusion, lane-keep, AEB', typicalAsil: 'up to ASIL-D' },
  C: { plain: 'Touchscreen, navigation, voice assistant, connectivity, HMI', typicalAsil: 'QM / ASIL-A' },
  D: { plain: 'Body, chassis & gateway controllers that coordinate the vehicle', typicalAsil: 'ASIL-B/C' },
  E: { plain: 'AUTOSAR, RTOS, diagnostics, comms — the software platform layer', typicalAsil: 'ASIL-B' },
  F: { plain: 'Secure boot, encryption, intrusion detection (ISO 21434)', typicalAsil: 'ASIL-B/C' },
  G: { plain: 'Over-the-air (OTA) updates, cloud backend, fleet analytics', typicalAsil: 'QM' },
};

// Full setup by default: the cockpit recalculates live, so the long walkthrough is optional (cockpit review, Oct 2026).
let _swMode: 'guided' | 'advanced' = 'advanced';
let _swTab: CockpitTab = 'setup';
let _swSelectTab: ((t: CockpitTab) => void) | null = null;
let _wizStep = 1;
let _wizDomains: Record<SWCat, boolean> = { A: true, B: true, C: true, D: true, E: true, F: true, G: true };
let _wizCfg: Record<SWCat, GuidedDomainCfg> =
  Object.fromEntries(ALL_CATS.map(c => [c, { complexity: 'default', reuse: 'Medium', asil: 'default' }])) as Record<SWCat, GuidedDomainCfg>;
let _programPhase: 'Concept' | 'Development' | 'SOP' | 'Facelift' = 'Development';
/** The wizard's drivetrain — BEV reproduces its old behaviour (domain A = the EV stack). P1 #5. */
let _wizPowertrain: SWPowertrain = 'BEV';
const PT_LABEL: Record<SWPowertrain, string> = { ICE: 'ICE — combustion', MHEV: 'MHEV — 48 V mild hybrid', PHEV: 'PHEV — plug-in hybrid', BEV: 'BEV — battery-electric' };

/** Map the guided selections onto the full module set in _swInputs. */
function applyGuidedToInputs(): void {
  // The drivetrain scope comes from the ENGINE (applyPowertrainScope: which modules, and the PHEV / MHEV de-rating) —
  // the wizard switched on every in-scope module and skipped the de-rating, so Guided and Advanced disagreed for the
  // same choices (code review F2: £406.7M v £388.7M).
  const scoped = applyPowertrainScope(_swInputs.modules, _wizPowertrain);
  for (const m of _swInputs.modules) {
    const def = SW_MODULES.find(d => d.id === m.moduleId)!;
    const cat = def.category as SWCat;
    const sc = scoped.find(x => x.moduleId === m.moduleId)!;
    const pt = SW_POWERTRAIN_MODULE_IDS.has(m.moduleId);
    // Premium-trim options keep the state they have (default off, as on the Advanced form); the rest follow the domain.
    const premium = def.defaultEnabled === false && !pt;
    m.enabled = _wizDomains[cat] && (pt ? sc.enabled : premium ? m.enabled : true);
    const g = _wizCfg[cat];
    m.complexity = g.complexity === 'default' ? (pt ? sc.complexity : def.defaultComplexity) : g.complexity;
    m.asil       = g.asil === 'default' ? (pt ? sc.asil : def.defaultAsil) : g.asil;
    m.reuse      = g.reuse;
  }
  _swInputs.powertrain = _wizPowertrain;
}

function selectedCats(): SWCat[] { return ALL_CATS.filter(c => _wizDomains[c]); }

function renderGuidedWizardHTML(): string {
  const dots = WIZARD_STEPS.map((label, i) => {
    const n = i + 1;
    const state = n < _wizStep ? 'done' : n === _wizStep ? 'active' : 'todo';
    return `<div class="sw-wiz-dot sw-wiz-${state}">
      <span class="sw-wiz-num">${n < _wizStep ? '✓' : n}</span>
      <span class="sw-wiz-dot-label">${esc(label)}</span>
    </div>`;
  }).join('<div class="sw-wiz-connector"></div>');

  return `
  <div class="sw-wiz-progress">${dots}</div>
  <div class="sw-wiz-card">
    <div id="sw-wiz-body">${renderWizStepBody(_wizStep)}</div>
    <div class="sw-wiz-footer">
      <button id="sw-wiz-back" class="sw-wiz-btn-ghost" ${_wizStep === 1 ? 'disabled' : ''}>← Back</button>
      <span class="sw-wiz-stepcount">Step ${_wizStep} of ${WIZARD_STEPS.length}</span>
      <button id="sw-wiz-next" class="sw-wiz-btn-primary">${_wizStep >= WIZARD_STEPS.length ? '↻ Start over' : 'Next →'}</button>
    </div>
  </div>`;
}

const tip = (t: string) => `<span class="sw-tip" title="${esc(t)}">ⓘ</span>`;

function renderWizStepBody(step: number): string {
  const inp = _swInputs;
  if (step === 1) {
    const regionOpts = hubOptionsHTML(inp.region, activeSWBook().lib, n => swMoney(n, 0), inp.teamSeniorFraction);
    const phaseOpts = (['Concept','Development','SOP','Facelift'] as const)
      .map(p => `<option value="${p}" ${_programPhase === p ? 'selected' : ''}>${p}</option>`).join('');
    const ptOpts = (['ICE', 'MHEV', 'PHEV', 'BEV'] as const)
      .map(p => `<option value="${p}" ${_wizPowertrain === p ? 'selected' : ''}>${PT_LABEL[p]}</option>`).join('');
    return `
      <div class="sw-wiz-h">Step 1 — Vehicle &amp; Programme Context</div>
      <p class="sw-wiz-help">Tell us about the programme. These set the baseline rates and how the one-time engineering cost is spread across vehicles.</p>
      <div class="sw-grid sw-grid-2" style="gap:16px">
        <div class="sw-field-group"><label class="sw-label" for="wiz-region">Software engineering hub ${tip('Where your engineers are based. Each hub has its own rate from that country\'s salaries, statutory employer on-costs and working hours — see the Rate Library.')}</label>
          <select id="wiz-region" class="sw-config-sel">${regionOpts}</select></div>
        <div class="sw-field-group"><label class="sw-label" for="wiz-phase">Programme phase ${tip('Concept/Development/SOP/Facelift — informational; facelift programmes usually reuse more software.')}</label>
          <select id="wiz-phase" class="sw-config-sel">${phaseOpts}</select></div>
        <div class="sw-field-group"><label class="sw-label" for="wiz-powertrain">Powertrain ${tip('Sets which powertrain software is in scope: engine / transmission for ICE, 48 V and hybrid control for MHEV, both stacks for PHEV, the EV stack for BEV.')}</label>
          <select id="wiz-powertrain" class="sw-config-sel">${ptOpts}</select></div>
        <div class="sw-field-group"><label class="sw-label" for="wiz-vol">Annual production volume ${tip('Vehicles per year. Higher volume spreads the software investment over more cars.')}</label>
          <input id="wiz-vol" type="number" class="sw-config-inp" min="1000" max="500000" step="1000" value="${inp.annualProductionVolume}"></div>
        <div class="sw-field-group"><label class="sw-label" for="wiz-life">Programme life (years) ${tip('How long the software is developed and maintained — typically 5–10 years.')}</label>
          <input id="wiz-life" type="number" class="sw-config-inp" min="3" max="20" step="1" value="${inp.programLifeYears}"></div>
      </div>`;
  }

  if (step === 2) {
    const cards = ALL_CATS.map(c => {
      const meta = CAT_META[c]; const info = DOMAIN_INFO[c];
      const count = SW_MODULES.filter(m => m.category === c).length;
      const on = _wizDomains[c];
      return `<label class="sw-domain-card ${on ? 'sw-domain-on' : ''}" style="border-left:3px solid ${meta.color}">
        <input type="checkbox" class="wiz-domain" data-cat="${c}" ${on ? 'checked' : ''}>
        <div>
          <div class="sw-domain-title">${meta.icon} ${esc(meta.label)} <span class="sw-domain-count">${count} modules · ${esc(info.typicalAsil)}</span></div>
          <div class="sw-domain-desc">${esc(info.plain)}</div>
        </div>
      </label>`;
    }).join('');
    return `
      <div class="sw-wiz-h">Step 2 — Which software domains are in scope?</div>
      <p class="sw-wiz-help">Select the software areas your programme includes. Unselected domains are excluded from the cost. Most full premium EV programmes include all seven.</p>
      <div class="sw-domain-grid">${cards}</div>`;
  }

  if (step === 3) {
    const cats = selectedCats();
    if (!cats.length) return `<div class="sw-wiz-h">Step 3 — Complexity &amp; Safety</div><p class="sw-wiz-help">No domains selected. Go back to Step 2 and choose at least one.</p>`;
    const compOpts = (cfg: GuidedDomainCfg) => (['default','Low','Medium','High','Very High'] as const)
      .map(v => `<option value="${v}" ${cfg.complexity === v ? 'selected' : ''}>${v === 'default' ? 'Module default' : v}</option>`).join('');
    const reuseOpts = (cfg: GuidedDomainCfg) => (['Fresh','Light','Medium','Heavy','Platform'] as const)
      .map(v => `<option value="${v}" ${cfg.reuse === v ? 'selected' : ''}>${v}</option>`).join('');
    const asilOpts = (cfg: GuidedDomainCfg) => (['default','QM','A','B','C','D'] as const)
      .map(v => `<option value="${v}" ${cfg.asil === v ? 'selected' : ''}>${v === 'default' ? 'Per-module ISO 26262' : v}</option>`).join('');
    const rows = cats.map(c => {
      const meta = CAT_META[c]; const cfg = _wizCfg[c];
      return `<tr data-cat="${c}">
        <td style="font-weight:600">${meta.icon} ${esc(meta.label)}</td>
        <td><select class="wiz-comp sw-sel" data-cat="${c}">${compOpts(cfg)}</select></td>
        <td><select class="wiz-reuse sw-sel" data-cat="${c}">${reuseOpts(cfg)}</select></td>
        <td><select class="wiz-asil sw-sel" data-cat="${c}">${asilOpts(cfg)}</select></td>
      </tr>`;
    }).join('');
    return `
      <div class="sw-wiz-h">Step 3 — Complexity, Safety &amp; Reuse</div>
      <p class="sw-wiz-help">For each domain set how hard it is to build (complexity), how safety-critical it is (ASIL ${tip('Automotive Safety Integrity Level, ISO 26262. Higher = costlier. Leave on “Per-module” to use realistic per-module defaults.')}), and how much you reuse from previous vehicles ${tip('Reuse is the biggest cost lever — platform reuse can cut a domain’s cost by ~85%.')}. Leave defaults if unsure.</p>
      <div class="sw-table-wrap"><table class="sw-data-table">
        <thead><tr><th>Domain</th><th>Complexity</th><th>Reuse</th><th>Safety (ASIL)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  }

  if (step === 4) {
    // computed on entry by wireWizStep
    return `
      <div class="sw-wiz-h">Step 4 — Effort &amp; Cost by Domain</div>
      <p class="sw-wiz-help">Based on your selections, here is the estimated engineering effort and cost per domain.</p>
      <div id="wiz-cost-summary" class="sw-grid sw-grid-3" style="margin-bottom:14px"></div>
      <div id="wiz-cost-table" class="sw-table-wrap"></div>`;
  }

  if (step === 5) {
    return `
      <div class="sw-wiz-h">Step 5 — Review &amp; Fine-Tune</div>
      <p class="sw-wiz-help">Adjust the commercial assumptions, then recalculate. Most users can leave these at defaults.</p>
      <div class="sw-grid sw-grid-3" style="gap:16px">
        <div class="sw-field-group"><label class="sw-label" for="wiz-overhead">Overhead multiplier ${tip('Facilities, IT, management and non-statutory benefits on top of the hub rate (which is salary + statutory employer on-cost only). 1.15 is a CostVision assumption — use your company\'s figure.')}</label>
          <input id="wiz-overhead" type="number" class="sw-config-inp" min="1" max="3" step="0.05" value="${inp.overheadMultiplier}"></div>
        <div class="sw-field-group"><label class="sw-label" for="wiz-senior">Senior engineer fraction ${tip('Share of the team that are senior: blends the hub\'s mid-level and senior rates. It changes the rate only, not the effort.')}</label>
          <input id="wiz-senior" type="number" class="sw-config-inp" min="0" max="1" step="0.05" value="${inp.teamSeniorFraction}"></div>
        <div class="sw-field-group"><label class="sw-label" for="wiz-baserate">Your engineer rate £/PM (optional) ${tip('Leave as shown to use the hub\'s own book rate. Type your own £ per person-month (152 h, before overhead) to replace it for this hub — it is never scaled by a country factor.')}</label>
          <input id="wiz-baserate" type="number" class="sw-config-inp" min="100" max="500000" step="50" value="${inp.baseRateGBP ?? Math.round(swLibraryBaseRate(inp))}"${inp.baseRateGBP ? ' data-typed="1"' : ''}></div>
      </div>
      <div style="text-align:center;margin-top:16px"><button id="wiz-recalc" class="sw-wiz-btn-primary">↻ Recalculate</button></div>
      <div id="wiz-sensitivity" style="margin-top:14px"></div>`;
  }

  // step 6 — report rendered into shared #sw-results by wireWizStep
  return `
    <div class="sw-wiz-h">Step 6 — Final Report</div>
    <p class="sw-wiz-help">Your full software should-cost estimate is below. Use the AI summary for an executive narrative, or export to Excel/PDF.</p>
    <div id="wiz-report-note"></div>`;
}

function readWizStep(step: number): void {
  const g = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (step === 1) {
    const region = (g('wiz-region') as HTMLSelectElement)?.value; if (region) _swInputs.region = region as SWRegion;
    const phase = (g('wiz-phase') as HTMLSelectElement)?.value as typeof _programPhase; if (phase) _programPhase = phase;
    const pt = (g('wiz-powertrain') as HTMLSelectElement)?.value as SWPowertrain; if (pt) { _wizPowertrain = pt; _swInputs.powertrain = pt; }
    const vol = parseInt((g('wiz-vol') as HTMLInputElement)?.value); if (!isNaN(vol)) _swInputs.annualProductionVolume = Math.max(1, vol);
    const life = parseInt((g('wiz-life') as HTMLInputElement)?.value); if (!isNaN(life)) _swInputs.programLifeYears = Math.max(1, life);
  } else if (step === 2) {
    document.querySelectorAll<HTMLInputElement>('.wiz-domain').forEach(cb => { _wizDomains[cb.dataset.cat as SWCat] = cb.checked; });
  } else if (step === 3) {
    document.querySelectorAll<HTMLSelectElement>('.wiz-comp').forEach(s => { _wizCfg[s.dataset.cat as SWCat].complexity = s.value as SWComplexity | 'default'; });
    document.querySelectorAll<HTMLSelectElement>('.wiz-reuse').forEach(s => { _wizCfg[s.dataset.cat as SWCat].reuse = s.value as SWReuse; });
    document.querySelectorAll<HTMLSelectElement>('.wiz-asil').forEach(s => { _wizCfg[s.dataset.cat as SWCat].asil = s.value as ASILLevel | 'default'; });
  } else if (step === 5) {
    const ov = parseFloat((g('wiz-overhead') as HTMLInputElement)?.value); if (!isNaN(ov)) _swInputs.overheadMultiplier = Math.max(1, ov);
    const sf = parseFloat((g('wiz-senior') as HTMLInputElement)?.value); if (!isNaN(sf)) _swInputs.teamSeniorFraction = Math.min(1, Math.max(0, sf));
    const brEl = g('wiz-baserate') as HTMLInputElement | null;
    if (brEl) _swInputs.baseRateGBP = baseRateOverride(brEl.value, brEl.dataset.typed === '1');
  }
}

function wizCompute(): void {
  applyGuidedToInputs();
  try {
    _swResult = computeSWProgram(_swInputs);
  } catch (err) {
    // An invalid input is reported, not costed (engine validateSWInputs, P2 #8).
    showSWError((err as Error).message);
    throw err;
  }
}

function renderWizCost(): void {
  wizCompute();
  const s = _swResult!.summary;
  const sumEl = document.getElementById('wiz-cost-summary');
  if (sumEl) sumEl.innerHTML = [
    { l: 'Total Programme', v: fmtM(s.grandTotal), c: '#2563eb' },
    { l: 'Per Vehicle',     v: `${swMoney(s.perVehicle, 0)}`, c: '#059669' },
    { l: 'Total NRE',       v: fmtM(s.nreTotal), c: '#7c3aed' },
  ].map(x => `<div class="sw-summary-card"><div style="position:absolute;top:0;left:0;right:0;height:3px;background:${x.c}"></div><div class="sw-card-label">${x.l}</div><div class="sw-card-value" style="color:${x.c}">${x.v}</div></div>`).join('');
  const tEl = document.getElementById('wiz-cost-table');
  if (tEl) {
    const rows = selectedCats().map(c => {
      const meta = CAT_META[c];
      const mods = _swResult!.modules.filter(m => m.category === c);
      const pm = mods.reduce((a, m) => a + m.personMonths, 0);
      const cost = s.byCategory[c] ?? 0;
      return `<tr><td>${meta.icon} ${esc(meta.label)}</td><td class="sw-num">${mods.length}</td><td class="sw-num">${fmt(pm, 0)}</td><td class="sw-num">${fmtM(cost)}</td><td class="sw-num">${fmt(s.grandTotal > 0 ? cost / s.grandTotal * 100 : 0, 0)}%</td></tr>`;
    }).join('');
    tEl.innerHTML = `<table class="sw-data-table"><thead><tr><th>Domain</th><th class="sw-num">Modules</th><th class="sw-num">Person-Months</th><th class="sw-num">Cost</th><th class="sw-num">Share</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
}

function renderWizSensitivity(): void {
  const el = document.getElementById('wiz-sensitivity');
  if (!el || !_swResult) return;
  const reg  = _swResult.sensitivity.find(x => x.parameter.startsWith('Engineering hub'));
  const asil = _swResult.sensitivity.find(x => x.parameter.includes('ASIL'));
  const row = (label: string, r?: { low: number; high: number }) =>
    r ? `<div class="sw-box" style="font-size:0.78rem"><strong>${esc(label)}:</strong> ${fmtM(r.low)} → ${fmtM(r.high)}</div>` : '';
  el.innerHTML = `<div class="sw-grid sw-grid-2" style="gap:10px">${row(`Hub swing (${reg?.parameter.replace(/^Engineering hub \((.*)\)$/, '$1').replace(' vs ', ' ↔ ') ?? ''})`, reg)}${row('ASIL swing (B ↔ D)', asil)}</div>`;
}

function renderWizReport(): void {
  wizCompute();
  renderResults(_swResult!);
  const res = document.getElementById('sw-results');
  if (res) res.style.display = '';
  const note = document.getElementById('wiz-report-note');
  if (note) note.innerHTML = `<div class="sw-box" style="font-size:0.78rem;line-height:1.6"><strong>Key assumptions:</strong> ${selectedCats().length}/7 domains · ${esc(hubLabel(_swInputs.region))} · ${_programPhase} phase · ${_swInputs.programLifeYears} yr · ${fmt(_swInputs.annualProductionVolume / 1000, 0)}k vehicles/yr · overhead ×${_swInputs.overheadMultiplier}. Rates from ${activeSWBook().company ? "company" : "built-in"} library v${esc(activeSWBook().lib.version)}. Per-vehicle is amortised over full lifetime volume — see the Model Validation panel for the recovery-window caveat.</div>`;
}

function goToWizStep(n: number): void {
  _wizStep = Math.min(WIZARD_STEPS.length, Math.max(1, n));
  const body = document.getElementById('sw-guided-body');
  if (body) { body.innerHTML = renderGuidedWizardHTML(); wireGuided(); }
  if (_wizStep === 4) renderWizCost();
  if (_wizStep === 5) renderWizSensitivity();
  if (_wizStep === 6) renderWizReport();
  body?.scrollIntoView({ block: 'start' });
}

function wireGuided(): void {
  document.getElementById('sw-wiz-back')?.addEventListener('click', () => { readWizStep(_wizStep); goToWizStep(_wizStep - 1); });
  document.getElementById('sw-wiz-next')?.addEventListener('click', () => {
    if (_wizStep >= WIZARD_STEPS.length) {           // "Start over"
      const res = document.getElementById('sw-results'); if (res) res.style.display = 'none';
      goToWizStep(1); return;
    }
    readWizStep(_wizStep);
    goToWizStep(_wizStep + 1);
  });
  document.querySelectorAll<HTMLInputElement>('.wiz-domain').forEach(cb =>
    cb.addEventListener('change', () => cb.closest('.sw-domain-card')?.classList.toggle('sw-domain-on', cb.checked)));
  document.getElementById('wiz-recalc')?.addEventListener('click', () => { readWizStep(5); wizCompute(); renderWizSensitivity(); });
}

/** Write the shared inputs into the Advanced form, so switching from Guided shows (and Calculate reads) what the wizard
 *  set (code review F3: Advanced re-read its stale fields and overwrote the wizard's volume, hub and life). */
function syncAdvancedFields(): void {
  const set = (id: string, v: string | number | undefined) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (el && v !== undefined) el.value = String(v);
  };
  set('sw-region', _swInputs.region);
  set('sw-dev-source', _swInputs.devSource);
  set('sw-prog-life', _swInputs.programLifeYears);
  set('sw-vol', _swInputs.annualProductionVolume);
  set('sw-overhead', _swInputs.overheadMultiplier);
  set('sw-senior-frac', _swInputs.teamSeniorFraction);
  if (_swInputs.powertrain) set('sw-powertrain', _swInputs.powertrain);
  const br = document.getElementById('sw-base-rate') as HTMLInputElement | null;
  if (br) {
    if (_swInputs.baseRateGBP) { br.value = String(_swInputs.baseRateGBP); br.dataset.typed = '1'; }
    else { delete br.dataset.typed; }
  }
  refreshRateFields();
  for (const m of _swInputs.modules) {
    const q = (cls: string) => document.querySelector<HTMLInputElement | HTMLSelectElement>(`.${cls}[data-id="${m.moduleId}"]`);
    const cb = q('sw-mod-enable') as HTMLInputElement | null;
    if (cb) cb.checked = m.enabled;
    const a = q('sw-asil-sel'); if (a) a.value = m.asil;
    const c = q('sw-comp-sel'); if (c) c.value = m.complexity;
    const r = q('sw-reuse-sel'); if (r) r.value = m.reuse;
  }
}

function setSWMode(mode: 'guided' | 'advanced'): void {
  if (mode === _swMode) return;
  // Leaving Advanced: its fields are the inputs. Entering Advanced: show the inputs the wizard set.
  if (_swMode === 'advanced') { try { readConfig(); } catch { /* the engine reports a bad value at Calculate */ } }
  else syncAdvancedFields();
  _swMode = mode;
  const g = document.getElementById('sw-guided-body');
  const a = document.getElementById('sw-advanced-body');
  if (g) g.style.display = mode === 'guided' ? '' : 'none';
  if (a) a.style.display = mode === 'advanced' ? '' : 'none';
  document.querySelectorAll<HTMLButtonElement>('.sw-mode-btn').forEach(b =>
    b.classList.toggle('sw-mode-active', b.dataset.mode === mode));
}

/** Scope toolbar: find modules, show only those in scope, and set ASIL / complexity / reuse on every module shown. */
function scopeBarHTML(): string {
  const opt = (vals: string[], label: string, id: string) => `<label class="sr-only" for="${id}">${label}</label><select id="${id}" data-no-live><option value="">${label}…</option>${vals.map(v => `<option value="${v}">${v}</option>`).join('')}</select>`;
  return `<div class="swk-scopebar" role="search">
    <label class="sr-only" for="swk-scope-q">Find a module</label>
    <input id="swk-scope-q" type="search" placeholder="Find a module — e.g. radar, BMS, OTA" data-no-live autocomplete="off">
    <label style="display:flex;gap:6px;align-items:center;font-size:.76rem;color:var(--sw-text-body)"><input id="swk-scope-on" type="checkbox" data-no-live> In scope only</label>
    ${opt(['QM', 'A', 'B', 'C', 'D'], 'ASIL', 'swk-bulk-asil')}${opt(['Low', 'Medium', 'High', 'Very High'], 'Complexity', 'swk-bulk-comp')}${opt(['Fresh', 'Light', 'Medium', 'Heavy', 'Platform'], 'Reuse', 'swk-bulk-reuse')}
    <button type="button" class="swk-btn" id="swk-bulk-apply">Apply to modules shown</button>
    <span class="swk-count" id="swk-scope-count" aria-live="polite"></span>
  </div>`;
}

function rateCheckHTML(r: SWProgramResult): string {
  const c = swRateCheck(r);
  const hub = activeSWBook().lib.hubRates[r.inputs.region];
  return `<section class="swk-card"><h3 class="swk-h">The engineering rate in this costing</h3>
    <p class="swk-sub">${esc(hubLabel(r.inputs.region))}: hub rate ${swMoney(hub ? (r.inputs.teamSeniorFraction * hub.senior.value + (1 - r.inputs.teamSeniorFraction) * hub.mid.value) : 0, 0)} / PM
      × development source × overhead ${r.inputs.overheadMultiplier} = <strong>${swMoney(c.loadedPerPM, 0)} per person-month</strong>
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
        <td class="sw-mod-check"><input type="checkbox" class="sw-mod-enable" data-id="${def.id}" ${inp.enabled ? 'checked' : ''} aria-label="Include ${esc(def.shortName)}"></td>
        <td class="sw-mod-name">
          <div style="font-weight:600;font-size:0.82rem;color:var(--sw-text-primary)">${esc(def.shortName)}${def.estimateBasis ? ` <span title="${esc('Estimate: ' + def.estimateBasis)}" style="font-size:0.62rem;font-weight:700;color:var(--amber,#b45309);border:1px solid currentColor;border-radius:4px;padding:0 4px;margin-left:4px">estimate</span>` : ''}${def.royaltyBasis ? ` <span title="${esc('Royalty: ' + def.royaltyBasis)}" style="font-size:0.62rem;font-weight:700;color:var(--sw-text-secondary);border:1px solid currentColor;border-radius:4px;padding:0 4px;margin-left:4px">per-vehicle royalty</span>` : ''}</div>
          <div style="font-size:0.7rem;color:var(--sw-text-muted);margin-top:1px">${esc(def.basePersonMonths)} PM base · ${tags.join(' ')}</div>
        </td>
        <td class="sw-mod-desc" title="${esc(def.description)}" style="font-size:0.72rem;color:var(--sw-text-secondary);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(def.description)}</td>
        <td><select class="sw-sel sw-asil-sel" data-id="${def.id}" aria-label="${esc(def.shortName)} ASIL">${asilOpts}</select>${asilWarn}</td>
        <td><select class="sw-sel sw-comp-sel" data-id="${def.id}" aria-label="${esc(def.shortName)} complexity">${compOpts}</select></td>
        <td><select class="sw-sel sw-reuse-sel" data-id="${def.id}" aria-label="${esc(def.shortName)} reuse">${reuseOpts}</select></td>
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
              <th style="width:24px"></th>
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
  <!-- ── Mode toggle: Guided wizard (default) vs Advanced panel ── -->
  <div class="sw-mode-toggle">
    <button class="sw-mode-btn ${_swMode === 'advanced' ? 'sw-mode-active' : ''}" data-mode="advanced">Full setup</button>
    <button class="sw-mode-btn ${_swMode === 'guided' ? 'sw-mode-active' : ''}" data-mode="guided">Guided walkthrough</button>
  </div>

  <!-- ── Guided wizard body ───────────────────────────────────── -->
  <div id="sw-guided-body" style="${_swMode === 'guided' ? '' : 'display:none'}">
    ${renderGuidedWizardHTML()}
  </div>

  <!-- ── Advanced expert body ─────────────────────────────────── -->
  <div id="sw-advanced-body" style="${_swMode === 'advanced' ? '' : 'display:none'}">

  <!-- ── Saved Configurations (Rec 10) ────────────────────────── -->
  ${renderSavedConfigsHTML()}

  <!-- ── Global Programme Config ──────────────────────────────── -->
  <div class="sw-config-card" style="background:var(--sw-surface-alt);border:1px solid var(--sw-border);border-radius:10px;padding:18px 20px;margin-bottom:18px">
    <div style="font-weight:700;font-size:0.88rem;color:var(--sw-text-primary);margin-bottom:14px;display:flex;align-items:center;gap:6px">
      <span>⚙</span> Programme Configuration
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">
      <div class="sw-field-group">
        <label class="sw-label" for="sw-region">Software engineering hub</label>
        <select id="sw-region" class="sw-config-sel">${regionOpts}</select><div id="sw-hub-basis" style="font-size:0.66rem;color:var(--text-muted);margin-top:3px">${esc(_swHubBasis)}</div>
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-dev-source">Development Source</label>
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
        <label class="sw-label" for="sw-prog-life">Programme Life (years)</label>
        <input id="sw-prog-life" type="number" class="sw-config-inp" min="5" max="20" step="1" value="${inputs.programLifeYears}">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-vol">Annual Production Volume</label>
        <input id="sw-vol" type="number" class="sw-config-inp" min="1000" max="500000" step="1000" value="${inputs.annualProductionVolume}">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-overhead">Overhead Multiplier</label>
        <input id="sw-overhead" type="number" class="sw-config-inp" min="1.0" max="3.0" step="0.05" value="${inputs.overheadMultiplier}">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-effort-cal">Effort Calibration ×</label>
        <input id="sw-effort-cal" type="number" class="sw-config-inp" min="0.2" max="5" step="0.01" placeholder="none" value="${inputs.effortCalibration ?? ''}" title="Your own actual ÷ modelled effort (Calibrate to your actuals, below). Blank = the model as published. Scales the model's effort, not a typed custom PM.">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-dev-months">Development Duration (months)</label>
        <input id="sw-dev-months" type="number" class="sw-config-inp" min="6" max="180" step="1" placeholder="${SW_DEFAULT_DEVELOPMENT_MONTHS}" value="${inputs.developmentMonths ?? ''}" title="Feasibility to SOP. Development tool licences are paid over this, and the phase timeline follows it. Blank = ${SW_DEFAULT_DEVELOPMENT_MONTHS} months (the tool's own timeline).">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-connected">Connected Vehicles (%)</label>
        <input id="sw-connected" type="number" class="sw-config-inp" min="0" max="100" step="1" placeholder="100" value="${inputs.connectedVehicleShare != null ? Math.round(inputs.connectedVehicleShare * 100) : ''}" title="Share of vehicles that use the cloud back-end. Cloud is charged per connected vehicle in service. Blank = 100 %.">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-senior-frac">Senior Engineer Fraction</label>
        <input id="sw-senior-frac" type="number" class="sw-config-inp" min="0" max="1" step="0.05" value="${inputs.teamSeniorFraction}" title="Share of senior engineers (0–1): blends the hub's mid-level and senior rates. It changes the rate, not the effort.">
      </div>
      <div class="sw-field-group">
        <label class="sw-label" for="sw-base-rate">Your engineer rate (£/PM, optional)</label>
        <input id="sw-base-rate" type="number" class="sw-config-inp" min="100" max="500000" step="50" value="${inputs.baseRateGBP ?? Math.round(swLibraryBaseRate(inputs))}"${inputs.baseRateGBP ? ' data-typed="1"' : ''} title="Shows the hub's own book rate (its mid / senior blend at your senior share). Type your own £ per person-month (152 h, before overhead) to replace it for this hub — it is never scaled by a country factor.">
      </div>
      <div class="sw-field-group" style="display:flex;flex-direction:column;gap:8px;justify-content:flex-end">
        <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--sw-text-body);cursor:pointer">
          <input type="checkbox" id="sw-inc-maint" ${inputs.includeMaintenanceCost ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer">
          Include Maintenance Cost
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--sw-text-body);cursor:pointer">
          <input type="checkbox" id="sw-inc-cloud" ${inputs.includeCloudCost ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer">
          Include Cloud/Infra Cost
        </label>
      </div>
    </div>
  </div>


  <!-- ── Quick-set presets ─────────────────────────────────────── -->
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center">
    <span style="font-size:0.78rem;color:var(--sw-text-muted);font-weight:600">Quick Set:</span>
    <button class="sw-preset-btn" data-preset="aggressive" title="Heavy reuse everywhere, developed in China; module ASIL and complexity unchanged">Heavy reuse · China hub</button>
    <button class="sw-preset-btn" data-preset="baseline" title="Medium reuse, UK hub, module defaults">Baseline · UK hub</button>
    <button class="sw-preset-btn" data-preset="premium" title="Fresh code, complexity raised to at least High (never lowered), California hub">Fresh code · California hub</button>
    <button class="sw-preset-btn" data-preset="offshored" title="Medium reuse, India hub, module defaults">Offshored · India hub</button>
  </div>

  <!-- ── Vehicle programme demos ────────────────────────────────── -->
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center">
    <span style="font-size:0.78rem;color:var(--sw-text-muted);font-weight:600">Demo Programmes:</span>
    ${SW_VEHICLE_DEMOS.map(v => `<button class="sw-preset-btn sw-vehicle-btn" data-vehicle="${v.id}" title="${esc(v.desc)}">${v.label}</button>`).join('')}
    <button class="sw-preset-btn" id="sw-study-btn" title="Open the apple-to-apple powertrain cost study — 5 cars × 4 drivetrains" style="border-color:rgba(180,120,20,0.6);color:var(--sw-text-primary);font-weight:700">Powertrain Cost Study</button>
    <button class="sw-preset-btn" id="sw-bench-btn" title="Range Rover L460 competitive benchmark — vs BMW X7 / Audi Q8 / Mercedes GLS / Porsche Cayenne, real drivetrains only" style="border-color:var(--sw-accent-border);color:var(--sw-text-primary);font-weight:700">L460 Competitive Benchmark</button>
    <button class="sw-preset-btn" id="sw-deepdive-btn" title="Range Rover L460 module-by-module deep-dive — features, cost detail, competitive differences and an insight for every module" style="border-color:rgba(156,115,40,0.6);color:var(--sw-text-primary);font-weight:700">L460 Deep-Dive</button>
    <button class="sw-preset-btn" id="sw-allmodels-btn" title="All-models comparison — every module priced across Range Rover L460 / BMW X7 / Audi Q8 / Mercedes GLS / Porsche Cayenne side by side" style="border-color:var(--sw-accent-border);color:var(--sw-text-primary);font-weight:700">All-Models Comparison</button>
  </div>
  <p id="sw-reports-stale" style="font-size:0.72rem;color:var(--sw-text-muted);margin:-8px 0 14px">
    The Study, Benchmark, Deep-Dive, All-Models and per-vehicle pages are <strong>reference examples</strong> — static reports
    generated before the October 2026 model fixes (one overhead default, sourced ASIL uplift, ICE / hybrid software, powertrain
    scope, royalties, CAL-keyed cyber). Their figures differ from the live calculation above, which is the current model; the
    Excel / PDF export of the live calculation states its rate basis.
  </p>
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



  <!-- ── Calculate button ─────────────────────────────────────── -->
  <div style="margin:20px 0;text-align:center">
    <button id="sw-calc-btn" class="swk-btn swk-btn-primary">
      Recalculate now
    </button>
    <div style="font-size:0.72rem;color:var(--sw-text-secondary);margin-top:6px">The figures above update as you type.</div>
  </div>

  </div><!-- /sw-advanced-body -->
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
  </section>

  <div id="sw-results">
  <section class="swk-panel" id="swk-p-overview" role="tabpanel" aria-labelledby="swk-t-overview"${_swTab === 'overview' ? '' : ' hidden'}>
    <div id="swk-overview" class="swk-stack"></div>
    <div class="sw-results-section" id="sw-insights"></div>
  </section>
  <section class="swk-panel" id="swk-p-vehicle" role="tabpanel" aria-labelledby="swk-t-vehicle"${_swTab === 'vehicle' ? '' : ' hidden'}>
    <div id="sw-studio"></div>
  </section>
  <section class="swk-panel" id="swk-p-risk" role="tabpanel" aria-labelledby="swk-t-risk"${_swTab === 'risk' ? '' : ' hidden'}>
    <div id="swk-risk"></div>
    <div class="sw-results-section" id="sw-monte-carlo"></div>
    <div class="sw-results-section" id="sw-sensitivity"></div>
  </section>
  <section class="swk-panel" id="swk-p-spend" role="tabpanel" aria-labelledby="swk-t-spend"${_swTab === 'spend' ? '' : ' hidden'}>
    <div id="swk-spend" class="swk-stack"></div>
    <div class="sw-results-section" id="sw-phases"></div>
  </section>
  <section class="swk-panel" id="swk-p-modules" role="tabpanel" aria-labelledby="swk-t-modules"${_swTab === 'modules' ? '' : ' hidden'}>
    <div class="sw-results-section" id="sw-cat-breakdown"></div>
    <div class="sw-results-section" id="sw-cost-composition"></div>
    <div class="sw-results-section" id="sw-module-table"></div>
    <div class="sw-results-section" id="sw-source-decomp"></div>
  </section>
  <section class="swk-panel" id="swk-p-supplier" role="tabpanel" aria-labelledby="swk-t-supplier"${_swTab === 'supplier' ? '' : ' hidden'}>
    ${supplierFormHTML(Object.entries(CAT_META).map(([c, m]) => [c as SWCategory, m.label]))}
  </section>
  <section class="swk-panel" id="swk-p-rates" role="tabpanel" aria-labelledby="swk-t-rates"${_swTab === 'rates' ? '' : ' hidden'}>
    <div id="swk-ratecheck"></div>
    ${renderRateLibraryHTML()}
    <div id="sw-validation-wrap">${renderValidationHTML()}</div>
    ${renderActualsHTML()}
  </section>
  <section class="swk-panel" id="swk-p-report" role="tabpanel" aria-labelledby="swk-t-report"${_swTab === 'report' ? '' : ' hidden'}>
    <!-- Export -->
    <div style="text-align:center;margin:20px 0;display:flex;justify-content:center;gap:10px;flex-wrap:wrap">
      <button id="sw-excel-btn" class="swk-btn">
        Export Excel (6 sheets)
      </button>
      <button id="sw-pdf-btn" class="swk-btn swk-btn-primary">
        Export PDF Report
      </button>
    </div>
    <!-- AI Analysis (Rec 5) -->
    <div class="sw-results-section" id="sw-ai-analysis">
      <div class="sw-section-title"><span></span> AI Analysis</div>
      <div style="text-align:center;padding:12px 0">
        <button id="sw-ai-btn" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:0.85rem;font-weight:600;cursor:pointer">
          Generate AI Narrative Insights
        </button>
        <div style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:6px">Uses AI to provide executive summary and cost reduction opportunities</div>
      </div>
      <div id="sw-ai-content" style="display:none"></div>
    </div>

    <div class="sw-results-section" id="sw-benchmarks"></div>
  </section>
  </div><!-- /sw-results -->

</div>

<style>
${HUB_RATES_CSS}
${COCKPIT_CSS}
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
.sw-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }

/* Saved configs */
.sw-saved-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--sw-surface);
  border: 1px solid var(--sw-border);
  margin-bottom: 5px;
  font-size: 0.78rem;
}
.sw-saved-name { flex: 1; font-weight: 600; color: var(--sw-text-primary); }
.sw-saved-date { font-size: 0.7rem; color: var(--sw-text-muted); }
.sw-saved-load {
  font-size: 0.7rem; padding: 2px 8px; border-radius: 4px;
  border: 1px solid var(--sw-accent); background: var(--sw-accent-bg);
  color: var(--sw-accent); cursor: pointer;
}
.sw-saved-del {
  font-size: 0.7rem; padding: 2px 6px; border-radius: 4px;
  border: 1px solid var(--sw-border); background: var(--sw-surface);
  color: var(--sw-text-muted); cursor: pointer;
}
.sw-saved-del:hover { background: color-mix(in srgb, var(--danger) 10%, var(--sw-surface)); border-color: color-mix(in srgb, var(--danger) 40%, transparent); color: var(--danger); }

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

/* ── Guided wizard (Part 4) ────────────────────────────────────────────────── */
.sw-mode-toggle { display: inline-flex; gap: 2px; background: var(--sw-surface-alt); border: 1px solid var(--sw-border); border-radius: 8px; padding: 3px; margin-bottom: 16px; }
.sw-mode-btn { border: none; background: transparent; color: var(--sw-text-muted); font-size: 0.8rem; font-weight: 600; padding: 6px 16px; border-radius: 6px; cursor: pointer; transition: color 0.15s, background-color 0.15s, border-color 0.15s, box-shadow 0.15s, opacity 0.15s, transform 0.15s; }
.sw-mode-btn:hover { color: var(--sw-text-body); }
.sw-mode-active { background: var(--sw-surface); color: var(--sw-accent) !important; box-shadow: var(--sw-shadow-sm); }

.sw-wiz-progress { display: flex; align-items: center; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px; }
.sw-wiz-dot { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
.sw-wiz-num { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700; border: 2px solid var(--sw-border); color: var(--sw-text-muted); background: var(--sw-surface); transition: color 0.25s, background-color 0.25s, border-color 0.25s, box-shadow 0.25s, opacity 0.25s, transform 0.25s; }
.sw-wiz-dot-label { font-size: 0.72rem; font-weight: 600; color: var(--sw-text-muted); white-space: nowrap; }
.sw-wiz-connector { flex: 1; min-width: 14px; height: 2px; background: var(--sw-border); margin: 0 8px; }
.sw-wiz-active .sw-wiz-num { border-color: var(--sw-accent); color: var(--sw-accent); box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
.sw-wiz-active .sw-wiz-dot-label { color: var(--sw-accent); }
.sw-wiz-done .sw-wiz-num { border-color: #059669; background: #059669; color: #fff; }
.sw-wiz-done .sw-wiz-dot-label { color: var(--sw-text-body); }

.sw-wiz-card { background: var(--sw-surface); border: 1px solid var(--sw-border); border-radius: var(--sw-radius-lg); padding: 22px 24px; box-shadow: var(--sw-shadow-sm); }
#sw-wiz-body { animation: swWizIn 0.28s ease; }
@keyframes swWizIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.sw-wiz-h { font-size: 1.05rem; font-weight: 800; color: var(--sw-text-primary); margin-bottom: 6px; }
.sw-wiz-help { font-size: 0.82rem; color: var(--sw-text-secondary); margin-bottom: 16px; line-height: 1.55; }
.sw-wiz-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--sw-border-light); }
.sw-wiz-stepcount { font-size: 0.74rem; color: var(--sw-text-muted); }
.sw-wiz-btn-primary { background: var(--sw-accent); color: var(--sw-on-accent); border: 1px solid var(--sw-accent); border-radius: 8px; padding: 9px 26px; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: background-color 0.2s, border-color 0.2s; }
.sw-wiz-btn-primary:hover { filter: brightness(1.08); }
.sw-wiz-btn-ghost { background: transparent; color: var(--sw-text-body); border: 1px solid var(--sw-border); border-radius: 8px; padding: 9px 20px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.sw-wiz-btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }

.sw-domain-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.sw-domain-card { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--sw-border); border-radius: var(--sw-radius); background: var(--sw-surface); cursor: pointer; transition: color 0.15s, background-color 0.15s, border-color 0.15s, box-shadow 0.15s, opacity 0.15s, transform 0.15s; }
.sw-domain-card:hover { border-color: var(--sw-text-muted); }
.sw-domain-on { background: var(--sw-accent-bg); border-color: var(--sw-accent-border); }
.sw-domain-card input { margin-top: 3px; width: 15px; height: 15px; cursor: pointer; flex-shrink: 0; }
.sw-domain-title { font-size: 0.82rem; font-weight: 700; color: var(--sw-text-primary); margin-bottom: 3px; }
.sw-domain-count { font-size: 0.68rem; font-weight: 500; color: var(--sw-text-muted); }
.sw-domain-desc { font-size: 0.74rem; color: var(--sw-text-secondary); line-height: 1.4; }

.sw-tip { display: inline-block; width: 14px; height: 14px; line-height: 14px; text-align: center; border-radius: 50%; background: var(--sw-border); color: var(--sw-text-muted); font-size: 0.62rem; cursor: help; font-style: normal; }
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
  const overhead   = parseFloat((get('sw-overhead') as HTMLInputElement)?.value) || SW_DEFAULT_OVERHEAD;
  const seniorFrac = parseFloat((get('sw-senior-frac') as HTMLInputElement)?.value) ?? 0.50;
  const baseRateEl = get('sw-base-rate') as HTMLInputElement | null;
  const maint      = (get('sw-inc-maint') as HTMLInputElement)?.checked ?? true;
  const cloud      = (get('sw-inc-cloud') as HTMLInputElement)?.checked ?? true;

  _swInputs.region                 = region;
  _swInputs.devSource              = devSrc;
  _swInputs.programLifeYears       = life;
  _swInputs.annualProductionVolume = vol;
  _swInputs.overheadMultiplier     = Math.max(1, overhead);
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
}


export const SW_VEHICLE_DEMOS: SWVehicleDemo[] = [
  {
    id: 'rr_l460', powertrain: 'PHEV', label: 'Range Rover L460 (PHEV)',
    desc: 'JLR flagship, EVA2 (MLA) architecture, Pivi Pro infotainment. Heavy Tier-1 outsourcing; PHEV P550e keeps a (smaller) EV powertrain stack. Premium software: Dynamic Response Pro (48V active anti-roll) + rear-axle steer, Meridian 3D audio, park assist + 3D surround, cabin-air purification, digital key, HUD. Published ≈ £390M (core stack).',
    region: 'UK', devSource: 'Tier1_Supplier', volume: 75_000, life: 8, overhead: SW_DEFAULT_OVERHEAD, senior: 0.55, reuse: 'Medium',
    reportUrl: 'reports/l460-software-cost-breakdown.html',  // relative to import.meta.env.BASE_URL
    disabledModules: [],  // PHEV: retains battery/charge/drive SW at reduced scope
    moduleOverrides: {
      bms_core:       { complexity: 'High' },     // PHEV pack smaller than a BEV
      soc_soh_soe:    { complexity: 'High' },
      fast_charge:    { complexity: 'Medium' },   // AC + modest DC
      edu_control:    { complexity: 'High' },
      premium_audio:  { complexity: 'Very High' }, // Meridian Signature 3D
    },
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

function renderResults(result: SWProgramResult, opts: { live?: boolean } = {}): void {
  const s = result.summary;
  renderCockpit(result, opts);

  // Summary cards. Per-vehicle split follows the engine's rule exactly: NRE over the recovery window's vehicles,
  // lifecycle over the life's (it divided both by life, so the two parts did not add to the headline).
  const sch = swSchedule(result);
  const nreTotal = s.nreTotal;
  const lifecycleTotal = s.totalMaintenance + s.totalCloud + s.totalLicensing;   // F8: licences / royalties are lifecycle too
  const recovery = Math.max(1, result.inputs.costRecoveryYears ?? result.inputs.programLifeYears);
  const nreVehicles = result.inputs.annualProductionVolume * recovery;
  const lifeVehicles = result.inputs.annualProductionVolume * result.inputs.programLifeYears;
  const nrePerVeh       = nreVehicles > 0 ? nreTotal / nreVehicles : 0;
  const lifecyclePerVeh = lifeVehicles > 0 ? lifecycleTotal / lifeVehicles : 0;
  const cards: { label: string; value: string; sub: string; color: string }[] = [
    { label: 'Total Programme Cost',    value: fmtM(s.grandTotal),             sub: 'NRE + Lifecycle (all modules)',                color: '#2563eb' },
    { label: 'Per Vehicle (SW Cost)',   value: `${swMoney(s.perVehicle, 0)}`,     sub: `NRE ${swMoney(nrePerVeh,0)} (${recovery}-yr recovery) + Lifecycle ${swMoney(lifecyclePerVeh,0)} · ${fmt(result.inputs.annualProductionVolume/1000,0)}k/yr × ${result.inputs.programLifeYears}yr`, color: '#059669' },
    { label: 'Total NRE',              value: fmtM(nreTotal),                  sub: 'Dev + Test + Integ + Tools + Cyber + Calib',  color: '#7c3aed' },
    { label: 'Engineering Effort',     value: `${fmt(s.totalEffortPersonMonths, 0)} PM`, sub: `development ${fmt(s.totalPersonMonths, 0)} PM · avg ${fmt(sch.averageTeam,0)} engineers over ${fmt(sch.developmentMonths,0)} months`, color: '#d97706' },
    { label: 'Lifecycle',              value: fmtM(lifecycleTotal), sub: `maintenance, cloud, licences & royalties · ${fmt(s.grandTotal > 0 ? lifecycleTotal/s.grandTotal*100 : 0,0)}% of total`, color: '#0891b2' },
    { label: 'Active Modules',         value: `${result.modules.length}`,      sub: `of ${SW_MODULES.length} modules · ${hubLabel(result.inputs.region)} / ${result.inputs.devSource.replace('_',' ')}`, color: '#64748b' },
  ];

  const cardsHTML = cards.map(c => `
    <div class="sw-summary-card">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${c.color}"></div>
      <div class="sw-card-label">${esc(c.label)}</div>
      <div class="sw-card-value" style="color:${c.color}">${c.value}</div>
      <div class="sw-card-sub">${esc(c.sub)}</div>
    </div>`).join('');

  const cardsEl = document.getElementById('sw-summary-cards');
  if (cardsEl) cardsEl.innerHTML = cardsHTML;

  // Costing studio: the seven steps of this costing on the SUV skeleton (sw-costing-pipeline.ts).
  const studioEl = document.getElementById('sw-studio');
  if (studioEl) {
    const lib = activeSWBook().lib;
    const hub = lib.hubRates[result.inputs.region];
    const r = swRateBasis(result.inputs);
    const used = r.find(([k]) => k === 'Engineer rate used')?.[1] ?? '';
    const loaded = (result.inputs.baseRateGBP && result.inputs.baseRateGBP > 0 ? result.inputs.baseRateGBP : swLibraryBaseRate(result.inputs))
      * (lib.devSourceMultipliers[result.inputs.devSource]?.value ?? 1) * result.inputs.overheadMultiplier;
    mountSWStudio(studioEl, {
      result,
      rate: { perPMGBP: loaded, hubLabel: hubLabel(result.inputs.region),
        build: `${used.replace(/^\u00a3[\d,]+ — /, '')}; mid ${swMoney(hub?.mid.value ?? 0, 0)} / senior ${swMoney(hub?.senior.value ?? 0, 0)} per person-month (salary + statutory on-cost ÷ productive hours × 152 h), × development source ${lib.devSourceMultipliers[result.inputs.devSource]?.value ?? 1} × overhead ${result.inputs.overheadMultiplier}.` },
      fmt: { money: n => n >= 1e6 ? fmtM(n) : swMoney(n, 0), number: (n, dp = 0) => fmt(n, dp) },
    });
  }

  // Rec 2: Monte Carlo
  const mc = result.monteCarlo;
  const mcEl = document.getElementById('sw-monte-carlo');
  if (mcEl) {
    const span = mc.p90 - mc.p10;
    const pct90vs10 = mc.p10 > 0 ? (mc.p90 / mc.p10 - 1) * 100 : 0;
    mcEl.innerHTML = `
      <div class="sw-section-title"><span></span> Monte Carlo Cost Distribution (${mc.iterations.toLocaleString()} iterations)</div>
      <div class="sw-grid sw-grid-4" style="margin-bottom:16px">
        ${[
          { label: 'P10 (Optimistic)',  val: fmtM(mc.p10),  pv: `${swMoney(mc.p10PerVehicle,0)}/veh`, color: 'var(--sw-text-primary)' },
          { label: 'P50 (Median)',      val: fmtM(mc.p50),  pv: `${swMoney(mc.p50PerVehicle,0)}/veh`, color: 'var(--sw-text-primary)' },
          { label: 'P90 (Pessimistic)', val: fmtM(mc.p90),  pv: `${swMoney(mc.p90PerVehicle,0)}/veh`, color: 'var(--sw-text-primary)' },
          { label: 'Mean',              val: fmtM(mc.mean), pv: `P90/P10 spread: +${fmt(pct90vs10,0)}%`, color: 'var(--sw-text-primary)' },
        ].map(c => `
        <div style="background:var(--sw-surface-alt);border:1px solid var(--sw-border);border-radius:8px;padding:12px 14px">
          <div style="font-size:0.7rem;font-weight:600;color:var(--sw-text-muted);margin-bottom:4px">${c.label}</div>
          <div style="font-size:1.15rem;font-weight:800;color:${c.color}">${c.val}</div>
          <div style="font-size:0.7rem;color:var(--sw-text-muted);margin-top:2px">${c.pv}</div>
        </div>`).join('')}
      </div>
      <div style="font-size:0.75rem;color:var(--sw-text-secondary);background:var(--sw-surface-alt);border:1px solid var(--sw-border);border-radius:6px;padding:10px 14px">
        <strong>Uncertainty model:</strong> Triangular distributions on 11 cost buckets
        (development −30 / +40 %, testing −25 / +35 %, cybersecurity −35 / +50 %, cloud −50 / +60 %, etc. — CostVision
        engineering estimates, not sourced) combined with a
        <strong>55% programme-wide correlation</strong> — schedule slips inflate dev, test and
        integration together, so the tail reflects real correlated overrun rather than a
        cancelling independent sum. Range P10→P90: <strong>${fmtM(span)}</strong>.
      </div>
      <p id="sw-headline-pct" style="font-size:0.78rem;color:var(--sw-text-body);margin:8px 0 0">
        The headline total (${fmtM(result.summary.grandTotal)}) sits at about <strong>P${mc.headlinePercentile}</strong> of this band, not at
        the median: the cost ranges are skewed upwards (overruns are larger than savings). P50 = <strong>${fmtM(mc.p50)}</strong>.
      </p>`;
  }

  // Rec 3: Programme Phases
  // Fills dark enough for the white segment labels (≥ 4.5:1); the budget column uses body text, the swatch carries the colour.
  const phaseColors = ['#4f46e5','#2563eb','#0e7490','#047857','#b45309'];
  const phaseEl = document.getElementById('sw-phases');
  if (phaseEl) {
    const barSegs = result.phases.map((p, i) => `
      <div class="sw-phase-seg" style="width:${(p.fraction*100).toFixed(0)}%;background:${phaseColors[i]}" title="${p.name}: ${fmtM(p.nreCost)} (${p.months})">
        ${p.fraction >= 0.12 ? p.name.split('/')[0] : ''}
      </div>`).join('');

    const phaseRows = result.phases.map((p, i) => `<tr>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${phaseColors[i]};margin-right:6px"></span>${esc(p.name)}</td>
      <td style="font-size:0.75rem;color:var(--sw-text-muted)">${esc(p.months)}</td>
      <td class="sw-num">${fmt(p.fraction*100,0)}%</td>
      <td class="sw-num" style="font-weight:700;color:var(--sw-text-primary)">${fmtM(p.nreCost)}</td>
    </tr>`).join('');

    phaseEl.innerHTML = `
      <div class="sw-section-title"><span></span> Programme Milestone Phases (NRE: ${fmtM(nreTotal)})</div>
      <div class="sw-phase-bar">${barSegs}</div>
      <table class="sw-data-table" style="margin-top:10px">
        <thead><tr><th>Phase</th><th>Timeline</th><th class="sw-num">NRE Share</th><th class="sw-num">Budget</th></tr></thead>
        <tbody>${phaseRows}</tbody>
      </table>
      <p style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:8px">* Phase fractions apply to NRE only. Lifecycle costs (maintenance, cloud, IP licensing) are incurred post-SOP and shown separately in Cost Composition.</p>`;
  }

  // Category breakdown
  const catRows = Object.entries(CAT_META).map(([cat, meta]) => {
    const total = s.byCategory[cat as keyof typeof s.byCategory] ?? 0;
    const pct   = s.grandTotal > 0 ? (total / s.grandTotal * 100) : 0;
    const mods  = result.modules.filter(m => m.category === cat);
    const topMod = mods.length > 0 ? mods.sort((a,b) => b.grandTotal - a.grandTotal)[0] : null;
    return `
    <tr>
      <td><span style="font-size:1rem">${meta.icon}</span> <strong>${esc(meta.label)}</strong></td>
      <td class="sw-num">${mods.length}</td>
      <td class="sw-num">${fmtM(total)}</td>
      <td class="sw-num">${fmt(pct, 1)}%</td>
      <td>
        <div class="sw-bar-track"><div class="sw-bar-fill" style="width:${pct.toFixed(1)}%;background:${meta.color}"></div></div>
      </td>
      <td style="font-size:0.72rem;color:var(--sw-text-muted)">${topMod ? esc(topMod.moduleName) : '—'}</td>
    </tr>`;
  }).join('');

  const catEl = document.getElementById('sw-cat-breakdown');
  if (catEl) catEl.innerHTML = `
    <div class="sw-section-title"><span></span> Cost by Software Category</div>
    <table class="sw-data-table">
      <thead><tr><th>Category</th><th class="sw-num">Modules</th><th class="sw-num">Total Cost</th><th class="sw-num">Share</th><th style="width:140px">Distribution</th><th>Largest Module</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>`;

  // Cost composition (Rec 7: includes Calibration)
  const comp: [string, string, number][] = [
    ['<svg class="ic" aria-hidden="true"><use href="#i-monitor"/></svg>', 'Development (Engineering)', s.totalDevelopment],
    ['<svg class="ic" aria-hidden="true"><use href="#i-flask"/></svg>', 'Testing & Validation',      s.totalTesting],
    ['<svg class="ic" aria-hidden="true"><use href="#i-link"/></svg>', 'Integration & V&V',         s.totalIntegration],
    ['<svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg>', 'Toolchain (dev tools)',      s.totalToolchain],
    ['<svg class="ic" aria-hidden="true"><use href="#i-ruler"/></svg>', 'Calibration & Tuning',       s.totalCalibration],
    ['<svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg>', 'Cybersecurity (pentest/TARA)', s.totalCybersecurity],
    ['<svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg>', 'Maintenance (lifecycle)',    s.totalMaintenance],
    ['<svg class="ic" aria-hidden="true"><use href="#i-cloud"/></svg>', 'Cloud & Infra (lifecycle)',   s.totalCloud],
    ['<svg class="ic" aria-hidden="true"><use href="#i-doc"/></svg>', 'IP Licensing (lifecycle)',    s.totalLicensing],
  ];
  const compRows = comp.map(([icon, label, val]) => {
    const pct = s.grandTotal > 0 ? val / s.grandTotal * 100 : 0;
    return `<tr>
      <td>${icon} ${esc(label)}</td>
      <td class="sw-num">${fmtM(val)}</td>
      <td class="sw-num">${fmt(pct, 1)}%</td>
      <td><div class="sw-bar-track"><div class="sw-bar-fill" style="width:${pct.toFixed(1)}%;background:var(--sw-accent)"></div></div></td>
    </tr>`;
  }).join('');

  const compEl = document.getElementById('sw-cost-composition');
  if (compEl) compEl.innerHTML = `
    <div class="sw-section-title"><span></span> Cost Composition (10 Dimensions)</div>
    <table class="sw-data-table">
      <thead><tr><th>Cost Bucket</th><th class="sw-num">Value</th><th class="sw-num">Share</th><th>Distribution</th></tr></thead>
      <tbody>${compRows}
      <tr style="background:var(--sw-surface-alt);font-weight:700">
        <td>TOTAL PROGRAMME COST</td>
        <td class="sw-num" style="color:var(--sw-accent)">${fmtM(s.grandTotal)}</td>
        <td class="sw-num">100%</td>
        <td></td>
      </tr>
      </tbody>
    </table>`;

  // Module detail table with Rec 8 ASIL validation
  const sortedMods = [...result.modules].sort((a,b) => b.grandTotal - a.grandTotal);
  const modRows = sortedMods.map((m, i) => {
    const meta = CAT_META[m.category];
    const def  = SW_MODULES.find(d => d.id === m.moduleId);
    const isDowngrade = def && ASIL_RANK[m.asilUsed] < ASIL_RANK[def.defaultAsil];
    const asilCell = isDowngrade
      ? `${asilBadge(m.asilUsed)} <span style="color:#d97706;font-size:0.7rem" title="Below default ${def?.defaultAsil ?? ''}">⚠ −${ASIL_RANK[def!.defaultAsil] - ASIL_RANK[m.asilUsed]} lvl</span>`
      : asilBadge(m.asilUsed);
    return `<tr class="${i < 5 ? 'sw-highlight' : ''}">
      <td>${i + 1}</td>
      <td style="font-weight:600">${esc(m.moduleName)}</td>
      <td><span style="color:${meta?.color ?? '#64748b'}">${meta?.icon ?? ''}</span> ${esc(meta?.label ?? m.categoryLabel)}</td>
      <td>${asilCell}</td>
      <td style="font-size:0.75rem;color:var(--sw-text-muted)">${esc(m.complexityUsed)}</td>
      <td style="font-size:0.75rem;color:var(--sw-text-muted)">${esc(m.reuseUsed)}</td>
      <td class="sw-num">${fmt(m.personMonths, 0)}</td>
      <td class="sw-num">${fmtM(m.development.total)}</td>
      <td class="sw-num">${fmtM(m.calibrationCost)}</td>
      <td class="sw-num">${fmtM(m.testing.total)}</td>
      <td class="sw-num">${fmtM(m.grandTotal)}</td>
      <td class="sw-num" style="color:#059669;font-weight:600">${swMoney(m.perVehicle, 0)}</td>
    </tr>`;
  }).join('');

  // Count ASIL downgrades for header warning
  const downgradeCount = sortedMods.filter(m => {
    const def = SW_MODULES.find(d => d.id === m.moduleId);
    return def && ASIL_RANK[m.asilUsed] < ASIL_RANK[def.defaultAsil];
  }).length;
  const downgradeWarning = downgradeCount > 0
    ? `<div style="background:color-mix(in srgb, var(--warning) 8%, var(--surface));border:1px solid color-mix(in srgb, var(--warning) 35%, transparent);border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:0.78rem;color:color-mix(in srgb, var(--warning) 75%, var(--text-primary))">⚠ <strong>${downgradeCount} module(s)</strong> have ASIL set below their default. Review safety case documentation (ISO 26262 §6.4.5) before sign-off.</div>`
    : '';

  const modTableEl = document.getElementById('sw-module-table');
  if (modTableEl) modTableEl.innerHTML = `
    <div class="sw-section-title"><span></span> Module Cost Detail — All ${result.modules.length} Active Modules</div>
    ${downgradeWarning}
    <div style="overflow-x:auto">
    <table class="sw-data-table">
      <thead><tr>
        <th>#</th><th>Module</th><th>Category</th><th>ASIL</th>
        <th>Complexity</th><th>Reuse</th><th class="sw-num">PM</th>
        <th class="sw-num">Dev Cost</th><th class="sw-num">Calibration</th>
        <th class="sw-num">Test Cost</th>
        <th class="sw-num">Grand Total</th><th class="sw-num">${swCur().sym}/Vehicle</th>
      </tr></thead>
      <tbody>${modRows}</tbody>
    </table>
    </div>`;

  // Sensitivity analysis
  const sensRows = result.sensitivity.map(row => {
    const low  = row.unit === '£M' ? fmtM(row.low) : `${swMoney(row.low, 0)}`;
    const base = row.unit === '£M' ? fmtM(row.base) : `${swMoney(row.base, 0)}`;
    const high = row.unit === '£M' ? fmtM(row.high) : `${swMoney(row.high, 0)}`;
    const span = row.high - row.low;
    const spanFmt = row.unit === '£M' ? fmtM(span) : `${swMoney(span, 0)}`;
    return `<tr>
      <td style="font-weight:600">${esc(row.parameter)}</td>
      <td class="sw-num" style="color:#059669">${low}</td>
      <td class="sw-num sw-highlight" style="background:var(--sw-accent-bg) !important">${base}</td>
      <td class="sw-num" style="color:#ef4444">${high}</td>
      <td class="sw-num">${spanFmt}</td>
    </tr>`;
  }).join('');

  const sensEl = document.getElementById('sw-sensitivity');
  if (sensEl) sensEl.innerHTML = `
    <div class="sw-section-title"><span></span> Sensitivity Analysis</div>
    <table class="sw-data-table">
      <thead><tr><th>Parameter</th><th class="sw-num">Low Scenario</th><th class="sw-num">Base Case</th><th class="sw-num">High Scenario</th><th class="sw-num">Range</th></tr></thead>
      <tbody>${sensRows}</tbody>
    </table>
    <p style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:10px">* Low = favourable scenario. High = unfavourable. Production Volume: Low = 150k/yr (cheaper per-vehicle), High = 50k/yr (expensive). Base = this configuration.</p>`;

  // Benchmark comparison
  const bmRows = result.benchmarks.map(b => {
    const isThis = b.vehicle === 'This programme';
    const thisM  = s.grandTotal / 1_000_000;
    const diff   = (!isThis && b.totalM > 0) ? ((thisM - b.totalM) / b.totalM * 100) : 0;
    const diffFmt = isThis ? 'Base' : `${diff >= 0 ? '+' : ''}${fmt(diff, 0)}%`;
    const diffColor = isThis ? 'var(--sw-text-primary)' : diff > 20 ? 'var(--sw-bad)' : diff < -20 ? 'var(--sw-good)' : 'var(--sw-text-body)';
    const cite = isThis ? '' : ` <span style="cursor:help;color:var(--sw-text-muted);font-size:0.7rem" title="Source: ${esc(b.source)}">ⓘ</span>`;
    return `<tr ${isThis ? 'style="background:var(--sw-accent-bg);font-weight:700"' : ''}>
      <td>${esc(b.vehicle)}${cite}</td>
      <td class="sw-num">${b.totalM > 0 ? fmtM(b.totalM * 1_000_000) : fmtM(s.grandTotal)}</td>
      <td class="sw-num">${swMoney(b.perVehicle > 0 ? b.perVehicle : s.perVehicle, 0)}</td>
      <td class="sw-num" style="color:${diffColor};font-weight:600">${diffFmt}</td>
      <td style="font-size:0.72rem;color:var(--sw-text-muted)">${isThis ? '' : b.verified ? '' : '<strong style="color:var(--amber,#b45309)">Unverified</strong> · '}${esc(b.source)}</td>
    </tr>`;
  }).join('');

  const bmEl = document.getElementById('sw-benchmarks');
  if (bmEl) bmEl.innerHTML = `
    <div class="sw-section-title"><span></span> Benchmark Comparison — Premium EV Programme SW Investment (unverified)</div>
    <table class="sw-data-table">
      <thead><tr><th>Vehicle / Programme</th><th class="sw-num">Total SW Cost</th><th class="sw-num">${swCur().sym}/Vehicle</th><th class="sw-num">vs This Model</th><th>Source</th></tr></thead>
      <tbody>${bmRows}</tbody>
    </table>
    <p style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:10px">* Positive = benchmark cheaper than this model. <strong>None of these published figures has a source link</strong> and two could not be traced at all — they are shown for context only; do not quote them. The published per-vehicle figures do not reconcile with the published totals.</p>`;

  // Rec 4: OEM / Tier-1 / Startup decomposition
  const sourceDecomp: { src: string; label: string; riskNote: string; ipNote: string; warrantyNote: string }[] = [
    { src: 'OEM_Internal',   label: 'OEM Internal',    riskNote: 'Full visibility & control', ipNote: 'IP owned outright', warrantyNote: 'Full in-house warranty liability' },
    { src: 'Tier1_Supplier', label: 'Tier 1 Supplier', riskNote: 'Contractual milestone risk', ipNote: 'IP shared / licensed-back', warrantyNote: 'Supplier carries a contractual warranty share' },
    { src: 'Startup_OSS',   label: 'Startup / OSS',   riskNote: 'High execution risk, talent risk', ipNote: 'OSS licence risk; limited assignment', warrantyNote: 'Warranty indemnity limited; OEM absorbs tail' },
  ];
  const currentSrc = result.inputs.devSource;
  // Each row is the programme RE-COSTED with that source in the active rate book (engine devSourceComparison) —
  // the table used its own copy of the multipliers and scaled the labour share (P2 #13).
  const bySource = new Map(devSourceComparison(result.inputs).map(r => [r.devSource as string, r]));
  const decompRows = sourceDecomp.map(d => {
    const row = bySource.get(d.src);
    if (!row) return '';
    const isCurrent = d.src === currentSrc;
    return `<tr ${isCurrent ? 'style="background:var(--sw-accent-bg);font-weight:700"' : ''}>
      <td>${isCurrent ? '⭐ ' : ''}${esc(d.label)}</td>
      <td class="sw-num" style="color:var(--sw-accent)">${fmtM(row.grandTotal)}</td>
      <td class="sw-num">×${row.multiplier.toFixed(2)}</td>
      <td style="font-size:0.75rem;color:var(--sw-text-secondary)">${esc(d.riskNote)}</td>
      <td style="font-size:0.75rem;color:var(--sw-text-secondary)">${esc(d.ipNote)}</td>
      <td style="font-size:0.75rem;color:var(--sw-text-secondary)">${esc(d.warrantyNote)}</td>
    </tr>`;
  }).join('');

  const decompEl = document.getElementById('sw-source-decomp');
  if (decompEl) decompEl.innerHTML = `
    <div class="sw-section-title"><span></span> Development Source Decomposition (OEM / Tier-1 / Startup)</div>
    <table class="sw-data-table">
      <thead><tr><th>Dev Source</th><th class="sw-num">Estimated Cost</th><th class="sw-num">Rate Mult.</th><th>Risk Profile</th><th>IP Ownership</th><th>Warranty Exposure</th></tr></thead>
      <tbody>${decompRows}</tbody>
    </table>
    <p style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:8px">* Each row re-costs this programme with that source's rate multiplier from the active rate book. Actual costs also depend on management overhead, ramp-up time, and programme governance.</p>`;

  // Engineering Insights
  const insightsEl = document.getElementById('sw-insights');
  if (insightsEl) {
    const insights: { icon: string; level: 'info' | 'warn' | 'ok'; title: string; body: string }[] = [];

    const sorted = [...result.modules].sort((a,b) => b.grandTotal - a.grandTotal);
    if (sorted.length > 0) {
      const top = sorted[0];
      insights.push({ icon: '<svg class="ic" aria-hidden="true"><use href="#i-chart"/></svg>', level: 'info',
        title: `Top cost driver: ${top.moduleName}`,
        body: `At ${fmtM(top.grandTotal)} (${fmt(top.grandTotal/s.grandTotal*100,1)}% of total), ${top.moduleName} is the largest single module. Evaluate build-vs-buy: price a licensed platform against this figure (no saving is assumed here).`,
      });
    }

    const asilDReuseHeavy = result.modules.filter(m => m.asilUsed === 'D' && (m.reuseUsed === 'Heavy' || m.reuseUsed === 'Platform'));
    if (asilDReuseHeavy.length > 0) {
      insights.push({ icon: '⚠', level: 'warn',
        title: `ASIL-D with Heavy/Platform reuse — verify safety case`,
        body: `${asilDReuseHeavy.map(m => m.moduleName).join(', ')} are ASIL-D with ${asilDReuseHeavy[0].reuseUsed} reuse. ISO 26262 requires formal safety case for SEooC elements. Factor in additional safety analysis cost.`,
      });
    }

    const lifecycleTotal = s.totalMaintenance + s.totalCloud + s.totalLicensing;
    const lifecyclePct = s.grandTotal > 0 ? lifecycleTotal / s.grandTotal * 100 : 0;
    // Name the bucket that actually leads — the text used to say "cloud" whatever the numbers were (P1 #7).
    const lifeTop = [
      { name: 'maintenance', value: s.totalMaintenance },
      { name: 'cloud', value: s.totalCloud },
      { name: 'IP licensing', value: s.totalLicensing },
    ].sort((a, b) => b.value - a.value)[0];
    if (lifecyclePct > 45) {
      insights.push({ icon: '<svg class="ic" aria-hidden="true"><use href="#i-cloud"/></svg>', level: 'warn',
        title: `High lifecycle cost (${fmt(lifecyclePct,0)}% of total)`,
        body: `Lifecycle costs total ${fmtM(lifecycleTotal)} (${fmt(lifecyclePct,0)}%). The largest lifecycle bucket is ${lifeTop.name} at ${fmtM(lifeTop.value)} — review its assumptions first.`,
      });
    } else {
      insights.push({ icon: '<svg class="ic" aria-hidden="true"><use href="#i-check-circle"/></svg>', level: 'ok',
        title: `NRE / lifecycle split: ${fmt(100-lifecyclePct,0)}% NRE`,
        body: `Development NRE is ${fmt(100-lifecyclePct,0)}% of the total; lifecycle (maintenance, cloud, IP) is ${fmt(lifecyclePct,0)}%.`,
      });
    }

    // Peer comparison only against SOURCED figures — none exists yet (sw-benchmarks.ts), so this insight is withheld (P1 #6).
    const nonThis = result.benchmarks.filter(b => b.vehicle !== 'This programme' && b.verified);
    const medianBm = [...nonThis].sort((a,b)=>a.totalM-b.totalM)[Math.floor(nonThis.length/2)]?.totalM ?? 0;
    const thisM = s.grandTotal / 1_000_000;
    if (medianBm > 0) {
      const diffPct = (thisM - medianBm) / medianBm * 100;
      insights.push({ icon: diffPct > 30 ? '<svg class="ic" aria-hidden="true" style="color:#ef4444"><use href="#i-dot"/></svg>' : diffPct > 10 ? '<svg class="ic" aria-hidden="true" style="color:#eab308"><use href="#i-dot"/></svg>' : '<svg class="ic" aria-hidden="true" style="color:var(--green)"><use href="#i-dot"/></svg>', level: diffPct > 30 ? 'warn' : 'ok',
        title: `Programme cost is ${fmt(Math.abs(diffPct),0)}% ${diffPct >= 0 ? 'above' : 'below'} peer median (${fmtM(medianBm * 1_000_000)})`,
        body: diffPct > 20 ? `Cost exceeds peer median. Review ASIL assignments and reuse opportunities. The cheapest assessed hub would cost ${fmt(s.grandTotal > 0 ? Math.abs(s.grandTotal - _recomputeTotalForInsight(result)) / s.grandTotal * 100 : 0, 0)}% less than this hub.`
              : `Programme cost is within normal range vs peers. Monitor cloud costs as fleet scales.`,
      });
    }

    const hasCyberMod = result.modules.some(m => m.category === 'F');
    if (!hasCyberMod) {
      insights.push({ icon: '<svg class="ic" aria-hidden="true" style="color:#ef4444"><use href="#i-dot"/></svg>', level: 'warn',
        title: 'No Cybersecurity (ISO 21434) modules enabled',
        body: 'UN-ECE R155 mandates CSMS for all connected vehicles from July 2024. Category F modules are required for regulatory compliance.',
      });
    }

    const hubRow = result.sensitivity.find(r => r.parameter.startsWith('Engineering hub'));
    if (hubRow && hubRow.low > 0 && hubRow.low < s.grandTotal * 0.97) {
      const cheapest = hubRow.parameter.replace(/^Engineering hub \((.*) vs .*\)$/, '$1');
      const saving = s.grandTotal - hubRow.low;
      insights.push({ icon: '<svg class="ic" aria-hidden="true"><use href="#i-bulb"/></svg>', level: 'info',
        title: `The same scope in ${cheapest} would cost ${fmtM(hubRow.low)} (−${fmtM(saving)})`,
        body: `The whole programme re-costed at ${cheapest}'s own book rate. Add your own figure for coordination, knowledge transfer, travel and time-zone risk before comparing.`,
      });
    }

    // Average team over the DEVELOPMENT window and the COCOMO II duration of the longest module (code review F7: it
    // divided development effort by the production life).
    const sch = swSchedule(result);
    insights.push({ icon: '<svg class="ic" aria-hidden="true"><use href="#i-users"/></svg>', level: sch.overrunning.length ? 'warn' : 'info',
      title: `Average team: ${fmt(sch.averageTeam, 0)} engineers over ${fmt(sch.developmentMonths, 0)} months of development`,
      body: `${fmt(s.totalEffortPersonMonths, 0)} person-months of engineering ÷ ${fmt(sch.developmentMonths, 0)} months. COCOMO II gives the longest module (${sch.longestModule}) ${fmt(sch.longestMonths, 0)} months`
        + (sch.overrunning.length ? ` — ${sch.overrunning.length} module${sch.overrunning.length === 1 ? '' : 's'} need longer than the development window at nominal staffing (${sch.overrunning.slice(0, 3).join(', ')}${sch.overrunning.length > 3 ? '…' : ''}).` : ', inside the development window.'),
    });

    const levelColor: Record<string, string> = { info: 'var(--sw-accent)', warn: 'var(--sw-warn,#b45309)', ok: 'var(--sw-good)' };
    const levelBg:    Record<string, string> = { info: 'var(--sw-accent-bg)', warn: 'var(--sw-surface-alt)', ok: 'var(--sw-surface-alt)' };
    const levelBorder:Record<string, string> = { info: 'var(--sw-accent-border)', warn: 'var(--sw-border)', ok: 'var(--sw-border)' };

    insightsEl.innerHTML = `
      <div class="sw-section-title"><span></span> Engineering Insights</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${insights.map(ins => `
        <div style="background:${levelBg[ins.level]};border:1px solid ${levelBorder[ins.level]};border-radius:8px;padding:12px 16px;display:flex;gap:12px;align-items:flex-start">
          <span style="font-size:1.2rem;flex-shrink:0">${ins.icon}</span>
          <div>
            <div style="font-weight:700;font-size:0.82rem;color:${levelColor[ins.level]};margin-bottom:4px">${esc(ins.title)}</div>
            <div style="font-size:0.78rem;color:var(--sw-text-body);line-height:1.5">${esc(ins.body)}</div>
          </div>
        </div>`).join('')}
      </div>`;
  }

  // Results live in their tabs now; nothing scrolls the page (cockpit review: smooth scroll-jumps removed).
  const resultsEl = document.getElementById('sw-results');
  if (resultsEl) resultsEl.style.display = '';
}

/** The cockpit views: rail, context line, overview / risk / spend charts, supplier check and the rate check. */
function renderCockpit(result: SWProgramResult, opts: { live?: boolean } = {}): void {
  const money = (n: number) => swMoney(n, 0);
  const rail = document.getElementById('swk-rail');
  if (rail) updateRail(rail, result, money, fmtM, { quiet: !opts.live });
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
    if (_swMode === 'advanced') readConfig();
    else { readWizStep(_wizStep); applyGuidedToInputs(); }
    if (!_swInputs.modules.some(m => m.enabled)) { if (rail) railError(rail, 'No module is in scope — tick at least one module on the Scope tab.'); return; }
    _swResult = computeSWProgram(_swInputs);
    renderResults(_swResult, { live });
    if (_swMode === 'guided') syncAdvancedFields();
  } catch (err) {
    // Keep the last good figures, dimmed, and say why (an invalid input is reported, never patched).
    if (rail) railError(rail, (err as Error).message.replace(/^Software cost inputs are not valid — /, 'Check the inputs: '));
  }
}

function _recomputeTotalForInsight(result: SWProgramResult): number {
  // The cheapest assessed hub, from the sensitivity row (no extra recompute).
  return result.sensitivity.find(r => r.parameter.startsWith('Engineering hub'))?.low ?? result.summary.grandTotal;
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

PROGRAMME: Premium Luxury SUV Full Software Stack (${result.inputs.programLifeYears}-year programme)
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
  const s  = result.summary;
  const inp = result.inputs;

  // Money in the page's display currency (P3 #15): fM for millions, fV for £ / vehicle; f2 stays for %, PM, counts.
  const fM = (n: number) => parseFloat((swConv(n)/1_000_000).toFixed(3));
  const f2 = (n: number) => parseFloat(n.toFixed(2));
  const fV = (n: number) => parseFloat(swConv(n).toFixed(2));

  // Sheet 1: Summary
  const summaryData = [
    ['CostVision — Automotive SW Should-Cost Report'],
    ['Programme', 'Premium Luxury SUV Full SW Stack 2024–2026'],
    ['Generated', new Date().toLocaleDateString('en-GB')],
    [],
    ['Cost Bucket', `Value (${swUnitM()})`, 'Share (%)'],
    ['Development Engineering', fM(s.totalDevelopment), f2(s.totalDevelopment/s.grandTotal*100)],
    ['Testing & Validation',    fM(s.totalTesting),     f2(s.totalTesting/s.grandTotal*100)],
    ['Integration & V&V',       fM(s.totalIntegration), f2(s.totalIntegration/s.grandTotal*100)],
    ['Toolchain (dev tools)',   fM(s.totalToolchain),   f2(s.totalToolchain/s.grandTotal*100)],
    ['Calibration & Tuning',    fM(s.totalCalibration), f2(s.totalCalibration/s.grandTotal*100)],
    ['Cybersecurity',           fM(s.totalCybersecurity), f2(s.totalCybersecurity/s.grandTotal*100)],
    ['Maintenance (lifecycle)', fM(s.totalMaintenance), f2(s.totalMaintenance/s.grandTotal*100)],
    ['Cloud & Infra (lifecycle)',fM(s.totalCloud),       f2(s.totalCloud/s.grandTotal*100)],
    ['IP Licensing (lifecycle)', fM(s.totalLicensing),  f2(s.totalLicensing/s.grandTotal*100)],
    ['TOTAL PROGRAMME COST',    fM(s.grandTotal),        100],
    [],
    ['Per Vehicle (SW)', fV(s.perVehicle), `${swCur().sym}`],
    ['Currency', `${swCur().code} at ${swCur().perGbp.toFixed(4)} per £ (the engine prices in £; inputs below are £)`],
    ['Engineering Effort (all costed effort)', f2(s.totalEffortPersonMonths), 'PM'],
    ['Development Person-Months (costed)', f2(s.totalPersonMonths), 'PM'],
    ['Active Modules', result.modules.length, ''],
    [],
    ['RATE BASIS — what these figures were priced on'],
    ...swRateBasis(inp).map(([k, v]) => [k, v]),
  ];

  // Sheet 2: Category Breakdown
  const catData = [
    ['Category', 'Category Label', 'Modules', `Total Cost (${swUnitM()})`, 'Share (%)'],
    ...Object.entries(CAT_META).map(([cat, meta]) => {
      const t = s.byCategory[cat as keyof typeof s.byCategory] ?? 0;
      const mods = result.modules.filter(m => m.category === cat);
      return [cat, meta.label, mods.length, fM(t), f2(t/s.grandTotal*100)];
    }),
  ];

  // Sheet 3: Module Detail
  const modData = [
    ['#', 'Module', 'Category', 'ASIL', 'Complexity', 'Reuse', 'CAL (ISO/SAE 21434)', 'Effort basis', 'Person-Months',
     `Dev Cost (${swUnitM()})`, `Test Cost (${swUnitM()})`, `Calibration (${swUnitM()})`, `Integration (${swUnitM()})`,
     `Toolchain (${swUnitM()})`, `IP Licence (${swUnitM()})`, `Cybersec (${swUnitM()})`, `Cloud (${swUnitM()})`, `Maintenance (${swUnitM()})`,
     `Grand Total (${swUnitM()})`, `${swCur().sym}/Vehicle`],
    ...[...result.modules].sort((a,b) => b.grandTotal - a.grandTotal).map((m, i) => [
      i+1, m.moduleName, m.category, m.asilUsed, m.complexityUsed, m.reuseUsed, m.calUsed,
      m.effortBasis === 'size' ? `COCOMO II size (${inp.modules.find(x => x.moduleId === m.moduleId)?.sizeKSLOC} KSLOC)` : m.effortBasis,
      f2(m.personMonths), fM(m.development.total), fM(m.testing.total),
      fM(m.calibrationCost), fM(m.integrationCost), fM(m.toolchainCost),
      fM(m.licensingCost), fM(m.cybersecCost), fM(m.cloudCost), fM(m.maintenanceCost),
      fM(m.grandTotal), fV(m.perVehicle),
    ]),
  ];

  // Sheet 4: Sensitivity + Monte Carlo
  const mc = result.monteCarlo;
  const sensData: unknown[][] = [
    ['SENSITIVITY ANALYSIS'],
    ['Parameter', 'Unit', 'Low Scenario', 'Base Case', 'High Scenario', 'Range'],
    ...result.sensitivity.map(r => {
      // £M rows store absolute pounds; convert to £M. Per-vehicle rows stay raw.
      const v = (n: number) => r.unit === '£M' ? fM(n) : fV(n);
      return [r.parameter, r.unit.replace('£', swCur().sym), v(r.low), v(r.base), v(r.high), v(r.high - r.low)];
    }),
    [],
    ['MONTE CARLO DISTRIBUTION', `${mc.iterations} iterations`],
    ['Percentile', `Total Cost (${swUnitM()})`, `${swCur().sym}/Vehicle`],
    ['P10 (Optimistic)', fM(mc.p10), fV(mc.p10PerVehicle)],
    ['P50 (Median)',     fM(mc.p50), fV(mc.p50PerVehicle)],
    ['P90 (Pessimistic)',fM(mc.p90), fV(mc.p90PerVehicle)],
    ['Mean',             fM(mc.mean), ''],
    ['P90-P10 Spread',   fM(mc.p90 - mc.p10), ''],
    [`Headline (≈ P${mc.headlinePercentile} of this band)`, fM(s.grandTotal), fV(s.perVehicle)],
    [],
    ['PROGRAMME PHASES (NRE)'],
    ['Phase', 'Timeline', 'NRE Share (%)', `NRE Budget (${swUnitM()})`],
    ...result.phases.map(p => [p.name, p.months, f2(p.fraction*100), fM(p.nreCost)]),
  ];

  // Sheet 5: Benchmarks
  const bmData = [
    ['Vehicle / Programme', `Total SW Cost (${swUnitM()})`, `${swCur().sym}/Vehicle`, 'vs This Model (%)', 'Source'],
    ...result.benchmarks.map(b => {
      const isThis = b.vehicle === 'This programme';
      const thisM = s.grandTotal / 1_000_000;
      const diff = (!isThis && b.totalM > 0) ? f2((thisM - b.totalM) / b.totalM * 100) : 'Base';
      return [b.vehicle, b.totalM > 0 ? fM(b.totalM * 1_000_000) : fM(s.grandTotal), fV(b.perVehicle > 0 ? b.perVehicle : s.perVehicle), diff, (isThis || b.verified ? '' : 'UNVERIFIED — ') + b.source];
    }),
  ];

  // Sheet 6: Configuration
  const cfgData = [
    ['PROGRAMME CONFIGURATION'],
    ['Parameter', 'Value'],
    ['Engineering hub', hubLabel(inp.region)],
    ['Dev Source', inp.devSource],
    ['Programme Life (years)', inp.programLifeYears],
    ['Annual Production Volume', inp.annualProductionVolume],
    ['Team Senior Fraction', inp.teamSeniorFraction],
    ['Overhead Multiplier', inp.overheadMultiplier],
    ['Include Maintenance', inp.includeMaintenanceCost ? 'Yes' : 'No'],
    ['Include Cloud', inp.includeCloudCost ? 'Yes' : 'No'],
    [],
    ['MODULE CONFIGURATION'],
    ['Module ID', 'Module Name', 'Enabled', 'ASIL', 'Complexity', 'Reuse', 'Custom PM'],
    ...inp.modules.map(m => {
      const def = SW_MODULES.find(d => d.id === m.moduleId);
      return [m.moduleId, def?.name ?? m.moduleId, m.enabled ? 'Yes' : 'No', m.asil, m.complexity, m.reuse, m.customPersonMonths ?? 'auto'];
    }),
  ];

  // Where the software runs (the studio's SUV map), the COCOMO schedule and the hub's own rate build-up — the same
  // engine figures the screen shows; a module on several components counts at each (stated in the sheet).
  const vLoad = componentLoad(skeletonStateFor(result));
  const vehicleData: (string | number)[][] = [
    ['Where this software runs — components and the modules on them (a module on several components counts at each; these do not add up)'],
    ['Component', 'Kind', 'Modules', `Software on it (${swCur().code} M)`, 'Modules'],
    ...[...vLoad.entries()].filter(([id]) => id !== 'backbone').sort((a, b) => b[1].cost - a[1].cost).map(([id, l]) => {
      const c = vehicleComponent(id)!;
      return [c.label, c.kind, l.modules.length, fM(l.cost), l.modules.map(m => m.name).join('; ')];
    }),
  ];
  const sch = swSchedule(result);
  const schedData: (string | number)[][] = [
    ['Schedule — COCOMO II.2000 TDEV per module (modules in parallel; CostVision assumption)'],
    ['Basis', sch.basis],
    ['Development window (months)', f2(sch.developmentMonths)],
    ['Average engineering team (effort ÷ window)', f2(sch.averageTeam)],
    ['Longest module (months)', f2(sch.longestMonths)],
    [],
    ['Module', 'Effort (PM)', 'COCOMO duration (months)', 'Average staff'],
    ...sch.rows.map(r => [r.name, f2(r.effortPM), f2(r.tdevMonths), f2(r.avgStaff)]),
  ];
  const hubBook = SW_HUB_RATES[inp.region];
  const hubData: (string | number)[][] = hubBook ? [
    ['Engineering hub — its own rate (no UK multiplier)'],
    ['Hub', hubBook.label],
    ['Cities', hubBook.cities.join(', ')],
    ['Build-up', hubBook.build],
    ['Senior basis', hubBook.seniorBasis],
    ['Employer on-cost', hubBook.onCostBasis],
    ['Productive hours', hubBook.hoursBasis],
    ['Confidence', hubBook.confidence],
    ['Notes', hubBook.notes],
    [],
    ['Salary figures (mid)', 'Source · statistic · year · URL'],
    ...hubBook.mid.map(o => [`${hubBook.currency} ${o.value.toLocaleString('en-GB')} ${o.period} × ${o.annualFactor}`, `${o.source} · ${o.statistic} · ${o.dataYear ?? 'year n/s'} · ${o.url}`]),
    ['Salary figures (senior)', ''],
    ...hubBook.senior.map(o => [`${hubBook.currency} ${o.value.toLocaleString('en-GB')} ${o.period} × ${o.annualFactor}`, `${o.source} · ${o.statistic} · ${o.dataYear ?? 'year n/s'} · ${o.url}`]),
    ['Evidence of automotive software here', hubBook.evidence.join(' · ')],
  ] : [['Engineering hub', String(inp.region)]];

  const wb = await buildWorkbook([
    { name: 'Summary',            rows: summaryData, cols: [30, 16, 12] },
    { name: 'Category Breakdown', rows: catData,     cols: [10, 30, 10, 16, 12] },
    { name: 'Module Detail',      rows: modData,     cols: [4, 30, 9, 7, 12, 10, 14, ...Array(11).fill(14)] },
    { name: 'Sensitivity & MC',   rows: sensData,    cols: [40, 12, 16, 16, 16, 14] },
    { name: 'Benchmarks',         rows: bmData,      cols: [28, 18, 12, 18, 44] },
    { name: 'Configuration',      rows: cfgData,     cols: [28, 40, 10, 8, 12, 10, 12] },
    { name: 'Vehicle map',        rows: vehicleData, cols: [34, 12, 10, 16, 90] },
    { name: 'Schedule',           rows: schedData,   cols: [40, 14, 14, 14] },
    { name: 'Hub rate',           rows: hubData,     cols: [34, 90] },
  ]);
  await downloadWorkbook(wb, exportFilename('sw-should-cost', null, 'xlsx'));
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

function exportSWPDF(result: SWProgramResult): void {
  import('jspdf').then(({ jsPDF }) => {
    Promise.all([import('jspdf-autotable'), import('../../export/pdf.js')]).then(([{ default: autoTable }, { hardenPdfText }]) => {
      // WinAnsi-safe text: ₹ ₩ ₫ ₺ zł Kč and "≈" printed as mojibake (code review F10); same helper as the main PDF.
      const doc = hardenPdfText(new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }));
      const s = result.summary;
      const W = 210, MG = 14;
      const nreTotal = s.nreTotal;

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, W, 68, 'F');
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, 4, 68, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('Automotive Software Should-Cost', 14, 28);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('Premium Luxury SUV — Full Software Stack (2024–2026)', 14, 38);
      doc.setFontSize(9);
      doc.text(`Engineering hub: ${hubLabel(result.inputs.region)}  ·  Source: ${result.inputs.devSource}  ·  Life: ${result.inputs.programLifeYears}yr  ·  Volume: ${(result.inputs.annualProductionVolume / 1000).toFixed(0)}k/yr`, 14, 46);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}  ·  CostVision`, 14, 52);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text(fmtM(s.grandTotal), W - MG, 30, { align: 'right' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('Total Programme Cost', W - MG, 38, { align: 'right' });
      doc.text(`${swMoney(s.perVehicle, 0)} / vehicle`, W - MG, 45, { align: 'right' });

      let y = 76;
      const chk = (need: number) => { if (y + need > 270) { doc.addPage(); y = 18; } };
      const th = { fillColor: [15, 23, 42] as [number, number, number], textColor: [255,255,255] as [number,number,number], fontStyle: 'bold' as const, fontSize: 7 };

      // §1 Summary
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('1. Programme Cost Summary', MG, y); y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Cost Bucket', `Value (${swUnitM()})`, 'Share (%)']],
        body: [
          ['Development Engineering', fmtM(s.totalDevelopment), fmt(s.totalDevelopment/s.grandTotal*100,1)+'%'],
          ['Testing & Validation',    fmtM(s.totalTesting),     fmt(s.totalTesting/s.grandTotal*100,1)+'%'],
          ['Integration & V&V',       fmtM(s.totalIntegration), fmt(s.totalIntegration/s.grandTotal*100,1)+'%'],
          ['Toolchain (dev tools)',   fmtM(s.totalToolchain),   fmt(s.totalToolchain/s.grandTotal*100,1)+'%'],
          ['Calibration & Tuning',    fmtM(s.totalCalibration), fmt(s.totalCalibration/s.grandTotal*100,1)+'%'],
          ['Cybersecurity',           fmtM(s.totalCybersecurity), fmt(s.totalCybersecurity/s.grandTotal*100,1)+'%'],
          ['Maintenance (lifecycle)', fmtM(s.totalMaintenance), fmt(s.totalMaintenance/s.grandTotal*100,1)+'%'],
          ['Cloud & Infra',           fmtM(s.totalCloud),       fmt(s.totalCloud/s.grandTotal*100,1)+'%'],
          ['IP Licensing',            fmtM(s.totalLicensing),   fmt(s.totalLicensing/s.grandTotal*100,1)+'%'],
          ['NRE Subtotal',            fmtM(nreTotal),           fmt(nreTotal/s.grandTotal*100,1)+'%'],
          ['TOTAL', fmtM(s.grandTotal), '100%'],
        ],
        headStyles: th,
        columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 44, halign: 'right' }, 2: { cellWidth: 38, halign: 'right' } },
        bodyStyles: { fontSize: 7, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: MG, right: MG },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      // Rate basis — what the figures were priced on, so the report can be reproduced (P2 #14).
      chk(40);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('Rate basis', MG, y); y += 4;
      autoTable(doc, {
        startY: y,
        body: swRateBasis(result.inputs),
        columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' }, 1: { cellWidth: 112 } },
        bodyStyles: { fontSize: 7, cellPadding: 1.8 },
        margin: { left: MG, right: MG },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // §2 Monte Carlo
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('2. Monte Carlo Cost Distribution', MG, y); y += 6;
      const mc = result.monteCarlo;
      autoTable(doc, {
        startY: y,
        head: [['Percentile', `Total Cost (${swUnitM()})`, `${swCur().sym}/Vehicle`]],
        body: [
          ['P10 (Optimistic)', fmtM(mc.p10), `${swMoney(mc.p10PerVehicle,0)}`],
          ['P50 (Median)',     fmtM(mc.p50), `${swMoney(mc.p50PerVehicle,0)}`],
          ['P90 (Pessimistic)',fmtM(mc.p90), `${swMoney(mc.p90PerVehicle,0)}`],
          ['Mean',             fmtM(mc.mean), ''],
          [`Headline (≈ P${mc.headlinePercentile})`, fmtM(s.grandTotal), `${swMoney(s.perVehicle,0)}`],
        ],
        headStyles: th,
        columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 62, halign: 'right' }, 2: { cellWidth: 60, halign: 'right' } },
        bodyStyles: { fontSize: 7, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: MG, right: MG },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // §3 Category breakdown
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('3. Cost by Software Category', MG, y); y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Category', 'Modules', `Grand Total (${swUnitM()})`, 'Share (%)']],
        body: Object.entries(CAT_META).map(([cat, m]) => {
          const t = s.byCategory[cat as keyof typeof s.byCategory] ?? 0;
          return [m.label, String(result.modules.filter(x => x.category === cat).length), fmtM(t), fmt(t/s.grandTotal*100,1)+'%'];
        }),
        headStyles: th,
        columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 18, halign: 'right' }, 2: { cellWidth: 48, halign: 'right' }, 3: { cellWidth: 36, halign: 'right' } },
        bodyStyles: { fontSize: 7, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: MG, right: MG },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // §4 Module detail
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('4. Module Cost Detail (Top 20 by Cost)', MG, y); y += 6;
      const topMods = [...result.modules].sort((a,b) => b.grandTotal - a.grandTotal).slice(0, 20);
      autoTable(doc, {
        startY: y,
        head: [['Module', 'Cat', 'ASIL', 'PM', `Dev (${swUnitM()})`, `Calib (${swUnitM()})`, `Test (${swUnitM()})`, `Total (${swUnitM()})`, `${swCur().sym}/Veh`]],
        body: topMods.map(m => [
          m.moduleName.length > 26 ? m.moduleName.slice(0, 24)+'…' : m.moduleName,
          m.category, m.asilUsed, fmt(m.personMonths, 0),
          fmtM(m.development.total), fmtM(m.calibrationCost),
          fmtM(m.testing.total), fmtM(m.grandTotal), `${swMoney(m.perVehicle, 0)}`,
        ]),
        headStyles: th,
        columnStyles: {
          0: { cellWidth: 56 }, 1: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 10, halign: 'center' },
          3: { cellWidth: 12, halign: 'right' }, 4: { cellWidth: 18, halign: 'right' },
          5: { cellWidth: 18, halign: 'right' }, 6: { cellWidth: 18, halign: 'right' },
          7: { cellWidth: 20, halign: 'right' }, 8: { cellWidth: 22, halign: 'right' },
        },
        bodyStyles: { fontSize: 6.5, cellPadding: 2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: MG, right: MG },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // §5 Sensitivity
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('5. Sensitivity Analysis', MG, y); y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Parameter', 'Low', 'Base', 'High', 'Range']],
        body: result.sensitivity.map(r => {
          const f = (n: number) => r.unit === '£M' ? fmtM(n) : `${swMoney(n, 0)}`;
          return [r.parameter, f(r.low), f(r.base), f(r.high), f(r.high - r.low)];
        }),
        headStyles: th,
        columnStyles: {
          0: { cellWidth: 76 }, 1: { cellWidth: 24, halign: 'right' }, 2: { cellWidth: 24, halign: 'right' },
          3: { cellWidth: 26, halign: 'right' }, 4: { cellWidth: 32, halign: 'right' },
        },
        bodyStyles: { fontSize: 7, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: MG, right: MG },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // §6 Benchmarks
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('6. Benchmark Comparison', MG, y); y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Vehicle / Programme', 'Total SW Cost', `${swCur().sym}/Vehicle`, 'Source']],
        body: result.benchmarks.map(b => [
          b.vehicle, b.totalM > 0 ? fmtM(b.totalM * 1_000_000) : fmtM(s.grandTotal),
          `${swMoney(b.perVehicle > 0 ? b.perVehicle : s.perVehicle, 0)}`, (b.vehicle === 'This programme' || b.verified ? '' : 'UNVERIFIED — ') + b.source,
        ]),
        headStyles: th,
        columnStyles: { 0: { cellWidth: 56 }, 1: { cellWidth: 30, halign: 'right' }, 2: { cellWidth: 22, halign: 'right' }, 3: { cellWidth: 74 } },
        bodyStyles: { fontSize: 6.5, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: MG, right: MG },
      });

      const totalPages = (doc as unknown as { internal: { pages: unknown[] } }).internal.pages.length - 1;
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`CostVision — Automotive Software Should-Cost  |  Confidential  |  Page ${p} of ${totalPages}`, W / 2, 290, { align: 'center' });
      }

      doc.save(exportFilename('sw-should-cost', null, 'pdf'));
    });
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

function loadConfig(id: string): void {
  const cfg = _savedConfigs.find(c => c.id === id);
  if (!cfg) return;
  _swInputs = JSON.parse(JSON.stringify(cfg.inputs));
  // A configuration saved before Oct 2026 names a retired hub ('EU', 'India' …) — map it to today's hub.
  _swInputs.region = normaliseSWRegion(String(_swInputs.region)) as SWRegion;
  delete _swInputs.rateLibrary;          // legacy configs may carry a snapshot — drop it
  void syncSWRateLibrary();              // apply the CURRENT active rate library
  // Stale result from a prior calculation no longer matches the loaded inputs;
  // clear it so exports/AI can't run against the wrong configuration.
  _swResult = null;
  // Re-render entire panel to reflect loaded inputs
  const panel = document.getElementById('sw-panel');
  if (panel?.parentElement) {
    panel.parentElement.innerHTML = renderSWPanelHTML();
    wireSWPanel();
  }
}

function deleteConfig(id: string): void {
  _savedConfigs = _savedConfigs.filter(c => c.id !== id);
  updateSavedConfigsUI();
  void projectStore.remove(SW_PROJECT_KIND, id).catch(() => { /* offline */ });
}

// Rec 7: side-by-side comparison of saved scenarios (plus the current inputs).
function compareConfigs(): void {
  const out = document.getElementById('sw-compare-out');
  if (!out) return;
  readConfig();

  const scenarios: { name: string; inputs: SWProgramInputs }[] = [
    { name: '● Current', inputs: _swInputs },
    // Saved configs carry no rate book: compare them on the same active book as "Current" (P1 #2).
    ...(_savedConfigs.map(c => ({ name: c.name, inputs: { ...c.inputs, rateLibrary: _swInputs.rateLibrary } }))),
  ];
  if (scenarios.length < 2) {
    out.innerHTML = `<div style="font-size:0.75rem;color:var(--sw-text-muted);font-style:italic">Save at least one configuration to compare it against the current inputs.</div>`;
    return;
  }

  const computed = scenarios.map(sc => {
    try { return { name: sc.name, r: computeSWProgram(sc.inputs) }; }
    catch { return null; }
  }).filter((x): x is { name: string; r: SWProgramResult } => x != null);

  // Best (lowest grandTotal) highlighted per the Total row.
  const minTotal = Math.min(...computed.map(c => c.r.summary.grandTotal));

  const head = `<th style="text-align:left">Metric</th>` +
    computed.map(c => `<th class="sw-num">${esc(c.name)}</th>`).join('');

  const rows: Array<[string, (c: { r: SWProgramResult }) => string, ((c: { r: SWProgramResult }) => boolean)?]> = [
    ['Total Programme', c => fmtM(c.r.summary.grandTotal), c => c.r.summary.grandTotal === minTotal],
    ['Per Vehicle',     c => `${swMoney(c.r.summary.perVehicle, 0)}`],
    ['Total NRE',       c => fmtM(c.r.summary.nreTotal)],
    ['Lifecycle',       c => fmtM(c.r.summary.totalMaintenance + c.r.summary.totalCloud + c.r.summary.totalLicensing)],
    ['MC P50',          c => fmtM(c.r.monteCarlo.p50)],
    ['MC P90',          c => fmtM(c.r.monteCarlo.p90)],
    ['Engineering hub', c => hubLabel(c.r.inputs.region)],
    ['Dev Source',      c => c.r.inputs.devSource.replace('_', ' ')],
    ['Active Modules',  c => `${c.r.modules.length}/${SW_MODULES.length}`],
  ];

  const bodyRows = rows.map(([label, fn, isBest]) => {
    const cells = computed.map(c => {
      const best = isBest?.(c) ?? false;
      return `<td class="sw-num"${best ? ' style="color:#059669;font-weight:700"' : ''}>${esc(fn(c))}${best ? ' ✓' : ''}</td>`;
    }).join('');
    return `<tr><td style="font-weight:600">${esc(label)}</td>${cells}</tr>`;
  }).join('');

  out.innerHTML = `
    <div style="font-size:0.78rem;font-weight:700;color:var(--sw-text-primary);margin-bottom:8px">Scenario Comparison <span style="font-weight:400;color:var(--sw-text-muted)">(✓ = lowest total)</span></div>
    <div style="overflow-x:auto">
      <table class="sw-data-table" style="font-size:0.78rem">
        <thead><tr>${head}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
}

function updateSavedConfigsUI(): void {
  const listEl = document.getElementById('sw-saved-list');
  if (!listEl) return;
  if (_savedConfigs.length === 0) {
    listEl.innerHTML = '<div style="font-size:0.75rem;color:var(--sw-text-muted);font-style:italic">No saved configurations yet.</div>';
    return;
  }
  listEl.innerHTML = _savedConfigs.map(c => `
    <div class="sw-saved-item" data-id="${esc(c.id)}">
      <span class="sw-saved-name">${esc(c.name)}</span>
      <span class="sw-saved-date">${esc(c.createdAt)}</span>
      <button class="sw-saved-load" data-id="${esc(c.id)}">Load</button>
      <button class="sw-saved-del" data-id="${esc(c.id)}">✕</button>
    </div>`).join('');
  // Re-wire the buttons
  listEl.querySelectorAll<HTMLButtonElement>('.sw-saved-load').forEach(btn => {
    btn.addEventListener('click', () => loadConfig(btn.dataset.id!));
  });
  listEl.querySelectorAll<HTMLButtonElement>('.sw-saved-del').forEach(btn => {
    btn.addEventListener('click', () => deleteConfig(btn.dataset.id!));
  });
}

// ─── Error display ────────────────────────────────────────────────────────────

function showSWError(msg: string): void {
  let errEl = document.getElementById('sw-calc-error');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id = 'sw-calc-error';
    errEl.style.cssText = 'background:color-mix(in srgb, var(--danger) 8%, var(--surface));border:1px solid color-mix(in srgb, var(--danger) 35%, transparent);border-radius:8px;padding:10px 16px;margin:8px 0;font-size:0.82rem;color:color-mix(in srgb, var(--danger) 80%, var(--text-primary));display:flex;align-items:center;gap:8px';
  }
  // Put it where the engineer is looking: the Advanced Calculate button, or the wizard's own body (code review F5 —
  // the wizard's errors went into the hidden Advanced section).
  const anchor = _swMode === 'guided' ? document.getElementById('sw-guided-body') : document.getElementById('sw-calc-btn');
  if (_swMode === 'guided') anchor?.prepend(errEl);
  else anchor?.parentElement?.insertBefore(errEl, anchor);
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
    if (t.closest('#sw-actuals-card, #sw-saved-configs, .sw-saved-configs')) return;
    if (t.closest('#swk-p-scope') && _swMode === 'guided') enterAdvancedKeepingEdits();
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
}

function renderCockpitStudio(result: SWProgramResult): void {
  const studioEl = document.getElementById('sw-studio');
  if (studioEl && !studioEl.querySelector('.swp-studio')) renderResults(result);
}

/** Scope edits are module-level, which the guided walkthrough does not hold: switch to full setup without overwriting
 *  the edit (the advanced fields are kept in sync with the wizard after every live run). */
function enterAdvancedKeepingEdits(): void {
  _swMode = 'advanced';
  const g = document.getElementById('sw-guided-body'), a = document.getElementById('sw-advanced-body');
  if (g) g.style.display = 'none';
  if (a) a.style.display = '';
  document.querySelectorAll<HTMLButtonElement>('.sw-mode-btn').forEach(b => b.classList.toggle('sw-mode-active', b.dataset.mode === 'advanced'));
}

function wireScopeBar(): void {
  const q = document.getElementById('swk-scope-q') as HTMLInputElement | null;
  const onlyOn = document.getElementById('swk-scope-on') as HTMLInputElement | null;
  const count = document.getElementById('swk-scope-count');
  const filter = () => {
    const term = (q?.value ?? '').trim().toLowerCase();
    let shown = 0, total = 0;
    document.querySelectorAll<HTMLElement>('#sw-modules-container .sw-module-row').forEach(row => {
      total++;
      const text = row.textContent?.toLowerCase() ?? '';
      const enabled = (row.querySelector('.sw-mod-enable') as HTMLInputElement | null)?.checked ?? false;
      const hit = (!term || text.includes(term)) && (!onlyOn?.checked || enabled);
      row.classList.toggle('swk-hit-none', !hit);
      if (hit) shown++;
    });
    document.querySelectorAll<HTMLElement>('#sw-modules-container .sw-cat-group').forEach(g => {
      const any = !!g.querySelector('.sw-module-row:not(.swk-hit-none)');
      g.style.display = any ? '' : 'none';
      if (term && any) g.classList.remove('sw-collapsed');
    });
    if (count) count.textContent = `${shown} of ${total} modules shown`;
  };
  q?.addEventListener('input', filter);
  onlyOn?.addEventListener('change', filter);
  document.getElementById('swk-bulk-apply')?.addEventListener('click', () => {
    const v = (id: string) => (document.getElementById(id) as HTMLSelectElement | null)?.value ?? '';
    const asil = v('swk-bulk-asil'), comp = v('swk-bulk-comp'), reuse = v('swk-bulk-reuse');
    if (!asil && !comp && !reuse) { if (count) count.textContent = 'Choose an ASIL, complexity or reuse to apply.'; return; }
    let n = 0;
    document.querySelectorAll<HTMLElement>('#sw-modules-container .sw-module-row:not(.swk-hit-none)').forEach(row => {
      if (asil) { const s2 = row.querySelector<HTMLSelectElement>('.sw-asil-sel'); if (s2) s2.value = asil; }
      if (comp) { const s2 = row.querySelector<HTMLSelectElement>('.sw-comp-sel'); if (s2) s2.value = comp; }
      if (reuse) { const s2 = row.querySelector<HTMLSelectElement>('.sw-reuse-sel'); if (s2) s2.value = reuse; }
      n++;
    });
    if (_swMode === 'guided') enterAdvancedKeepingEdits();
    if (count) count.textContent = `Applied to ${n} module${n === 1 ? '' : 's'}.`;
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
      if ((SW_BASE_RATE_FIELDS as readonly string[]).includes(t.id)) t.dataset.typed = '1';
    });
    // A new hub or senior share: the untyped rate field follows the hub's book rate; the hub note clears.
    swPanel.addEventListener('change', e => {
      const t = e.target as HTMLInputElement | HTMLSelectElement;
      if (t.id === 'sw-region' || t.id === 'wiz-region') {
        _swInputs.region = t.value as SWRegion;
        _swHubBasis = '';
        const basisEl = document.getElementById('sw-hub-basis');
        if (basisEl) basisEl.textContent = '';
        refreshRateFields();
      } else if (t.id === 'sw-senior-frac' || t.id === 'wiz-senior') {
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
    _swResult = null;
    const panel = document.getElementById('sw-panel');
    if (panel?.parentElement) { panel.parentElement.innerHTML = renderSWPanelHTML(); wireSWPanel(); runLive(false); }
  });
  // Mode toggle (Guided wizard ↔ Advanced expert panel) + wizard wiring
  document.querySelectorAll<HTMLButtonElement>('.sw-mode-btn').forEach(btn =>
    btn.addEventListener('click', () => setSWMode(btn.dataset.mode as 'guided' | 'advanced')));
  wireGuided();
  void renderSWRateAdmin();
  // The calibration card is wired AFTER Calculate (below) and cannot stop the panel if it fails (code review F1).

  queueMicrotask(() => {
    try {
      wireActuals(factor => {
        _swInputs.effortCalibration = factor;
        const f = document.getElementById('sw-effort-cal') as HTMLInputElement | null;
        if (f) f.value = String(factor);
      });
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
  document.querySelectorAll<HTMLButtonElement>('.sw-preset-btn:not(.sw-vehicle-btn):not(#sw-study-btn):not(#sw-bench-btn):not(#sw-deepdive-btn):not(#sw-allmodels-btn)').forEach(btn => {
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

  // PDF export
  document.getElementById('sw-pdf-btn')?.addEventListener('click', () => {
    if (_swResult) exportSWPDF(_swResult);
    else showSWError('Run the calculation first before exporting the PDF report.');
  });

  // Rec 10: Save config button
  document.getElementById('sw-save-config-btn')?.addEventListener('click', () => {
    readConfig();
    const name = prompt('Enter a name for this configuration:');
    if (name && name.trim()) {
      void saveConfig(name.trim());
    }
  });

  // Rec 7: Compare all saved scenarios side by side
  document.getElementById('sw-compare-btn')?.addEventListener('click', compareConfigs);

  // Rec 10: Load/delete saved config buttons
  document.querySelectorAll<HTMLButtonElement>('.sw-saved-load').forEach(btn => {
    btn.addEventListener('click', () => loadConfig(btn.dataset.id!));
  });
  document.querySelectorAll<HTMLButtonElement>('.sw-saved-del').forEach(btn => {
    btn.addEventListener('click', () => deleteConfig(btn.dataset.id!));
  });
}

function updateCatCounts(): void {
  document.querySelectorAll<HTMLElement>('.sw-cat-group').forEach(group => {
    const total   = group.querySelectorAll('.sw-mod-enable').length;
    const enabled = group.querySelectorAll<HTMLInputElement>('.sw-mod-enable:checked').length;
    const countEl = group.querySelector('.sw-cat-count');
    if (countEl) countEl.textContent = `${enabled}/${total} modules`;
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render the SW Should-Cost panel into containerEl, wire all events.
 * Call this from switchCommodity('automotive_software').
 */
let _swHubBasis = '';

/** An untyped engineer-rate field shows the hub's book rate at the current senior share. */
function refreshRateFields(): void {
  for (const id of SW_BASE_RATE_FIELDS) {
    const f = document.getElementById(id) as HTMLInputElement | null;
    if (f && f.dataset.typed !== '1') {
      const v = swLibraryBaseRate(_swInputs);
      f.value = Number.isFinite(v) ? String(Math.round(v)) : '';
    }
  }
}

/** Both hub pickers re-listed from the active book (a company book changes the rates the options show). */
function refreshHubPickers(): void {
  for (const id of ['sw-region', 'wiz-region']) {
    const sel = document.getElementById(id) as HTMLSelectElement | null;
    if (sel) sel.innerHTML = hubOptionsHTML(_swInputs.region, activeSWBook().lib, n => swMoney(n, 0), _swInputs.teamSeniorFraction);
  }
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
  for (const id of ['sw-region', 'wiz-region']) {
    const sel = document.getElementById(id) as HTMLSelectElement | null;
    if (sel) sel.value = _swInputs.region;
  }
  const basisEl = document.getElementById('sw-hub-basis');
  if (basisEl) basisEl.textContent = _swHubBasis;
  refreshRateFields();
}

export function initSWPanel(containerEl: HTMLElement): void {
  _swInputs = defaultSWProgramInputs();
  // The engineering hub follows the selected manufacturing country (nearest hub, stated).
  setSWCountry((document.getElementById('mfg-region-selector') as HTMLSelectElement | null)?.value ?? 'UK');
  _swResult = null;
  containerEl.innerHTML = renderSWPanelHTML();
  wireSWPanel();
  // The cockpit opens with the default programme already costed (deterministic, milliseconds).
  runLive(false);
  // Load saved configs asynchronously (server or localStorage), then refresh the
  // list in place — the panel renders immediately without waiting on the network.
  void loadSavedConfigs().then(updateSavedConfigsUI).catch(() => { /* non-fatal */ });
  // Apply the organisation's active SW rates (if an admin has uploaded them).
  void syncSWRateLibrary();
}
