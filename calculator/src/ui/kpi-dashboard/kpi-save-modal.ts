/**
 * "Save to KPI Dashboard" — the details step on save (decided 11 Nov 2026). The costing is
 * not changed: its should-cost (GBP, as computed) and the engine's delivery terms are shown
 * read-only; the engineer adds what the costing does not hold — part number, programme,
 * model year, powertrain, status and the current (quoted / paid) cost in its own currency.
 */
import { apiBase } from '../../api-base.js';
import { STANDARD_PROGRAMMES, STANDARD_POWERTRAINS } from '../../engine/kpi-dashboard.js';
import { esc, gbp } from './kpi-builders.js';
import { showToast } from '../toast.js';

export interface SaveContext {
  scenarioId?: string;
  name: string;
  commodity: string;
  commodityLabel: string;
  region: string;
  input: Record<string, unknown> & { partName?: string; annualVolume?: number; deliveryTerms?: string };
  result: { total: number; partName?: string } & Record<string, unknown>;
}

let currencies: { code: string; symbol: string }[] | null = null;
async function loadCurrencies(): Promise<{ code: string; symbol: string }[]> {
  if (currencies) return currencies;
  try {
    const r = await fetch(`${apiBase}/api/kpi/meta`);
    if (r.ok) currencies = ((await r.json()) as { currencies: { code: string; symbol: string }[] }).currencies;
  } catch { /* offline: GBP only */ }
  return currencies ?? [{ code: 'GBP', symbol: '£' }];
}

const PREFERRED = ['GBP', 'EUR', 'USD', 'CNY', 'INR', 'JPY', 'KRW', 'PLN', 'CZK', 'HUF', 'MXN', 'TRY', 'SEK'];

function selectOrOther(id: string, label: string, opts: readonly string[]): string {
  return `<div class="kd-field"><label for="${id}">${label}</label>
    <select id="${id}" class="kd-select" data-other="${id}-other"><option value="">Not set</option>${opts.map(o => `<option>${esc(o)}</option>`).join('')}<option value="__other">Other…</option></select>
    <input id="${id}-other" class="kd-input" type="text" maxlength="40" placeholder="Type the ${label.toLowerCase()}" hidden aria-label="Other ${label.toLowerCase()}"></div>`;
}

export async function openKpiSaveModal(ctx: SaveContext): Promise<void> {
  document.getElementById('kd-save-dialog')?.remove();
  const ccys = await loadCurrencies();
  const ordered = [...PREFERRED.filter(c => ccys.some(x => x.code === c)), ...ccys.map(c => c.code).filter(c => !PREFERRED.includes(c))];
  const terms = ctx.input.deliveryTerms === 'EXW' ? 'EXW' : 'DAP';
  const dlg = document.createElement('dialog');
  dlg.id = 'kd-save-dialog';
  dlg.className = 'kd-dialog';
  dlg.setAttribute('aria-labelledby', 'kd-save-title');
  dlg.innerHTML = `<form method="dialog" class="kd-dialog-in" novalidate>
    <div class="kd-dialog-h"><div><h2 id="kd-save-title">Save to KPI Dashboard</h2>
      <p>Adds this costing to the shared dashboard. Everyone signed in can see it; only you or an admin can change it.</p></div>
      <button type="button" class="kd-icon-btn" data-close aria-label="Close">×</button></div>
    <div class="kd-save-should"><span>Should-cost (from this costing)</span><strong>${gbp(ctx.result.total)}</strong>
      <span class="kd-muted">per piece · GBP · ${terms} · ${esc(ctx.region)} · ${esc(ctx.commodityLabel)}</span></div>
    <div class="kd-form-grid">
      <div class="kd-field"><label for="kd-s-pn">Part number <span aria-hidden="true">*</span></label><input id="kd-s-pn" class="kd-input" required maxlength="60" autocomplete="off" aria-describedby="kd-s-pn-h"><small id="kd-s-pn-h">Identifies the component. Revisions are matched on part number, programme, model year and powertrain — never on name.</small></div>
      <div class="kd-field"><label for="kd-s-name">Component name</label><input id="kd-s-name" class="kd-input" maxlength="160" value="${esc(ctx.input.partName || ctx.result.partName || ctx.name)}"></div>
      ${selectOrOther('kd-s-prog', 'Programme', STANDARD_PROGRAMMES)}
      <div class="kd-field"><label for="kd-s-my">Model year</label><input id="kd-s-my" class="kd-input" type="number" min="2000" max="2100" step="1" placeholder="e.g. 2027"></div>
      ${selectOrOther('kd-s-pt', 'Powertrain', STANDARD_POWERTRAINS)}
      <div class="kd-field"><label for="kd-s-status">Status</label><select id="kd-s-status" class="kd-select"><option value="draft">Draft</option><option value="completed" selected>Completed</option></select><small>Reviewed and approved are set by an admin.</small></div>
    </div>
    <fieldset class="kd-fieldset"><legend>Current cost (optional)</legend>
      <p class="kd-muted">The price paid or quoted per piece, in the currency it was given in. It is converted to GBP at the approved rate for this month and the rate is frozen on the record.</p>
      <div class="kd-form-grid">
        <div class="kd-field"><label for="kd-s-cc">Amount per piece</label><input id="kd-s-cc" class="kd-input" type="number" min="0" step="any" inputmode="decimal"></div>
        <div class="kd-field"><label for="kd-s-ccy">Currency</label><select id="kd-s-ccy" class="kd-select"><option value="">Choose…</option>${ordered.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="kd-field"><label for="kd-s-terms">Delivery terms</label><select id="kd-s-terms" class="kd-select"><option value="">Choose…</option><option value="DAP">DAP (delivered)</option><option value="EXW">EXW (ex works)</option></select><small>Compared with the should-cost only on the same terms (${terms}).</small></div>
        <div class="kd-field"><label for="kd-s-src">Source</label><select id="kd-s-src" class="kd-select"><option value="quote">Supplier quote</option><option value="purchase order">Purchase order</option><option value="contract">Contract price</option><option value="other">Other</option></select></div>
      </div></fieldset>
    <div class="kd-form-grid">
      <div class="kd-field"><label for="kd-s-vol">Annual volume</label><input id="kd-s-vol" class="kd-input" type="number" min="0" step="1" value="${Number.isFinite(ctx.input.annualVolume) ? Number(ctx.input.annualVolume) : ''}"><small>Used for an annualised figure only after an admin validates it.</small></div>
      <div class="kd-field kd-field-wide"><label for="kd-s-notes">Notes</label><textarea id="kd-s-notes" class="kd-input" rows="2" maxlength="1000"></textarea></div>
    </div>
    <p class="kd-form-err" role="alert" hidden></p>
    <div class="kd-dialog-f"><button type="button" class="kd-btn kd-btn-ghost" data-close>Cancel</button><button type="submit" class="kd-btn kd-btn-primary">Save to dashboard</button></div>
  </form>`;
  document.body.appendChild(dlg);
  const $ = <T extends HTMLElement>(sel: string) => dlg.querySelector<T>(sel)!;
  const err = $('.kd-form-err');
  dlg.querySelectorAll<HTMLSelectElement>('select[data-other]').forEach(s => s.addEventListener('change', () => {
    const o = dlg.querySelector<HTMLInputElement>(`#${s.dataset.other}`)!;
    o.hidden = s.value !== '__other'; if (!o.hidden) o.focus();
  }));
  dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('close', () => dlg.remove());
  const pick = (id: string) => { const s = $<HTMLSelectElement>(`#${id}`); return s.value === '__other' ? $<HTMLInputElement>(`#${id}-other`).value.trim() || null : s.value || null; };
  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    const fail = (m: string, focus?: string) => { err.textContent = m; err.hidden = false; if (focus) $<HTMLElement>(focus).focus(); };
    err.hidden = true;
    const pn = $<HTMLInputElement>('#kd-s-pn').value.trim();
    if (!pn) return fail('Enter the part number.', '#kd-s-pn');
    const myRaw = $<HTMLInputElement>('#kd-s-my').value;
    const my = myRaw ? Number(myRaw) : null;
    if (my !== null && (!Number.isInteger(my) || my < 2000 || my > 2100)) return fail('Model year must be a four-digit year.', '#kd-s-my');
    const ccRaw = $<HTMLInputElement>('#kd-s-cc').value;
    const cc = ccRaw === '' ? null : Number(ccRaw);
    if (cc !== null && !(cc >= 0)) return fail('The current cost must be a number of 0 or more.', '#kd-s-cc');
    const ccy = $<HTMLSelectElement>('#kd-s-ccy').value || null;
    const ct = $<HTMLSelectElement>('#kd-s-terms').value || null;
    if (cc !== null && !ccy) return fail('Choose the currency of the current cost.', '#kd-s-ccy');
    if (cc !== null && !ct) return fail('Choose the delivery terms of the current cost.', '#kd-s-terms');
    const volRaw = $<HTMLInputElement>('#kd-s-vol').value;
    const btn = $<HTMLButtonElement>('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const scenarioId = ctx.scenarioId ?? `sc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const r = await fetch(`${apiBase}/api/kpi/records`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: { id: scenarioId, name: ctx.name, commodity: ctx.commodity, region: ctx.region, input: ctx.input, result: ctx.result },
          details: {
            partNumber: pn, componentName: $<HTMLInputElement>('#kd-s-name').value.trim() || undefined,
            programme: pick('kd-s-prog'), modelYear: my, powertrain: pick('kd-s-pt'),
            status: $<HTMLSelectElement>('#kd-s-status').value,
            currentCost: cc, currentCcy: cc !== null ? ccy : null, currentTerms: cc !== null ? ct : null,
            currentSource: cc !== null ? $<HTMLSelectElement>('#kd-s-src').value : null,
            annualVolume: volRaw === '' ? null : Math.round(Number(volRaw)), notes: $<HTMLTextAreaElement>('#kd-s-notes').value.trim(),
          },
        }),
      });
      const body = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) { btn.disabled = false; btn.textContent = 'Save to dashboard'; return fail(body.error ?? `Not saved (${r.status}).`); }
      dlg.close();
      showToast(`Saved ${pn} to the KPI Dashboard.`, 'info');
      document.dispatchEvent(new CustomEvent('cv-kpi-saved'));
    } catch {
      btn.disabled = false; btn.textContent = 'Save to dashboard';
      fail('The server could not be reached — nothing was saved.');
    }
  });
  dlg.showModal();
  $<HTMLInputElement>('#kd-s-pn').focus();
}
