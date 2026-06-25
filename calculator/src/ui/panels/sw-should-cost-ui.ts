/**
 * Automotive Software Should-Cost — UI Panel
 * Self-contained panel: renders HTML, wires events, shows results.
 */

import type {
  ASILLevel, SWComplexity, SWReuse, SWRegion, DevSource,
  SWProgramInputs, SWProgramResult,
} from '../../engine/sw-should-cost.js';
import {
  computeSWProgram, defaultSWProgramInputs, SW_MODULES,
} from '../../engine/sw-should-cost.js';

// ─── Module-level state ───────────────────────────────────────────────────────

let _swResult: SWProgramResult | null = null;
let _swInputs: SWProgramInputs = defaultSWProgramInputs();

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

// ─── ASIL badge ───────────────────────────────────────────────────────────────

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
      return `
      <tr class="sw-module-row" data-module-id="${def.id}">
        <td class="sw-mod-check"><input type="checkbox" class="sw-mod-enable" data-id="${def.id}" ${inp.enabled ? 'checked' : ''}></td>
        <td class="sw-mod-name">
          <div style="font-weight:600;font-size:0.82rem;color:#1e293b">${esc(def.shortName)}</div>
          <div style="font-size:0.7rem;color:#64748b;margin-top:1px">${esc(def.basePersonMonths)} PM base · ${tags.join(' ')}</div>
        </td>
        <td class="sw-mod-desc" title="${esc(def.description)}" style="font-size:0.72rem;color:#475569;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(def.description)}</td>
        <td><select class="sw-sel sw-asil-sel" data-id="${def.id}">${asilOpts}</select></td>
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
        <span class="sw-cat-count">${mods.length} modules</span>
        <span class="sw-cat-chevron">▾</span>
      </div>
      <div class="sw-cat-body">
        <table class="sw-module-table">
          <thead>
            <tr>
              <th style="width:24px"></th>
              <th>Module</th>
              <th>Description</th>
              <th style="width:70px">ASIL</th>
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
          <div style="font-size:0.78rem;color:#94a3b8;margin-top:2px">Premium Luxury SUV — Full SW Stack · 43 Modules · 7 Categories · ISO 26262 / ISO 21434</div>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
        <span style="background:rgba(59,130,246,0.25);color:#93c5fd;border:1px solid rgba(59,130,246,0.4);border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:600">ASIL QM→D</span>
        <span style="background:rgba(34,197,94,0.2);color:#86efac;border:1px solid rgba(34,197,94,0.35);border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:600">9 Cost Dimensions</span>
        <span style="background:rgba(168,85,247,0.2);color:#d8b4fe;border:1px solid rgba(168,85,247,0.35);border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:600">Global Benchmarks</span>
        <span style="background:rgba(245,158,11,0.2);color:#fcd34d;border:1px solid rgba(245,158,11,0.35);border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:600">Sensitivity Analysis</span>
      </div>
    </div>
  </div>

  <!-- ── Global Programme Config ──────────────────────────────── -->
  <div class="sw-config-card" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:18px">
    <div style="font-weight:700;font-size:0.88rem;color:#0f172a;margin-bottom:14px;display:flex;align-items:center;gap:6px">
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
      <div class="sw-field-group" style="display:flex;flex-direction:column;gap:8px;justify-content:flex-end">
        <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:#374151;cursor:pointer">
          <input type="checkbox" id="sw-inc-maint" ${inputs.includeMaintenanceCost ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer">
          Include Maintenance Cost
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:#374151;cursor:pointer">
          <input type="checkbox" id="sw-inc-cloud" ${inputs.includeCloudCost ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer">
          Include Cloud/Infra Cost
        </label>
      </div>
    </div>
  </div>

  <!-- ── Quick-set presets ─────────────────────────────────────── -->
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center">
    <span style="font-size:0.78rem;color:#64748b;font-weight:600">Quick Set:</span>
    <button class="sw-preset-btn" data-preset="aggressive">🚀 Aggressive (Low ASIL, High Reuse)</button>
    <button class="sw-preset-btn" data-preset="baseline">📊 Industry Baseline</button>
    <button class="sw-preset-btn" data-preset="premium">👑 Premium OEM (High ASIL, Fresh)</button>
    <button class="sw-preset-btn" data-preset="offshored">🌏 Offshored (India Team)</button>
  </div>

  <!-- ── Module Configuration ─────────────────────────────────── -->
  <div style="font-weight:700;font-size:0.88rem;color:#0f172a;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
    <span style="display:flex;align-items:center;gap:6px"><span>📋</span> Module Configuration (43 modules)</span>
    <div style="display:flex;gap:8px">
      <button id="sw-select-all" style="font-size:0.72rem;padding:3px 10px;border-radius:4px;border:1px solid #e2e8f0;background:#fff;color:#374151;cursor:pointer">Select All</button>
      <button id="sw-deselect-all" style="font-size:0.72rem;padding:3px 10px;border-radius:4px;border:1px solid #e2e8f0;background:#fff;color:#374151;cursor:pointer">Deselect All</button>
    </div>
  </div>

  <div id="sw-modules-container">${moduleRowsHTML}</div>

  <!-- ── Calculate button ─────────────────────────────────────── -->
  <div style="margin:20px 0;text-align:center">
    <button id="sw-calc-btn" style="background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border:none;border-radius:10px;padding:14px 48px;font-size:1rem;font-weight:700;cursor:pointer;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(37,99,235,0.35);transition:all 0.2s">
      ⚡ Calculate Software Should-Cost
    </button>
  </div>

  <!-- ── Results (hidden until calculated) ────────────────────── -->
  <div id="sw-results" style="display:none">

    <!-- Summary cards -->
    <div id="sw-summary-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px"></div>

    <!-- Category breakdown -->
    <div class="sw-results-section" id="sw-cat-breakdown"></div>

    <!-- Cost composition -->
    <div class="sw-results-section" id="sw-cost-composition"></div>

    <!-- Module detail table (top 15 by cost) -->
    <div class="sw-results-section" id="sw-module-table"></div>

    <!-- Sensitivity analysis -->
    <div class="sw-results-section" id="sw-sensitivity"></div>

    <!-- Benchmark comparison -->
    <div class="sw-results-section" id="sw-benchmarks"></div>

    <!-- Export -->
    <div style="text-align:center;margin:20px 0">
      <button id="sw-pdf-btn" style="background:#0f172a;color:#fff;border:none;border-radius:8px;padding:11px 32px;font-size:0.88rem;font-weight:600;cursor:pointer;margin-right:8px">
        📄 Export PDF Report
      </button>
    </div>
  </div>

</div>

<style>
.sw-config-sel, .sw-config-inp {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.8rem;
  background: #fff;
  color: #1e293b;
}
.sw-config-sel:focus, .sw-config-inp:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
}
.sw-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 5px;
}
.sw-field-group { display: flex; flex-direction: column; }

.sw-cat-group { margin-bottom: 10px; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; }
.sw-cat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  background: #f8fafc;
  cursor: pointer;
  user-select: none;
  font-size: 0.84rem;
  font-weight: 700;
  color: #1e293b;
}
.sw-cat-header:hover { background: #f1f5f9; }
.sw-cat-icon { font-size: 1rem; }
.sw-cat-label { flex: 1; }
.sw-cat-count { font-size: 0.72rem; font-weight: 500; color: #64748b; }
.sw-cat-chevron { font-size: 0.75rem; color: #64748b; transition: transform 0.2s; }
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
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.sw-module-table tbody tr:hover { background: #f8fafc; }
.sw-module-row td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.sw-mod-check { width: 24px; }
.sw-mod-name { min-width: 110px; }

.sw-sel {
  padding: 4px 6px;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  font-size: 0.75rem;
  background: #fff;
  color: #1e293b;
  width: 100%;
}
.sw-sel:focus { outline: none; border-color: #2563eb; }
.sw-pm-input {
  padding: 4px 6px;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  font-size: 0.75rem;
  background: #fff;
  color: #1e293b;
  width: 60px;
}
.sw-pm-input:focus { outline: none; border-color: #2563eb; }

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
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #374151;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}
.sw-preset-btn:hover { background: #f1f5f9; border-color: #94a3b8; }

.sw-results-section {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 18px 20px;
  margin-bottom: 14px;
}
.sw-section-title {
  font-weight: 700;
  font-size: 0.9rem;
  color: #0f172a;
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
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.sw-data-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #374151; }
.sw-data-table tr:last-child td { border-bottom: none; }
.sw-data-table tbody tr:hover { background: #f8fafc; }
.sw-num { text-align: right; font-variant-numeric: tabular-nums; font-family: monospace; }
.sw-highlight { background: #eff6ff !important; font-weight: 700; color: #1d4ed8 !important; }

.sw-summary-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px 18px;
  position: relative;
  overflow: hidden;
}
.sw-summary-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
}
.sw-card-label { font-size: 0.73rem; font-weight: 600; color: #64748b; margin-bottom: 6px; }
.sw-card-value { font-size: 1.4rem; font-weight: 800; color: #0f172a; line-height: 1; }
.sw-card-sub { font-size: 0.72rem; color: #94a3b8; margin-top: 4px; }

.sw-bar-track { background: #f1f5f9; border-radius: 4px; height: 8px; overflow: hidden; margin-top: 4px; }
.sw-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }
</style>`;
}

// ─── Read current form state into _swInputs ───────────────────────────────────

function readConfig(): void {
  const get = (id: string) => document.getElementById(id) as HTMLElement | null;

  const region   = (get('sw-region') as HTMLSelectElement)?.value as SWRegion || 'UK';
  const devSrc   = (get('sw-dev-source') as HTMLSelectElement)?.value as DevSource || 'OEM_Internal';
  const life     = parseInt((get('sw-prog-life') as HTMLInputElement)?.value) || 10;
  const vol      = parseInt((get('sw-vol') as HTMLInputElement)?.value) || 80_000;
  const overhead = parseFloat((get('sw-overhead') as HTMLInputElement)?.value) || 1.60;
  const maint    = (get('sw-inc-maint') as HTMLInputElement)?.checked ?? true;
  const cloud    = (get('sw-inc-cloud') as HTMLInputElement)?.checked ?? true;

  _swInputs.region                = region;
  _swInputs.devSource             = devSrc;
  _swInputs.programLifeYears      = Math.max(1, life);
  _swInputs.annualProductionVolume = Math.max(1, vol);
  _swInputs.overheadMultiplier    = Math.max(1, overhead);
  _swInputs.includeMaintenanceCost = maint;
  _swInputs.includeCloudCost      = cloud;

  // Read per-module overrides
  document.querySelectorAll<HTMLInputElement>('.sw-mod-enable').forEach(cb => {
    const id = cb.dataset.id!;
    const m  = _swInputs.modules.find(x => x.moduleId === id);
    if (!m) return;
    m.enabled = cb.checked;
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
  const cards: { label: string; value: string; sub: string; color: string }[] = [
    { label: 'Total Programme Cost',    value: fmtM(s.grandTotal),       sub: 'NRE + Lifecycle',                        color: '#2563eb' },
    { label: 'Per Vehicle (SW)',        value: `£${fmt(s.perVehicle, 0)}`, sub: `${fmt(result.inputs.annualProductionVolume/1000,0)}k units/yr × ${result.inputs.programLifeYears}yr`, color: '#059669' },
    { label: 'Total NRE',              value: fmtM(s.totalDevelopment + s.totalTesting + s.totalIntegration + s.totalToolchain + s.totalCybersecurity), sub: 'Dev + Test + Integration + Tools', color: '#7c3aed' },
    { label: 'Total Person-Months',    value: `${fmt(s.totalPersonMonths, 0)} PM`, sub: `≈ ${fmt(s.totalPersonMonths/12, 0)} FTE-years`,   color: '#d97706' },
    { label: 'Maintenance + Cloud',    value: fmtM(s.totalMaintenance + s.totalCloud), sub: `Over ${result.inputs.programLifeYears}-year programme`,   color: '#0891b2' },
    { label: 'Active Modules',         value: `${result.modules.length}`, sub: 'of 43 configured modules',              color: '#64748b' },
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
      <td style="font-size:0.72rem;color:#64748b">${topMod ? esc(topMod.moduleName) : '—'}</td>
    </tr>`;
  }).join('');

  const catEl = document.getElementById('sw-cat-breakdown');
  if (catEl) catEl.innerHTML = `
    <div class="sw-section-title"><span>📊</span> Cost by Software Category</div>
    <table class="sw-data-table">
      <thead><tr><th>Category</th><th class="sw-num">Modules</th><th class="sw-num">Total Cost</th><th class="sw-num">Share</th><th style="width:140px">Distribution</th><th>Largest Module</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>`;

  // Cost composition
  const comp: [string, string, number][] = [
    ['💻', 'Development (Engineering)', s.totalDevelopment],
    ['🧪', 'Testing & Validation',      s.totalTesting],
    ['🔗', 'Integration & V&V',         s.totalIntegration],
    ['🛠️', 'Toolchain & Licences',       s.totalToolchain],
    ['🔒', 'Cybersecurity (pentest/TARA)', s.totalCybersecurity],
    ['🔧', 'Maintenance (lifecycle)',    s.totalMaintenance],
    ['☁️', 'Cloud & Infra (lifecycle)',   s.totalCloud],
    ['📜', 'IP Licensing',               s.totalLicensing],
  ];
  const compRows = comp.map(([icon, label, val]) => {
    const pct = s.grandTotal > 0 ? val / s.grandTotal * 100 : 0;
    return `<tr>
      <td>${icon} ${esc(label)}</td>
      <td class="sw-num">${fmtM(val)}</td>
      <td class="sw-num">${fmt(pct, 1)}%</td>
      <td><div class="sw-bar-track"><div class="sw-bar-fill" style="width:${pct.toFixed(1)}%;background:#2563eb"></div></div></td>
    </tr>`;
  }).join('');

  const compEl = document.getElementById('sw-cost-composition');
  if (compEl) compEl.innerHTML = `
    <div class="sw-section-title"><span>💰</span> Cost Composition (9 Dimensions)</div>
    <table class="sw-data-table">
      <thead><tr><th>Cost Bucket</th><th class="sw-num">Value</th><th class="sw-num">Share</th><th>Distribution</th></tr></thead>
      <tbody>${compRows}
      <tr style="background:#f8fafc;font-weight:700">
        <td>TOTAL PROGRAMME COST</td>
        <td class="sw-num" style="color:#2563eb">${fmtM(s.grandTotal)}</td>
        <td class="sw-num">100%</td>
        <td></td>
      </tr>
      </tbody>
    </table>`;

  // Module detail table (sorted by cost, all modules)
  const sortedMods = [...result.modules].sort((a,b) => b.grandTotal - a.grandTotal);
  const modRows = sortedMods.map((m, i) => {
    const meta = CAT_META[m.category];
    return `<tr class="${i < 5 ? 'sw-highlight' : ''}">
      <td>${i + 1}</td>
      <td style="font-weight:600">${esc(m.moduleName)}</td>
      <td><span style="color:${meta?.color ?? '#64748b'}">${meta?.icon ?? ''}</span> ${esc(m.categoryLabel)}</td>
      <td>${asilBadge(m.asilUsed)}</td>
      <td style="font-size:0.75rem;color:#64748b">${esc(m.complexityUsed)}</td>
      <td style="font-size:0.75rem;color:#64748b">${esc(m.reuseUsed)}</td>
      <td class="sw-num">${fmt(m.personMonths, 0)}</td>
      <td class="sw-num">${fmtM(m.development.total)}</td>
      <td class="sw-num">${fmtM(m.testing.total)}</td>
      <td class="sw-num">${fmtM(m.grandTotal)}</td>
      <td class="sw-num" style="color:#059669;font-weight:600">£${fmt(m.perVehicle, 0)}</td>
    </tr>`;
  }).join('');

  const modTableEl = document.getElementById('sw-module-table');
  if (modTableEl) modTableEl.innerHTML = `
    <div class="sw-section-title"><span>📋</span> Module Cost Detail — All ${result.modules.length} Active Modules</div>
    <div style="overflow-x:auto">
    <table class="sw-data-table">
      <thead><tr>
        <th>#</th><th>Module</th><th>Category</th><th>ASIL</th>
        <th>Complexity</th><th>Reuse</th><th class="sw-num">PM</th>
        <th class="sw-num">Dev Cost</th><th class="sw-num">Test Cost</th>
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
      <td class="sw-num sw-highlight" style="background:#eff6ff !important">${base}</td>
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
    <p style="font-size:0.72rem;color:#94a3b8;margin-top:10px">* Low = favourable (lower cost). High = unfavourable (higher cost). Base = this calculation.</p>`;

  // Benchmark comparison
  const bmRows = result.benchmarks.map(b => {
    const isThis = b.vehicle.includes('This Model');
    const diff   = b.totalM > 0 ? ((b.totalM - s.grandTotal / 1_000_000) / (s.grandTotal / 1_000_000) * 100) : 0;
    const diffFmt = isThis ? 'Base' : `${diff >= 0 ? '+' : ''}${fmt(diff, 0)}%`;
    const diffColor = isThis ? '#2563eb' : diff > 0 ? '#ef4444' : '#059669';
    return `<tr ${isThis ? 'style="background:#eff6ff;font-weight:700"' : ''}>
      <td>${isThis ? '⭐ ' : ''}${esc(b.vehicle)}</td>
      <td class="sw-num">${b.totalM > 0 ? fmtM(b.totalM * 1_000_000) : fmtM(s.grandTotal)}</td>
      <td class="sw-num">£${b.perVehicle > 0 ? fmt(b.perVehicle, 0) : fmt(s.perVehicle, 0)}</td>
      <td class="sw-num" style="color:${diffColor};font-weight:600">${diffFmt}</td>
      <td style="font-size:0.72rem;color:#94a3b8">${esc(b.source)}</td>
    </tr>`;
  }).join('');

  const bmEl = document.getElementById('sw-benchmarks');
  if (bmEl) bmEl.innerHTML = `
    <div class="sw-section-title"><span>🏆</span> Benchmark Comparison — Premium EV Programme SW Investment</div>
    <table class="sw-data-table">
      <thead><tr><th>Vehicle / Programme</th><th class="sw-num">Total SW Cost</th><th class="sw-num">£/Vehicle</th><th class="sw-num">vs This Model</th><th>Source</th></tr></thead>
      <tbody>${bmRows}</tbody>
    </table>
    <p style="font-size:0.72rem;color:#94a3b8;margin-top:10px">* Benchmark figures are industry estimates and analyst reports. OEM-specific programmes vary by architecture strategy, insourcing vs outsourcing mix, and capitalisation policy.</p>`;

  // Show results section
  const resultsEl = document.getElementById('sw-results');
  if (resultsEl) {
    resultsEl.style.display = '';
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

function exportSWPDF(result: SWProgramResult): void {
  // Dynamic import to avoid bundling jsPDF unconditionally here
  import('jspdf').then(({ jsPDF }) => {
    import('jspdf-autotable').then(({ default: autoTable }) => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const s = result.summary;
      const W = 210, MG = 14;

      // Cover
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

      // Helper
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
          ['Development Engineering', fmtM(s.totalDevelopment), fmt(s.totalDevelopment/s.grandTotal*100, 1)+'%'],
          ['Testing & Validation',    fmtM(s.totalTesting),     fmt(s.totalTesting/s.grandTotal*100, 1)+'%'],
          ['Integration & V&V',       fmtM(s.totalIntegration), fmt(s.totalIntegration/s.grandTotal*100, 1)+'%'],
          ['Toolchain & Licences',    fmtM(s.totalToolchain),   fmt(s.totalToolchain/s.grandTotal*100, 1)+'%'],
          ['Cybersecurity',           fmtM(s.totalCybersecurity), fmt(s.totalCybersecurity/s.grandTotal*100, 1)+'%'],
          ['Maintenance (lifecycle)', fmtM(s.totalMaintenance), fmt(s.totalMaintenance/s.grandTotal*100, 1)+'%'],
          ['Cloud & Infra (lifecycle)',fmtM(s.totalCloud),       fmt(s.totalCloud/s.grandTotal*100, 1)+'%'],
          ['IP Licensing',            fmtM(s.totalLicensing),   fmt(s.totalLicensing/s.grandTotal*100, 1)+'%'],
          ['TOTAL', fmtM(s.grandTotal), '100%'],
        ],
        headStyles: th,
        columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 44, halign: 'right' }, 2: { cellWidth: 38, halign: 'right' } },
        bodyStyles: { fontSize: 7, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: MG, right: MG },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // §2 Category breakdown
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('2. Cost by Software Category', MG, y); y += 6;
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

      // §3 Module detail
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('3. Module Cost Detail (Top 20 by Cost)', MG, y); y += 6;
      const topMods = [...result.modules].sort((a,b) => b.grandTotal - a.grandTotal).slice(0, 20);
      autoTable(doc, {
        startY: y,
        head: [['Module', 'Cat', 'ASIL', 'PM', 'Dev (£M)', 'Test (£M)', 'Total (£M)', '£/Veh']],
        body: topMods.map(m => [
          m.moduleName.length > 28 ? m.moduleName.slice(0, 26)+'…' : m.moduleName,
          m.category,
          m.asilUsed,
          fmt(m.personMonths, 0),
          fmtM(m.development.total),
          fmtM(m.testing.total),
          fmtM(m.grandTotal),
          `£${fmt(m.perVehicle, 0)}`,
        ]),
        headStyles: th,
        columnStyles: {
          0: { cellWidth: 64 }, 1: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 12, halign: 'center' },
          3: { cellWidth: 14, halign: 'right' }, 4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 22, halign: 'right' },
          7: { cellWidth: 16, halign: 'right' },
        },
        bodyStyles: { fontSize: 6.5, cellPadding: 2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: MG, right: MG },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // §4 Sensitivity
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('4. Sensitivity Analysis', MG, y); y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Parameter', 'Low Scenario', 'Base Case', 'High Scenario', 'Range']],
        body: result.sensitivity.map(r => {
          const f = (n: number) => r.unit === '£M' ? fmtM(n) : `£${fmt(n, 0)}`;
          return [r.parameter, f(r.low), f(r.base), f(r.high), f(r.high - r.low)];
        }),
        headStyles: th,
        columnStyles: {
          0: { cellWidth: 76 }, 1: { cellWidth: 26, halign: 'right' }, 2: { cellWidth: 26, halign: 'right' },
          3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 26, halign: 'right' },
        },
        bodyStyles: { fontSize: 7, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: MG, right: MG },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // §5 Benchmarks
      chk(8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
      doc.text('5. Benchmark Comparison', MG, y); y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Vehicle / Programme', 'Total SW Cost', '£/Vehicle', 'Source']],
        body: result.benchmarks.map(b => [
          b.vehicle,
          b.totalM > 0 ? fmtM(b.totalM * 1_000_000) : fmtM(s.grandTotal),
          `£${b.perVehicle > 0 ? fmt(b.perVehicle, 0) : fmt(s.perVehicle, 0)}`,
          b.source,
        ]),
        headStyles: th,
        columnStyles: {
          0: { cellWidth: 58 }, 1: { cellWidth: 30, halign: 'right' }, 2: { cellWidth: 24, halign: 'right' }, 3: { cellWidth: 70 },
        },
        bodyStyles: { fontSize: 6.5, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: MG, right: MG },
      });

      // Footer on all pages
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

// ─── Wire events ──────────────────────────────────────────────────────────────

export function wireSWPanel(): void {
  // Calculate button
  const calcBtn = document.getElementById('sw-calc-btn');
  if (calcBtn) {
    calcBtn.addEventListener('click', () => {
      readConfig();
      const origText = calcBtn.textContent ?? '';
      calcBtn.textContent = '⏳ Calculating…';
      (calcBtn as HTMLButtonElement).disabled = true;

      setTimeout(() => {
        try {
          _swResult = computeSWProgram(_swInputs);
          renderResults(_swResult);
        } finally {
          calcBtn.textContent = origText;
          (calcBtn as HTMLButtonElement).disabled = false;
        }
      }, 20);
    });
  }

  // Preset buttons
  document.querySelectorAll<HTMLButtonElement>('.sw-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset ?? '';
      applyPreset(preset);
    });
  });

  // Select/deselect all
  document.getElementById('sw-select-all')?.addEventListener('click', () => {
    document.querySelectorAll<HTMLInputElement>('.sw-mod-enable').forEach(cb => { cb.checked = true; });
  });
  document.getElementById('sw-deselect-all')?.addEventListener('click', () => {
    document.querySelectorAll<HTMLInputElement>('.sw-mod-enable').forEach(cb => { cb.checked = false; });
  });

  // PDF export
  document.getElementById('sw-pdf-btn')?.addEventListener('click', () => {
    if (_swResult) exportSWPDF(_swResult);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render the SW Should-Cost panel into containerEl, wire all events.
 * Call this from switchCommodity('automotive_software').
 */
export function initSWPanel(containerEl: HTMLElement): void {
  // Reset inputs to defaults on every entry so the form is clean
  _swInputs = defaultSWProgramInputs();
  _swResult = null;
  containerEl.innerHTML = renderSWPanelHTML();
  wireSWPanel();
}
