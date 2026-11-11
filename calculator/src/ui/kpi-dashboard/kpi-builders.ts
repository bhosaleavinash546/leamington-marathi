/**
 * KPI dashboard — pure (data) → HTML builders. No state, no DOM access, no arithmetic:
 * every figure arrives from the server's `buildFromClassified`. Every string that came
 * from a user, a file or a tool goes through `esc`.
 */
import {
  STATUS_LABEL, INELIGIBLE_LABEL, DATE_PRESET_LABEL, DRILL_LABEL, DIMENSIONS, NOT_SET, FX_METHOD_LABEL,
  type DashboardSummary, type DashboardFilters, type Dimension, type DrillGroup, type DrillLevel, type FilterOption,
  type CurrencyTotal, type RecordStatus, type FxApplied, type DatePreset,
} from '../../engine/kpi-dashboard.js';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ─── Formatting (display only) ────────────────────────────────────────────────

export function gbp(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const s = Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${n < 0 ? '−' : ''}£${s}`;
}
/** Compact £ for big headline numbers (£1.2m, £45.3k) — the exact figure goes in the title. */
export function gbpCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const a = Math.abs(n); const sign = n < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}£${(a / 1e9).toFixed(2)}bn`;
  if (a >= 1e6) return `${sign}£${(a / 1e6).toFixed(2)}m`;
  if (a >= 1e4) return `${sign}£${(a / 1e3).toFixed(1)}k`;
  return gbp(n, 2);
}
export function money(n: number | null | undefined, ccy: string | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n) || !ccy) return '—';
  return `${n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })} ${esc(ccy)}`;
}
export const pct = (n: number | null | undefined, dp = 1): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(dp)}%`;
export const int = (n: number): string => n.toLocaleString('en-GB');
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const DIM_LABEL: Record<Dimension, string> = {
  commodity: 'Commodity', programme: 'Programme', modelYear: 'Model year', powertrain: 'Powertrain', tool: 'Costing tool',
  country: 'Country / market', currency: 'Currency', status: 'Status', createdBy: 'Created by',
};
export const optionLabel = (dim: Dimension, v: string): string =>
  dim === 'status' ? (STATUS_LABEL[v as RecordStatus] ?? v) : dim === 'modelYear' && v !== NOT_SET ? `MY${v}` : v;

// ─── Filter bar ───────────────────────────────────────────────────────────────

export function multiSelectHtml(dim: Dimension, options: FilterOption[], selected: string[], open: boolean, query: string): string {
  const id = `kd-ms-${dim}`;
  const n = selected.length;
  const needle = query.trim().toLowerCase();
  const shown = options.filter(o => !needle || optionLabel(dim, o.value).toLowerCase().includes(needle));
  return `<div class="kd-ms${open ? ' is-open' : ''}" data-dim="${dim}">
    <button type="button" class="kd-ms-btn${n ? ' has-sel' : ''}" aria-haspopup="true" aria-expanded="${open}" aria-controls="${id}-pop" data-ms-toggle="${dim}">
      <span>${DIM_LABEL[dim]}</span>${n ? `<span class="kd-ms-count" aria-label="${n} selected">${n}</span>` : ''}
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    ${open ? `<div class="kd-ms-pop" id="${id}-pop" role="group" aria-label="${DIM_LABEL[dim]} filter">
      <input type="search" class="kd-ms-search" data-ms-search="${dim}" placeholder="Search ${DIM_LABEL[dim].toLowerCase()}…" aria-label="Search ${DIM_LABEL[dim]} options" value="${esc(query)}" autocomplete="off">
      <div class="kd-ms-list">${shown.length ? shown.map((o, i) => `
        <label class="kd-ms-opt${o.count === 0 && !selected.includes(o.value) ? ' is-empty' : ''}">
          <input type="checkbox" data-ms-opt="${dim}" value="${esc(o.value)}"${selected.includes(o.value) ? ' checked' : ''} id="${id}-o${i}">
          <span class="kd-ms-opt-l">${esc(optionLabel(dim, o.value))}</span><span class="kd-ms-opt-n">${int(o.count)}</span>
        </label>`).join('') : `<p class="kd-ms-none">No ${DIM_LABEL[dim].toLowerCase()} matches “${esc(query)}”.</p>`}</div>
      <div class="kd-ms-foot"><button type="button" class="kd-link" data-ms-clear="${dim}"${n ? '' : ' disabled'}>Clear</button><button type="button" class="kd-btn kd-btn-sm" data-ms-close="${dim}">Done</button></div>
    </div>` : ''}
  </div>`;
}

export function dateControlHtml(f: DashboardFilters): string {
  const opts = (Object.keys(DATE_PRESET_LABEL) as DatePreset[]).map(p => `<option value="${p}"${f.datePreset === p ? ' selected' : ''}>${DATE_PRESET_LABEL[p]}</option>`).join('');
  return `<div class="kd-date">
    <label class="kd-visually-hidden" for="kd-date-preset">Reporting period</label>
    <select id="kd-date-preset" class="kd-select" data-date-preset>${opts}</select>
    ${f.datePreset === 'custom' ? `<label class="kd-visually-hidden" for="kd-date-from">From</label><input type="date" id="kd-date-from" class="kd-input" data-date-from value="${esc(f.dateFrom ?? '')}">
      <span aria-hidden="true">–</span><label class="kd-visually-hidden" for="kd-date-to">To</label><input type="date" id="kd-date-to" class="kd-input" data-date-to value="${esc(f.dateTo ?? '')}">` : ''}
  </div>`;
}

export function chipsHtml(f: DashboardFilters): string {
  const chips: string[] = [];
  for (const dim of DIMENSIONS) for (const v of f[dim]) {
    chips.push(`<span class="kd-chip"><span class="kd-chip-k">${DIM_LABEL[dim]}:</span> ${esc(optionLabel(dim, v))}<button type="button" class="kd-chip-x" data-chip-dim="${dim}" data-chip-val="${esc(v)}" aria-label="Remove ${esc(DIM_LABEL[dim])} ${esc(optionLabel(dim, v))}">×</button></span>`);
  }
  const period = f.datePreset === 'custom' ? `${f.dateFrom ? day(f.dateFrom) : 'start'} – ${f.dateTo ? day(f.dateTo) : 'today'}` : DATE_PRESET_LABEL[f.datePreset];
  return `<div class="kd-chips" aria-live="polite">
    <span class="kd-chip kd-chip-period"><span class="kd-chip-k">Period:</span> ${esc(period)}</span>
    ${chips.join('')}
    ${chips.length || f.datePreset !== '12m' ? `<button type="button" class="kd-link" data-clear-all>Clear all</button>` : ''}
  </div>`;
}

// ─── KPI cards ────────────────────────────────────────────────────────────────

interface Card { id: string; label: string; value: string; exact?: string; sub: string; tip: string; tone?: 'good' | 'warn' | 'bad' | 'muted'; action?: string }

function cardHtml(c: Card): string {
  const tipId = `kd-tip-${c.id}`;
  const body = `<div class="kd-card-top"><span class="kd-card-l">${c.label}</span>
      <span class="kd-tip" tabindex="0" role="button" aria-label="About ${esc(c.label)}" aria-describedby="${tipId}">i<span class="kd-tip-pop" role="tooltip" id="${tipId}">${c.tip}</span></span></div>
    <div class="kd-card-v${c.tone ? ` is-${c.tone}` : ''}"${c.exact ? ` title="${esc(c.exact)}"` : ''}>${c.value}</div>
    <div class="kd-card-s">${c.sub}</div>`;
  return c.action
    ? `<article class="kd-card is-action" data-card="${c.id}"><button type="button" class="kd-card-hit" data-card-action="${c.action}" aria-label="${esc(c.label)}: ${esc(c.value)} — show these records"></button>${body}</article>`
    : `<article class="kd-card" data-card="${c.id}">${body}</article>`;
}

export function kpiCardsHtml(s: DashboardSummary): string {
  const o = s.operational, f = s.financial;
  const elig = `${int(f.eligible)} eligible record${f.eligible === 1 ? '' : 's'}`;
  const cards: Card[] = [
    { id: 'records', label: 'Costing records', value: int(o.totalRecords), sub: `${int(o.currentRecords)} current · ${int(o.totalRecords - o.currentRecords)} older revisions / duplicates`,
      tip: 'Every eligible saved costing in this view, revisions included. Deleted, test and invalid records are excluded.', action: 'scope:all' },
    { id: 'components', label: 'Unique components', value: int(o.uniqueComponents), sub: o.unidentified ? `${int(o.unidentified)} record${o.unidentified === 1 ? '' : 's'} without a part number not counted` : 'Counted by part number',
      tip: 'Distinct part numbers among current records. Revisions and other users’ costings of the same part count once. Names are never used to merge parts.' },
    { id: 'completed', label: 'Completed costings', value: int(o.completedRecords), sub: `of ${int(o.currentRecords)} current (completed, reviewed or approved)`,
      tip: 'Current records whose status is completed, reviewed or approved — drafts are not counted.', action: 'status:completed,reviewed,approved' },
    { id: 'commodities', label: 'Commodities covered', value: int(o.commodities), sub: 'with a current costing', tip: 'Distinct commodities among current records.' },
    { id: 'programmes', label: 'Programmes covered', value: int(o.programmes), sub: 'with a current costing', tip: 'Distinct vehicle programmes among current records.' },
    { id: 'gap-pct', label: 'Weighted cost gap', value: f.weightedGapPct === null ? '—' : pct(f.weightedGapPct), sub: elig,
      tip: 'Σ (GBP current − GBP should-cost) ÷ Σ GBP current cost, over financially eligible current records. Weighted by cost — never an average of percentages.',
      tone: f.weightedGapPct === null ? 'muted' : undefined },
    { id: 'opportunity', label: 'Potential unit cost opportunity', value: gbpCompact(f.opportunity.gbp), exact: gbp(f.opportunity.gbp),
      sub: `${int(f.opportunity.n)} record${f.opportunity.n === 1 ? '' : 's'} above should-cost · per piece, summed${f.unfavourable.n ? ` · ${int(f.unfavourable.n)} below (${gbp(f.unfavourable.gbp)})` : ''}`
        + (f.annualised.n ? `<span class="kd-card-x" data-annualised>Annualised: <strong title="${gbp(f.annualised.gbp)}">${gbpCompact(f.annualised.gbp)}</strong> over ${int(f.annualised.n)} validated volume${f.annualised.n === 1 ? '' : 's'}</span>`
          : '<span class="kd-card-x" data-annualised>Not annualised — no admin-validated annual volume</span>'),
      tip: 'Sum of per-piece gaps where the current cost is above should-cost. It is a sum of unit gaps, NOT programme spend or an annual saving. Records below should-cost are shown separately as unfavourable. An annualised figure (gap × annual volume) appears only where an admin has validated the volume.',
      tone: f.opportunity.n ? 'good' : 'muted' },
    { id: 'validated', label: 'Validated savings', value: f.validatedSavings.n ? gbpCompact(f.validatedSavings.gbp) : 'Not tracked', exact: f.validatedSavings.n ? gbp(f.validatedSavings.gbp) : undefined,
      sub: f.validatedSavings.n ? `${int(f.validatedSavings.n)} record${f.validatedSavings.n === 1 ? '' : 's'} · per piece` : 'No saving has been marked validated',
      tip: 'Per-piece savings an admin has marked validated. A should-cost gap is never counted as a saving.', tone: f.validatedSavings.n ? undefined : 'muted' },
    { id: 'implemented', label: 'Implemented savings', value: f.implementedSavings.n ? gbpCompact(f.implementedSavings.gbp) : 'Not tracked', exact: f.implementedSavings.n ? gbp(f.implementedSavings.gbp) : undefined,
      sub: f.implementedSavings.n ? `${int(f.implementedSavings.n)} record${f.implementedSavings.n === 1 ? '' : 's'} · per piece` : 'No saving has been marked implemented',
      tip: 'Per-piece savings an admin has marked implemented (in the price paid).', tone: f.implementedSavings.n ? undefined : 'muted' },
    { id: 'review', label: 'Awaiting review / approval', value: int(o.needsReview), sub: `${int(o.awaitingReview)} to review · ${int(o.awaitingApproval)} to approve`,
      tip: 'Current records marked completed (waiting for review) or reviewed (waiting for approval).', tone: o.needsReview ? 'warn' : undefined, action: 'status:completed,reviewed' },
  ];
  return `<div class="kd-cards">${cards.map(cardHtml).join('')}</div>`;
}

// ─── Original-currency totals ────────────────────────────────────────────────

export function currencyTotalsHtml(rows: CurrencyTotal[]): string {
  if (!rows.length) return `<p class="kd-empty-s">No current record carries a cost in this view.</p>`;
  return `<div class="kd-table-wrap"><table class="kd-table">
    <caption class="kd-visually-hidden">Totals in each original currency — currencies are never added together</caption>
    <thead><tr><th scope="col">Currency</th><th scope="col" class="num">Records with current cost</th><th scope="col" class="num">Σ current cost</th>
      <th scope="col" class="num">Records with should-cost</th><th scope="col" class="num">Σ should-cost</th><th scope="col" class="num">Same-currency records</th><th scope="col" class="num">Σ gap (same currency, same basis)</th></tr></thead>
    <tbody>${rows.map(r => `<tr><th scope="row">${esc(r.currency)} <span class="kd-muted">${esc(r.symbol)}</span></th>
      <td class="num">${int(r.currentRecords)}</td><td class="num">${money(r.sumCurrent, r.currency)}</td>
      <td class="num">${int(r.shouldRecords)}</td><td class="num">${money(r.sumShould, r.currency)}</td>
      <td class="num">${int(r.sameCcyRecords)}</td><td class="num">${r.sameCcyRecords ? money(r.sumGap, r.currency) : '—'}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

// ─── Insights + data quality ─────────────────────────────────────────────────

export function insightsHtml(s: DashboardSummary): string {
  if (!s.insights.length) return `<p class="kd-empty-s">No insights — there are no records in this view.</p>`;
  const icon = { info: 'i', good: '↑', warn: '!' } as const;
  return `<ul class="kd-insights">${s.insights.map((i, n) => `<li class="kd-insight is-${i.tone}">
    <span class="kd-insight-ic" aria-hidden="true">${icon[i.tone]}</span>
    <div><p class="kd-insight-t">${esc(i.title)}</p><p class="kd-insight-d">${esc(i.detail)}</p>
    ${i.filter ? `<button type="button" class="kd-link" data-insight="${n}">Filter to this</button>` : ''}</div></li>`).join('')}</ul>`;
}

export function dataQualityHtml(s: DashboardSummary, isAdmin: boolean): string {
  const q = s.dataQuality;
  const row = (label: string, n: number, note = '', action = '') =>
    `<tr><th scope="row">${label}</th><td class="num">${int(n)}</td><td class="kd-muted">${note}${action}</td></tr>`;
  const mc = q.missingClassification;
  const share = q.included ? Math.round((q.financiallyEligible / Math.max(1, s.operational.currentRecords)) * 100) : 0;
  return `<div class="kd-dq-head"><div class="kd-dq-meter" role="img" aria-label="${share}% of current records are financially eligible"><span style="width:${share}%"></span></div>
      <p><strong>${share}%</strong> of current records can be compared in GBP (${int(q.financiallyEligible)} of ${int(s.operational.currentRecords)}).</p></div>
    <div class="kd-table-wrap"><table class="kd-table kd-dq">
    <caption class="kd-visually-hidden">Data quality for the records in this view</caption>
    <thead><tr><th scope="col">Check</th><th scope="col" class="num">Records</th><th scope="col">What it means</th></tr></thead><tbody>
    ${row('Retrieved', q.retrieved, 'Every saved record in this view, excluded ones too')}
    ${row('Included', q.included, 'All revisions that count towards activity')}
    ${row('Excluded', q.excluded, `Deleted ${int(q.excludedBy.deleted)} · test ${int(q.excludedBy.test)} · invalid ${int(q.excludedBy.invalid)}`, isAdmin && q.excluded ? ' <button type="button" class="kd-link" data-scope="excluded">View</button>' : '')}
    ${row('Financially eligible', q.financiallyEligible, 'Current record, both costs, both converted to GBP, same delivery terms')}
    ${row('Missing should-cost', q.missingShouldCost, 'Never treated as zero')}
    ${row('Missing current cost', q.missingCurrentCost, 'Never treated as zero')}
    ${row('Missing FX rate', q.missingFx, 'No approved or reference rate for the currency')}
    ${row('Different cost basis', q.basisMismatch, 'Current and should-cost on different delivery terms (DAP / EXW)')}
    ${row('Reference FX (not approved)', q.unapprovedFx, 'Converted at the built-in reference rate until an approved rate is loaded')}
    ${row('Duplicate candidates', q.duplicateCandidates, 'Another user’s costing of the same part, programme, model year and powertrain', ' <button type="button" class="kd-link" data-scope="all">View all revisions</button>')}
    ${row('Older revisions', q.supersededRevisions, 'Kept for activity, not in financial KPIs')}
    ${row('No part number', mc.partNumber, 'Cannot be de-duplicated — counted on its own')}
    ${row('No programme', mc.programme)}${row('No model year', mc.modelYear)}${row('No powertrain', mc.powertrain)}${row('No commodity', mc.commodity)}
    </tbody></table></div>`;
}

// ─── Drill-down ──────────────────────────────────────────────────────────────

export function drillHtml(level: DrillLevel, groups: DrillGroup[], path: { level: DrillLevel; key: string; label: string }[]): string {
  const crumbs = [`<button type="button" class="kd-crumb" data-drill-to="-1">All commodities</button>`,
    ...path.map((p, i) => `<span aria-hidden="true">›</span><button type="button" class="kd-crumb" data-drill-to="${i}"${i === path.length - 1 ? ' aria-current="step"' : ''}>${esc(DRILL_LABEL[p.level])}: ${esc(p.label)}</button>`)];
  const head = `<nav class="kd-crumbs" aria-label="Drill-down path">${crumbs.join('')}</nav>`;
  if (level === 'record') return `${head}<p class="kd-empty-s">The costing records for this component are listed in the table below.</p>`;
  if (!groups.length) return `${head}<p class="kd-empty-s">No current records at this level for the active filters.</p>`;
  return `${head}<div class="kd-table-wrap"><table class="kd-table">
    <caption class="kd-visually-hidden">${esc(DRILL_LABEL[level])} breakdown</caption>
    <thead><tr><th scope="col">${esc(DRILL_LABEL[level])}</th><th scope="col" class="num">Current records</th><th scope="col" class="num">Eligible</th>
      <th scope="col" class="num">GBP current</th><th scope="col" class="num">GBP should-cost</th><th scope="col" class="num">GBP gap</th><th scope="col" class="num">Opportunity (per piece, Σ)</th></tr></thead>
    <tbody>${groups.map(g => `<tr><th scope="row"><button type="button" class="kd-link kd-drill-go" data-drill-key="${esc(g.key)}" data-drill-label="${esc(g.label)}">${esc(g.label)}</button></th>
      <td class="num">${int(g.count)}</td><td class="num">${int(g.eligible)}</td><td class="num">${g.eligible ? gbp(g.currentGbp) : '—'}</td>
      <td class="num">${g.eligible ? gbp(g.shouldGbp) : '—'}</td><td class="num">${g.eligible ? gbp(g.gapGbp) : '—'}</td><td class="num">${g.eligible ? gbp(g.opportunityGbp) : '—'}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

// ─── Records table ───────────────────────────────────────────────────────────

export interface RecordRowView {
  id: string; sourceTool: string; sourceRef: string; ownerName: string; partNumber: string | null; componentName: string;
  commodity: string | null; programme: string | null; modelYear: number | null; powertrain: string | null; country: string | null;
  status: RecordStatus; costingDate: string; createdAt: string; updatedAt: string;
  currentCost: number | null; currentCcy: string | null; shouldCost: number | null; shouldCcy: string | null;
  gbpCurrent: number | null; gbpShould: number | null; gapGbp: number | null; gapPct: number | null;
  role: string | null; eligible: boolean; ineligible: keyof typeof INELIGIBLE_LABEL | null; excluded: string | null; invalidReasons: string[];
  fx: { current?: FxApplied | null; should?: FxApplied | null };
}

export const TABLE_COLUMNS: { key: string; label: string; sort?: string; num?: boolean }[] = [
  { key: 'id', label: 'Costing ID', sort: 'id' }, { key: 'componentName', label: 'Component', sort: 'componentName' },
  { key: 'partNumber', label: 'Part number', sort: 'partNumber' }, { key: 'commodity', label: 'Commodity', sort: 'commodity' },
  { key: 'programme', label: 'Programme', sort: 'programme' }, { key: 'modelYear', label: 'MY', sort: 'modelYear' },
  { key: 'powertrain', label: 'Powertrain', sort: 'powertrain' }, { key: 'country', label: 'Country', sort: 'country' },
  { key: 'currentOrig', label: 'Current cost (original)', num: true }, { key: 'shouldOrig', label: 'Should-cost (original)', num: true },
  { key: 'gbpCurrent', label: 'GBP current', sort: 'gbpCurrent', num: true }, { key: 'gbpShould', label: 'GBP should-cost', sort: 'gbpShould', num: true },
  { key: 'gapGbp', label: 'GBP gap', sort: 'gapGbp', num: true }, { key: 'gapPct', label: 'Gap %', sort: 'gapPct', num: true },
  { key: 'sourceTool', label: 'Tool', sort: 'sourceTool' }, { key: 'status', label: 'Status', sort: 'status' },
  { key: 'ownerName', label: 'Created by', sort: 'ownerName' }, { key: 'costingDate', label: 'Created', sort: 'costingDate' },
  { key: 'updatedAt', label: 'Last updated', sort: 'updatedAt' },
];

export function statusBadge(s: RecordStatus): string {
  return `<span class="kd-badge is-${s}">${STATUS_LABEL[s] ?? esc(s)}</span>`;
}
export function roleNote(r: RecordRowView): string {
  if (r.excluded) return `<span class="kd-badge is-excluded" title="${esc(r.invalidReasons.join('; '))}">Excluded: ${esc(r.excluded)}</span>`;
  if (r.role === 'superseded') return '<span class="kd-badge is-muted">Older revision</span>';
  if (r.role === 'duplicate') return '<span class="kd-badge is-warn">Duplicate candidate</span>';
  return '';
}
const fxFlag = (fx: FxApplied | null | undefined) => (fx && !fx.approved ? ' <abbr class="kd-ref" title="Reference rate — not an approved rate">ref</abbr>' : '');

export function recordsTableHtml(rows: RecordRowView[], sort: string, dir: 'asc' | 'desc', currencyMode: 'gbp' | 'original'): string {
  if (!rows.length) return `<div class="kd-empty"><p class="kd-empty-t">No costing records match</p><p>Widen the period or clear a filter.</p></div>`;
  const th = TABLE_COLUMNS.map(c => {
    const active = c.sort && c.sort === sort;
    const aria = active ? ` aria-sort="${dir === 'asc' ? 'ascending' : 'descending'}"` : '';
    const inner = c.sort ? `<button type="button" class="kd-sort" data-sort="${c.sort}">${c.label}<span aria-hidden="true">${active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</span></button>` : c.label;
    const dim = currencyMode === 'original' && ['gbpCurrent', 'gbpShould', 'gapGbp'].includes(c.key) ? ' is-dim' : currencyMode === 'gbp' && ['currentOrig', 'shouldOrig'].includes(c.key) ? ' is-dim' : '';
    return `<th scope="col"${aria} class="${c.num ? 'num' : ''}${dim}">${inner}</th>`;
  }).join('');
  const body = rows.map(r => `<tr data-row="${esc(r.id)}">
    <td><button type="button" class="kd-link kd-mono" data-open="${esc(r.id)}" aria-label="Open costing ${esc(r.id)}">${esc(r.id.replace(/^rec-/, '').slice(0, 8))}</button>${roleNote(r)}</td>
    <td>${esc(r.componentName)}</td><td class="kd-mono">${esc(r.partNumber ?? '—')}</td><td>${esc(r.commodity ?? '—')}</td>
    <td>${esc(r.programme ?? '—')}</td><td>${r.modelYear ?? '—'}</td><td>${esc(r.powertrain ?? '—')}</td><td>${esc(r.country ?? '—')}</td>
    <td class="num">${money(r.currentCost, r.currentCcy)}</td><td class="num">${money(r.shouldCost, r.shouldCcy)}</td>
    <td class="num">${gbp(r.gbpCurrent)}${fxFlag(r.fx.current)}</td><td class="num">${gbp(r.gbpShould)}${fxFlag(r.fx.should)}</td>
    <td class="num${r.gapGbp !== null ? (r.gapGbp > 0 ? ' is-pos' : r.gapGbp < 0 ? ' is-neg' : '') : ''}">${r.eligible ? gbp(r.gapGbp) : `<span class="kd-muted" title="${esc(r.ineligible ? INELIGIBLE_LABEL[r.ineligible] : '')}">${r.ineligible ? esc(INELIGIBLE_LABEL[r.ineligible]) : '—'}</span>`}</td>
    <td class="num">${r.eligible ? pct(r.gapPct) : '—'}</td>
    <td>${esc(r.sourceTool)}</td><td>${statusBadge(r.status)}</td><td>${esc(r.ownerName)}</td><td>${day(r.costingDate)}</td><td>${dateTime(r.updatedAt)}</td>
  </tr>`).join('');
  return `<div class="kd-table-wrap kd-records"><table class="kd-table">
    <caption class="kd-visually-hidden">Costing records — select a column heading to sort</caption>
    <thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function pagerHtml(page: number, pages: number, total: number, pageSize: number): string {
  const from = total ? (page - 1) * pageSize + 1 : 0, to = Math.min(total, page * pageSize);
  return `<div class="kd-pager"><span>${int(from)}–${int(to)} of ${int(total)}</span>
    <label class="kd-visually-hidden" for="kd-page-size">Rows per page</label>
    <select id="kd-page-size" class="kd-select kd-select-sm" data-page-size>${[10, 25, 50, 100].map(n => `<option value="${n}"${n === pageSize ? ' selected' : ''}>${n} / page</option>`).join('')}</select>
    <button type="button" class="kd-btn kd-btn-sm" data-page="${page - 1}"${page <= 1 ? ' disabled' : ''} aria-label="Previous page">‹</button>
    <span aria-live="polite">Page ${page} of ${pages}</span>
    <button type="button" class="kd-btn kd-btn-sm" data-page="${page + 1}"${page >= pages ? ' disabled' : ''} aria-label="Next page">›</button></div>`;
}

export function fxLine(fx: FxApplied | null | undefined): string {
  if (!fx) return '<span class="kd-muted">No rate — not converted</span>';
  if (fx.method === 'identity') return 'GBP — no conversion';
  return `£${fx.gbpPerUnit.toPrecision(6)} per ${esc(fx.currency)} · ${esc(fx.source)} · effective ${esc(fx.effectiveDate)} · ${esc(FX_METHOD_LABEL[fx.method] ?? fx.method)} · frozen ${dateTime(fx.retrievedAt)}${fx.approved ? '' : ' · <strong>reference, not approved</strong>'}`;
}

export function skeletonHtml(): string {
  const box = (cls: string) => `<div class="kd-skel ${cls}" aria-hidden="true"></div>`;
  return `<div class="kd-cards">${Array.from({ length: 10 }, () => box('kd-skel-card')).join('')}</div>
    <div class="kd-charts">${Array.from({ length: 4 }, () => box('kd-skel-chart')).join('')}</div>`;
}
