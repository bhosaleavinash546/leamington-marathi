/**
 * "Verify these first" — the ten dearest BOM lines, ranked (EDU v6, Nov 2026). On the EDU control board the dearest
 * lines carried most of the component cost and one list-price ceiling (the AURIX pair) moved the board by £17: this is
 * where an engineer's minute is worth most. Each line says what stands behind its price. With customer-supplied parts,
 * the EMS invoice (the board less them) is printed under the list. Pure (data) → HTML builder; no main.ts state.
 */
import type { PCBImageAnalysis, PCBBOMItem } from './types.js';
import { escHtml } from '../toast.js';
import { pcbInfoRequest } from '../../export/pcb-info-request.js';
import '../styles/pcb-verify-list.css';

const money = (v: number, dp = 2) => `£${(Number(v) || 0).toFixed(dp)}`;

export function buildVerifyListSection(r: PCBImageAnalysis): string {
  const list = r._verifyList ?? [];
  if (!list.length) return '';
  const toVerify = list.filter(l => l.status === 'to verify');
  const share = list.reduce((t, l) => t + l.share, 0);
  const bd = r._selectedCountryBreakdown;
  const cs = bd?.breakdown?.customerSupplied ?? 0;
  const rows = list.map(l => `<tr>
    <td class="pcb-vl__n">${l.rank}</td>
    <td class="pcb-vl__ref">${escHtml(l.refDes)}</td>
    <td>${escHtml(l.description.slice(0, 80))}${l.partNumber ? ` <span class="pcb-vl__pn">${escHtml(l.partNumber)}</span>` : ''}${l.customerSupplied ? ' <span class="pcb-badge" title="Supplied by the customer (directed buy / consignment): no EMS burden on it, and it is not on the EMS invoice">Customer-supplied</span>' : ''}</td>
    <td class="pcb-vl__num">${l.qty}</td>
    <td class="pcb-vl__num">${money(l.lineTotalGBP)}</td>
    <td class="pcb-vl__num">${(l.share * 100).toFixed(1)} %</td>
    <td><span class="pcb-vl__status pcb-vl__status--${l.status === 'confirmed' ? 'ok' : 'check'}">${l.status === 'confirmed' ? 'Confirmed' : 'To verify'}</span> <span class="pcb-vl__why">${escHtml(l.why)}</span></td>
  </tr>`).join('');
  return `<section class="pcb-vl" aria-labelledby="pcb-vl-h">
    <h4 id="pcb-vl-h" class="pcb-vl__h">Verify these first — the ${list.length} dearest lines (${(share * 100).toFixed(0)} % of the components)</h4>
    ${buildQuantityBandLine(r)}
    ${r._componentMarket ? `<p class="pcb-vl__count">Components priced at the ${r._componentMarket.market === 'cn' ? 'China' : escHtml(r._componentMarket.market)} market (${escHtml(r._componentMarket.source)}): <strong>${money(r._componentMarket.componentsGBP)}</strong> a board, against ${money(r._componentMarket.globalComponentsGBP)} at global distributor prices; ${r._componentMarket.linesAtMarket} lines take a market price. Other countries in the comparison stay at global prices.</p>` : ''}
    <p class="pcb-vl__lead">${toVerify.length ? `${toVerify.length} of them rest on a class range, a family price or an unconfirmed part number. A quote, the BOM or a part number read off the chip moves the board most here.` : 'Every one of them stands on a confirmed price.'}</p>
    <div class="pcb-vl__wrap"><table class="pcb-vl__t">
      <thead><tr><th>#</th><th>Ref</th><th>Part</th><th class="pcb-vl__num">Qty</th><th class="pcb-vl__num">£ a board</th><th class="pcb-vl__num">Share</th><th>Price basis</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${cs > 0 && bd ? `<p class="pcb-vl__inv">EMS invoice <strong>${money(bd.emsInvoicePerBoard ?? bd.totalPerBoard - cs)}</strong> a board — the delivered cost ${money(bd.totalPerBoard)} less ${money(cs)} of parts the customer supplies (no EMS burden is charged on them).</p>` : ''}
  </section>`;
}

/** How a BOM line's quantity was counted, as a short note under its description (EDU v6). '' when not stated. */
export function countEvidenceHtml(item: PCBBOMItem): string {
  const m = item.countMethod;
  if (!m || m === 'unstated') return '';
  const range = item.qtyMin !== undefined && item.qtyMax !== undefined && item.qtyMin !== item.qtyMax ? ` (${item.qtyMin}–${item.qtyMax})` : '';
  const how = m === 'counted' ? 'counted' : m === 'bom' ? 'from the BOM / your edit' : m === 'designator-range' ? `from designator ranges${range}` : `estimated${range}`;
  const side = item.side && item.side !== 'unknown' ? `, ${item.side}` : '';
  const seen = (item.seenIn ?? []).length ? ` — in ${escHtml((item.seenIn ?? []).slice(0, 4).join(', '))}` : '';
  return `<div class="pcb-count-ev${m === 'estimated' || m === 'designator-range' ? ' pcb-count-ev--range' : ''}">Qty ${how}${side}${seen}</div>`;
}

/** The board's count: parts, the range they can be defended in, and how they were counted. '' with no band. */
export function buildQuantityBandLine(r: PCBImageAnalysis): string {
  const q = r._quantityBand;
  if (!q || !(q.parts > 0)) return '';
  const range = q.partsLow !== q.partsHigh ? ` — likely ${q.partsLow.toLocaleString('en-GB')} to ${q.partsHigh.toLocaleString('en-GB')} (${money(q.gbpLow)} / +${money(q.gbpHigh)} on the components)` : '';
  return `<p class="pcb-vl__count"><strong>${q.parts.toLocaleString('en-GB')} parts</strong>${range}. ${escHtml(q.note)}</p>`;
}

/** The two ranges, apart (EDU audit G-16 / M-06): sourced alternatives, and the judgement corridor with its basis. */
export function buildRangesSection(r: PCBImageAnalysis): string {
  const cb = r._confidenceBand;
  if (!cb) return '';
  const c = cb.conditional;
  const items = (c?.items ?? []).map(i => `<li>${escHtml(i.label)}: ${money(i.low)} / +${money(i.high)} <span class="pcb-vl__why">(${escHtml(i.source)})</span></li>`).join('');
  return `<section class="pcb-vl" aria-labelledby="pcb-rng-h">
    <h4 id="pcb-rng-h" class="pcb-vl__h">How far the figure can move</h4>
    <p class="pcb-vl__lead"><strong>Sourced range ${c ? `${money(c.low)} – ${money(c.high)}` : '—'}</strong>: only what sourced alternatives move${items ? '' : ' (none on this costing — counts stated exact, one component basis)'}.</p>
    ${items ? `<ul class="pcb-vl__list">${items}</ul>` : ''}
    <p class="pcb-vl__lead"><strong>Judgement corridor ${money(cb.totalLow)} – ${money(cb.totalHigh)}</strong>: part identity and scope, by CostVision engineering ratios — not a measured accuracy. ${cb.basis ? `<span class="pcb-vl__why">${escHtml(cb.basis)}</span>` : ''}</p>
    ${r._contractFx ? `<p class="pcb-vl__lead">Catalogue and class prices at the contract rate US$${r._contractFx.usdPerGbp} / £ (× ${r._contractFx.factor.toFixed(4)}).</p>` : ''}
  </section>`;
}

/** What to ask for (EDU audit G-18): ten items, ticked from what this costing holds. */
export function buildInfoRequestSection(r: PCBImageAnalysis): string {
  const items = pcbInfoRequest(r as never);
  const missing = items.filter(i => !i.have).length;
  return `<section class="pcb-vl" aria-labelledby="pcb-ir-h">
    <h4 id="pcb-ir-h" class="pcb-vl__h">Information request — ${missing ? `${missing} of 10 items to ask for` : 'all 10 items in hand'}</h4>
    <ul class="pcb-vl__list">${items.map(i => `<li><span class="pcb-vl__status pcb-vl__status--${i.have ? 'ok' : 'check'}">${i.have ? 'Have' : 'Ask'}</span> ${escHtml(i.item)} <span class="pcb-vl__why">— ${escHtml(i.why)}</span></li>`).join('')}</ul>
  </section>`;
}
