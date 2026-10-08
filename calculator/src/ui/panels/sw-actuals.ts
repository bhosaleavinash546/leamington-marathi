/**
 * "Calibrate to your actuals" card for the software panel (software review P2 #21). The engine does the fitting
 * (sw-calibration.ts); this module only collects the logged modules, keeps them in this browser, and prints the fit.
 * The factor is applied only when the user presses "Use this factor" — it goes into the Effort Calibration field.
 */
import { calibrateSWEffort, modelledEffortPM } from '../../engine/sw-calibration.js';
import type { SWEffortActual } from '../../engine/sw-calibration.js';
import { SW_MODULES } from '../../engine/sw-should-cost.js';
import type { ASILLevel, SWComplexity, SWReuse } from '../../engine/sw-should-cost.js';

const KEY = 'cv-sw-effort-actuals';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function loadActuals(): SWEffortActual[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v as SWEffortActual[] : [];
  } catch { return []; }
}
function saveActuals(a: SWEffortActual[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private window / blocked storage — kept for this view only */ }
}

const opts = (vals: readonly string[], sel?: string) => vals.map(v => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

export function renderActualsHTML(): string {
  const modOpts = SW_MODULES.map(m => `<option value="${esc(m.id)}">${esc(m.shortName)}</option>`).join('');
  return `
  <details class="sw-config-card" id="sw-actuals-card" style="background:var(--sw-surface-alt);border:1px solid var(--sw-border);border-radius:10px;padding:0;margin-bottom:14px">
    <summary style="cursor:pointer;padding:12px 18px;font-weight:700;font-size:0.82rem;color:var(--sw-text-primary);list-style:none">
      Calibrate to your actuals <span id="sw-actuals-badge" style="font-size:0.7rem;font-weight:400;color:var(--sw-text-muted)"></span>
    </summary>
    <div style="padding:0 18px 16px">
      <p style="font-size:0.74rem;color:var(--sw-text-secondary);margin:0 0 10px">Log finished modules with the settings they were built at and the
        engineering effort they actually took (development + test + integration + cybersecurity + calibration, person-months). The model
        re-estimates each one alone at those settings; the factor is Σ actual ÷ Σ modelled. Kept in this browser only.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">
        <label class="sw-label" style="display:flex;flex-direction:column;gap:3px">Module<select id="swa-module" class="sw-config-sel">${modOpts}</select></label>
        <label class="sw-label" style="display:flex;flex-direction:column;gap:3px">ASIL<select id="swa-asil" class="sw-config-sel">${opts(['QM', 'A', 'B', 'C', 'D'], 'B')}</select></label>
        <label class="sw-label" style="display:flex;flex-direction:column;gap:3px">Complexity<select id="swa-comp" class="sw-config-sel">${opts(['Low', 'Medium', 'High', 'Very High'], 'Medium')}</select></label>
        <label class="sw-label" style="display:flex;flex-direction:column;gap:3px">Reuse<select id="swa-reuse" class="sw-config-sel">${opts(['Fresh', 'Light', 'Medium', 'Heavy', 'Platform'], 'Fresh')}</select></label>
        <label class="sw-label" style="display:flex;flex-direction:column;gap:3px">Actual effort (PM)<input id="swa-pm" type="number" min="0.1" step="0.1" class="sw-config-inp" style="width:110px"></label>
        <label class="sw-label" style="display:flex;flex-direction:column;gap:3px">Project<input id="swa-project" type="text" class="sw-config-inp" style="width:140px" placeholder="optional"></label>
        <button type="button" id="swa-add" class="sw-preset-btn">Add</button>
      </div>
      <div id="swa-msg" role="status" style="font-size:0.72rem;color:var(--sw-text-muted);margin-top:6px"></div>
      <div id="swa-table" style="overflow-x:auto;margin-top:10px"></div>
      <div id="swa-result" style="margin-top:10px;font-size:0.78rem"></div>
    </div>
  </details>`;
}

/** Wire the card. `onApply` receives the fitted factor (rounded to 3 dp) when the user chooses to use it. */
export function wireActuals(onApply: (factor: number) => void): void {
  const g = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  let actuals = loadActuals();

  const draw = () => {
    const fit = calibrateSWEffort(actuals);
    const badge = g('sw-actuals-badge');
    if (badge) badge.textContent = fit.factor !== null ? `· factor ×${fit.factor.toFixed(2)} from ${fit.n} module${fit.n === 1 ? '' : 's'}` : '· none logged';
    const table = g('swa-table');
    if (table) table.innerHTML = actuals.length ? `<table class="sw-data-table" style="font-size:0.74rem">
      <thead><tr><th>Module</th><th>Project</th><th>Settings</th><th class="sw-num">Actual PM</th><th class="sw-num">Model PM</th><th class="sw-num">Actual ÷ model</th><th></th></tr></thead>
      <tbody>${actuals.map((a, i) => {
        const known = SW_MODULES.some(m => m.id === a.moduleId);
        const model = known ? modelledEffortPM(a) : NaN;
        return `<tr>
        <td>${esc(SW_MODULES.find(m => m.id === a.moduleId)?.shortName ?? a.moduleId)}</td><td>${esc(a.project ?? '')}</td>
        <td>${esc(`${a.asil} · ${a.complexity} · ${a.reuse}`)}</td>
        <td class="sw-num">${Number(a.actualPersonMonths).toFixed(1)}</td>
        <td class="sw-num">${Number.isFinite(model) ? model.toFixed(1) : '—'}</td>
        <td class="sw-num">${Number.isFinite(model) && model > 0 ? (a.actualPersonMonths / model).toFixed(2) : '—'}</td>
        <td><button type="button" class="swa-del" data-i="${i}" aria-label="Remove logged ${esc(a.moduleId)}" style="font-size:0.7rem">Remove</button></td>
      </tr>`; }).join('')}</tbody></table>` : '';
    const res = g('swa-result');
    if (res) {
      const ok = fit.factor !== null && fit.factor >= 0.2 && fit.factor <= 5;
      res.innerHTML = fit.factor === null ? '<span style="color:var(--sw-text-muted)">No modules logged yet — the model is uncalibrated.</span>'
        : `<strong>Effort factor ×${fit.factor.toFixed(3)}</strong> = Σ actual ${fit.sumActualPM.toFixed(1)} PM ÷ Σ modelled ${fit.sumModelledPM.toFixed(1)} PM (n = ${fit.n})
           ${fit.warnings.map(w => `<div style="color:var(--amber,#b45309);margin-top:4px">${esc(w)}</div>`).join('')}
           ${ok ? `<div style="margin-top:6px"><button type="button" id="swa-apply" class="sw-preset-btn">Use this factor</button></div>` : ''}`;
      g('swa-apply')?.addEventListener('click', () => {
        if (fit.factor === null) return;
        onApply(Math.round(fit.factor * 1000) / 1000);
        const msg = g('swa-msg'); if (msg) msg.textContent = `Effort calibration set to ×${fit.factor.toFixed(3)} — press Calculate to re-cost.`;
      });
    }
    document.querySelectorAll<HTMLButtonElement>('.swa-del').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      if (i >= 0) { actuals.splice(i, 1); saveActuals(actuals); draw(); }
    }));
  };

  g('swa-add')?.addEventListener('click', () => {
    const pm = parseFloat(g<HTMLInputElement>('swa-pm')?.value ?? '');
    const msg = g('swa-msg');
    if (!(pm > 0)) { if (msg) msg.textContent = 'Enter the effort the module actually took, in person-months.'; return; }
    actuals = [...actuals, {
      moduleId:   g<HTMLSelectElement>('swa-module')!.value,
      asil:       g<HTMLSelectElement>('swa-asil')!.value as ASILLevel,
      complexity: g<HTMLSelectElement>('swa-comp')!.value as SWComplexity,
      reuse:      g<HTMLSelectElement>('swa-reuse')!.value as SWReuse,
      actualPersonMonths: pm,
      project:    g<HTMLInputElement>('swa-project')?.value.trim() || undefined,
    }];
    saveActuals(actuals);
    const pmEl = g<HTMLInputElement>('swa-pm'); if (pmEl) pmEl.value = '';
    if (msg) msg.textContent = 'Logged.';
    draw();
  });
  draw();
}
