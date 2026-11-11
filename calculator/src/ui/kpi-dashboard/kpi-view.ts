/**
 * CostVision | Global Cost Engineering KPI Dashboard — the view (state, fetch, events).
 * Every figure comes from /api/kpi (server-side aggregation); builders in kpi-builders.ts,
 * charts in kpi-charts.ts, exports in kpi-export.ts. Mounted into #kpi-view by main.ts.
 */
import { apiBase } from '../../api-base.js';
import {
  DEFAULT_FILTERS, DIMENSIONS, STATUS_LABEL, INELIGIBLE_LABEL, FX_METHOD_LABEL,
  type DashboardSummary, type DashboardFilters, type Dimension, type DrillGroup, type DrillLevel, type RecordStatus, type DatePreset,
} from '../../engine/kpi-dashboard.js';
import {
  esc, gbp, money, pct, int, day, dateTime, fxLine, statusBadge, roleNote, kpiCardsHtml, currencyTotalsHtml, insightsHtml,
  dataQualityHtml, drillHtml, recordsTableHtml, pagerHtml, multiSelectHtml, dateControlHtml, chipsHtml, skeletonHtml,
  type RecordRowView,
} from './kpi-builders.js';
import { renderCharts, destroyCharts } from './kpi-charts.js';
import { showToast } from '../toast.js';

const STORE_KEY = 'cv-kpi-dashboard';
const AUTO_REFRESH_MS = 5 * 60_000;

interface Meta { isAdmin: boolean; userId: string; statuses: RecordStatus[]; fxPolicy: string; currencies: { code: string; symbol: string }[] }
interface RecordsPage { rows: RecordRowView[]; total: number; page: number; pages: number }
type Scope = 'current' | 'all' | 'excluded';

const S = {
  root: null as HTMLElement | null,
  meta: null as Meta | null,
  filters: structuredClone(DEFAULT_FILTERS) as DashboardFilters,
  summary: null as DashboardSummary | null,
  records: null as RecordsPage | null,
  drill: { level: 'commodity' as DrillLevel, groups: [] as DrillGroup[] },
  drillPath: [] as { level: DrillLevel; key: string; label: string }[],
  q: { search: '', sort: 'costingDate', dir: 'desc' as 'asc' | 'desc', page: 1, pageSize: 25, scope: 'current' as Scope },
  currencyMode: 'gbp' as 'gbp' | 'original',
  tables: new Set<string>(),
  openDim: null as Dimension | null,
  msQuery: '',
  loading: false,
  error: '',
  refreshedAt: '',
  seq: 0,
  timer: 0 as unknown as ReturnType<typeof setInterval>,
  observer: null as MutationObserver | null,
};

// ─── persistence (per-viewer convenience only) ───────────────────────────────

function restore(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const v = JSON.parse(raw) as { filters?: DashboardFilters; currencyMode?: 'gbp' | 'original'; pageSize?: number };
    if (v.filters) S.filters = { ...structuredClone(DEFAULT_FILTERS), ...v.filters };
    if (v.currencyMode === 'original') S.currencyMode = 'original';
    if (v.pageSize && [10, 25, 50, 100].includes(v.pageSize)) S.q.pageSize = v.pageSize;
  } catch { /* storage blocked */ }
}
function persist(): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ filters: S.filters, currencyMode: S.currencyMode, pageSize: S.q.pageSize })); } catch { /* ignore */ }
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${apiBase}/api/kpi${path}`, init);
  const body = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw Object.assign(new Error(body.error ?? `Request failed (${r.status})`), { status: r.status, body });
  return body;
}
const fParam = () => `f=${encodeURIComponent(JSON.stringify(S.filters))}`;
function drillParams(): string {
  return S.drillPath.map(p => `&drill_${p.level}=${encodeURIComponent(p.key)}`).join('');
}
function recordsQuery(extra = ''): string {
  return `?${fParam()}&scope=${S.q.scope}&sort=${S.q.sort}&dir=${S.q.dir}&page=${S.q.page}&pageSize=${S.q.pageSize}&search=${encodeURIComponent(S.q.search)}${drillParams()}${extra}`;
}

// ─── Loading ──────────────────────────────────────────────────────────────────

async function loadAll(opts: { quiet?: boolean } = {}): Promise<void> {
  const seq = ++S.seq;
  if (!opts.quiet) { S.loading = true; S.error = ''; renderBody(); }
  try {
    const [summary, records, drill] = await Promise.all([
      api<DashboardSummary & { refreshedAt: string }>(`/summary?${fParam()}`),
      api<RecordsPage>(`/records${recordsQuery()}`),
      api<{ level: DrillLevel; groups: DrillGroup[] }>(`/drill?${fParam()}${drillParams()}`),
    ]);
    if (seq !== S.seq) return;
    S.summary = summary; S.records = records; S.drill = drill;
    S.refreshedAt = summary.refreshedAt; S.error = '';
  } catch (e) {
    if (seq !== S.seq) return;
    S.error = (e as Error).message || 'The dashboard could not be loaded.';
  } finally {
    if (seq === S.seq) { S.loading = false; renderAll(); }
  }
}

async function loadRecords(): Promise<void> {
  const seq = ++S.seq;
  try {
    const [records, drill] = await Promise.all([
      api<RecordsPage>(`/records${recordsQuery()}`),
      api<{ level: DrillLevel; groups: DrillGroup[] }>(`/drill?${fParam()}${drillParams()}`),
    ]);
    if (seq !== S.seq) return;
    S.records = records; S.drill = drill;
    renderRecords(); renderDrill();
  } catch (e) {
    if ((e as { status?: number }).status === 403) { S.q.scope = 'current'; showToast('Excluded records are visible to admins only.', 'warning'); return; }
    showToast((e as Error).message, 'error');
  }
}

let debounce = 0 as unknown as ReturnType<typeof setTimeout>;
function filtersChanged(): void {
  S.q.page = 1; S.drillPath = [];
  persist();
  renderFilters();
  const body = S.root?.querySelector('#kd-body');
  body?.setAttribute('aria-busy', 'true'); body?.firstElementChild?.classList.add('kd-dim');
  clearTimeout(debounce);
  debounce = setTimeout(() => void loadAll(), 120);
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function shell(): string {
  return `<div class="kd-wrap">
    <div class="kd-head">
      <div class="kd-head-t"><p class="kd-eyebrow">CostVision</p><h1>Global Cost Engineering KPI Dashboard</h1>
        <p class="kd-head-s">Saved should-costs across every authorised user, consolidated in GBP. Read-only reporting.</p></div>
      <div class="kd-head-a">
        <div class="kd-refresh"><span id="kd-refreshed" aria-live="polite"></span>
          <button type="button" class="kd-btn kd-btn-ghost kd-btn-sm" data-act="refresh" aria-label="Refresh now"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8 8 0 1 0-.6 4.6"/><path d="M20 4v7h-7"/></svg> Refresh</button></div>
        <div class="kd-seg-ctl" role="radiogroup" aria-label="Currency view">
          <button type="button" role="radio" data-ccy-mode="gbp">Consolidated GBP</button><button type="button" role="radio" data-ccy-mode="original">Original currency</button></div>
        <div class="kd-menu"><button type="button" class="kd-btn kd-btn-primary kd-btn-sm" data-act="export-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="kd-export-menu">Export</button>
          <div class="kd-menu-pop" id="kd-export-menu" role="menu" hidden>
            <button type="button" role="menuitem" data-act="export-pdf">PDF dashboard report</button>
            <button type="button" role="menuitem" data-act="export-xlsx">Excel report</button>
            <button type="button" role="menuitem" data-act="export-csv">CSV of filtered records</button></div></div>
        <button type="button" class="kd-btn kd-btn-sm" data-act="admin" id="kd-admin-btn" hidden>Admin</button>
      </div>
    </div>
    <section class="kd-filters" aria-label="Filters"><div class="kd-filter-row" id="kd-filter-row"></div><div id="kd-chips"></div></section>
    <p class="kd-fxnote" id="kd-fxnote"></p>
    <div id="kd-body" aria-busy="false"></div>
  </div>
  <dialog class="kd-dialog kd-drawer" id="kd-drawer" aria-labelledby="kd-drawer-title"></dialog>
  <dialog class="kd-dialog" id="kd-admin" aria-labelledby="kd-admin-title"></dialog>`;
}

function renderFilters(focusSel?: string): void {
  const row = S.root?.querySelector('#kd-filter-row');
  if (!row) return;
  const opts = S.summary?.options;
  row.innerHTML = dateControlHtml(S.filters) + DIMENSIONS.map(d => multiSelectHtml(d, opts?.[d] ?? [], S.filters[d], S.openDim === d, S.openDim === d ? S.msQuery : '')).join('');
  S.root!.querySelector('#kd-chips')!.innerHTML = chipsHtml(S.filters);
  if (focusSel) S.root!.querySelector<HTMLElement>(focusSel)?.focus();
}

function renderHead(): void {
  const r = S.root!;
  const ts = r.querySelector('#kd-refreshed')!;
  ts.textContent = S.refreshedAt ? `Last refreshed ${dateTime(S.refreshedAt)}` : '';
  r.querySelectorAll<HTMLButtonElement>('[data-ccy-mode]').forEach(b => {
    const on = b.dataset.ccyMode === S.currencyMode;
    b.setAttribute('aria-checked', String(on)); b.classList.toggle('is-on', on); b.tabIndex = on ? 0 : -1;
  });
  (r.querySelector('#kd-admin-btn') as HTMLElement).hidden = !S.meta?.isAdmin;
  const s = S.summary;
  r.querySelector('#kd-fxnote')!.innerHTML = s
    ? `GBP figures use each record’s frozen FX snapshot · policy: <strong>${esc(FX_METHOD_LABEL[s.fx.policy])}</strong> · ${int(s.fx.approvedRates)} approved rate${s.fx.approvedRates === 1 ? '' : 's'} loaded${s.dataQuality.unapprovedFx ? ` · <span class="kd-warn-t">${int(s.dataQuality.unapprovedFx)} record${s.dataQuality.unapprovedFx === 1 ? '' : 's'} at the built-in reference rate (not approved)</span>` : ''}`
    : '';
}

function section(id: string, title: string, sub: string, body: string, extra = ''): string {
  return `<section class="kd-sec" id="kd-sec-${id}" aria-labelledby="kd-h-${id}"><div class="kd-sec-h"><div><h2 id="kd-h-${id}">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${extra}</div>${body}</section>`;
}

function renderBody(): void {
  const body = S.root?.querySelector<HTMLElement>('#kd-body');
  if (!body) return;
  body.setAttribute('aria-busy', String(S.loading));
  if (S.error && !S.summary) {
    body.innerHTML = `<div class="kd-empty is-error" role="alert"><p class="kd-empty-t">The dashboard could not be loaded</p><p>${esc(S.error)}</p><button type="button" class="kd-btn" data-act="refresh">Try again</button></div>`;
    return;
  }
  if (!S.summary) { body.innerHTML = skeletonHtml(); return; }   // first load (or before it starts)
  const s = S.summary!;
  if (!s.dataQuality.retrieved && !hasFilters()) {
    destroyCharts();
    body.innerHTML = `<div class="kd-empty"><p class="kd-empty-t">No costing has been saved to the dashboard yet</p>
      <p>Cost a part, then choose <strong>Save to KPI Dashboard</strong> on the result. Records from CSS System or CPSC II are loaded by an admin from an export file.</p></div>`;
    return;
  }
  const empty = !s.dataQuality.retrieved;
  body.innerHTML = `${S.error ? `<p class="kd-banner is-error" role="alert">Refresh failed: ${esc(S.error)} — showing the last loaded figures.</p>` : ''}
    ${empty ? `<div class="kd-empty"><p class="kd-empty-t">No costing records match these filters</p><p>Widen the reporting period or clear a filter.</p><button type="button" class="kd-btn" data-clear-all>Clear all filters</button></div>` : ''}
    <div class="${S.loading ? 'kd-dim' : ''}">
    ${kpiCardsHtml(s)}
    ${S.currencyMode === 'original' ? section('ccy', 'Original-currency totals', 'Each currency on its own row — never added together. GBP KPIs above use the frozen FX snapshots.', currencyTotalsHtml(s.currencyTotals)) : ''}
    <div class="kd-two">${section('insights', 'Management insights', `Only what the data in this view shows. Thresholds: fewer than ${3} current costings = limited coverage; a gap of 15% or more = significant.`, insightsHtml(s))}
      ${section('dq', 'Data quality', 'What the KPIs are built on, and what was left out.', dataQualityHtml(s, !!S.meta?.isAdmin))}</div>
    ${section('charts', 'Analysis', 'Financial charts use consolidated GBP. Select a bar, segment or cell to filter.', '<div class="kd-charts" id="kd-charts"></div>')}
    ${section('drill', 'Drill-down', 'Commodity → programme → powertrain → model year → component → costing record. Active filters stay applied.', '<div id="kd-drill"></div>')}
    ${section('records', 'Costing records', '', `<div class="kd-rec-tools">
        <label class="kd-visually-hidden" for="kd-search">Search records</label>
        <input type="search" id="kd-search" class="kd-input" placeholder="Search part number, component, owner, ID…" value="${esc(S.q.search)}" autocomplete="off">
        <label class="kd-visually-hidden" for="kd-scope">Which records</label>
        <select id="kd-scope" class="kd-select" data-scope-select>
          <option value="current"${S.q.scope === 'current' ? ' selected' : ''}>Current records (one per application)</option>
          <option value="all"${S.q.scope === 'all' ? ' selected' : ''}>All saves, revisions included</option>
          ${S.meta?.isAdmin ? `<option value="excluded"${S.q.scope === 'excluded' ? ' selected' : ''}>Excluded records (admin)</option>` : ''}
        </select></div><div id="kd-records"></div>`)}
    </div>`;
  renderCharts(body.querySelector('#kd-charts')!, s, S.tables, (dim, value) => addFilter(dim, value), (from, to) => {
    S.filters.datePreset = 'custom'; S.filters.dateFrom = from; S.filters.dateTo = to; filtersChanged();
  });
  renderDrill(); renderRecords();
}

function renderRecords(): void {
  const host = S.root?.querySelector('#kd-records');
  if (!host || !S.records) return;
  host.innerHTML = recordsTableHtml(S.records.rows, S.q.sort, S.q.dir, S.currencyMode) + pagerHtml(S.records.page, S.records.pages, S.records.total, S.q.pageSize);
}
function renderDrill(): void {
  const host = S.root?.querySelector('#kd-drill');
  if (host) host.innerHTML = drillHtml(S.drill.level, S.drill.groups, S.drillPath);
}
function renderAll(): void { renderHead(); renderFilters(); renderBody(); }

const hasFilters = () => S.filters.datePreset !== '12m' || DIMENSIONS.some(d => S.filters[d].length);
function addFilter(dim: Dimension, value: string): void {
  if (!S.filters[dim].includes(value)) S.filters[dim] = [...S.filters[dim], value];
  filtersChanged();
}

// ─── Record drawer ───────────────────────────────────────────────────────────

interface Detail {
  record: RecordRowView & Record<string, unknown> & { currentTerms: string | null; shouldTerms: string | null; currentSource: string | null; annualVolume: number | null; volumeValidated: boolean; savingStatus: string | null; savingPerPiece: number | null; savingCcy: string | null; gbpSaving: number | null; notes: string; isTest: boolean; fx: { current?: unknown; should?: unknown; saving?: unknown } };
  fxHistory?: { replacedAt: string; by: string; policy: string; gbpCurrent: number | null; gbpShould: number | null }[];
  costing: { input?: Record<string, unknown>; result?: { total?: number; breakdown?: Record<string, number>; operationDetails?: { name?: string; cost?: number }[] }; region?: string; commodity?: string } | null;
  revisions: { id: string; costingDate: string; status: RecordStatus; role: string | null; ownerName: string; gbpShould: number | null; gbpCurrent: number | null }[];
  canEdit: boolean; isAdmin: boolean;
}

const BUCKETS: [string, string][] = [['rawMaterial', 'Material'], ['process', 'Process'], ['labour', 'Labour'], ['tooling', 'Tooling'], ['packaging', 'Packaging'], ['logistics', 'Logistics'], ['overhead', 'Overhead'], ['margin', 'Margin']];

async function openRecord(id: string): Promise<void> {
  const dlg = S.root!.querySelector<HTMLDialogElement>('#kd-drawer')!;
  dlg.innerHTML = `<div class="kd-dialog-in"><p class="kd-muted">Loading…</p></div>`;
  if (!dlg.open) dlg.showModal();
  let d: Detail;
  try { d = await api<Detail>(`/records/${encodeURIComponent(id)}`); } catch (e) {
    dlg.innerHTML = `<div class="kd-dialog-in"><p role="alert">${esc((e as Error).message)}</p><button type="button" class="kd-btn" data-close>Close</button></div>`; return;
  }
  const r = d.record;
  const fxS = r.fx as { current?: import('../../engine/kpi-dashboard.js').FxApplied | null; should?: import('../../engine/kpi-dashboard.js').FxApplied | null; saving?: import('../../engine/kpi-dashboard.js').FxApplied | null };
  const bd = d.costing?.result?.breakdown;
  const costingHtml = d.costing?.result ? `<h3>Original costing analysis</h3>
    <p class="kd-muted">The costing as saved from CostVision (${esc(d.costing.commodity ?? '')}, ${esc(d.costing.region ?? '')}). It is not re-run here.</p>
    ${bd ? `<div class="kd-table-wrap"><table class="kd-table kd-table-sm"><caption class="kd-visually-hidden">Eight-bucket breakdown</caption><thead><tr><th scope="col">Bucket</th><th scope="col" class="num">£ per piece</th></tr></thead>
      <tbody>${BUCKETS.filter(([k]) => typeof bd[k] === 'number').map(([k, l]) => `<tr><th scope="row">${l}</th><td class="num">${gbp(bd[k])}</td></tr>`).join('')}
      <tr class="kd-total"><th scope="row">Should-cost</th><td class="num">${gbp(d.costing.result.total ?? null)}</td></tr></tbody></table></div>` : ''}
    ${d.costing.result.operationDetails?.length ? `<details class="kd-details"><summary>Operations (${d.costing.result.operationDetails.length})</summary><ul>${d.costing.result.operationDetails.slice(0, 40).map(o => `<li>${esc(o.name ?? '')}${typeof o.cost === 'number' ? ` — ${gbp(o.cost)}` : ''}</li>`).join('')}</ul></details>` : ''}`
    : r.sourceTool !== 'CostVision' ? `<h3>Original costing</h3><p>This record was imported from <strong>${esc(r.sourceTool)}</strong>; its costing lives in that tool under record <span class="kd-mono">${esc(r.sourceRef)}</span>.</p>` : '';
  const edit = d.canEdit ? editFormHtml(d) : '';
  dlg.innerHTML = `<div class="kd-dialog-in">
    <div class="kd-dialog-h"><div><p class="kd-eyebrow">${esc(r.sourceTool)} · <span class="kd-mono">${esc(r.id)}</span></p>
      <h2 id="kd-drawer-title">${esc(r.componentName)}</h2><p>${esc(r.partNumber ?? 'No part number')} ${statusBadge(r.status)} ${roleNote(r)}</p></div>
      <button type="button" class="kd-icon-btn" data-close aria-label="Close">×</button></div>
    <dl class="kd-dl">
      <div><dt>Commodity</dt><dd>${esc(r.commodity ?? '—')}</dd></div><div><dt>Programme</dt><dd>${esc(r.programme ?? '—')}</dd></div>
      <div><dt>Model year</dt><dd>${r.modelYear ?? '—'}</dd></div><div><dt>Powertrain</dt><dd>${esc(r.powertrain ?? '—')}</dd></div>
      <div><dt>Country / market</dt><dd>${esc(r.country ?? '—')}</dd></div><div><dt>Created by</dt><dd>${esc(r.ownerName)}</dd></div>
      <div><dt>Costing date</dt><dd>${day(r.costingDate)}</dd></div><div><dt>Last updated</dt><dd>${dateTime(r.updatedAt)}</dd></div>
      <div><dt>Original record</dt><dd class="kd-mono">${esc(r.sourceRef)}</dd></div><div><dt>Annual volume</dt><dd>${r.annualVolume === null ? '—' : int(r.annualVolume)} ${r.volumeValidated ? '<span class="kd-badge is-approved">validated</span>' : '<span class="kd-muted">not validated</span>'}</dd></div>
    </dl>
    <h3>Cost</h3>
    <div class="kd-table-wrap"><table class="kd-table kd-table-sm"><caption class="kd-visually-hidden">Original values, FX and GBP</caption>
      <thead><tr><th scope="col"></th><th scope="col" class="num">Original</th><th scope="col">Terms</th><th scope="col" class="num">GBP</th><th scope="col">FX snapshot</th></tr></thead>
      <tbody><tr><th scope="row">Current cost${r.currentSource ? ` <span class="kd-muted">(${esc(r.currentSource)})</span>` : ''}</th><td class="num">${money(r.currentCost, r.currentCcy)}</td><td>${esc(r.currentTerms ?? '—')}</td><td class="num">${gbp(r.gbpCurrent)}</td><td class="kd-fx">${r.currentCost === null ? '—' : fxLine(fxS.current)}</td></tr>
      <tr><th scope="row">Should-cost</th><td class="num">${money(r.shouldCost, r.shouldCcy)}</td><td>${esc(r.shouldTerms ?? '—')}</td><td class="num">${gbp(r.gbpShould)}</td><td class="kd-fx">${r.shouldCost === null ? '—' : fxLine(fxS.should)}</td></tr>
      <tr class="kd-total"><th scope="row">Gap</th><td></td><td></td><td class="num">${r.eligible ? `${gbp(r.gapGbp)} (${pct(r.gapPct)})` : esc(r.ineligible ? INELIGIBLE_LABEL[r.ineligible] : r.excluded ?? '—')}</td><td class="kd-muted">${r.eligible ? 'GBP current − GBP should-cost, each converted on its own rate' : 'Not in financial KPIs'}</td></tr>
      ${r.savingStatus ? `<tr><th scope="row">Saving (${esc(r.savingStatus)})</th><td class="num">${money(r.savingPerPiece, r.savingCcy)}</td><td></td><td class="num">${gbp(r.gbpSaving)}</td><td class="kd-fx">${fxLine(fxS.saving)}</td></tr>` : ''}
      </tbody></table></div>
    ${r.excluded && r.invalidReasons.length ? `<p class="kd-banner is-error">Excluded: ${esc(r.invalidReasons.join('; '))}</p>` : ''}
    ${d.revisions.length ? `<h3>Other costings of this application</h3><ul class="kd-revs">${d.revisions.map(v => `<li><button type="button" class="kd-link" data-open="${esc(v.id)}">${day(v.costingDate)} · ${esc(v.ownerName)}</button> ${statusBadge(v.status)} <span class="kd-muted">${esc(v.role === 'current' ? 'current' : v.role === 'duplicate' ? 'duplicate candidate' : v.role === 'superseded' ? 'older revision' : 'excluded')} · should ${gbp(v.gbpShould)} · current ${gbp(v.gbpCurrent)}</span></li>`).join('')}</ul>` : ''}
    ${costingHtml}
    ${r.notes ? `<h3>Notes</h3><p class="kd-notes">${esc(r.notes)}</p>` : ''}
    ${d.fxHistory?.length ? `<details class="kd-details"><summary>FX history (${d.fxHistory.length})</summary><ul>${d.fxHistory.map(h => `<li>${dateTime(h.replacedAt)} · policy ${esc(h.policy)} · was current ${gbp(h.gbpCurrent)}, should ${gbp(h.gbpShould)}</li>`).join('')}</ul></details>` : ''}
    ${edit}
  </div>`;
  dlg.dataset.id = r.id;
}

function editFormHtml(d: Detail): string {
  const r = d.record; const a = d.isAdmin;
  const statuses: RecordStatus[] = a ? ['draft', 'completed', 'reviewed', 'approved'] : (r.status === 'reviewed' || r.status === 'approved') ? [r.status, 'draft', 'completed'] : ['draft', 'completed'];
  const ccyOpts = (sel: string | null) => `<option value="">—</option>${(S.meta?.currencies ?? []).map(c => `<option${c.code === sel ? ' selected' : ''}>${esc(c.code)}</option>`).join('')}`;
  const termOpts = (sel: string | null) => `<option value="">—</option><option${sel === 'DAP' ? ' selected' : ''}>DAP</option><option${sel === 'EXW' ? ' selected' : ''}>EXW</option>`;
  const n = (v: number | null) => (v === null || v === undefined ? '' : String(v));
  return `<details class="kd-details kd-edit"${a ? ' open' : ''}><summary>Edit this record</summary>
    <form id="kd-edit-form" novalidate>
      <div class="kd-form-grid">
        <div class="kd-field"><label for="kd-e-status">Status</label><select id="kd-e-status" class="kd-select" name="status">${statuses.map(s => `<option value="${s}"${s === r.status ? ' selected' : ''}${!a && (s === 'reviewed' || s === 'approved') ? ' disabled' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select></div>
        <div class="kd-field"><label for="kd-e-pn">Part number</label><input id="kd-e-pn" class="kd-input" name="partNumber" maxlength="60" value="${esc(r.partNumber ?? '')}"></div>
        <div class="kd-field"><label for="kd-e-prog">Programme</label><input id="kd-e-prog" class="kd-input" name="programme" maxlength="40" value="${esc(r.programme ?? '')}"></div>
        <div class="kd-field"><label for="kd-e-my">Model year</label><input id="kd-e-my" class="kd-input" name="modelYear" type="number" min="2000" max="2100" value="${n(r.modelYear)}"></div>
        <div class="kd-field"><label for="kd-e-pt">Powertrain</label><input id="kd-e-pt" class="kd-input" name="powertrain" maxlength="40" value="${esc(r.powertrain ?? '')}"></div>
        <div class="kd-field"><label for="kd-e-cc">Current cost per piece</label><input id="kd-e-cc" class="kd-input" name="currentCost" type="number" min="0" step="any" value="${n(r.currentCost)}"></div>
        <div class="kd-field"><label for="kd-e-ccy">Currency</label><select id="kd-e-ccy" class="kd-select" name="currentCcy">${ccyOpts(r.currentCcy)}</select></div>
        <div class="kd-field"><label for="kd-e-ct">Delivery terms</label><select id="kd-e-ct" class="kd-select" name="currentTerms">${termOpts(r.currentTerms)}</select></div>
        <div class="kd-field"><label for="kd-e-vol">Annual volume</label><input id="kd-e-vol" class="kd-input" name="annualVolume" type="number" min="0" step="1" value="${n(r.annualVolume)}"></div>
        ${a ? `<div class="kd-field"><label class="kd-check"><input type="checkbox" name="volumeValidated"${r.volumeValidated ? ' checked' : ''}> Annual volume validated</label></div>
        <div class="kd-field"><label for="kd-e-ss">Saving status</label><select id="kd-e-ss" class="kd-select" name="savingStatus"><option value="">None</option><option value="validated"${r.savingStatus === 'validated' ? ' selected' : ''}>Validated</option><option value="implemented"${r.savingStatus === 'implemented' ? ' selected' : ''}>Implemented</option></select></div>
        <div class="kd-field"><label for="kd-e-sp">Saving per piece</label><input id="kd-e-sp" class="kd-input" name="savingPerPiece" type="number" min="0" step="any" value="${n(r.savingPerPiece)}"></div>
        <div class="kd-field"><label for="kd-e-sc">Saving currency</label><select id="kd-e-sc" class="kd-select" name="savingCcy">${ccyOpts(r.savingCcy)}</select></div>
        <div class="kd-field"><label class="kd-check"><input type="checkbox" name="isTest"${r.isTest ? ' checked' : ''}> Test record (exclude)</label></div>` : ''}
        <div class="kd-field kd-field-wide"><label for="kd-e-notes">Notes</label><textarea id="kd-e-notes" class="kd-input" name="notes" rows="2" maxlength="1000">${esc(r.notes ?? '')}</textarea></div>
      </div>
      <p class="kd-muted">Changing a money value re-freezes only that value’s FX at the current policy; the others keep their snapshot.${!a && (r.status === 'reviewed' || r.status === 'approved') ? ' Changing the current cost sends this costing back for review.' : ''}</p>
      <p class="kd-form-err" role="alert" hidden></p>
      <div class="kd-dialog-f"><button type="button" class="kd-btn kd-btn-danger" data-act="delete-ask">Delete record</button>
        <span class="kd-del-confirm" hidden>Delete this record from the dashboard? <button type="button" class="kd-btn kd-btn-danger kd-btn-sm" data-act="delete-yes">Delete</button> <button type="button" class="kd-btn kd-btn-sm" data-act="delete-no">Keep</button></span>
        <button type="submit" class="kd-btn kd-btn-primary">Save changes</button></div>
    </form></details>`;
}

async function submitEdit(form: HTMLFormElement): Promise<void> {
  const dlg = S.root!.querySelector<HTMLDialogElement>('#kd-drawer')!;
  const id = dlg.dataset.id!;
  const err = form.querySelector<HTMLElement>('.kd-form-err')!;
  const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null);
  const body: Record<string, unknown> = {};
  const str = (n: string) => { const e = v(n); if (e) body[n] = e.value.trim() || null; };
  const num = (n: string, intOnly = false) => { const e = v(n); if (e) body[n] = e.value === '' ? null : intOnly ? Math.round(Number(e.value)) : Number(e.value); };
  body.status = (v('status') as unknown as HTMLSelectElement).value;
  str('partNumber'); str('programme'); str('powertrain'); num('modelYear', true); num('currentCost'); str('currentCcy'); str('currentTerms'); num('annualVolume', true);
  body.notes = (v('notes') as unknown as HTMLTextAreaElement).value.trim();
  if (S.meta?.isAdmin) {
    body.volumeValidated = !!v('volumeValidated')?.checked; body.isTest = !!v('isTest')?.checked;
    str('savingStatus'); num('savingPerPiece'); str('savingCcy');
  }
  try {
    await api(`/records/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    showToast('Record updated.', 'info');
    await loadAll({ quiet: true });
    await openRecord(id);
  } catch (e) { err.textContent = (e as Error).message; err.hidden = false; }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

async function openAdmin(tab: 'fx' | 'import' | 'audit' = 'fx'): Promise<void> {
  const dlg = S.root!.querySelector<HTMLDialogElement>('#kd-admin')!;
  const tabs = `<div class="kd-tabs" role="tablist" aria-label="Admin">${(['fx', 'import', 'audit'] as const).map(t => `<button type="button" role="tab" id="kd-at-${t}" aria-selected="${t === tab}" aria-controls="kd-ap" data-admin-tab="${t}" tabindex="${t === tab ? 0 : -1}">${t === 'fx' ? 'FX rates & policy' : t === 'import' ? 'Import records' : 'Audit log'}</button>`).join('')}</div>`;
  let panel = '';
  try {
    if (tab === 'fx') {
      const fx = await api<{ policy: string; labels: Record<string, string>; rates: { currency: string; period: string; gbpPerUnit: number; source: string; loadedAt: string }[]; reference: { source: string; effectiveDate: string } }>('/fx');
      panel = `<h3>Default FX policy</h3><p class="kd-muted">Approved 11 Nov 2026: approved monthly rates. Changing the policy does not change saved records until a recalculation is applied.</p>
        <div class="kd-inline"><label class="kd-visually-hidden" for="kd-fx-policy">FX policy</label><select id="kd-fx-policy" class="kd-select">${(['monthly', 'costing-date', 'reporting-date'] as const).map(p => `<option value="${p}"${p === fx.policy ? ' selected' : ''}>${esc(fx.labels[p])}</option>`).join('')}</select>
          <button type="button" class="kd-btn kd-btn-sm" data-act="fx-policy">Save policy</button></div>
        <h3>Load approved rates</h3><p class="kd-muted">CSV or Excel with columns <code>currency, period, gbp_per_unit</code> (or <code>units_per_gbp</code>)<code>, source</code>. Period is YYYY-MM (monthly) or YYYY-MM-DD (daily). The whole file is refused on any error.</p>
        <div class="kd-inline"><label class="kd-visually-hidden" for="kd-fx-file">FX rate file</label><input type="file" id="kd-fx-file" accept=".csv,.xlsx,.xls"><button type="button" class="kd-btn kd-btn-sm" data-act="fx-upload">Load rates</button></div>
        <div id="kd-fx-msg" aria-live="polite"></div>
        <h3>Controlled recalculation</h3><p class="kd-muted">Re-applies the current policy and table to every saved record. Preview first; applying keeps each record’s previous snapshot in its FX history. Original values never change.</p>
        <div class="kd-inline"><button type="button" class="kd-btn kd-btn-sm" data-act="recalc-preview">Preview</button><button type="button" class="kd-btn kd-btn-sm kd-btn-danger" data-act="recalc-apply" disabled>Apply recalculation</button></div>
        <div id="kd-recalc-msg" aria-live="polite"></div>
        <h3>Loaded rates (${fx.rates.length})</h3>
        ${fx.rates.length ? `<div class="kd-table-wrap kd-scroll-sm" tabindex="0" role="region" aria-label="Scrollable table"><table class="kd-table kd-table-sm"><caption class="kd-visually-hidden">Approved FX rates</caption><thead><tr><th scope="col">Currency</th><th scope="col">Period</th><th scope="col" class="num">GBP per unit</th><th scope="col">Source</th><th scope="col">Loaded</th></tr></thead><tbody>${fx.rates.map(r => `<tr><th scope="row">${esc(r.currency)}</th><td>${esc(r.period)}</td><td class="num">${r.gbpPerUnit.toPrecision(6)}</td><td>${esc(r.source)}</td><td>${dateTime(r.loadedAt)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="kd-muted">None loaded. Until rates are loaded every foreign-currency value uses the built-in reference: ${esc(fx.reference.source)} (${esc(fx.reference.effectiveDate)}).</p>`}`;
    } else if (tab === 'import') {
      panel = `<h3>Import from CSS System, CPSC II or another tool</h3>
        <p class="kd-muted">One row per costing in the template’s columns. Re-importing the same <code>source_tool</code> + <code>source_record_id</code> updates that record. The whole file is refused on any error, with the row and column named.</p>
        <p><a class="kd-link" href="#" data-act="template">Download the import template (CSV)</a></p>
        <div class="kd-inline"><label class="kd-visually-hidden" for="kd-imp-file">Import file</label><input type="file" id="kd-imp-file" accept=".csv,.xlsx,.xls"><button type="button" class="kd-btn kd-btn-sm" data-act="import">Import</button></div>
        <div id="kd-imp-msg" aria-live="polite"></div>`;
    } else {
      const a = await api<{ rows: { ts: string; action: string; target: string; detail: string; user: string | null }[] }>('/audit');
      panel = a.rows.length ? `<div class="kd-table-wrap kd-scroll-sm" tabindex="0" role="region" aria-label="Scrollable table"><table class="kd-table kd-table-sm"><caption class="kd-visually-hidden">Last 200 dashboard changes</caption><thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Detail</th></tr></thead><tbody>${a.rows.map(x => `<tr><td>${dateTime(x.ts)}</td><td>${esc(x.user ?? '—')}</td><td>${esc(x.action)}</td><td class="kd-mono">${esc(x.target)}</td><td class="kd-mono kd-wrap">${esc(x.detail.slice(0, 200))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="kd-muted">No changes logged yet.</p>';
    }
  } catch (e) { panel = `<p role="alert">${esc((e as Error).message)}</p>`; }
  dlg.innerHTML = `<div class="kd-dialog-in"><div class="kd-dialog-h"><div><h2 id="kd-admin-title">Dashboard administration</h2><p>FX rates, imports and the change log. Admins only.</p></div><button type="button" class="kd-icon-btn" data-close aria-label="Close">×</button></div>
    ${tabs}<div id="kd-ap" role="tabpanel" aria-labelledby="kd-at-${tab}">${panel}</div></div>`;
  if (!dlg.open) dlg.showModal();
  dlg.querySelector<HTMLElement>(`#kd-at-${tab}`)?.focus();
}

async function fileBase64(input: HTMLInputElement | null): Promise<string | null> {
  const f = input?.files?.[0];
  if (!f) return null;
  const buf = new Uint8Array(await f.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function errorsHtml(errors: { row: number; column: string; message: string }[]): string {
  return `<div class="kd-table-wrap kd-scroll-sm" tabindex="0" role="region" aria-label="Scrollable table"><table class="kd-table kd-table-sm"><caption class="kd-visually-hidden">File errors</caption><thead><tr><th scope="col">Row</th><th scope="col">Column</th><th scope="col">Problem</th></tr></thead><tbody>${errors.map(e => `<tr><td>${e.row}</td><td class="kd-mono">${esc(e.column)}</td><td>${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>`;
}

async function adminAction(act: string): Promise<void> {
  const dlg = S.root!.querySelector<HTMLDialogElement>('#kd-admin')!;
  const msg = (id: string, html: string) => { const m = dlg.querySelector(`#${id}`); if (m) m.innerHTML = html; };
  try {
    if (act === 'fx-policy') {
      const p = dlg.querySelector<HTMLSelectElement>('#kd-fx-policy')!.value;
      const r = await api<{ note: string }>('/fx/policy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy: p }) });
      showToast(r.note, 'info'); void loadAll({ quiet: true });
    } else if (act === 'fx-upload') {
      const b = await fileBase64(dlg.querySelector('#kd-fx-file'));
      if (!b) { msg('kd-fx-msg', '<p class="kd-form-err">Choose a file first.</p>'); return; }
      try {
        const r = await api<{ loaded: number; notes: string[] }>('/fx/rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileBase64: b }) });
        showToast(`${r.loaded} rate(s) loaded.`, 'info');
        await openAdmin('fx');
        msg('kd-fx-msg', `<p class="kd-ok">${r.loaded} rate(s) loaded. ${r.notes.map(esc).join(' ')}</p>`);
      } catch (e) {
        const errs = (e as { body?: { errors?: { row: number; column: string; message: string }[] } }).body?.errors;
        msg('kd-fx-msg', `<p class="kd-form-err">${esc((e as Error).message)}</p>${errs ? errorsHtml(errs) : ''}`);
      }
    } else if (act === 'recalc-preview' || act === 'recalc-apply') {
      const apply = act === 'recalc-apply';
      const r = await api<{ examined: number; changed: number; applied: boolean; changes: { id: string; field: string; from: number | null; to: number | null; fromSource: string | null; toSource: string | null }[] }>('/fx/recalculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply }) });
      msg('kd-recalc-msg', `<p class="${apply ? 'kd-ok' : ''}">${apply ? 'Applied' : 'Preview'}: ${int(r.changed)} of ${int(r.examined)} record(s) ${apply ? 'changed' : 'would change'}.</p>
        ${r.changes.length ? `<div class="kd-table-wrap kd-scroll-sm" tabindex="0" role="region" aria-label="Scrollable table"><table class="kd-table kd-table-sm"><caption class="kd-visually-hidden">Recalculation changes</caption><thead><tr><th scope="col">Record</th><th scope="col">Value</th><th scope="col" class="num">GBP before</th><th scope="col" class="num">GBP after</th><th scope="col">Rate source after</th></tr></thead><tbody>${r.changes.slice(0, 50).map(c => `<tr><td class="kd-mono">${esc(c.id.slice(4, 12))}</td><td>${esc(c.field)}</td><td class="num">${gbp(c.from)}</td><td class="num">${gbp(c.to)}</td><td>${esc(c.toSource ?? 'no rate')}</td></tr>`).join('')}</tbody></table></div>` : ''}`);
      const applyBtn = dlg.querySelector<HTMLButtonElement>('[data-act="recalc-apply"]');
      if (applyBtn) applyBtn.disabled = apply || r.changed === 0;
      if (apply) { showToast(`FX recalculated on ${r.changed} record(s).`, 'info'); void loadAll({ quiet: true }); }
    } else if (act === 'import') {
      const b = await fileBase64(dlg.querySelector('#kd-imp-file'));
      if (!b) { msg('kd-imp-msg', '<p class="kd-form-err">Choose a file first.</p>'); return; }
      try {
        const r = await api<{ added: number; updated: number }>('/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileBase64: b }) });
        msg('kd-imp-msg', `<p class="kd-ok">${r.added} record(s) added, ${r.updated} updated.</p>`);
        void loadAll({ quiet: true });
      } catch (e) {
        const errs = (e as { body?: { errors?: { row: number; column: string; message: string }[] } }).body?.errors;
        msg('kd-imp-msg', `<p class="kd-form-err">${esc((e as Error).message)}</p>${errs ? errorsHtml(errs) : ''}`);
      }
    } else if (act === 'template') {
      const r = await fetch(`${apiBase}/api/kpi/import/template.csv`);
      const { download } = await import('./kpi-export.js');
      download(await r.blob(), 'costvision-kpi-import-template.csv');
    }
  } catch (e) { showToast((e as Error).message, 'error'); }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

async function exportRows(): Promise<import('./kpi-export.js').ExportRow[]> {
  const r = await api<RecordsPage>(`/records?${fParam()}&scope=all&all=1`);
  return r.rows as import('./kpi-export.js').ExportRow[];
}
async function doExport(kind: 'pdf' | 'xlsx' | 'csv'): Promise<void> {
  if (!S.summary) return;
  showToast(`Preparing the ${kind === 'xlsx' ? 'Excel' : kind.toUpperCase()} export…`, 'info');
  try {
    const ex = await import('./kpi-export.js');
    if (kind === 'csv') {
      const r = await fetch(`${apiBase}/api/kpi/records.csv?${fParam()}&scope=${S.q.scope === 'excluded' ? 'excluded' : 'all'}`);
      if (!r.ok) throw new Error(`CSV export failed (${r.status})`);
      ex.download(await r.blob(), `costvision-kpi-records-${new Date().toISOString().slice(0, 10)}.csv`);
    } else {
      const rows = await exportRows();
      if (kind === 'pdf') await ex.exportPdf(S.summary, rows); else await ex.exportExcel(S.summary, rows);
    }
  } catch (e) { showToast((e as Error).message || 'The export failed.', 'error'); }
}

// ─── Events ──────────────────────────────────────────────────────────────────

function onClick(e: MouseEvent): void {
  const t = e.target as HTMLElement;
  const el = <T extends HTMLElement = HTMLElement>(sel: string) => t.closest<T>(sel);
  let x: HTMLElement | null;

  if ((x = el('[data-close]'))) { x.closest('dialog')?.close(); return; }
  if ((x = el('[data-ms-toggle]'))) {
    const dim = x.dataset.msToggle as Dimension;
    S.openDim = S.openDim === dim ? null : dim; S.msQuery = '';
    renderFilters(S.openDim ? `[data-ms-search="${dim}"]` : `[data-ms-toggle="${dim}"]`); return;
  }
  if ((x = el('[data-ms-close]'))) { const d = x.dataset.msClose; S.openDim = null; renderFilters(`[data-ms-toggle="${d}"]`); return; }
  if ((x = el('[data-ms-clear]'))) { const d = x.dataset.msClear as Dimension; S.filters[d] = []; filtersChanged(); return; }
  if ((x = el('[data-chip-dim]'))) {
    const d = x.dataset.chipDim as Dimension; S.filters[d] = S.filters[d].filter(v => v !== x!.dataset.chipVal); filtersChanged(); return;
  }
  if (el('[data-clear-all]')) { S.filters = structuredClone(DEFAULT_FILTERS); S.openDim = null; filtersChanged(); return; }
  if (S.openDim && !el('.kd-ms')) { const d = S.openDim; S.openDim = null; renderFilters(); void d; }

  if ((x = el('[data-ccy-mode]'))) { S.currencyMode = x.dataset.ccyMode as 'gbp' | 'original'; persist(); renderHead(); renderBody(); return; }
  if ((x = el('[data-card-action]'))) {
    const [k, v] = x.dataset.cardAction!.split(':');
    if (k === 'scope') { S.q.scope = v as Scope; S.q.page = 1; void loadRecords().then(() => scrollTo('records')); renderBody(); return; }
    if (k === 'status') { S.filters.status = v.split(','); filtersChanged(); return; }
  }
  if ((x = el('[data-insight]'))) {
    const ins = S.summary?.insights[Number(x.dataset.insight)];
    if (ins?.filter) { for (const [d, vals] of Object.entries(ins.filter)) S.filters[d as Dimension] = vals as string[]; filtersChanged(); }
    return;
  }
  if ((x = el('[data-chart-table]'))) {
    const id = x.dataset.chartTable!;
    if (S.tables.has(id)) S.tables.delete(id); else S.tables.add(id);
    renderBody(); S.root!.querySelector<HTMLElement>(`[data-chart-table="${id}"]`)?.focus(); return;
  }
  if ((x = el('[data-heat-com]'))) {
    const com = x.dataset.heatCom!, prog = x.dataset.heatProg!;
    if (!S.filters.commodity.includes(com)) S.filters.commodity = [...S.filters.commodity, com];
    if (!S.filters.programme.includes(prog)) S.filters.programme = [...S.filters.programme, prog];
    filtersChanged(); return;
  }
  if ((x = el('[data-status]'))) { addFilter('status', x.dataset.status!); return; }
  if ((x = el('[data-scope]'))) { S.q.scope = x.dataset.scope as Scope; S.q.page = 1; renderBody(); void loadRecords().then(() => scrollTo('records')); return; }
  if ((x = el('[data-drill-key]'))) {
    S.drillPath.push({ level: S.drill.level, key: x.dataset.drillKey!, label: x.dataset.drillLabel! });
    S.q.page = 1; void loadRecords(); return;
  }
  if ((x = el('[data-drill-to]'))) { S.drillPath = S.drillPath.slice(0, Number(x.dataset.drillTo) + 1); S.q.page = 1; void loadRecords(); return; }
  if ((x = el('[data-sort]'))) {
    const k = x.dataset.sort!;
    S.q.dir = S.q.sort === k && S.q.dir === 'desc' ? 'asc' : 'desc'; S.q.sort = k; S.q.page = 1;
    void loadRecords().then(() => S.root!.querySelector<HTMLElement>(`[data-sort="${k}"]`)?.focus()); return;
  }
  if ((x = el('[data-page]')) && !(x as HTMLButtonElement).disabled) { S.q.page = Number(x.dataset.page); void loadRecords(); return; }
  if ((x = el('[data-open]'))) { void openRecord(x.dataset.open!); return; }

  if ((x = el('[data-act]'))) {
    const act = x.dataset.act!;
    if (act === 'refresh') { void loadAll(); return; }
    if (act === 'export-menu') { toggleMenu(); return; }
    if (act.startsWith('export-')) { toggleMenu(false); void doExport(act.slice(7) as 'pdf' | 'xlsx' | 'csv'); return; }
    if (act === 'admin') { void openAdmin('fx'); return; }
    if (act === 'delete-ask') { x.parentElement!.querySelector<HTMLElement>('.kd-del-confirm')!.hidden = false; return; }
    if (act === 'delete-no') { x.closest<HTMLElement>('.kd-del-confirm')!.hidden = true; return; }
    if (act === 'delete-yes') {
      const dlg = S.root!.querySelector<HTMLDialogElement>('#kd-drawer')!;
      void api(`/records/${encodeURIComponent(dlg.dataset.id!)}`, { method: 'DELETE' }).then(() => { dlg.close(); showToast('Record deleted from the dashboard.', 'info'); void loadAll({ quiet: true }); }).catch(err => showToast((err as Error).message, 'error'));
      return;
    }
    if (act === 'template') e.preventDefault();
    void adminAction(act); return;
  }
  if ((x = el('[data-admin-tab]'))) { void openAdmin(x.dataset.adminTab as 'fx' | 'import' | 'audit'); return; }
  if (!el('.kd-menu')) toggleMenu(false);
}

function toggleMenu(force?: boolean): void {
  const btn = S.root!.querySelector<HTMLElement>('[data-act="export-menu"]')!;
  const pop = S.root!.querySelector<HTMLElement>('#kd-export-menu')!;
  const open = force ?? pop.hidden;
  pop.hidden = !open; btn.setAttribute('aria-expanded', String(open));
  if (open) pop.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
}

function scrollTo(id: string): void { S.root?.querySelector(`#kd-sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

function onChange(e: Event): void {
  const t = e.target as HTMLInputElement;
  if (t.matches('[data-ms-opt]')) {
    const d = t.dataset.msOpt as Dimension;
    S.filters[d] = t.checked ? [...S.filters[d], t.value] : S.filters[d].filter(v => v !== t.value);
    const sel = `[data-ms-opt="${d}"][value="${CSS.escape(t.value)}"]`;
    filtersChanged(); renderFilters(sel); return;
  }
  if (t.matches('[data-date-preset]')) {
    S.filters.datePreset = t.value as DatePreset;
    if (t.value !== 'custom') { delete S.filters.dateFrom; delete S.filters.dateTo; }
    filtersChanged(); renderFilters('#kd-date-preset'); return;
  }
  if (t.matches('[data-date-from]')) { S.filters.dateFrom = t.value || undefined; filtersChanged(); renderFilters('#kd-date-from'); return; }
  if (t.matches('[data-date-to]')) { S.filters.dateTo = t.value || undefined; filtersChanged(); renderFilters('#kd-date-to'); return; }
  if (t.matches('[data-scope-select]')) { S.q.scope = t.value as Scope; S.q.page = 1; void loadRecords(); return; }
  if (t.matches('[data-page-size]')) { S.q.pageSize = Number(t.value); S.q.page = 1; persist(); void loadRecords(); return; }
}

let searchT = 0 as unknown as ReturnType<typeof setTimeout>;
function onInput(e: Event): void {
  const t = e.target as HTMLInputElement;
  if (t.matches('[data-ms-search]')) {
    S.msQuery = t.value;
    const d = t.dataset.msSearch as Dimension;
    const wrap = t.closest('.kd-ms')!;
    const tmp = document.createElement('div');
    tmp.innerHTML = multiSelectHtml(d, S.summary?.options[d] ?? [], S.filters[d], true, S.msQuery);
    wrap.querySelector('.kd-ms-list')!.replaceWith(tmp.querySelector('.kd-ms-list')!);
    return;
  }
  if (t.id === 'kd-search') {
    clearTimeout(searchT);
    searchT = setTimeout(() => { S.q.search = t.value; S.q.page = 1; void loadRecords(); }, 250);
  }
}

function onKey(e: KeyboardEvent): void {
  const t = e.target as HTMLElement;
  if (e.key === 'Escape' && S.openDim) { const d = S.openDim; S.openDim = null; renderFilters(`[data-ms-toggle="${d}"]`); e.preventDefault(); return; }
  if (e.key === 'Escape' && !S.root!.querySelector<HTMLElement>('#kd-export-menu')!.hidden) { toggleMenu(false); S.root!.querySelector<HTMLElement>('[data-act="export-menu"]')?.focus(); return; }
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && t.matches('[data-ccy-mode]')) {
    S.currencyMode = S.currencyMode === 'gbp' ? 'original' : 'gbp'; persist(); renderHead(); renderBody();
    S.root!.querySelector<HTMLElement>(`[data-ccy-mode="${S.currencyMode}"]`)?.focus(); e.preventDefault(); return;
  }
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && t.matches('[data-admin-tab]')) {
    const order = ['fx', 'import', 'audit']; const i = order.indexOf(t.dataset.adminTab!);
    void openAdmin(order[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3] as 'fx' | 'import' | 'audit'); e.preventDefault();
  }
}

// ─── Mount ───────────────────────────────────────────────────────────────────

export async function mountKpiDashboard(host: HTMLElement): Promise<void> {
  if (S.root === host) { void loadAll({ quiet: !!S.summary }); return; }
  S.root = host;
  restore();
  host.innerHTML = shell();
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.addEventListener('input', onInput);
  host.addEventListener('keydown', onKey);
  host.addEventListener('submit', e => {
    const f = e.target as HTMLFormElement;
    if (f.id === 'kd-edit-form') { e.preventDefault(); void submitEdit(f); }
  });
  try { S.meta = await api<Meta>('/meta'); } catch { /* summary call will report */ }
  renderAll();
  await loadAll();
  // Auto-refresh while the dashboard is on screen and the tab is visible; also on return to the tab.
  S.timer = setInterval(() => { if (host.offsetParent && document.visibilityState === 'visible') void loadAll({ quiet: true }); }, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && host.offsetParent && Date.now() - Date.parse(S.refreshedAt || '0') > 60_000) void loadAll({ quiet: true });
  });
  document.addEventListener('cv-kpi-saved', () => { if (S.root) void loadAll({ quiet: true }); });
  // Theme switch → charts redraw in the new palette.
  S.observer = new MutationObserver(() => { if (S.summary && host.offsetParent) renderBody(); });
  S.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
