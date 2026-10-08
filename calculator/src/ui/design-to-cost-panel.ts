/**
 * Design to Cost — the results tab where the should-cost meets the target, live.
 *
 * Modelled on Boothroyd Dewhurst's Concurrent Costing and aPriori: the target and
 * the gap at the top, then the part's own design levers (the geometric DFM
 * findings that carry a £) as switches, the cost's drivers with what each would
 * have to fall to on its own, and what-if sliders — every move re-costs the part
 * through the SAME stack the headline came from (`design-to-cost.ts`), so
 * overhead and margin follow. Nothing here is a second cost model.
 *
 * Pure builders + one binder, like `dfm-geometry-panel.ts`: the builders are
 * tested under node, the binder only wires inputs to a re-render of the
 * projection block (so a slider keeps focus while it moves).
 */
import { escHtml } from './toast.js';
import type { UniversalStackInput, RateLibrary } from '../engine/types.js';
import {
  dfmLevers, costDrivers, projectDesignToCost, costsNotInStack,
  type DtcFindingLike, type DtcLever, type DtcDriver, type DtcWhatIf, type DtcProjection,
} from '../engine/design-to-cost.js';

export interface DtcPanelModel {
  input: UniversalStackInput;
  library: RateLibrary;
  /** Grouped geometric DFM findings; null = no CAD analysis for this costing. */
  grouped: readonly DtcFindingLike[] | null;
  /** The DFM job is still running. */
  dfmPending?: boolean;
  /** Target piece price in £ (the target-price field, converted); null/0 = none set. */
  targetGBP: number | null;
  /** £ → display string in the user's currency. */
  money: (gbp: number) => string;
}

export interface DtcState {
  key: string;
  on: Set<string>;
  whatIf: DtcWhatIf;
}

/** How many operations get a cycle-time slider — the costliest ones; the rest are in the driver table. */
export const DTC_OP_SLIDERS = 3;

export function dtcStateKey(input: UniversalStackInput): string {
  return `${input.partName}|${input.operations.length}|${input.rawMaterial.materialId}`;
}

export function freshDtcState(input: UniversalStackInput): DtcState {
  return { key: dtcStateKey(input), on: new Set(), whatIf: {} };
}

function pct(n: number, digits = 0): string { return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)} %`; }

function qty(q: { value: number; unit: string }, money: (g: number) => string): string {
  if (q.unit === '£') return money(q.value);
  if (q.unit === 's') return q.value >= 120 ? `${(q.value / 60).toFixed(2)} min` : `${q.value.toFixed(1)} s`;
  return `${q.value.toFixed(q.value < 10 ? 3 : 1)} ${q.unit}`;
}

/** Gap line and RAG class: within 5 % is on target (the cost card's band). */
export function gapStatus(totalGBP: number, targetGBP: number | null): { cls: string; text: string } | null {
  if (!targetGBP || !(targetGBP > 0)) return null;
  const gap = totalGBP - targetGBP;
  const p = (gap / targetGBP) * 100;
  if (Math.abs(p) <= 5) return { cls: 'ok', text: `on target (${pct(p, 1)})` };
  return gap > 0 ? { cls: 'over', text: `over target by ${pct(p, 1)}` } : { cls: 'under', text: `under target by ${pct(-p, 1).replace('+', '')}` };
}

export function buildDtcProjection(p: DtcProjection, m: Pick<DtcPanelModel, 'targetGBP' | 'money'>): string {
  const st = gapStatus(p.projected.total, m.targetGBP);
  const closed = p.gapClosed !== undefined ? ` — closes ${Math.round(p.gapClosed * 100)} % of the gap` : '';
  return `
    <div class="dtc-kpi"><span>Projected</span><strong data-dtc-projected>${m.money(p.projected.total)}</strong>
      <em>${p.savingGBP > 0.00005 ? `−${m.money(p.savingGBP)} / part${closed}` : p.savingGBP < -0.00005 ? `+${m.money(-p.savingGBP)} / part` : 'no change selected'}</em></div>
    ${st ? `<div class="dtc-kpi dtc-${st.cls}"><span>Projected v target</span><strong>${escHtml(st.text)}</strong></div>` : ''}
    ${p.applied.length ? `<ul class="dtc-applied">${p.applied.map(a => `<li>${escHtml(a)}</li>`).join('')}</ul>` : ''}`;
}

function leverRows(levers: DtcLever[], st: DtcState, money: (g: number) => string): string {
  return levers.map(l => `
    <tr>
      <td><input type="checkbox" data-dtc-lever="${escHtml(l.id)}" id="dtc-${escHtml(l.id)}"${st.on.has(l.id) ? ' checked' : ''}></td>
      <td><label for="dtc-${escHtml(l.id)}">${escHtml(l.title)}</label>${l.kind === 'upper-bound' ? ' <span class="dtc-tag" title="The whole feature\'s cost: deleting it saves this; shortening or opening it saves part">upper bound</span>' : ''}
        <div class="dtc-basis">${escHtml(l.basis)}${l.confidence === 'indicative' ? ' · indicative' : ''}</div></td>
      <td class="num">−${money(l.savingGBP)}</td>
      <td>${l.faceIds.length ? `<button type="button" class="btn btn-secondary btn-xs" data-dtc-faces="${escHtml(l.id)}">Show ${l.faceIds.length} face${l.faceIds.length === 1 ? '' : 's'}</button>` : ''}</td>
    </tr>`).join('');
}

function driverRows(drivers: DtcDriver[], money: (g: number) => string, hasTarget: boolean): string {
  return drivers.map(d => {
    const tt = d.toTarget;
    const to = !hasTarget ? '' : tt === 'met' ? 'target met' : tt === 'not-alone' ? 'cannot close the gap alone'
      : tt && d.quantity ? `${qty({ value: tt.value, unit: d.quantity.unit }, money)} (${pct(tt.pct)})` : tt ? pct(tt.pct) : '—';
    return `
    <tr>
      <td>${escHtml(d.label)}${d.quantity ? `<div class="dtc-basis">${escHtml(d.quantity.name)} ${escHtml(qty(d.quantity, money))}</div>` : ''}</td>
      <td class="num">${money(d.stackGBP)}</td>
      <td><div class="dtc-bar" role="img" aria-label="${(d.share * 100).toFixed(0)} % of the piece price"><i style="width:${Math.max(1, Math.min(100, d.share * 100)).toFixed(1)}%"></i></div>
        <span class="dtc-share">${(d.share * 100).toFixed(1)} %</span></td>
      ${hasTarget ? `<td class="dtc-to">${escHtml(to)}</td>` : ''}
    </tr>`;
  }).join('');
}

function slider(id: string, label: string, value: number, min: number, max: number, step: number, unit: string, hint: string): string {
  return `
    <div class="dtc-slider">
      <label for="${id}">${escHtml(label)} <output data-dtc-out="${id}">${unit === '×' ? `×${value}` : pct(value)}</output></label>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" data-dtc-unit="${unit}">
      <div class="dtc-basis">${escHtml(hint)}</div>
    </div>`;
}

/** Costs the DFM priced that the sheet does not carry yet (a hole it assumes is cored): to ADD, not to switch off. */
function notInStackBlock(m: DtcPanelModel): string {
  const xs = m.grouped ? costsNotInStack(m.grouped) : [];
  if (!xs.length) return '';
  return `<section aria-labelledby="dtc-h-add"><h4 id="dtc-h-add">Not in the should-cost yet</h4>
    <ul class="dtc-add">${xs.map(x => `<li>${escHtml(x.title)} — <strong>+${m.money(x.gbp)}</strong> / part before overhead and margin`
      + `${x.basis ? `<div class="dtc-basis">${escHtml(x.basis)}</div>` : ''}</li>`).join('')}</ul></section>`;
}

/** The whole tab. `levers` / `drivers` are passed in so the binder and the test cost them once. */
export function buildDtcPanel(m: DtcPanelModel, st: DtcState, levers: DtcLever[], drivers: DtcDriver[], proj: DtcProjection): string {
  const hasTarget = !!(m.targetGBP && m.targetGBP > 0);
  const gs = gapStatus(proj.base.total, m.targetGBP);
  const gap = hasTarget ? proj.base.total - (m.targetGBP as number) : 0;

  const designBody = m.grouped === null
    ? `<p class="dtc-empty">No CAD analysis for this costing. Upload a STEP in CAD-to-Cost: the geometric DFM measures the part and each priced finding becomes a switch here.</p>`
    : m.dfmPending && !m.grouped.length
      ? `<p class="dtc-empty">The geometric DFM is still running on the part — its levers appear here when it lands.</p>`
      : levers.length
        ? `<table class="dtc-table"><thead><tr><th scope="col"><span class="sr-only">Apply</span></th><th scope="col">Design change (from the measured part)</th><th scope="col" class="num">Saves / part</th><th scope="col"><span class="sr-only">Faces</span></th></tr></thead><tbody>${leverRows(levers, st, m.money)}</tbody></table>`
        : `<p class="dtc-empty">The DFM ran and none of its findings carries a modelled £ on this costing — see the DFM panel for the unpriced ones and why.</p>`;

  const opDrivers = drivers.filter(d => d.kind === 'operation').slice(0, DTC_OP_SLIDERS);
  const material = drivers.find(d => d.kind === 'material' && d.quantity?.unit === 'kg');
  const tooling = drivers.find(d => d.kind === 'tooling');
  const sliders = [
    material ? slider('dtc-mass', 'Part mass', st.whatIf.massPct ?? 0, -50, 20, 1, '%', 'Net mass; material and its melt / process energy scale with it.') : '',
    ...opDrivers.map(d => {
      const i = Number(d.id.slice(3));
      return slider(`dtc-op-${i}`, `${d.label} — ${d.quantity?.name ?? 'time'}`, st.whatIf.cyclePct?.[i] ?? 0, -60, 30, 1, '%', `Now ${d.quantity ? qty(d.quantity, m.money) : '—'} a cycle.`);
    }),
    tooling ? slider('dtc-toolvol', 'Tool amortisation volume', st.whatIf.toolingVolumeFactor ?? 1, 0.5, 4, 0.25, '×', 'Commercial, not design: the same tool spread over more (or fewer) parts.') : '',
  ].join('');

  return `
  <div class="dtc" data-dtc-root>
    <div class="dtc-head">
      <div class="dtc-kpi"><span>Should-cost</span><strong>${m.money(proj.base.total)}</strong><em>per part, as costed</em></div>
      <div class="dtc-kpi"><span>Target</span><strong>${hasTarget ? m.money(m.targetGBP as number) : '—'}</strong>
        <em>${hasTarget ? '' : 'Set a target price in the form to see the gap.'}</em></div>
      ${gs ? `<div class="dtc-kpi dtc-${gs.cls}"><span>Gap</span><strong>${gap > 0 ? m.money(gap) : m.money(-gap)}</strong><em>${escHtml(gs.text)}</em></div>` : ''}
      <div class="dtc-proj" data-dtc-proj aria-live="polite">${buildDtcProjection(proj, m)}</div>
    </div>
    <p class="dtc-note">Every figure is this part re-costed through the same 8-bucket stack as the headline — overhead and margin follow. Design levers are measured on the part: their minutes and tooling come off the costing's own operations, at those operations' rates. Drivers and what-ifs hold everything else equal.</p>

    <section aria-labelledby="dtc-h-design"><h4 id="dtc-h-design">Design levers</h4>${designBody}</section>

    ${notInStackBlock(m)}

    <section aria-labelledby="dtc-h-drivers"><h4 id="dtc-h-drivers">Cost drivers${hasTarget && gap > 0 ? ' — and what each must fall to, alone, to hit the target' : ''}</h4>
      ${drivers.length ? `<table class="dtc-table"><thead><tr><th scope="col">Driver</th><th scope="col" class="num">£ / part</th><th scope="col">Share</th>${hasTarget ? '<th scope="col">To hit target alone</th>' : ''}</tr></thead><tbody>${driverRows(drivers, m.money, hasTarget)}</tbody></table>` : '<p class="dtc-empty">No drivers to show.</p>'}
    </section>

    <section aria-labelledby="dtc-h-whatif"><h4 id="dtc-h-whatif">What-if</h4>
      <div class="dtc-sliders">${sliders || '<p class="dtc-empty">Nothing on this costing to vary.</p>'}</div>
      <button type="button" class="btn btn-secondary btn-xs" data-dtc-reset>Reset</button>
    </section>
  </div>`;
}

/** Cost everything the tab needs, once. */
export function computeDtc(m: DtcPanelModel, st: DtcState): { levers: DtcLever[]; drivers: DtcDriver[]; proj: DtcProjection } {
  const levers = m.grouped ? dfmLevers(m.grouped, m.input, m.library) : [];
  const drivers = costDrivers(m.input, m.library, m.targetGBP ?? undefined);
  const proj = projectDesignToCost(m.input, m.library, levers.filter(l => st.on.has(l.id)), st.whatIf, m.targetGBP ?? undefined);
  return { levers, drivers, proj };
}

let _state: DtcState | null = null;

/** Render the tab into `host` and wire it. State (switches, sliders) survives re-renders of the same part. */
export function mountDtcPanel(host: HTMLElement, m: DtcPanelModel, onHighlight?: (faceIds: number[]) => void): void {
  if (!_state || _state.key !== dtcStateKey(m.input)) _state = freshDtcState(m.input);
  const st = _state;
  let { levers, drivers, proj } = computeDtc(m, st);
  // A lever id that no longer exists (the DFM re-ran) is dropped.
  for (const id of [...st.on]) if (!levers.some(l => l.id === id)) st.on.delete(id);
  host.innerHTML = buildDtcPanel(m, st, levers, drivers, proj);

  const reproject = () => {
    proj = projectDesignToCost(m.input, m.library, levers.filter(l => st.on.has(l.id)), st.whatIf, m.targetGBP ?? undefined);
    const box = host.querySelector<HTMLElement>('[data-dtc-proj]');
    if (box) box.innerHTML = buildDtcProjection(proj, m);
  };
  host.querySelectorAll<HTMLInputElement>('[data-dtc-lever]').forEach(cb => cb.addEventListener('change', () => {
    const id = cb.dataset.dtcLever!;
    if (cb.checked) st.on.add(id); else st.on.delete(id);
    reproject();
  }));
  host.querySelectorAll<HTMLButtonElement>('[data-dtc-faces]').forEach(b => b.addEventListener('click', () => {
    const l = levers.find(x => x.id === b.dataset.dtcFaces);
    if (l && onHighlight) onHighlight(l.faceIds);
  }));
  host.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(r => r.addEventListener('input', () => {
    const v = Number(r.value);
    const out = host.querySelector(`[data-dtc-out="${r.id}"]`);
    if (out) out.textContent = r.dataset.dtcUnit === '×' ? `×${v}` : pct(v);
    if (r.id === 'dtc-mass') st.whatIf.massPct = v;
    else if (r.id === 'dtc-toolvol') st.whatIf.toolingVolumeFactor = v;
    else if (r.id.startsWith('dtc-op-')) st.whatIf.cyclePct = { ...(st.whatIf.cyclePct ?? {}), [Number(r.id.slice(7))]: v };
    reproject();
  }));
  host.querySelector<HTMLButtonElement>('[data-dtc-reset]')?.addEventListener('click', () => {
    _state = freshDtcState(m.input);
    mountDtcPanel(host, m, onHighlight);
  });
}
