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
  SWProgramInputs, SWProgramResult, SWModuleInput,
} from '../../engine/sw-should-cost.js';
import {
  computeSWProgram, defaultSWProgramInputs, SW_MODULES,
} from '../../engine/sw-should-cost.js';
import { DEFAULT_SW_RATE_LIBRARY } from '../../engine/sw-rate-library.js';
import type { SWRateEntry, RateConfidence } from '../../engine/sw-rate-library.js';
import { runValidation } from '../../engine/sw-validation.js';
import { buildWorkbook, downloadWorkbook } from '../../export/xlsx-util.js';
import { projectStore } from '../project-store.js';

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
      <span style="font-weight:700;font-size:0.78rem;color:var(--sw-text-primary)">🏭 Company SW Rates</span> ${badge}
      ${st.hasCompany ? '' : '<span style="font-size:0.68rem;color:var(--sw-text-muted)"> · none uploaded</span>'}${admin}</div>`;

  if (!st.isAdmin) return;
  const msg = (t: string, ok = true) => { const m = document.getElementById('swra-msg'); if (m) { m.textContent = t; m.style.color = ok ? '#059669' : '#dc2626'; } };
  const refresh = async () => { await syncSWRateLibrary(); await renderSWRateAdmin(); };

  document.getElementById('swra-template')?.addEventListener('click', async () => {
    const res = await fetch('/api/rate-library/sw/template', { headers: swAuthHeader() });
    if (!res.ok) { msg('Admin only.', false); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob());
    a.download = 'CostVision-SW-Rate-Template.xlsx'; a.click();
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

function fmtM(n: number): string {
  return `£${fmt(n / 1_000_000, 1)}M`;
}

// ─── ASIL helpers ─────────────────────────────────────────────────────────────

const ASIL_RANK: Record<ASILLevel, number> = { QM: 0, A: 1, B: 2, C: 3, D: 4 };

function asilColor(asil: ASILLevel): string {
  return { QM: '#64748b', A: '#10b981', B: '#f59e0b', C: '#f97316', D: '#ef4444' }[asil];
}

function asilBadge(asil: ASILLevel): string {
  const c = asilColor(asil);
  return `<span style="background:${c}22;color:${c};border:1px solid ${c}55;border-radius:4px;padding:1px 6px;font-size:0.7rem;font-weight:700;font-family:monospace">${esc(asil)}</span>`;
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CAT_META: Record<string, { label: string; icon: string; color: string }> = {
  A: { label: 'EV Powertrain & Battery',    icon: '⚡', color: '#22c55e' },
  B: { label: 'ADAS L2/L2+',               icon: '🎯', color: '#3b82f6' },
  C: { label: 'Infotainment & UX',          icon: '🎨', color: '#8b5cf6' },
  D: { label: 'Vehicle Domain Controllers', icon: '🔧', color: '#f59e0b' },
  E: { label: 'Middleware & Platform',      icon: '⚙️', color: '#06b6d4' },
  F: { label: 'Cybersecurity (ISO 21434)',  icon: '🔒', color: '#ef4444' },
  G: { label: 'OTA & Cloud Backend',        icon: '☁️', color: '#a78bfa' },
};

// ─── Render panel HTML ────────────────────────────────────────────────────────

// Rec #1: Rate library provenance — every rate shown with its source, date and
// confidence so the model is defensible, not a black box of constants.
function renderRateLibraryHTML(): string {
  const lib = DEFAULT_SW_RATE_LIBRARY;
  const confColor = (c: RateConfidence) => c === 'High' ? '#059669' : c === 'Medium' ? '#d97706' : '#dc2626';
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

  return `
  <details class="sw-config-card" style="background:var(--sw-surface-alt);border:1px solid var(--sw-border);border-radius:10px;padding:0;margin-bottom:14px">
    <summary style="cursor:pointer;padding:12px 18px;font-weight:700;font-size:0.82rem;color:var(--sw-text-primary);display:flex;align-items:center;gap:8px;list-style:none">
      <span>📚 Rate Library &amp; Provenance</span>
      <span style="font-size:0.68rem;font-weight:600;color:#fff;background:#2563eb;border-radius:4px;padding:1px 7px">v${esc(lib.version)}</span>
      <span style="font-size:0.7rem;font-weight:400;color:var(--sw-text-muted)">reviewed ${esc(lib.lastReviewed)} · every rate sourced &amp; overridable</span>
    </summary>
    <div style="padding:0 18px 16px;overflow-x:auto">
      <div id="sw-rate-admin" style="margin-bottom:12px"></div>
      <table class="sw-data-table" style="font-size:0.76rem">
        <thead><tr><th>Rate</th><th class="sw-num">Value</th><th>Confidence / As-of</th><th>Source</th></tr></thead>
        <tbody>
          ${rows('Labour base (£/person-month, pre-overhead)', [['UK senior-blended base', lib.ukBaseRatePerPM]])}
          ${rows('Regional multipliers', ent(lib.regionMultipliers))}
          ${rows('Development source multipliers', ent(lib.devSourceMultipliers))}
          ${rows('ASIL development multipliers (ISO 26262)', ent(lib.asilDevMultipliers))}
          ${rows('ASIL test/verification multipliers', ent(lib.asilTestMultipliers))}
          ${rows('Complexity multipliers', ent(lib.complexityMultipliers))}
          ${rows('Reuse factors', ent(lib.reuseFactors))}
        </tbody>
      </table>
      <p style="font-size:0.7rem;color:var(--sw-text-muted);margin-top:8px">Override the UK base rate in Programme Configuration above. Confidence reflects how well-anchored each figure is to a published or surveyed source — not all rates are equal; treat <span style="color:#dc2626;font-weight:600">Low</span> figures as directional.</p>
    </div>
  </details>`;
}

// Rec #2: model validation — publish the back-test variance vs published
// programmes so the model states its own error instead of presenting a number
// as truth. See docs/sw-cost-validation.md.
function renderValidationHTML(): string {
  const rep = runValidation();
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
      <span>🔬 Model Validation</span>
      <span style="font-size:0.68rem;font-weight:700;color:#fff;background:${rep.mapeTotal < 25 ? '#059669' : '#d97706'};border-radius:4px;padding:1px 7px">Total MAPE ${rep.mapeTotal.toFixed(0)}%</span>
      <span style="font-size:0.7rem;font-weight:400;color:var(--sw-text-muted)">${rep.withinBandCount}/${rep.caseCount} within ±${rep.band}% vs published programmes</span>
    </summary>
    <div style="padding:0 18px 16px;overflow-x:auto">
      <table class="sw-data-table" style="font-size:0.76rem">
        <thead><tr><th>Programme</th><th class="sw-num">Published</th><th class="sw-num">Modelled</th><th class="sw-num">Variance</th><th>Source</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:0.7rem;color:var(--sw-text-muted);margin-top:8px">
        Back-test of total SW investment against 7 premium-EV programmes (each run with that programme's region, dev source, volume and life).
        Published figures are third-party <strong>estimates</strong>, not audited actuals — this is envelope validation, not point-accuracy proof.
        <strong style="color:#dc2626">Known gap:</strong> per-vehicle figures validate poorly (model amortises NRE over full lifetime vs the industry's ~2-year recovery window) — see docs/sw-cost-validation.md.
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
      <span>💾 Saved Configurations</span>
      <div style="display:flex;gap:6px">
        <button id="sw-compare-btn" style="font-size:0.72rem;padding:4px 12px;border-radius:5px;border:1px solid var(--sw-border);background:var(--sw-surface);color:var(--sw-text-body);cursor:pointer" title="Compute and compare all saved configurations side by side">⚖ Compare All</button>
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

let _swMode: 'guided' | 'advanced' = 'guided';
let _wizStep = 1;
let _wizDomains: Record<SWCat, boolean> = { A: true, B: true, C: true, D: true, E: true, F: true, G: true };
let _wizCfg: Record<SWCat, GuidedDomainCfg> =
  Object.fromEntries(ALL_CATS.map(c => [c, { complexity: 'default', reuse: 'Medium', asil: 'default' }])) as Record<SWCat, GuidedDomainCfg>;
let _programPhase: 'Concept' | 'Development' | 'SOP' | 'Facelift' = 'Development';

/** Map the guided selections onto the full module set in _swInputs. */
function applyGuidedToInputs(): void {
  for (const m of _swInputs.modules) {
    const def = SW_MODULES.find(d => d.id === m.moduleId)!;
    const cat = def.category as SWCat;
    m.enabled = _wizDomains[cat];
    const g = _wizCfg[cat];
    m.complexity = g.complexity === 'default' ? def.defaultComplexity : g.complexity;
    m.asil       = g.asil === 'default' ? def.defaultAsil : g.asil;
    m.reuse      = g.reuse;
  }
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
    const regionOpts = (['UK','EU','USA_Detroit','USA_SV','China','India','Mexico','Eastern_Europe','Japan'] as const)
      .map(r => `<option value="${r}" ${inp.region === r ? 'selected' : ''}>${r.replace('_',' ')}</option>`).join('');
    const phaseOpts = (['Concept','Development','SOP','Facelift'] as const)
      .map(p => `<option value="${p}" ${_programPhase === p ? 'selected' : ''}>${p}</option>`).join('');
    return `
      <div class="sw-wiz-h">Step 1 — Vehicle &amp; Programme Context</div>
      <p class="sw-wiz-help">Tell us about the programme. These set the baseline rates and how the one-time engineering cost is spread across vehicles.</p>
      <div class="sw-grid sw-grid-2" style="gap:16px">
        <div class="sw-field-group"><label class="sw-label">Development region ${tip('Where your engineers are based — sets the labour rate. Silicon Valley is ~9× India.')}</label>
          <select id="wiz-region" class="sw-config-sel">${regionOpts}</select></div>
        <div class="sw-field-group"><label class="sw-label">Programme phase ${tip('Concept/Development/SOP/Facelift — informational; facelift programmes usually reuse more software.')}</label>
          <select id="wiz-phase" class="sw-config-sel">${phaseOpts}</select></div>
        <div class="sw-field-group"><label class="sw-label">Annual production volume ${tip('Vehicles per year. Higher volume spreads the software investment over more cars.')}</label>
          <input id="wiz-vol" type="number" class="sw-config-inp" min="1000" max="500000" step="1000" value="${inp.annualProductionVolume}"></div>
        <div class="sw-field-group"><label class="sw-label">Programme life (years) ${tip('How long the software is developed and maintained — typically 5–10 years.')}</label>
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
        <div class="sw-field-group"><label class="sw-label">Overhead multiplier ${tip('Office, IT, management on top of bare salary. 1.6 is typical.')}</label>
          <input id="wiz-overhead" type="number" class="sw-config-inp" min="1" max="3" step="0.05" value="${inp.overheadMultiplier}"></div>
        <div class="sw-field-group"><label class="sw-label">Senior engineer fraction ${tip('Share of the team that are senior (more expensive, more productive).')}</label>
          <input id="wiz-senior" type="number" class="sw-config-inp" min="0" max="1" step="0.05" value="${inp.teamSeniorFraction}"></div>
        <div class="sw-field-group"><label class="sw-label">UK base rate £/PM ${tip('UK senior-blended rate per person-month before overhead. All regions scale from this.')}</label>
          <input id="wiz-baserate" type="number" class="sw-config-inp" min="5000" max="120000" step="500" value="${inp.baseRateGBP ?? DEFAULT_SW_RATE_LIBRARY.ukBaseRatePerPM.value}"></div>
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
    const br = parseFloat((g('wiz-baserate') as HTMLInputElement)?.value); if (!isNaN(br) && br > 0) _swInputs.baseRateGBP = br;
  }
}

function wizCompute(): void {
  applyGuidedToInputs();
  _swResult = computeSWProgram(_swInputs);
}

function renderWizCost(): void {
  wizCompute();
  const s = _swResult!.summary;
  const sumEl = document.getElementById('wiz-cost-summary');
  if (sumEl) sumEl.innerHTML = [
    { l: 'Total Programme', v: fmtM(s.grandTotal), c: '#2563eb' },
    { l: 'Per Vehicle',     v: `£${fmt(s.perVehicle, 0)}`, c: '#059669' },
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
  const reg  = _swResult.sensitivity.find(x => x.parameter.includes('Region'));
  const asil = _swResult.sensitivity.find(x => x.parameter.includes('ASIL'));
  const row = (label: string, r?: { low: number; high: number }) =>
    r ? `<div class="sw-box" style="font-size:0.78rem"><strong>${esc(label)}:</strong> ${fmtM(r.low)} → ${fmtM(r.high)}</div>` : '';
  el.innerHTML = `<div class="sw-grid sw-grid-2" style="gap:10px">${row('Region swing (India ↔ USA SV)', reg)}${row('ASIL swing (B ↔ D)', asil)}</div>`;
}

function renderWizReport(): void {
  wizCompute();
  renderResults(_swResult!);
  const res = document.getElementById('sw-results');
  if (res) res.style.display = '';
  const note = document.getElementById('wiz-report-note');
  if (note) note.innerHTML = `<div class="sw-box" style="font-size:0.78rem;line-height:1.6"><strong>Key assumptions:</strong> ${selectedCats().length}/7 domains · ${esc(_swInputs.region.replace('_', ' '))} · ${_programPhase} phase · ${_swInputs.programLifeYears} yr · ${fmt(_swInputs.annualProductionVolume / 1000, 0)}k vehicles/yr · overhead ×${_swInputs.overheadMultiplier}. Rates from library v${esc(DEFAULT_SW_RATE_LIBRARY.version)}. Per-vehicle is amortised over full lifetime volume — see the Model Validation panel for the recovery-window caveat.</div>`;
}

function goToWizStep(n: number): void {
  _wizStep = Math.min(WIZARD_STEPS.length, Math.max(1, n));
  const body = document.getElementById('sw-guided-body');
  if (body) { body.innerHTML = renderGuidedWizardHTML(); wireGuided(); }
  if (_wizStep === 4) renderWizCost();
  if (_wizStep === 5) renderWizSensitivity();
  if (_wizStep === 6) renderWizReport();
  body?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function setSWMode(mode: 'guided' | 'advanced'): void {
  _swMode = mode;
  const g = document.getElementById('sw-guided-body');
  const a = document.getElementById('sw-advanced-body');
  if (g) g.style.display = mode === 'guided' ? '' : 'none';
  if (a) a.style.display = mode === 'advanced' ? '' : 'none';
  document.querySelectorAll<HTMLButtonElement>('.sw-mode-btn').forEach(b =>
    b.classList.toggle('sw-mode-active', b.dataset.mode === mode));
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
      const tags: string[] = [];
      if (def.hasMLContent) tags.push('<span class="sw-tag sw-tag-ml">ML</span>');
      if (def.hasCloudDependency) tags.push('<span class="sw-tag sw-tag-cloud">Cloud</span>');
      if (def.hasCybersecRequirement) tags.push('<span class="sw-tag sw-tag-sec">SecOps</span>');
      // Rec 8: ASIL downgrade warning — always render the span so the live
      // change handler can toggle it; hide it when not currently downgraded.
      const isDowngrade = ASIL_RANK[inp.asil] < ASIL_RANK[def.defaultAsil];
      const asilWarn = `<span class="sw-asil-warn" style="${isDowngrade ? '' : 'display:none'}" title="⚠️ ASIL set below module default (${def.defaultAsil}). Verify safety case.">⚠️</span>`;
      return `
      <tr class="sw-module-row" data-module-id="${def.id}">
        <td class="sw-mod-check"><input type="checkbox" class="sw-mod-enable" data-id="${def.id}" ${inp.enabled ? 'checked' : ''}></td>
        <td class="sw-mod-name">
          <div style="font-weight:600;font-size:0.82rem;color:var(--sw-text-primary)">${esc(def.shortName)}</div>
          <div style="font-size:0.7rem;color:var(--sw-text-muted);margin-top:1px">${esc(def.basePersonMonths)} PM base · ${tags.join(' ')}</div>
        </td>
        <td class="sw-mod-desc" title="${esc(def.description)}" style="font-size:0.72rem;color:var(--sw-text-secondary);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(def.description)}</td>
        <td><select class="sw-sel sw-asil-sel" data-id="${def.id}">${asilOpts}</select>${asilWarn}</td>
        <td><select class="sw-sel sw-comp-sel" data-id="${def.id}">${compOpts}</select></td>
        <td><select class="sw-sel sw-reuse-sel" data-id="${def.id}">${reuseOpts}</select></td>
        <td><input type="number" class="sw-pm-input" data-id="${def.id}" placeholder="auto" value="${inp.customPersonMonths ?? ''}" min="0" step="1" style="width:60px"></td>
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
              <th style="width:70px">Custom PM</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  const regionOpts = ([
    ['UK','UK (London / Coventry)'],['EU','EU (Germany / Czech)'],['USA_Detroit','USA (Detroit)'],
    ['USA_SV','USA (Silicon Valley)'],['China','China (Shanghai / Shenzhen)'],
    ['India','India (Bangalore / Pune)'],['Mexico','Mexico (Juárez / Guadalajara)'],
    ['Eastern_Europe','Eastern Europe (Romania / Poland)'],['Japan','Japan (Tokyo / Nagoya)'],
  ] as [SWRegion, string][]).map(([v,l]) =>
    `<option value="${v}" ${inputs.region === v ? 'selected' : ''}>${esc(l)}</option>`).join('');

  const sourceOpts = ([
    ['OEM_Internal','OEM Internal Teams'],['Tier1_Supplier','Tier 1 Supplier'],['Startup_OSS','Startup / OSS'],
  ] as [DevSource, string][]).map(([v,l]) =>
    `<option value="${v}" ${inputs.devSource === v ? 'selected' : ''}>${esc(l)}</option>`).join('');

  return `
<div id="sw-panel" style="padding:12px 0">

  <!-- ── Header ───────────────────────────────────────────────── -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#1e4a8a 100%);border-radius:12px;padding:24px 28px;margin-bottom:20px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 80% 50%,rgba(59,130,246,0.18) 0%,transparent 70%);pointer-events:none"></div>
    <div style="position:relative">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <span style="font-size:2rem">🚗</span>
        <div>
          <h2 style="margin:0;font-size:1.35rem;font-weight:800;color:#fff;letter-spacing:-0.3px">Automotive Software Should-Cost</h2>
          <div style="font-size:0.78rem;color:#94a3b8;margin-top:2px">Premium Luxury SUV — Full SW Stack · ${SW_MODULES.length} Modules · 7 Categories · ISO 26262 / ISO 21434</div>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
        <span style="background:rgba(59,130,246,0.25);color:#93c5fd;border:1px solid rgba(59,130,246,0.4);border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:600">ASIL QM→D</span>
        <span style="background:rgba(34,197,94,0.2);color:#86efac;border:1px solid rgba(34,197,94,0.35);border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:600">10 Cost Dimensions</span>
        <span style="background:rgba(168,85,247,0.2);color:#d8b4fe;border:1px solid rgba(168,85,247,0.35);border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:600">Monte Carlo P10/P50/P90</span>
        <span style="background:rgba(245,158,11,0.2);color:#fcd34d;border:1px solid rgba(245,158,11,0.35);border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:600">Phase Timeline</span>
      </div>
    </div>
  </div>

  <!-- ── Mode toggle: Guided wizard (default) vs Advanced panel ── -->
  <div class="sw-mode-toggle">
    <button class="sw-mode-btn ${_swMode === 'guided' ? 'sw-mode-active' : ''}" data-mode="guided">🧭 Guided</button>
    <button class="sw-mode-btn ${_swMode === 'advanced' ? 'sw-mode-active' : ''}" data-mode="advanced">⚙️ Advanced</button>
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
      <span>⚙️</span> Programme Configuration
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">
      <div class="sw-field-group">
        <label class="sw-label">Development Region</label>
        <select id="sw-region" class="sw-config-sel">${regionOpts}</select>
      </div>
      <div class="sw-field-group">
        <label class="sw-label">Development Source</label>
        <select id="sw-dev-source" class="sw-config-sel">${sourceOpts}</select>
      </div>
      <div class="sw-field-group">
        <label class="sw-label">Programme Life (years)</label>
        <input id="sw-prog-life" type="number" class="sw-config-inp" min="5" max="20" step="1" value="${inputs.programLifeYears}">
      </div>
      <div class="sw-field-group">
        <label class="sw-label">Annual Production Volume</label>
        <input id="sw-vol" type="number" class="sw-config-inp" min="1000" max="500000" step="1000" value="${inputs.annualProductionVolume}">
      </div>
      <div class="sw-field-group">
        <label class="sw-label">Overhead Multiplier</label>
        <input id="sw-overhead" type="number" class="sw-config-inp" min="1.0" max="3.0" step="0.05" value="${inputs.overheadMultiplier}">
      </div>
      <div class="sw-field-group">
        <label class="sw-label">Senior Engineer Fraction</label>
        <input id="sw-senior-frac" type="number" class="sw-config-inp" min="0" max="1" step="0.05" value="${inputs.teamSeniorFraction}" title="Fraction of team that are senior engineers (0.0–1.0).">
      </div>
      <div class="sw-field-group">
        <label class="sw-label">UK Base Rate (£/PM)</label>
        <input id="sw-base-rate" type="number" class="sw-config-inp" min="5000" max="120000" step="500" value="${inputs.baseRateGBP ?? DEFAULT_SW_RATE_LIBRARY.ukBaseRatePerPM.value}" title="UK senior-blended bare rate per person-month, before overhead. All regional rates are relative to this. Override to match your engagement's rate library.">
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

  <!-- ── Rate Library & Provenance (Rec #1) ────────────────────── -->
  ${renderRateLibraryHTML()}

  <!-- ── Model Validation (Rec #2) ─────────────────────────────── -->
  ${renderValidationHTML()}

  <!-- ── Quick-set presets ─────────────────────────────────────── -->
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center">
    <span style="font-size:0.78rem;color:var(--sw-text-muted);font-weight:600">Quick Set:</span>
    <button class="sw-preset-btn" data-preset="aggressive">🚀 Aggressive (Low ASIL, High Reuse)</button>
    <button class="sw-preset-btn" data-preset="baseline">📊 Industry Baseline</button>
    <button class="sw-preset-btn" data-preset="premium">👑 Premium OEM (High ASIL, Fresh)</button>
    <button class="sw-preset-btn" data-preset="offshored">🌏 Offshored (India Team)</button>
  </div>

  <!-- ── Vehicle programme demos ────────────────────────────────── -->
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center">
    <span style="font-size:0.78rem;color:var(--sw-text-muted);font-weight:600">Demo Programmes:</span>
    ${SW_VEHICLE_DEMOS.map(v => `<button class="sw-preset-btn sw-vehicle-btn" data-vehicle="${v.id}" title="${esc(v.desc)}">${v.label}</button>`).join('')}
    <button class="sw-preset-btn" id="sw-study-btn" title="Open the apple-to-apple powertrain cost study — 5 cars × 4 drivetrains" style="border-color:rgba(180,120,20,0.4);color:var(--gold,#B67D1E);font-weight:700">📊 Powertrain Cost Study</button>
    <button class="sw-preset-btn" id="sw-bench-btn" title="Range Rover L460 competitive benchmark — vs BMW X7 / Audi Q8 / Mercedes GLS / Porsche Cayenne, real drivetrains only" style="border-color:rgba(30,64,52,0.45);color:#1E4034;font-weight:700">🟢 L460 Competitive Benchmark</button>
  </div>
  ${(() => {
    const active = _swActiveVehicle ? SW_VEHICLE_DEMOS.find(d => d.id === _swActiveVehicle) : null;
    if (!active?.reportUrl) return '';
    return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:-6px 0 16px;padding:10px 14px;border-radius:8px;border:1px solid rgba(29,78,216,0.30);background:linear-gradient(135deg,rgba(37,99,235,0.10),rgba(37,99,235,0.04))">
      <span style="font-size:1.05rem">📄</span>
      <span style="flex:1;min-width:180px;font-size:0.78rem;font-weight:600;color:var(--sw-text-primary)">Detailed board-level breakdown available for ${esc(active.label)} — every parameter, all ${SW_MODULES.length} modules.</span>
      <button type="button" id="sw-demo-report-btn" data-report-url="${esc(active.reportUrl)}" style="display:flex;align-items:center;gap:6px;font-size:0.76rem;font-weight:700;padding:7px 15px;background:linear-gradient(135deg,#1d4ed8,#2563eb);border:none;border-radius:7px;cursor:pointer;color:#fff;box-shadow:0 3px 10px rgba(37,99,235,0.30);transition:transform 0.15s" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='none'">
        View full report →
      </button>
    </div>`;
  })()}

  <!-- ── Module Configuration ─────────────────────────────────── -->
  <div style="font-weight:700;font-size:0.88rem;color:var(--sw-text-primary);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
    <span style="display:flex;align-items:center;gap:6px"><span>📋</span> Module Configuration (${SW_MODULES.length} modules)</span>
    <div style="display:flex;gap:8px">
      <button id="sw-select-all" style="font-size:0.72rem;padding:3px 10px;border-radius:4px;border:1px solid var(--sw-border);background:var(--sw-surface);color:var(--sw-text-body);cursor:pointer">Select All</button>
      <button id="sw-deselect-all" style="font-size:0.72rem;padding:3px 10px;border-radius:4px;border:1px solid var(--sw-border);background:var(--sw-surface);color:var(--sw-text-body);cursor:pointer">Deselect All</button>
    </div>
  </div>

  <div id="sw-modules-container">${moduleRowsHTML}</div>

  <!-- ── Calculate button ─────────────────────────────────────── -->
  <div style="margin:20px 0;text-align:center">
    <button id="sw-calc-btn" style="background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border:none;border-radius:10px;padding:14px 48px;font-size:1rem;font-weight:700;cursor:pointer;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(37,99,235,0.35);transition:all 0.2s">
      ⚡ Calculate Software Should-Cost
    </button>
  </div>

  </div><!-- /sw-advanced-body -->

  <!-- ── Results (shared by both modes; hidden until calculated) ─ -->
  <div id="sw-results" style="display:none">

    <!-- Summary cards -->
    <div id="sw-summary-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px"></div>

    <!-- Monte Carlo distribution (Rec 2) -->
    <div class="sw-results-section" id="sw-monte-carlo"></div>

    <!-- Programme phases (Rec 3) -->
    <div class="sw-results-section" id="sw-phases"></div>

    <!-- Category breakdown -->
    <div class="sw-results-section" id="sw-cat-breakdown"></div>

    <!-- Cost composition (inc. Calibration — Rec 7) -->
    <div class="sw-results-section" id="sw-cost-composition"></div>

    <!-- Module detail table (Rec 8: ASIL validation) -->
    <div class="sw-results-section" id="sw-module-table"></div>

    <!-- Sensitivity analysis -->
    <div class="sw-results-section" id="sw-sensitivity"></div>

    <!-- Benchmark comparison -->
    <div class="sw-results-section" id="sw-benchmarks"></div>

    <!-- OEM / Tier1 / Startup decomposition (Rec 4) -->
    <div class="sw-results-section" id="sw-source-decomp"></div>

    <!-- AI Analysis (Rec 5) -->
    <div class="sw-results-section" id="sw-ai-analysis">
      <div class="sw-section-title"><span>🤖</span> AI Analysis</div>
      <div style="text-align:center;padding:12px 0">
        <button id="sw-ai-btn" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:0.85rem;font-weight:600;cursor:pointer">
          ✨ Generate AI Narrative Insights
        </button>
        <div style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:6px">Uses AI to provide executive summary and cost reduction opportunities</div>
      </div>
      <div id="sw-ai-content" style="display:none"></div>
    </div>

    <!-- Engineering Insights -->
    <div class="sw-results-section" id="sw-insights"></div>

    <!-- Export -->
    <div style="text-align:center;margin:20px 0;display:flex;justify-content:center;gap:10px;flex-wrap:wrap">
      <button id="sw-excel-btn" style="background:#059669;color:#fff;border:none;border-radius:8px;padding:11px 28px;font-size:0.88rem;font-weight:600;cursor:pointer">
        📊 Export Excel (6 sheets)
      </button>
      <button id="sw-pdf-btn" style="background:#0f172a;color:#fff;border:none;border-radius:8px;padding:11px 28px;font-size:0.88rem;font-weight:600;cursor:pointer">
        📄 Export PDF Report
      </button>
    </div>
  </div>

</div>

<style>
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
}
@media (prefers-color-scheme: dark) {
  :root {
    --sw-surface:      #1e293b;
    --sw-surface-alt:  #0f172a;
    --sw-border:       #334155;
    --sw-border-light: #1e293b;
    --sw-text-primary: #f1f5f9;
    --sw-text-body:    #cbd5e1;
    --sw-text-secondary: #94a3b8;
    --sw-text-muted:   #64748b;
    --sw-accent:       #3b82f6;
    --sw-accent-bg:    #1e3a5f;
    --sw-accent-border:#1d4ed8;
  }
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
.sw-tag-ml    { background: #7c3aed22; color: #7c3aed; border: 1px solid #7c3aed44; }
.sw-tag-cloud { background: #0891b222; color: #0891b2; border: 1px solid #0891b244; }
.sw-tag-sec   { background: #dc262622; color: #dc2626; border: 1px solid #dc262644; }

.sw-preset-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--sw-border);
  background: var(--sw-surface);
  color: var(--sw-text-body);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
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
.sw-num { text-align: right; font-variant-numeric: tabular-nums; font-family: monospace; }
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
.sw-saved-del:hover { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }

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
.sw-summary-card:hover { box-shadow: var(--sw-shadow); transform: translateY(-1px); }

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
.sw-mode-btn { border: none; background: transparent; color: var(--sw-text-muted); font-size: 0.8rem; font-weight: 600; padding: 6px 16px; border-radius: 6px; cursor: pointer; transition: all 0.15s; }
.sw-mode-btn:hover { color: var(--sw-text-body); }
.sw-mode-active { background: var(--sw-surface); color: var(--sw-accent) !important; box-shadow: var(--sw-shadow-sm); }

.sw-wiz-progress { display: flex; align-items: center; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px; }
.sw-wiz-dot { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
.sw-wiz-num { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700; border: 2px solid var(--sw-border); color: var(--sw-text-muted); background: var(--sw-surface); transition: all 0.25s; }
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
.sw-wiz-btn-primary { background: linear-gradient(135deg,#1d4ed8,#2563eb); color: #fff; border: none; border-radius: 8px; padding: 9px 26px; font-size: 0.85rem; font-weight: 700; cursor: pointer; box-shadow: var(--sw-shadow-sm); transition: transform 0.15s, box-shadow 0.15s; }
.sw-wiz-btn-primary:hover { transform: translateY(-1px); box-shadow: var(--sw-shadow); }
.sw-wiz-btn-ghost { background: transparent; color: var(--sw-text-body); border: 1px solid var(--sw-border); border-radius: 8px; padding: 9px 20px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.sw-wiz-btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }

.sw-domain-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.sw-domain-card { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--sw-border); border-radius: var(--sw-radius); background: var(--sw-surface); cursor: pointer; transition: all 0.15s; }
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
  const life       = parseInt((get('sw-prog-life') as HTMLInputElement)?.value) || 10;
  const vol        = parseInt((get('sw-vol') as HTMLInputElement)?.value) || 80_000;
  const overhead   = parseFloat((get('sw-overhead') as HTMLInputElement)?.value) || 1.60;
  const seniorFrac = parseFloat((get('sw-senior-frac') as HTMLInputElement)?.value) ?? 0.50;
  const baseRate   = parseFloat((get('sw-base-rate') as HTMLInputElement)?.value);
  const maint      = (get('sw-inc-maint') as HTMLInputElement)?.checked ?? true;
  const cloud      = (get('sw-inc-cloud') as HTMLInputElement)?.checked ?? true;

  _swInputs.region                 = region;
  _swInputs.devSource              = devSrc;
  _swInputs.programLifeYears       = Math.max(1, life);
  _swInputs.annualProductionVolume = Math.max(1, vol);
  _swInputs.overheadMultiplier     = Math.max(1, overhead);
  _swInputs.teamSeniorFraction     = Math.min(1, Math.max(0, isNaN(seniorFrac) ? 0.50 : seniorFrac));
  _swInputs.baseRateGBP            = isNaN(baseRate) || baseRate <= 0 ? DEFAULT_SW_RATE_LIBRARY.ukBaseRatePerPM.value : baseRate;
  _swInputs.includeMaintenanceCost = maint;
  _swInputs.includeCloudCost       = cloud;

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
  document.querySelectorAll<HTMLInputElement>('.sw-pm-input').forEach(inp => {
    const m = _swInputs.modules.find(x => x.moduleId === inp.dataset.id);
    if (!m) return;
    const v = parseInt(inp.value);
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
  /** Category-A powertrain modules to DISABLE (not applicable to this drivetrain). */
  disabledModules: string[];
  /** Optional per-module tweaks (complexity/asil) for signature systems. */
  moduleOverrides?: Record<string, Partial<Pick<SWModuleInput, 'asil' | 'complexity' | 'reuse'>>>;
  /** Optional path to a detailed, board-level cost-breakdown report for this programme. */
  reportUrl?: string;
}

// 48V mild-hybrid: no BEV-scale HV powertrain SW — keep only 48V regen + light
// thermal; disable the BEV battery/charge/drive modules.
const MHEV_DISABLED = ['bms_core', 'cell_balancing', 'soc_soh_soe', 'fast_charge', 'edu_control', 'inverter_ctrl', 'motor_ctrl'];

export const SW_VEHICLE_DEMOS: SWVehicleDemo[] = [
  {
    id: 'rr_l460', label: '🇬🇧 Range Rover L460 (PHEV)',
    desc: 'JLR flagship, EVA2 (MLA) architecture, Pivi Pro infotainment. Heavy Tier-1 outsourcing; PHEV P550e keeps a (smaller) EV powertrain stack. Premium software: Dynamic Response Pro (48V active anti-roll) + rear-axle steer, Meridian 3D audio, park assist + 3D surround, cabin-air purification, digital key, HUD. Published ≈ £390M (core stack).',
    region: 'UK', devSource: 'Tier1_Supplier', volume: 75_000, life: 8, overhead: 1.55, senior: 0.55, reuse: 'Medium',
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
    id: 'bmw_x7', label: '🇩🇪 BMW X7 (48V MHEV)',
    desc: 'G07 flagship SUV, CLAR platform, iDrive 8 (BMW OS 8). ICE + 48V mild hybrid. Strong platform reuse across 7-Series/X5/X7. Premium software: Executive Drive Pro (48V active roll) + Integral Active Steering, Bowers & Wilkins Diamond audio, Parking Assistant Professional + 360, Digital Key Plus (UWB), AR-ready HUD.',
    region: 'EU', devSource: 'OEM_Internal', volume: 60_000, life: 8, overhead: 1.60, senior: 0.55, reuse: 'Heavy',
    reportUrl: 'reports/bmw-x7-software-cost-breakdown.html',
    disabledModules: MHEV_DISABLED,
    moduleOverrides: {
      digital_key: { complexity: 'Very High' },   // BMW Digital Key Plus (UWB), industry-leading
    },
  },
  {
    id: 'audi_q8', label: '🇩🇪 Audi Q8 (48V MHEV)',
    desc: 'MLB Evo platform, MMI/MIB3 infotainment, VW Group + CARIAD shared software stacks. ICE + 48V mild hybrid. Strong platform reuse (VW.OS carry-across). Premium software: adaptive air suspension + all-wheel steer, Bang & Olufsen 3D, park assist plus + 360, 4-zone climate, HUD.',
    region: 'EU', devSource: 'OEM_Internal', volume: 55_000, life: 9, overhead: 1.58, senior: 0.55, reuse: 'Heavy',
    reportUrl: 'reports/audi-q8-software-cost-breakdown.html',
    // Core platform middleware genuinely carries across the VW Group → Platform reuse there.
    moduleOverrides: { autosar_classic: { reuse: 'Platform' }, autosar_adaptive: { reuse: 'Platform' }, rtos: { reuse: 'Platform' }, comm_stacks: { reuse: 'Platform' } },
    disabledModules: MHEV_DISABLED,
  },
  {
    id: 'merc_gls', label: '🇩🇪 Mercedes GLS 450 (48V MHEV)',
    desc: 'X167 flagship, MBUX / NTG6 (infotainment-heavy), EQ Boost 48V mild hybrid. Signature software: E-Active Body Control (48V, camera Road-Surface-Scan), MBUX + "Hey Mercedes" voice, Burmester 3D surround, active parking + 360, MB AR-HUD, 5-zone climate + air purification, digital key.',
    region: 'EU', devSource: 'OEM_Internal', volume: 45_000, life: 9, overhead: 1.62, senior: 0.55, reuse: 'Medium',
    reportUrl: 'reports/mercedes-gls-software-cost-breakdown.html',
    disabledModules: MHEV_DISABLED,
    moduleOverrides: {
      ivi_os:            { complexity: 'Very High' },
      voice_assistant:   { complexity: 'Very High' },
      navigation:        { complexity: 'Very High' },
      active_suspension: { complexity: 'Very High' }, // E-Active Body Control, camera-fed 48V
      premium_audio:     { complexity: 'Very High' }, // Burmester high-end 3D
    },
  },
  {
    id: 'porsche_cayenne', label: '🇩🇪 Porsche Cayenne Electric (2026)',
    desc: 'E4 platform (PPE, 800V), full BEV, Porsche Driver Experience HMI. Shares PPE middleware with Macan EV / Audi Q6 e-tron (Platform reuse there); bespoke Porsche 4D chassis, Active Ride, 800V high-power charging and Burmester audio at Very-High complexity. Full EV powertrain stack retained.',
    region: 'EU', devSource: 'OEM_Internal', volume: 50_000, life: 8, overhead: 1.62, senior: 0.60, reuse: 'Medium',
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
    id: 'porsche_cayenne_phev', label: '🇩🇪 Porsche Cayenne E-Hybrid (PHEV)',
    desc: 'MLB Evo · PCM · E-Hybrid plug-in powertrain. Same Porsche performance software as the BEV, but the plug-in-hybrid powertrain is retained at reduced scope (smaller pack, lower charging power) — BMS / SOC / drive-unit at High rather than Very-High.',
    region: 'EU', devSource: 'OEM_Internal', volume: 50_000, life: 8, overhead: 1.62, senior: 0.60, reuse: 'Medium',
    reportUrl: 'reports/porsche-cayenne-phev-software-cost-breakdown.html',
    disabledModules: [],  // PHEV: retains battery/charge/drive SW at reduced scope
    moduleOverrides: {
      autosar_classic: { reuse: 'Platform' }, autosar_adaptive: { reuse: 'Platform' }, rtos: { reuse: 'Platform' }, comm_stacks: { reuse: 'Platform' },
      vehicle_motion: { complexity: 'Very High' }, active_suspension: { complexity: 'Very High' }, premium_audio: { complexity: 'Very High' },
      bms_core: { complexity: 'High' }, soc_soh_soe: { complexity: 'High' }, edu_control: { complexity: 'High' }, fast_charge: { complexity: 'Medium' },
    },
  },
  {
    id: 'porsche_cayenne_mhev', label: '🇩🇪 Porsche Cayenne (48V MHEV)',
    desc: 'MLB Evo · PCM · 48V mild-hybrid powertrain. High-voltage battery / charge / drive modules are not applicable and disabled; 48V regen and battery-thermal retained. Porsche performance software at Very-High complexity.',
    region: 'EU', devSource: 'OEM_Internal', volume: 50_000, life: 8, overhead: 1.62, senior: 0.60, reuse: 'Medium',
    reportUrl: 'reports/porsche-cayenne-mhev-software-cost-breakdown.html',
    disabledModules: MHEV_DISABLED,
    moduleOverrides: {
      autosar_classic: { reuse: 'Platform' }, autosar_adaptive: { reuse: 'Platform' }, rtos: { reuse: 'Platform' }, comm_stacks: { reuse: 'Platform' },
      vehicle_motion: { complexity: 'Very High' }, active_suspension: { complexity: 'Very High' }, premium_audio: { complexity: 'Very High' },
    },
  },
  {
    id: 'porsche_cayenne_ice', label: '🇩🇪 Porsche Cayenne V8 (ICE)',
    desc: 'MLB Evo · PCM · V8 twin-turbo powertrain. No electrified-powertrain software — all nine EV powertrain / battery modules are out of scope. Porsche performance, chassis and infotainment software otherwise identical.',
    region: 'EU', devSource: 'OEM_Internal', volume: 50_000, life: 8, overhead: 1.62, senior: 0.60, reuse: 'Medium',
    reportUrl: 'reports/porsche-cayenne-ice-software-cost-breakdown.html',
    disabledModules: ['bms_core', 'cell_balancing', 'soc_soh_soe', 'thermal_mgmt', 'fast_charge', 'edu_control', 'inverter_ctrl', 'motor_ctrl', 'regen_braking'],
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
const _ICE_OFF = ['bms_core', 'cell_balancing', 'soc_soh_soe', 'thermal_mgmt', 'fast_charge', 'edu_control', 'inverter_ctrl', 'motor_ctrl', 'regen_braking'];
type Sig = Record<string, Partial<Pick<SWModuleInput, 'asil' | 'complexity' | 'reuse'>>>;
interface StudyCar { id: string; slug: string; flag: string; name: string; region: SWRegion; devSource: DevSource; volume: number; life: number; overhead: number; senior: number; reuse: SWReuse; sig: Sig; skip: string; }
interface StudyDT { key: string; code: string; dis: string[]; ov: Sig; note: string; }
const STUDY_CARS: StudyCar[] = [
  { id: 'l460', slug: 'range-rover-l460', flag: '🇬🇧', name: 'Range Rover L460', region: 'UK', devSource: 'Tier1_Supplier', volume: 75_000, life: 8, overhead: 1.55, senior: 0.55, reuse: 'Medium', sig: { premium_audio: { complexity: 'Very High' } }, skip: 'phev' },
  { id: 'bmw_x7', slug: 'bmw-x7', flag: '🇩🇪', name: 'BMW X7', region: 'EU', devSource: 'OEM_Internal', volume: 60_000, life: 8, overhead: 1.60, senior: 0.55, reuse: 'Heavy', sig: { digital_key: { complexity: 'Very High' } }, skip: 'mhev' },
  { id: 'audi_q8', slug: 'audi-q8', flag: '🇩🇪', name: 'Audi Q8', region: 'EU', devSource: 'OEM_Internal', volume: 55_000, life: 9, overhead: 1.58, senior: 0.55, reuse: 'Heavy', sig: { autosar_classic: { reuse: 'Platform' }, autosar_adaptive: { reuse: 'Platform' }, rtos: { reuse: 'Platform' }, comm_stacks: { reuse: 'Platform' } }, skip: 'mhev' },
  { id: 'merc_gls', slug: 'mercedes-gls', flag: '🇩🇪', name: 'Mercedes GLS 450', region: 'EU', devSource: 'OEM_Internal', volume: 45_000, life: 9, overhead: 1.62, senior: 0.55, reuse: 'Medium', sig: { ivi_os: { complexity: 'Very High' }, voice_assistant: { complexity: 'Very High' }, navigation: { complexity: 'Very High' }, active_suspension: { complexity: 'Very High' }, premium_audio: { complexity: 'Very High' } }, skip: 'mhev' },
];
const STUDY_DTS: StudyDT[] = [
  { key: 'ice', code: 'ICE', dis: _ICE_OFF, ov: {}, note: 'combustion — no EV powertrain software' },
  { key: 'mhev', code: 'MHEV', dis: MHEV_DISABLED, ov: {}, note: '48V mild hybrid — HV battery/charge/drive disabled' },
  { key: 'phev', code: 'PHEV', dis: [], ov: { bms_core: { complexity: 'High' }, soc_soh_soe: { complexity: 'High' }, edu_control: { complexity: 'High' }, fast_charge: { complexity: 'Medium' } }, note: 'plug-in hybrid — powertrain retained, de-rated vs BEV' },
  { key: 'bev', code: 'BEV', dis: [], ov: { fast_charge: { complexity: 'Very High' } }, note: 'full battery-electric — entire EV powertrain stack in scope' },
];
for (const c of STUDY_CARS) for (const dt of STUDY_DTS) {
  if (dt.key === c.skip) continue;
  SW_VEHICLE_DEMOS.push({
    id: `${c.id}__${dt.key}`, label: `${c.flag} ${c.name} (${dt.code})`,
    desc: `${c.name} — ${dt.code} powertrain variant (apple-to-apple study): ${dt.note}. Car identity and macro assumptions held constant; only the powertrain-software scope changes.`,
    region: c.region, devSource: c.devSource, volume: c.volume, life: c.life, overhead: c.overhead, senior: c.senior, reuse: c.reuse,
    reportUrl: `reports/${c.slug}-${dt.key}-software-cost-breakdown.html`,
    disabledModules: [...dt.dis],
    moduleOverrides: { ...c.sig, ...dt.ov },
  });
}

/** Build a full programme-inputs object for a vehicle demo. */
function buildVehicleInputs(v: SWVehicleDemo): SWProgramInputs {
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
    modules: b.modules.map(m => ({
      ...m,
      enabled: !disabled.has(m.moduleId),
      reuse:   v.reuse,
      ...(v.moduleOverrides?.[m.moduleId] ?? {}),
    })),
  };
}

/** Apply a vehicle demo: set inputs, re-render the panel, and compute immediately. */
function applyVehicleDemo(id: string): void {
  const v = SW_VEHICLE_DEMOS.find(d => d.id === id);
  if (!v) return;
  _swActiveVehicle = id;
  _swInputs = buildVehicleInputs(v);
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
    aggressive: { asil: 'A' as ASILLevel, comp: 'Medium' as SWComplexity, reuse: 'Heavy' as SWReuse, region: 'China' as SWRegion },
    baseline:   { asil: null,              comp: null,                       reuse: 'Medium' as SWReuse, region: 'UK'    as SWRegion },
    premium:    { asil: null,              comp: 'High' as SWComplexity,    reuse: 'Fresh'  as SWReuse, region: 'USA_SV' as SWRegion },
    offshored:  { asil: null,              comp: null,                       reuse: 'Medium' as SWReuse, region: 'India' as SWRegion },
  }[preset];
  if (!cfg) return;

  const regionSel = document.getElementById('sw-region') as HTMLSelectElement | null;
  if (regionSel) regionSel.value = cfg.region;

  document.querySelectorAll<HTMLSelectElement>('.sw-asil-sel').forEach(sel => {
    if (cfg.asil) sel.value = cfg.asil;
  });
  document.querySelectorAll<HTMLSelectElement>('.sw-comp-sel').forEach(sel => {
    if (cfg.comp) sel.value = cfg.comp;
  });
  document.querySelectorAll<HTMLSelectElement>('.sw-reuse-sel').forEach(sel => {
    sel.value = cfg.reuse;
  });
}

// ─── Render results ───────────────────────────────────────────────────────────

function renderResults(result: SWProgramResult): void {
  const s = result.summary;

  // Summary cards
  const avgFTE = s.totalPersonMonths > 0 ? s.totalPersonMonths / (result.inputs.programLifeYears * 12) : 0;
  const nreTotal = s.nreTotal;
  const vehicles = result.inputs.annualProductionVolume * result.inputs.programLifeYears;
  const nrePerVeh       = vehicles > 0 ? nreTotal / vehicles : 0;                    // one-time dev, amortised
  const lifecyclePerVeh = vehicles > 0 ? (s.grandTotal - nreTotal) / vehicles : 0;   // recurring over life
  const cards: { label: string; value: string; sub: string; color: string }[] = [
    { label: 'Total Programme Cost',    value: fmtM(s.grandTotal),             sub: 'NRE + Lifecycle (all modules)',                color: '#2563eb' },
    { label: 'Per Vehicle (SW Cost)',   value: `£${fmt(s.perVehicle, 0)}`,     sub: `NRE £${fmt(nrePerVeh,0)} + Lifecycle £${fmt(lifecyclePerVeh,0)} · ${fmt(result.inputs.annualProductionVolume/1000,0)}k/yr × ${result.inputs.programLifeYears}yr`, color: '#059669' },
    { label: 'Total NRE',              value: fmtM(nreTotal),                  sub: 'Dev + Test + Integ + Tools + Cyber + Calib',  color: '#7c3aed' },
    { label: 'Total Person-Months',    value: `${fmt(s.totalPersonMonths, 0)} PM`, sub: `Avg team: ${fmt(avgFTE,0)} FTE over ${result.inputs.programLifeYears}yr`, color: '#d97706' },
    { label: 'Lifecycle (Maint+Cloud)',value: fmtM(s.totalMaintenance + s.totalCloud), sub: `${fmt((s.totalMaintenance+s.totalCloud)/s.grandTotal*100,0)}% of total programme`, color: '#0891b2' },
    { label: 'Active Modules',         value: `${result.modules.length}`,      sub: `of ${SW_MODULES.length} modules · ${result.inputs.region} / ${result.inputs.devSource.replace('_',' ')}`, color: '#64748b' },
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

  // Rec 2: Monte Carlo
  const mc = result.monteCarlo;
  const mcEl = document.getElementById('sw-monte-carlo');
  if (mcEl) {
    const span = mc.p90 - mc.p10;
    const pct90vs10 = mc.p10 > 0 ? (mc.p90 / mc.p10 - 1) * 100 : 0;
    mcEl.innerHTML = `
      <div class="sw-section-title"><span>🎲</span> Monte Carlo Cost Distribution (${mc.iterations.toLocaleString()} iterations)</div>
      <div class="sw-grid sw-grid-4" style="margin-bottom:16px">
        ${[
          { label: 'P10 (Optimistic)',  val: fmtM(mc.p10),  pv: `£${fmt(mc.p10PerVehicle,0)}/veh`, color: '#059669' },
          { label: 'P50 (Median)',      val: fmtM(mc.p50),  pv: `£${fmt(mc.p50PerVehicle,0)}/veh`, color: '#2563eb' },
          { label: 'P90 (Pessimistic)', val: fmtM(mc.p90),  pv: `£${fmt(mc.p90PerVehicle,0)}/veh`, color: '#ef4444' },
          { label: 'Mean',              val: fmtM(mc.mean), pv: `P90/P10 spread: +${fmt(pct90vs10,0)}%`, color: '#7c3aed' },
        ].map(c => `
        <div style="background:var(--sw-surface-alt);border:1px solid var(--sw-border);border-radius:8px;padding:12px 14px">
          <div style="font-size:0.7rem;font-weight:600;color:var(--sw-text-muted);margin-bottom:4px">${c.label}</div>
          <div style="font-size:1.15rem;font-weight:800;color:${c.color}">${c.val}</div>
          <div style="font-size:0.7rem;color:var(--sw-text-muted);margin-top:2px">${c.pv}</div>
        </div>`).join('')}
      </div>
      <div style="font-size:0.75rem;color:var(--sw-text-secondary);background:var(--sw-surface-alt);border:1px solid var(--sw-border);border-radius:6px;padding:10px 14px">
        <strong>Uncertainty model:</strong> Triangular distributions on 9 cost buckets
        (labour ±35%, testing ±30%, cybersec ±50%, cloud ±60%, etc.) combined with a
        <strong>55% programme-wide correlation</strong> — schedule slips inflate dev, test and
        integration together, so the tail reflects real correlated overrun rather than a
        cancelling independent sum. Range P10→P90: <strong>${fmtM(span)}</strong>.
      </div>`;
  }

  // Rec 3: Programme Phases
  const phaseColors = ['#6366f1','#3b82f6','#0891b2','#059669','#d97706'];
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
      <td class="sw-num" style="font-weight:700;color:${phaseColors[i]}">${fmtM(p.nreCost)}</td>
    </tr>`).join('');

    phaseEl.innerHTML = `
      <div class="sw-section-title"><span>📅</span> Programme Milestone Phases (NRE: ${fmtM(nreTotal)})</div>
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
    <div class="sw-section-title"><span>📊</span> Cost by Software Category</div>
    <table class="sw-data-table">
      <thead><tr><th>Category</th><th class="sw-num">Modules</th><th class="sw-num">Total Cost</th><th class="sw-num">Share</th><th style="width:140px">Distribution</th><th>Largest Module</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>`;

  // Cost composition (Rec 7: includes Calibration)
  const comp: [string, string, number][] = [
    ['💻', 'Development (Engineering)', s.totalDevelopment],
    ['🧪', 'Testing & Validation',      s.totalTesting],
    ['🔗', 'Integration & V&V',         s.totalIntegration],
    ['🛠️', 'Toolchain (dev tools)',      s.totalToolchain],
    ['📐', 'Calibration & Tuning',       s.totalCalibration],
    ['🔒', 'Cybersecurity (pentest/TARA)', s.totalCybersecurity],
    ['🔧', 'Maintenance (lifecycle)',    s.totalMaintenance],
    ['☁️', 'Cloud & Infra (lifecycle)',   s.totalCloud],
    ['📜', 'IP Licensing (lifecycle)',    s.totalLicensing],
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
    <div class="sw-section-title"><span>💰</span> Cost Composition (10 Dimensions)</div>
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
      ? `${asilBadge(m.asilUsed)} <span style="color:#d97706;font-size:0.7rem" title="Below default ${def?.defaultAsil ?? ''}">⚠️ −${ASIL_RANK[def!.defaultAsil] - ASIL_RANK[m.asilUsed]} lvl</span>`
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
      <td class="sw-num" style="color:#059669;font-weight:600">£${fmt(m.perVehicle, 0)}</td>
    </tr>`;
  }).join('');

  // Count ASIL downgrades for header warning
  const downgradeCount = sortedMods.filter(m => {
    const def = SW_MODULES.find(d => d.id === m.moduleId);
    return def && ASIL_RANK[m.asilUsed] < ASIL_RANK[def.defaultAsil];
  }).length;
  const downgradeWarning = downgradeCount > 0
    ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:0.78rem;color:#92400e">⚠️ <strong>${downgradeCount} module(s)</strong> have ASIL set below their default. Review safety case documentation (ISO 26262 §6.4.5) before sign-off.</div>`
    : '';

  const modTableEl = document.getElementById('sw-module-table');
  if (modTableEl) modTableEl.innerHTML = `
    <div class="sw-section-title"><span>📋</span> Module Cost Detail — All ${result.modules.length} Active Modules</div>
    ${downgradeWarning}
    <div style="overflow-x:auto">
    <table class="sw-data-table">
      <thead><tr>
        <th>#</th><th>Module</th><th>Category</th><th>ASIL</th>
        <th>Complexity</th><th>Reuse</th><th class="sw-num">PM</th>
        <th class="sw-num">Dev Cost</th><th class="sw-num">Calibration</th>
        <th class="sw-num">Test Cost</th>
        <th class="sw-num">Grand Total</th><th class="sw-num">£/Vehicle</th>
      </tr></thead>
      <tbody>${modRows}</tbody>
    </table>
    </div>`;

  // Sensitivity analysis
  const sensRows = result.sensitivity.map(row => {
    const low  = row.unit === '£M' ? fmtM(row.low) : `£${fmt(row.low, 0)}`;
    const base = row.unit === '£M' ? fmtM(row.base) : `£${fmt(row.base, 0)}`;
    const high = row.unit === '£M' ? fmtM(row.high) : `£${fmt(row.high, 0)}`;
    const span = row.high - row.low;
    const spanFmt = row.unit === '£M' ? fmtM(span) : `£${fmt(span, 0)}`;
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
    <div class="sw-section-title"><span>📈</span> Sensitivity Analysis</div>
    <table class="sw-data-table">
      <thead><tr><th>Parameter</th><th class="sw-num">Low Scenario</th><th class="sw-num">Base Case</th><th class="sw-num">High Scenario</th><th class="sw-num">Range</th></tr></thead>
      <tbody>${sensRows}</tbody>
    </table>
    <p style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:10px">* Low = favourable scenario. High = unfavourable. Production Volume: Low = 150k/yr (cheaper per-vehicle), High = 50k/yr (expensive). Base = this configuration.</p>`;

  // Benchmark comparison
  const bmRows = result.benchmarks.map(b => {
    const isThis = b.vehicle.includes('This Model');
    const thisM  = s.grandTotal / 1_000_000;
    const diff   = (!isThis && b.totalM > 0) ? ((thisM - b.totalM) / b.totalM * 100) : 0;
    const diffFmt = isThis ? '⭐ Base' : `${diff >= 0 ? '+' : ''}${fmt(diff, 0)}%`;
    const diffColor = isThis ? '#2563eb' : diff > 20 ? '#ef4444' : diff < -20 ? '#059669' : '#d97706';
    const cite = isThis ? '' : ` <span style="cursor:help;color:var(--sw-text-muted);font-size:0.7rem" title="Source: ${esc(b.source)}">ⓘ</span>`;
    return `<tr ${isThis ? 'style="background:var(--sw-accent-bg);font-weight:700"' : ''}>
      <td>${isThis ? '⭐ ' : ''}${esc(b.vehicle)}${cite}</td>
      <td class="sw-num">${b.totalM > 0 ? fmtM(b.totalM * 1_000_000) : fmtM(s.grandTotal)}</td>
      <td class="sw-num">£${b.perVehicle > 0 ? fmt(b.perVehicle, 0) : fmt(s.perVehicle, 0)}</td>
      <td class="sw-num" style="color:${diffColor};font-weight:600">${diffFmt}</td>
      <td style="font-size:0.72rem;color:var(--sw-text-muted)">${esc(b.source)}</td>
    </tr>`;
  }).join('');

  const bmEl = document.getElementById('sw-benchmarks');
  if (bmEl) bmEl.innerHTML = `
    <div class="sw-section-title"><span>🏆</span> Benchmark Comparison — Premium EV Programme SW Investment</div>
    <table class="sw-data-table">
      <thead><tr><th>Vehicle / Programme</th><th class="sw-num">Total SW Cost</th><th class="sw-num">£/Vehicle</th><th class="sw-num">vs This Model</th><th>Source</th></tr></thead>
      <tbody>${bmRows}</tbody>
    </table>
    <p style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:10px">* Positive = benchmark cheaper than this model. Figures are industry estimates ±20%.</p>`;

  // Rec 4: OEM / Tier-1 / Startup decomposition
  const sourceDecomp: { src: string; label: string; srcMult: number; riskNote: string; ipNote: string; warrantyNote: string }[] = [
    { src: 'OEM_Internal',   label: 'OEM Internal',    srcMult: 1.00, riskNote: 'Full visibility & control', ipNote: 'IP owned outright', warrantyNote: 'Full in-house warranty liability' },
    { src: 'Tier1_Supplier', label: 'Tier 1 Supplier', srcMult: 0.88, riskNote: 'Contractual milestone risk', ipNote: 'IP shared / licensed-back', warrantyNote: 'Supplier warranty share ~40%' },
    { src: 'Startup_OSS',   label: 'Startup / OSS',   srcMult: 0.72, riskNote: 'High execution risk, talent risk', ipNote: 'OSS licence risk; limited assignment', warrantyNote: 'Warranty indemnity limited; OEM absorbs tail' },
  ];
  const currentSrc = result.inputs.devSource;
  const currentMult = currentSrc === 'OEM_Internal' ? 1.00 : currentSrc === 'Tier1_Supplier' ? 0.88 : 0.72;
  // Only labour-driven NRE/maintenance scales with the dev source. Fixed pools
  // (toolchain, IP licensing, cloud) are contractual and do not move.
  const fixedPart  = s.totalToolchain + s.totalLicensing + s.totalCloud;
  const labourPart = s.grandTotal - fixedPart;
  const decompRows = sourceDecomp.map(d => {
    const estCost = fixedPart + labourPart * (d.srcMult / currentMult);
    const isCurrent = d.src === currentSrc;
    return `<tr ${isCurrent ? 'style="background:var(--sw-accent-bg);font-weight:700"' : ''}>
      <td>${isCurrent ? '⭐ ' : ''}${esc(d.label)}</td>
      <td class="sw-num" style="color:var(--sw-accent)">${fmtM(estCost)}</td>
      <td class="sw-num">×${d.srcMult.toFixed(2)}</td>
      <td style="font-size:0.75rem;color:var(--sw-text-secondary)">${esc(d.riskNote)}</td>
      <td style="font-size:0.75rem;color:var(--sw-text-secondary)">${esc(d.ipNote)}</td>
      <td style="font-size:0.75rem;color:var(--sw-text-secondary)">${esc(d.warrantyNote)}</td>
    </tr>`;
  }).join('');

  const decompEl = document.getElementById('sw-source-decomp');
  if (decompEl) decompEl.innerHTML = `
    <div class="sw-section-title"><span>🏢</span> Development Source Decomposition (OEM / Tier-1 / Startup)</div>
    <table class="sw-data-table">
      <thead><tr><th>Dev Source</th><th class="sw-num">Estimated Cost</th><th class="sw-num">Rate Mult.</th><th>Risk Profile</th><th>IP Ownership</th><th>Warranty Exposure</th></tr></thead>
      <tbody>${decompRows}</tbody>
    </table>
    <p style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:8px">* Rate multipliers relative to OEM Internal baseline. Actual costs also depend on management overhead, ramp-up time, and programme governance.</p>`;

  // Engineering Insights
  const insightsEl = document.getElementById('sw-insights');
  if (insightsEl) {
    const insights: { icon: string; level: 'info' | 'warn' | 'ok'; title: string; body: string }[] = [];

    const sorted = [...result.modules].sort((a,b) => b.grandTotal - a.grandTotal);
    if (sorted.length > 0) {
      const top = sorted[0];
      insights.push({ icon: '📊', level: 'info',
        title: `Top cost driver: ${top.moduleName}`,
        body: `At ${fmtM(top.grandTotal)} (${fmt(top.grandTotal/s.grandTotal*100,1)}% of total), ${top.moduleName} dominates programme cost. Evaluate build-vs-buy: licensed platform IP could reduce this by 30–50%.`,
      });
    }

    const asilDReuseHeavy = result.modules.filter(m => m.asilUsed === 'D' && (m.reuseUsed === 'Heavy' || m.reuseUsed === 'Platform'));
    if (asilDReuseHeavy.length > 0) {
      insights.push({ icon: '⚠️', level: 'warn',
        title: `ASIL-D with Heavy/Platform reuse — verify safety case`,
        body: `${asilDReuseHeavy.map(m => m.moduleName).join(', ')} are ASIL-D with ${asilDReuseHeavy[0].reuseUsed} reuse. ISO 26262 requires formal safety case for SEooC elements. Factor in additional safety analysis cost.`,
      });
    }

    const lifecycleTotal = s.totalMaintenance + s.totalCloud + s.totalLicensing;
    const lifecyclePct = s.grandTotal > 0 ? lifecycleTotal / s.grandTotal * 100 : 0;
    if (lifecyclePct > 45) {
      insights.push({ icon: '☁️', level: 'warn',
        title: `High lifecycle cost (${fmt(lifecyclePct,0)}% of total)`,
        body: `Lifecycle costs total ${fmtM(lifecycleTotal)} (${fmt(lifecyclePct,0)}%). Cloud infrastructure for AI retraining is the main driver. Hybrid cloud/on-premise architecture could reduce by 25–35%.`,
      });
    } else {
      insights.push({ icon: '✅', level: 'ok',
        title: `NRE/lifecycle split is healthy (${fmt(100-lifecyclePct,0)}% NRE)`,
        body: `Development NRE accounts for ${fmt(100-lifecyclePct,0)}% of total. Typical for an OEM insourcing most development.`,
      });
    }

    const nonThis = result.benchmarks.filter(b => !b.vehicle.includes('This Model'));
    const medianBm = [...nonThis].sort((a,b)=>a.totalM-b.totalM)[Math.floor(nonThis.length/2)]?.totalM ?? 0;
    const thisM = s.grandTotal / 1_000_000;
    if (medianBm > 0) {
      const diffPct = (thisM - medianBm) / medianBm * 100;
      insights.push({ icon: diffPct > 30 ? '🔴' : diffPct > 10 ? '🟡' : '🟢', level: diffPct > 30 ? 'warn' : 'ok',
        title: `Programme cost is ${fmt(Math.abs(diffPct),0)}% ${diffPct >= 0 ? 'above' : 'below'} peer median (${fmtM(medianBm * 1_000_000)})`,
        body: diffPct > 20 ? `Cost exceeds peer median. Review ASIL assignments and reuse opportunities. India offshoring could reduce by ${fmt(s.grandTotal > 0 ? Math.abs(s.grandTotal - _recomputeTotalForInsight(result)) / s.grandTotal * 100 : 0, 0)}% vs current region.`
              : `Programme cost is within normal range vs peers. Monitor cloud costs as fleet scales.`,
      });
    }

    const hasCyberMod = result.modules.some(m => m.category === 'F');
    if (!hasCyberMod) {
      insights.push({ icon: '🔴', level: 'warn',
        title: 'No Cybersecurity (ISO 21434) modules enabled',
        body: 'UN-ECE R155 mandates CSMS for all connected vehicles from July 2024. Category F modules are required for regulatory compliance.',
      });
    }

    if (result.inputs.region === 'UK' || result.inputs.region === 'USA_SV') {
      const indiaTotal = result.sensitivity.find(r => r.parameter.includes('Region'))?.low;
      if (indiaTotal && indiaTotal > 0) {
        const saving = s.grandTotal - indiaTotal;
        insights.push({ icon: '💡', level: 'info',
          title: `Offshoring to India could save ${fmtM(saving)}`,
          body: `India-based team (Bangalore/Pune rate) reduces labour cost to ${fmtM(indiaTotal)} — saving ${fmtM(saving)}. Factor in coordination overhead (+15%), knowledge transfer, and time zone risk.`,
        });
      }
    }

    const avgTeamFTE = s.totalPersonMonths > 0 ? s.totalPersonMonths / (result.inputs.programLifeYears * 12) : 0;
    insights.push({ icon: '👥', level: 'info',
      title: `Average team: ${fmt(avgTeamFTE, 0)} FTE across ${result.inputs.programLifeYears}-year programme`,
      body: `${fmt(s.totalPersonMonths, 0)} total person-months implies ~${fmt(avgTeamFTE,0)} FTE sustained. Peak headcount during integration phases is typically 1.4–1.7× this average.`,
    });

    const levelColor: Record<string, string> = { info: '#2563eb', warn: '#d97706', ok: '#059669' };
    const levelBg:    Record<string, string> = { info: '#eff6ff', warn: '#fff7ed', ok: '#f0fdf4' };
    const levelBorder:Record<string, string> = { info: '#bfdbfe', warn: '#fed7aa', ok: '#bbf7d0' };

    insightsEl.innerHTML = `
      <div class="sw-section-title"><span>🧠</span> Engineering Insights</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${insights.map(ins => `
        <div style="background:${levelBg[ins.level]};border:1px solid ${levelBorder[ins.level]};border-radius:8px;padding:12px 16px;display:flex;gap:12px;align-items:flex-start">
          <span style="font-size:1.2rem;flex-shrink:0">${ins.icon}</span>
          <div>
            <div style="font-weight:700;font-size:0.82rem;color:${levelColor[ins.level]};margin-bottom:4px">${esc(ins.title)}</div>
            <div style="font-size:0.78rem;color:#374151;line-height:1.5">${esc(ins.body)}</div>
          </div>
        </div>`).join('')}
      </div>`;
  }

  // Show results section
  const resultsEl = document.getElementById('sw-results');
  if (resultsEl) {
    resultsEl.style.display = '';
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function _recomputeTotalForInsight(result: SWProgramResult): number {
  // Quick India recompute for insights without full sensitivity
  return result.sensitivity.find(r => r.parameter.includes('Region'))?.low ?? result.summary.grandTotal;
}

// ─── Rec 5: AI Analysis ───────────────────────────────────────────────────────

function generateAIInsights(result: SWProgramResult): void {
  const contentEl = document.getElementById('sw-ai-content');
  const btnEl = document.getElementById('sw-ai-btn') as HTMLButtonElement | null;
  if (!contentEl || !btnEl) return;

  btnEl.disabled = true;
  btnEl.textContent = '⏳ Generating analysis…';
  contentEl.style.display = '';
  contentEl.innerHTML = `<div style="text-align:center;padding:16px;color:var(--sw-text-muted)">🤖 Analysing programme cost data with AI…</div>`;

  const s = result.summary;
  const top3 = [...result.modules].sort((a,b) => b.grandTotal - a.grandTotal).slice(0,3);
  const nreTotal = s.nreTotal;
  const lifecyclePct = s.grandTotal > 0 ? (s.totalMaintenance + s.totalCloud + s.totalLicensing) / s.grandTotal * 100 : 0;

  const prompt = `You are a senior automotive software engineering cost analyst. Provide a concise executive summary and actionable recommendations for this programme:

PROGRAMME: Premium Luxury SUV Full Software Stack (${result.inputs.programLifeYears}-year programme)
Total Programme Cost: ${(s.grandTotal/1e6).toFixed(1)}M GBP
Per Vehicle: £${Math.round(s.perVehicle)}
Total Person-Months: ${Math.round(s.totalPersonMonths)} PM (avg ${Math.round(s.totalPersonMonths/(result.inputs.programLifeYears*12))} FTE)
Region: ${result.inputs.region} | Source: ${result.inputs.devSource} | Life: ${result.inputs.programLifeYears}yr | Volume: ${(result.inputs.annualProductionVolume/1000).toFixed(0)}k/yr
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
2. Top 3 cost reduction opportunities with estimated savings
3. Key risk factors requiring management attention
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
  if (cachedReply) { render(cachedReply, true); btnEl.disabled = false; btnEl.textContent = '✨ AI Analysis'; return; }

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
  .then((data: { reply?: string; error?: string }) => {
    const text = data.reply ?? data.error ?? 'No response from AI service.';
    if (data.reply) _aiCache.set(prompt, data.reply);
    render(text, false);
  })
  .catch(err => {
    const msg = ctrl.signal.aborted ? 'request timed out after 30s' : String(err);
    contentEl.innerHTML = `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;font-size:0.8rem;color:#dc2626">⚠️ AI analysis unavailable: ${esc(msg)}. Engineering Insights above are still available.</div>`;
    btnEl.disabled = false;
    btnEl.textContent = '✨ Retry AI Analysis';
  })
  .finally(() => clearTimeout(timeout));
}

// ─── Rec 6: Excel Export ──────────────────────────────────────────────────────

async function exportSWExcel(result: SWProgramResult): Promise<void> {
  const s  = result.summary;
  const inp = result.inputs;

  const fM = (n: number) => parseFloat((n/1_000_000).toFixed(3));
  const f2 = (n: number) => parseFloat(n.toFixed(2));

  // Sheet 1: Summary
  const summaryData = [
    ['CostVision — Automotive SW Should-Cost Report'],
    ['Programme', 'Premium Luxury SUV Full SW Stack 2024–2026'],
    ['Generated', new Date().toLocaleDateString('en-GB')],
    [],
    ['Cost Bucket', 'Value (£M)', 'Share (%)'],
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
    ['Per Vehicle (SW)', f2(s.perVehicle), '£'],
    ['Total Person-Months', f2(s.totalPersonMonths), 'PM'],
    ['Active Modules', result.modules.length, ''],
  ];

  // Sheet 2: Category Breakdown
  const catData = [
    ['Category', 'Category Label', 'Modules', 'Total Cost (£M)', 'Share (%)'],
    ...Object.entries(CAT_META).map(([cat, meta]) => {
      const t = s.byCategory[cat as keyof typeof s.byCategory] ?? 0;
      const mods = result.modules.filter(m => m.category === cat);
      return [cat, meta.label, mods.length, fM(t), f2(t/s.grandTotal*100)];
    }),
  ];

  // Sheet 3: Module Detail
  const modData = [
    ['#', 'Module', 'Category', 'ASIL', 'Complexity', 'Reuse', 'Person-Months',
     'Dev Cost (£M)', 'Test Cost (£M)', 'Calibration (£M)', 'Integration (£M)',
     'Toolchain (£M)', 'IP Licence (£M)', 'Cybersec (£M)', 'Cloud (£M)', 'Maintenance (£M)',
     'Grand Total (£M)', '£/Vehicle'],
    ...[...result.modules].sort((a,b) => b.grandTotal - a.grandTotal).map((m, i) => [
      i+1, m.moduleName, m.category, m.asilUsed, m.complexityUsed, m.reuseUsed,
      f2(m.personMonths), fM(m.development.total), fM(m.testing.total),
      fM(m.calibrationCost), fM(m.integrationCost), fM(m.toolchainCost),
      fM(m.licensingCost), fM(m.cybersecCost), fM(m.cloudCost), fM(m.maintenanceCost),
      fM(m.grandTotal), f2(m.perVehicle),
    ]),
  ];

  // Sheet 4: Sensitivity + Monte Carlo
  const mc = result.monteCarlo;
  const sensData: unknown[][] = [
    ['SENSITIVITY ANALYSIS'],
    ['Parameter', 'Unit', 'Low Scenario', 'Base Case', 'High Scenario', 'Range'],
    ...result.sensitivity.map(r => {
      // £M rows store absolute pounds; convert to £M. Per-vehicle rows stay raw.
      const v = (n: number) => r.unit === '£M' ? fM(n) : f2(n);
      return [r.parameter, r.unit, v(r.low), v(r.base), v(r.high), v(r.high - r.low)];
    }),
    [],
    ['MONTE CARLO DISTRIBUTION', `${mc.iterations} iterations`],
    ['Percentile', 'Total Cost (£M)', '£/Vehicle'],
    ['P10 (Optimistic)', fM(mc.p10), f2(mc.p10PerVehicle)],
    ['P50 (Median)',     fM(mc.p50), f2(mc.p50PerVehicle)],
    ['P90 (Pessimistic)',fM(mc.p90), f2(mc.p90PerVehicle)],
    ['Mean',             fM(mc.mean), ''],
    ['P90-P10 Spread',   fM(mc.p90 - mc.p10), ''],
    [],
    ['PROGRAMME PHASES (NRE)'],
    ['Phase', 'Timeline', 'NRE Share (%)', 'NRE Budget (£M)'],
    ...result.phases.map(p => [p.name, p.months, f2(p.fraction*100), fM(p.nreCost)]),
  ];

  // Sheet 5: Benchmarks
  const bmData = [
    ['Vehicle / Programme', 'Total SW Cost (£M)', '£/Vehicle', 'vs This Model (%)', 'Source'],
    ...result.benchmarks.map(b => {
      const isThis = b.vehicle.includes('This Model');
      const thisM = s.grandTotal / 1_000_000;
      const diff = (!isThis && b.totalM > 0) ? f2((thisM - b.totalM) / b.totalM * 100) : 'Base';
      return [b.vehicle, b.totalM > 0 ? b.totalM : fM(s.grandTotal), b.perVehicle > 0 ? b.perVehicle : f2(s.perVehicle), diff, b.source];
    }),
  ];

  // Sheet 6: Configuration
  const cfgData = [
    ['PROGRAMME CONFIGURATION'],
    ['Parameter', 'Value'],
    ['Region', inp.region],
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

  const wb = await buildWorkbook([
    { name: 'Summary',            rows: summaryData, cols: [30, 16, 12] },
    { name: 'Category Breakdown', rows: catData,     cols: [10, 30, 10, 16, 12] },
    { name: 'Module Detail',      rows: modData,     cols: [4, 30, 9, 7, 12, 10, 14, ...Array(11).fill(14)] },
    { name: 'Sensitivity & MC',   rows: sensData,    cols: [40, 12, 16, 16, 16, 14] },
    { name: 'Benchmarks',         rows: bmData,      cols: [28, 18, 12, 18, 44] },
    { name: 'Configuration',      rows: cfgData,     cols: [28, 40, 10, 8, 12, 10, 12] },
  ]);
  await downloadWorkbook(wb, 'SW_Should_Cost_CostVision.xlsx');
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

function exportSWPDF(result: SWProgramResult): void {
  import('jspdf').then(({ jsPDF }) => {
    import('jspdf-autotable').then(({ default: autoTable }) => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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
      doc.text(`Region: ${result.inputs.region}  ·  Source: ${result.inputs.devSource}  ·  Life: ${result.inputs.programLifeYears}yr  ·  Volume: ${(result.inputs.annualProductionVolume / 1000).toFixed(0)}k/yr`, 14, 46);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}  ·  CostVision`, 14, 52);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text(fmtM(s.grandTotal), W - MG, 30, { align: 'right' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('Total Programme Cost', W - MG, 38, { align: 'right' });
      doc.text(`£${fmt(s.perVehicle, 0)} / vehicle`, W - MG, 45, { align: 'right' });

      let y = 76;
      const chk = (need: number) => { if (y + need > 270) { doc.addPage(); y = 18; } };
      const th = { fillColor: [15, 23, 42] as [number, number, number], textColor: [255,255,255] as [number,number,number], fontStyle: 'bold' as const, fontSize: 7 };

      // §1 Summary
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('1. Programme Cost Summary', MG, y); y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Cost Bucket', 'Value (£M)', 'Share (%)']],
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

      // §2 Monte Carlo
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('2. Monte Carlo Cost Distribution', MG, y); y += 6;
      const mc = result.monteCarlo;
      autoTable(doc, {
        startY: y,
        head: [['Percentile', 'Total Cost (£M)', '£/Vehicle']],
        body: [
          ['P10 (Optimistic)', fmtM(mc.p10), `£${fmt(mc.p10PerVehicle,0)}`],
          ['P50 (Median)',     fmtM(mc.p50), `£${fmt(mc.p50PerVehicle,0)}`],
          ['P90 (Pessimistic)',fmtM(mc.p90), `£${fmt(mc.p90PerVehicle,0)}`],
          ['Mean',             fmtM(mc.mean), ''],
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
        head: [['Category', 'Modules', 'Grand Total (£M)', 'Share (%)']],
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
        head: [['Module', 'Cat', 'ASIL', 'PM', 'Dev (£M)', 'Calib (£M)', 'Test (£M)', 'Total (£M)', '£/Veh']],
        body: topMods.map(m => [
          m.moduleName.length > 26 ? m.moduleName.slice(0, 24)+'…' : m.moduleName,
          m.category, m.asilUsed, fmt(m.personMonths, 0),
          fmtM(m.development.total), fmtM(m.calibrationCost),
          fmtM(m.testing.total), fmtM(m.grandTotal), `£${fmt(m.perVehicle, 0)}`,
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
          const f = (n: number) => r.unit === '£M' ? fmtM(n) : `£${fmt(n, 0)}`;
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
        head: [['Vehicle / Programme', 'Total SW Cost', '£/Vehicle', 'Source']],
        body: result.benchmarks.map(b => [
          b.vehicle, b.totalM > 0 ? fmtM(b.totalM * 1_000_000) : fmtM(s.grandTotal),
          `£${b.perVehicle > 0 ? fmt(b.perVehicle, 0) : fmt(s.perVehicle, 0)}`, b.source,
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

      doc.save('SW_Should_Cost_Report.pdf');
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
    ...(_savedConfigs.map(c => ({ name: c.name, inputs: c.inputs }))),
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
    ['Per Vehicle',     c => `£${fmt(c.r.summary.perVehicle, 0)}`],
    ['Total NRE',       c => fmtM(c.r.summary.nreTotal)],
    ['Lifecycle',       c => fmtM(c.r.summary.totalMaintenance + c.r.summary.totalCloud + c.r.summary.totalLicensing)],
    ['MC P50',          c => fmtM(c.r.monteCarlo.p50)],
    ['MC P90',          c => fmtM(c.r.monteCarlo.p90)],
    ['Region',          c => c.r.inputs.region],
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
    <div style="font-size:0.78rem;font-weight:700;color:var(--sw-text-primary);margin-bottom:8px">⚖ Scenario Comparison <span style="font-weight:400;color:var(--sw-text-muted)">(✓ = lowest total)</span></div>
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
    errEl.style.cssText = 'background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 16px;margin:8px 0;font-size:0.82rem;color:#dc2626;display:flex;align-items:center;gap:8px';
    const calcBtn = document.getElementById('sw-calc-btn');
    calcBtn?.parentElement?.insertBefore(errEl, calcBtn);
  }
  errEl.innerHTML = `<span>⚠️</span> ${esc(msg)}`;
  errEl.style.display = 'flex';
  setTimeout(() => { if (errEl) errEl.style.display = 'none'; }, 6000);
}

// ─── Wire events ──────────────────────────────────────────────────────────────

export function wireSWPanel(): void {
  // Mode toggle (Guided wizard ↔ Advanced expert panel) + wizard wiring
  document.querySelectorAll<HTMLButtonElement>('.sw-mode-btn').forEach(btn =>
    btn.addEventListener('click', () => setSWMode(btn.dataset.mode as 'guided' | 'advanced')));
  wireGuided();
  void renderSWRateAdmin();

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

      const origText = calcBtn.textContent ?? '';
      calcBtn.textContent = '⏳ Calculating…';
      (calcBtn as HTMLButtonElement).disabled = true;

      setTimeout(() => {
        try {
          _swResult = computeSWProgram(_swInputs);
          renderResults(_swResult);
          const errEl = document.getElementById('sw-calc-error');
          if (errEl) errEl.style.display = 'none';
        } catch (err) {
          showSWError(`Calculation error: ${(err as Error).message}`);
        } finally {
          calcBtn.textContent = origText;
          (calcBtn as HTMLButtonElement).disabled = false;
        }
      }, 20);
    });
  }

  // Preset buttons (excluding the vehicle demos, which have their own handler)
  document.querySelectorAll<HTMLButtonElement>('.sw-preset-btn:not(.sw-vehicle-btn):not(#sw-study-btn):not(#sw-bench-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('.sw-preset-btn').forEach(b => b.classList.remove('sw-preset-active'));
      btn.classList.add('sw-preset-active');
      // A generic preset is not a vehicle programme — retire the report banner.
      _swActiveVehicle = null;
      document.getElementById('sw-demo-report-btn')?.parentElement?.remove();
      applyPreset(btn.dataset.preset ?? '');
    });
  });

  // Vehicle programme demos — load a full detailed configuration and compute.
  document.querySelectorAll<HTMLButtonElement>('.sw-vehicle-btn').forEach(btn => {
    btn.addEventListener('click', () => applyVehicleDemo(btn.dataset.vehicle ?? ''));
  });

  // "View full report" — open the detailed board-level breakdown for the demo.
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
export function initSWPanel(containerEl: HTMLElement): void {
  _swInputs = defaultSWProgramInputs();
  _swResult = null;
  containerEl.innerHTML = renderSWPanelHTML();
  wireSWPanel();
  // Load saved configs asynchronously (server or localStorage), then refresh the
  // list in place — the panel renders immediately without waiting on the network.
  void loadSavedConfigs().then(updateSavedConfigsUI).catch(() => { /* non-fatal */ });
  // Apply the organisation's active SW rates (if an admin has uploaded them).
  void syncSWRateLibrary();
}
