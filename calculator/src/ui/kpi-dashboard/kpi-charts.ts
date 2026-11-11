/**
 * KPI dashboard charts (Chart.js + one HTML heatmap). Data comes ready-made from the
 * server summary — no figure is computed here.
 *
 * Colour (dataviz method): the reference categorical palette in fixed slot order,
 * validated with validate_palette.js on CostVision's own surfaces — light #ffffff
 * (all pass; three slots < 3:1, so every chart carries a table view) and dark
 * #111513 / #141a27 (all pass). One series → slot 1 for every bar; the heatmap is one
 * hue light → dark. Text uses the theme's text tokens, never a series colour.
 */
import {
  Chart, BarController, LineController, DoughnutController, BarElement, LineElement, PointElement, ArcElement,
  CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js';
import { STATUS_LABEL, NOT_SET, type DashboardSummary, type CategoryRow, type Dimension, type RecordStatus } from '../../engine/kpi-dashboard.js';
import { esc, gbp, int } from './kpi-builders.js';

/** Chart configs are kept loosely typed ON PURPOSE: Chart.js's generic types are checked by
 *  variance, and a strictly typed second user of them changed how TypeScript compared the
 *  existing charts in main.ts (five false errors). The runtime config is plain Chart.js. */
export interface ChartConfiguration { type: 'bar' | 'line' | 'doughnut'; data: unknown; options?: Record<string, unknown> }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tip = { parsed: any; dataIndex: number; dataset: { label?: string }; label: string };

Chart.register(BarController, LineController, DoughnutController, BarElement, LineElement, PointElement, ArcElement, CategoryScale, LinearScale, Tooltip, Legend);

const CAT_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const CAT_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

let _forceLight = false;
/** Run `fn` with charts drawn in the light theme (the PDF prints on white whatever the screen shows). */
export async function withLightTheme(fn: () => Promise<void>): Promise<void> {
  _forceLight = true;
  try { await fn(); } finally { _forceLight = false; }
}
const isDark = () => !_forceLight && document.documentElement.getAttribute('data-theme') !== 'light';
const cssVar = (n: string, fb: string) => (_forceLight ? fb : getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb);
function theme() {
  const dark = isDark();
  return {
    cat: dark ? CAT_DARK : CAT_LIGHT,
    text: cssVar('--text-secondary', dark ? '#aeb9d4' : '#374769'),
    muted: cssVar('--text-muted', '#7c8aa6'),
    grid: cssVar('--border', dark ? 'rgba(150,166,204,0.14)' : 'rgba(37,99,235,0.12)'),
    surface: cssVar('--surface', dark ? '#111513' : '#ffffff'),
  };
}

export type FilterClick = (dim: Dimension, value: string) => void;
export type PeriodClick = (from: string, to: string) => void;

const charts: Chart[] = [];
export function destroyCharts(): void { while (charts.length) charts.pop()!.destroy(); }

interface ChartSpec {
  id: string;
  title: string;
  basis: string;
  empty: boolean;
  emptyText: string;
  table: { head: string[]; rows: (string | number)[][] };
  config?: () => ChartConfiguration;
  html?: string;          // non-canvas chart (heatmap, segmented bar)
  height?: number;
}

function tableHtml(t: ChartSpec['table'], title: string): string {
  return `<div class="kd-table-wrap"><table class="kd-table kd-table-sm"><caption class="kd-visually-hidden">${esc(title)} — data</caption>
    <thead><tr>${t.head.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map(r => `<tr>${r.map((c, i) => (i ? `<td class="num">${typeof c === 'number' ? int(c) : esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function cardHtml(s: ChartSpec, showTable: boolean): string {
  const body = s.empty
    ? `<div class="kd-chart-empty">${esc(s.emptyText)}</div>`
    : showTable ? tableHtml(s.table, s.title)
      : s.html ?? `<div class="kd-chart-box" style="height:${s.height ?? 240}px"><canvas id="kd-c-${s.id}" role="img" aria-label="${esc(s.title)} chart. Use the Table button for the values."></canvas></div>`;
  return `<section class="kd-chart-card" data-chart="${s.id}" aria-labelledby="kd-ct-${s.id}">
    <div class="kd-chart-h"><div><h3 id="kd-ct-${s.id}">${esc(s.title)}</h3><p>${esc(s.basis)}</p></div>
      ${s.empty ? '' : `<button type="button" class="kd-btn kd-btn-ghost kd-btn-sm" data-chart-table="${s.id}" aria-pressed="${showTable}">${showTable ? 'Chart' : 'Table'}</button>`}</div>
    ${body}</section>`;
}

const label = (k: string) => (k === NOT_SET ? 'Not set' : k);
const myLabel = (k: string) => (k === NOT_SET ? 'Not set' : `MY${k}`);

function barConfig(rows: CategoryRow[], value: (r: CategoryRow) => number, opts: { horizontal?: boolean; money?: boolean; name: string; labelOf?: (k: string) => string }): () => ChartConfiguration {
  return () => {
    const t = theme();
    const lf = opts.labelOf ?? label;
    return {
      type: 'bar',
      data: { labels: rows.map(r => lf(r.key)), datasets: [{ label: opts.name, data: rows.map(value), backgroundColor: t.cat[0], borderColor: t.surface, borderWidth: 2, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 }] },
      options: {
        indexAxis: opts.horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: Tip) => { const v = Number(c.parsed[opts.horizontal ? 'x' : 'y'] ?? 0); return `${opts.name}: ${opts.money ? gbp(v) : int(v)}`; } } } },
        // The VALUE axis may get a £ formatter; the category axis keeps Chart.js's own label
        // callback (passing callback: undefined replaces it and prints 0, 1, 2 …).
        scales: (() => {
          const money = { callback: (v: unknown) => gbp(Number(v), 0) };
          const valueTicks = { color: t.text, precision: 0, ...(opts.money ? money : {}) };
          const catTicks = { color: t.text, autoSkip: false };
          return {
            x: { grid: { display: !!opts.horizontal, color: t.grid }, border: { color: t.grid }, ticks: opts.horizontal ? valueTicks : catTicks, ...(opts.horizontal ? { beginAtZero: true } : {}) },
            y: { grid: { display: !opts.horizontal, color: t.grid }, border: { color: t.grid }, ticks: opts.horizontal ? catTicks : valueTicks, ...(opts.horizontal ? {} : { beginAtZero: true }) },
          };
        })(),
      },
    } as ChartConfiguration;
  };
}

export function chartSpecs(s: DashboardSummary): ChartSpec[] {
  const c = s.charts;
  const finEmpty = 'No financially eligible record (both costs, converted to GBP, same delivery terms) in this view.';
  const specs: ChartSpec[] = [];

  specs.push({
    id: 'activity', title: 'Costing activity over time', basis: `Saves per ${c.activityGranularity}, revisions included`, height: 220,
    empty: !c.activity.some(p => p.count), emptyText: 'No costing saved in this period.',
    table: { head: ['Period', 'Costings saved'], rows: c.activity.map(p => [p.label, p.count]) },
    config: () => {
      const t = theme();
      return {
        type: 'line',
        data: { labels: c.activity.map(p => p.label), datasets: [{ label: 'Costings saved', data: c.activity.map(p => p.count), borderColor: t.cat[0], backgroundColor: t.cat[0], borderWidth: 2, pointRadius: c.activity.length > 40 ? 0 : 3, pointHoverRadius: 5, pointBorderColor: t.surface, pointBorderWidth: 2, tension: 0 }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x: Tip) => `Costings saved: ${int(x.parsed.y ?? 0)}` } } },
          scales: { x: { grid: { display: false }, border: { color: t.grid }, ticks: { color: t.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.text, precision: 0 } } },
        },
      } as ChartConfiguration;
    },
  });

  const byCom = c.byCommodity.slice(0, 15);
  specs.push({
    id: 'commodity', title: 'Costing records by commodity', basis: 'Saves, revisions included · select a bar to filter', height: Math.max(180, byCom.length * 26 + 40),
    empty: !byCom.length, emptyText: 'No records in this view.',
    table: { head: ['Commodity', 'Records'], rows: c.byCommodity.map(r => [label(r.key), r.count]) },
    config: barConfig(byCom, r => r.count, { horizontal: true, name: 'Records' }),
  });

  const cost = c.costByCommodity.slice(0, 12);
  specs.push({
    id: 'cost', title: 'Current cost v should-cost by commodity', basis: 'GBP per piece, summed over eligible current records', height: 260,
    empty: !cost.length, emptyText: finEmpty,
    table: { head: ['Commodity', 'Eligible records', 'GBP current (Σ per piece)', 'GBP should-cost (Σ per piece)', 'GBP gap'], rows: c.costByCommodity.map(r => [label(r.key), r.eligible!, gbp(r.currentGbp), gbp(r.shouldGbp), gbp(r.gapGbp)]) },
    config: () => {
      const t = theme();
      const ds = (name: string, v: number[], col: string) => ({ label: name, data: v, backgroundColor: col, borderColor: t.surface, borderWidth: 2, borderRadius: 4, borderSkipped: 'start' as const, maxBarThickness: 22 });
      return {
        type: 'bar',
        data: { labels: cost.map(r => label(r.key)), datasets: [ds('Current cost', cost.map(r => r.currentGbp!), t.cat[0]), ds('Should-cost', cost.map(r => r.shouldGbp!), t.cat[1])] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: true, position: 'top', align: 'end', labels: { color: t.text, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } }, tooltip: { callbacks: { label: (x: Tip) => `${x.dataset.label}: ${gbp(x.parsed.y)} (${int(cost[x.dataIndex].eligible!)} records)` } } },
          scales: { x: { grid: { display: false }, border: { color: t.grid }, ticks: { color: t.text } }, y: { beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.text, callback: (v: unknown) => gbp(Number(v), 0) } } },
        },
      } as ChartConfiguration;
    },
  });

  const opp = c.opportunityByCommodity.slice(0, 12);
  specs.push({
    id: 'opportunity', title: 'Potential cost opportunity by commodity', basis: 'Ranked · per-piece gaps above should-cost, summed — not an annual saving', height: Math.max(180, opp.length * 26 + 40),
    empty: !opp.length, emptyText: 'No current record is above its should-cost in this view.',
    table: { head: ['Commodity', 'Records', 'Opportunity (GBP per piece, Σ)'], rows: c.opportunityByCommodity.map(r => [label(r.key), r.eligible!, gbp(r.opportunityGbp)]) },
    config: barConfig(opp, r => r.opportunityGbp!, { horizontal: true, money: true, name: 'Opportunity' }),
  });

  specs.push({
    id: 'programme', title: 'Programme distribution', basis: 'Current records · select a bar to filter', height: 220,
    empty: !c.byProgramme.length, emptyText: 'No current records in this view.',
    table: { head: ['Programme', 'Current records'], rows: c.byProgramme.map(r => [label(r.key), r.count]) },
    config: barConfig(c.byProgramme, r => r.count, { name: 'Current records' }),
  });

  const pt = c.byPowertrain;
  specs.push({
    id: 'powertrain', title: 'Powertrain distribution', basis: 'Current records · select a segment to filter', height: 220,
    empty: !pt.length, emptyText: 'No current records in this view.',
    table: { head: ['Powertrain', 'Current records'], rows: pt.map(r => [label(r.key), r.count]) },
    config: () => {
      const t = theme();
      const total = pt.reduce((a, r) => a + r.count, 0);
      return {
        type: 'doughnut',
        data: { labels: pt.map(r => label(r.key)), datasets: [{ data: pt.map(r => r.count), backgroundColor: pt.map((r, i) => (r.key === NOT_SET ? t.muted : t.cat[i % 8])), borderColor: t.surface, borderWidth: 2 }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false, cutout: '62%',
          plugins: { legend: { position: 'right', labels: { color: t.text, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } }, tooltip: { callbacks: { label: (x: Tip) => `${x.label}: ${int(x.parsed)} (${((x.parsed / Math.max(1, total)) * 100).toFixed(1)}%)` } } },
        },
      } as ChartConfiguration;
    },
  });

  specs.push({
    id: 'modelyear', title: 'Model year analysis', basis: 'Current records · select a column to filter', height: 220,
    empty: !c.byModelYear.length, emptyText: 'No current records in this view.',
    table: { head: ['Model year', 'Current records'], rows: c.byModelYear.map(r => [myLabel(r.key), r.count]) },
    config: barConfig(c.byModelYear, r => r.count, { name: 'Current records', labelOf: myLabel }),
  });

  specs.push({
    id: 'tool', title: 'Costing tool contribution', basis: 'Saves, revisions included · select a bar to filter', height: Math.max(160, c.byTool.length * 30 + 40),
    empty: !c.byTool.length, emptyText: 'No records in this view.',
    table: { head: ['Tool', 'Records'], rows: c.byTool.map(r => [label(r.key), r.count]) },
    config: barConfig(c.byTool, r => r.count, { horizontal: true, name: 'Records' }),
  });

  // Heatmap: HTML grid, one hue light → dark on the count; every cell is a button.
  const hm = c.heatmap;
  const max = Math.max(1, ...hm.cells.map(x => x.count));
  const cell = (com: string, prog: string) => hm.cells.find(x => x.commodity === com && x.programme === prog);
  const heatHtml = `<div class="kd-table-wrap"><table class="kd-heat"><caption class="kd-visually-hidden">Current records by commodity and programme</caption>
    <thead><tr><th scope="col">Commodity</th>${hm.programmes.map(p => `<th scope="col">${esc(label(p))}</th>`).join('')}</tr></thead>
    <tbody>${hm.commodities.map(com => `<tr><th scope="row">${esc(label(com))}</th>${hm.programmes.map(p => {
      const x = cell(com, p);
      if (!x) return '<td><span class="kd-heat-0" aria-label="none">·</span></td>';
      const step = SEQ[Math.min(SEQ.length - 1, 2 + Math.round((x.count / max) * (SEQ.length - 3)))];
      const ink = SEQ.indexOf(step) >= 7 ? '#ffffff' : '#0d366b';
      return `<td><button type="button" class="kd-heat-c" style="background:${step};color:${ink}" data-heat-com="${esc(com)}" data-heat-prog="${esc(p)}"
        title="${esc(label(com))} × ${esc(label(p))}: ${x.count} current record(s), opportunity ${gbp(x.opportunityGbp)} per piece Σ" aria-label="${esc(label(com))}, ${esc(label(p))}: ${x.count} records, opportunity ${gbp(x.opportunityGbp)}">${x.count}</button></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="kd-heat-scale" aria-hidden="true"><span>Fewer</span>${SEQ.slice(2).filter((_, i) => i % 2 === 0).map(s => `<i style="background:${s}"></i>`).join('')}<span>More current records</span></div>`;
  specs.push({
    id: 'heatmap', title: 'Commodity v programme', basis: 'Current records · hover for opportunity · select a cell to filter both',
    empty: !hm.cells.length, emptyText: 'No current records in this view.',
    table: { head: ['Commodity', 'Programme', 'Current records', 'Opportunity (GBP per piece, Σ)'], rows: hm.cells.map(x => [label(x.commodity), label(x.programme), x.count, gbp(x.opportunityGbp)]) },
    html: heatHtml,
  });

  specs.push({
    id: 'opp-powertrain', title: 'Cost opportunity by powertrain', basis: 'Per-piece gaps above should-cost, summed · select a bar to filter', height: 220,
    empty: !c.opportunityByPowertrain.length, emptyText: 'No current record is above its should-cost in this view.',
    table: { head: ['Powertrain', 'Records', 'Opportunity (GBP per piece, Σ)'], rows: c.opportunityByPowertrain.map(r => [label(r.key), r.eligible!, gbp(r.opportunityGbp)]) },
    config: barConfig(c.opportunityByPowertrain, r => r.opportunityGbp!, { money: true, name: 'Opportunity' }),
  });

  // Status: one segmented bar (part-to-whole, ≤ 4 segments) with a legend that names every count.
  const st = c.byStatus; const stTotal = st.reduce((a, r) => a + r.count, 0);
  const t = theme();
  const stHtml = `<div class="kd-seg" role="group" aria-label="Costing status — select a segment to filter">
    ${st.map((r, i) => `<button type="button" class="kd-seg-part" style="flex:${r.count};background:${t.cat[i % 8]}" data-status="${esc(r.key)}" title="${esc(STATUS_LABEL[r.key as RecordStatus] ?? r.key)}: ${r.count} (${((r.count / Math.max(1, stTotal)) * 100).toFixed(1)}%)" aria-label="Filter to ${esc(STATUS_LABEL[r.key as RecordStatus] ?? r.key)}"></button>`).join('')}</div>
    <ul class="kd-legend">${st.map((r, i) => `<li><i style="background:${t.cat[i % 8]}"></i>${esc(STATUS_LABEL[r.key as RecordStatus] ?? r.key)} <strong>${int(r.count)}</strong> <span class="kd-muted">${((r.count / Math.max(1, stTotal)) * 100).toFixed(0)}%</span></li>`).join('')}</ul>`;
  specs.push({
    id: 'status', title: 'Costing status', basis: 'Current records · select a segment to filter',
    empty: !st.length, emptyText: 'No current records in this view.',
    table: { head: ['Status', 'Current records'], rows: st.map(r => [STATUS_LABEL[r.key as RecordStatus] ?? r.key, r.count]) },
    html: stHtml,
  });
  return specs;
}

/** The dimension a click on a chart filters, by chart id. */
const CLICK_DIM: Record<string, Dimension> = {
  commodity: 'commodity', opportunity: 'commodity', cost: 'commodity', programme: 'programme', powertrain: 'powertrain',
  modelyear: 'modelYear', tool: 'tool', 'opp-powertrain': 'powertrain',
};

export function renderCharts(host: HTMLElement, s: DashboardSummary, tables: Set<string>, onFilter: FilterClick, onPeriod: PeriodClick): void {
  destroyCharts();
  const specs = chartSpecs(s);
  host.innerHTML = specs.map(sp => cardHtml(sp, tables.has(sp.id))).join('');
  for (const sp of specs) {
    if (sp.empty || tables.has(sp.id) || !sp.config) continue;
    const canvas = host.querySelector<HTMLCanvasElement>(`#kd-c-${sp.id}`);
    if (!canvas) continue;
    const cfg = sp.config();
    const keys = keysFor(sp.id, s);
    cfg.options = {
      ...cfg.options,
      onHover: (e: { native?: Event | null }, els: unknown[]) => { (e.native?.target as HTMLElement | undefined)?.style.setProperty('cursor', els.length ? 'pointer' : 'default'); },
      onClick: (_e: unknown, els: { index: number }[]) => {
        if (!els.length) return;
        const i = els[0].index;
        if (sp.id === 'activity') {
          const p = s.charts.activity[i];
          if (!p) return;
          const start = p.bucket;
          const d = new Date(start + 'T00:00:00Z');
          if (s.charts.activityGranularity === 'month') d.setUTCMonth(d.getUTCMonth() + 1); else d.setUTCDate(d.getUTCDate() + (s.charts.activityGranularity === 'week' ? 7 : 1));
          d.setUTCDate(d.getUTCDate() - 1);
          onPeriod(start, d.toISOString().slice(0, 10));
          return;
        }
        const dim = CLICK_DIM[sp.id];
        if (dim && keys[i] !== undefined) onFilter(dim, keys[i]);
      },
    };
    charts.push(new Chart(canvas, cfg as never));
  }
}

function keysFor(id: string, s: DashboardSummary): string[] {
  const c = s.charts;
  switch (id) {
    case 'commodity': return c.byCommodity.slice(0, 15).map(r => r.key);
    case 'cost': return c.costByCommodity.slice(0, 12).map(r => r.key);
    case 'opportunity': return c.opportunityByCommodity.slice(0, 12).map(r => r.key);
    case 'programme': return c.byProgramme.map(r => r.key);
    case 'powertrain': return c.byPowertrain.map(r => r.key);
    case 'modelyear': return c.byModelYear.map(r => r.key);
    case 'tool': return c.byTool.map(r => r.key);
    case 'opp-powertrain': return c.opportunityByPowertrain.map(r => r.key);
    default: return [];
  }
}
