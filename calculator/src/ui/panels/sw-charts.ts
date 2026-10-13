/**
 * Software costing charts (cockpit, Oct 2026 review) — plain SVG builders `(data) → string` and ONE `wireCharts(root)`
 * for hover tooltips and motion. Every figure is the engine's; the charts only draw it.
 *
 * Data-viz rules (dataviz skill): the reference categorical palette, validated in both themes (7 slots, adjacent pairs:
 * CVD ΔE ≥ 8.4, normal ≥ 19.3; light slots 3–5 under 3:1 → every chart has direct labels or a data table); one axis per
 * chart; bars ≤ 24 px with a 4 px rounded data end; 2 px surface gaps; recessive 1 px solid grid; text in text tokens,
 * never the series colour; a legend for ≥ 2 series.
 *
 * Motion (app motion policy: 150–260 ms, power2-out, no bounce, reduced motion = none): a chart's marks are revealed on
 * FIRST render (clip from the baseline, 260 ms, staggered ≤ 150 ms in total); on a live update the same marks MORPH from
 * their previous geometry to the new one (220 ms) — the eye follows the change instead of re-reading the chart.
 */

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

export type Money = (gbp: number) => string;

/** Series colours by slot (CSS custom properties, defined for both themes in CHART_CSS). */
export const SLOT = (i: number): string => `var(--swc-${(i % 7) + 1})`;

/** Domain A–G → a fixed slot (colour follows the entity, never its rank). */
export const DOMAIN_SLOT: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Rounded data end on the right of a horizontal bar, square at the baseline. */
function hbar(x: number, y: number, w: number, h: number, fill: string, key: string, tip: string, cls = ''): string {
  const rr = Math.min(4, w / 2, h / 2);
  const ww = Math.max(0, w);
  const d = ww <= rr
    ? `M${r1(x)} ${r1(y)}h${r1(ww)}v${r1(h)}h${r1(-ww)}z`
    : `M${r1(x)} ${r1(y)}h${r1(ww - rr)}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${r1(h - 2 * rr)}a${rr} ${rr} 0 0 1 ${-rr} ${rr}h${r1(-(ww - rr))}z`;
  return `<path class="swc-mark ${cls}" d="${d}" fill="${fill}" data-k="${esc(key)}" data-x="${r1(x)}" data-w="${r1(ww)}" data-tip="${esc(tip)}"/>`;
}

/** Rounded data end at the top of a column, square at the baseline. */
function vbar(x: number, yTop: number, w: number, h: number, fill: string, key: string, tip: string, roundTop = true): string {
  const rr = roundTop ? Math.min(4, w / 2, h) : 0;
  const hh = Math.max(0, h);
  const d = rr <= 0 || hh <= rr
    ? `M${r1(x)} ${r1(yTop)}h${r1(w)}v${r1(hh)}h${r1(-w)}z`
    : `M${r1(x)} ${r1(yTop + rr)}a${rr} ${rr} 0 0 1 ${rr} ${-rr}h${r1(w - 2 * rr)}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${r1(hh - rr)}h${r1(-w)}z`;
  return `<path class="swc-mark swc-col" d="${d}" fill="${fill}" data-k="${esc(key)}" data-y="${r1(yTop)}" data-h="${r1(hh)}" data-tip="${esc(tip)}"/>`;
}

function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function table(caption: string, head: string[], rows: string[][]): string {
  return `<details class="swc-data"><summary>Data table</summary><div class="swc-tw"><table><caption>${esc(caption)}</caption>
    <thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;
}

function legend(items: Array<[string, string]>): string {
  return `<ul class="swc-legend" aria-hidden="true">${items.map(([c, l]) => `<li><i style="background:${c}"></i>${esc(l)}</li>`).join('')}</ul>`;
}

// ── Waterfall: the programme total built from its buckets ───────────────────────────────────────────────────────────

export interface WaterfallItem { key: string; label: string; value: number; group: 'nre' | 'life' }

export function waterfallChart(id: string, items: WaterfallItem[], total: number, money: Money): string {
  const rows = items.filter(i => i.value > 0);
  const W = 640, rowH = 26, gap = 8, left = 168, right = 86, top = 6;
  const H = top + (rows.length + 1) * (rowH + gap) + 4;
  const sx = (v: number) => (W - left - right) * v / (total || 1);
  let acc = 0;
  const bars = rows.map((it, i) => {
    const y = top + i * (rowH + gap);
    const x = left + sx(acc);
    acc += it.value;
    const fill = it.group === 'nre' ? SLOT(0) : SLOT(1);
    const pct = total > 0 ? it.value / total * 100 : 0;
    return `<text class="swc-lbl" x="${left - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(it.label)}</text>
      ${hbar(x, y + 4, sx(it.value), rowH - 8, fill, it.key, `${it.label}: ${money(it.value)} (${pct.toFixed(1)} % of total)`)}
      <text class="swc-val" x="${r1(x + sx(it.value) + 6)}" y="${y + rowH / 2 + 4}">${esc(money(it.value))}</text>`;
  }).join('');
  const yT = top + rows.length * (rowH + gap);
  const totalBar = `<text class="swc-lbl swc-strong" x="${left - 10}" y="${yT + rowH / 2 + 4}" text-anchor="end">Programme total</text>
    ${hbar(left, yT + 4, sx(total), rowH - 8, 'var(--swc-ink)', 'total', `Programme total: ${money(total)}`)}
    <text class="swc-val swc-strong" x="${r1(left + sx(total) + 6)}" y="${yT + rowH / 2 + 4}">${esc(money(total))}</text>`;
  const connectors = rows.map((_, i) => {
    const xEnd = left + sx(rows.slice(0, i + 1).reduce((a, r) => a + r.value, 0));
    const y1 = top + i * (rowH + gap) + rowH - 4, y2 = top + (i + 1) * (rowH + gap) + 4;
    return `<line class="swc-conn" x1="${r1(xEnd)}" x2="${r1(xEnd)}" y1="${y1}" y2="${y2}"/>`;
  }).join('');
  return `<figure class="swc" data-chart="${esc(id)}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t"><title id="${id}-t">Programme cost built up from its buckets, ${esc(money(total))} in total</title>
      ${connectors}${bars}${totalBar}</svg>
    ${legend([[SLOT(0), 'One-off engineering (NRE)'], [SLOT(1), 'Lifecycle (each production year)'], ['var(--swc-ink)', 'Total']])}
    ${table('Cost by bucket', ['Bucket', 'Cost', 'Share'], [...rows.map(r => [r.label, money(r.value), `${(total > 0 ? r.value / total * 100 : 0).toFixed(1)} %`]), ['Programme total', money(total), '100 %']])}
  </figure>`;
}

// ── Treemap: where the money is, domain → module ────────────────────────────────────────────────────────────────────

export interface TreeNode { key: string; label: string; value: number; group: string; groupLabel: string }

interface Rect { x: number; y: number; w: number; h: number }

/** Squarified treemap (Bruls, Huizing & van Wijk 2000) over values already sorted descending. */
function squarify(values: number[], box: Rect): Rect[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }));
  const scale = (box.w * box.h) / total;
  const areas = values.map(v => v * scale);
  const out: Rect[] = [];
  let { x, y, w, h } = box;
  let i = 0;
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0), mx = Math.max(...row), mn = Math.min(...row);
    return Math.max(side * side * mx / (s * s), (s * s) / (side * side * mn));
  };
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) { row.push(areas[j]); j++; }
    const s = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const cw = s / h; let cy = y;
      for (const a of row) { const ch = a / cw; out.push({ x, y: cy, w: cw, h: ch }); cy += ch; }
      x += cw; w -= cw;
    } else {
      const rh = s / w; let cx = x;
      for (const a of row) { const cw2 = a / rh; out.push({ x: cx, y, w: cw2, h: rh }); cx += cw2; }
      y += rh; h -= rh;
    }
    i = j;
  }
  return out;
}

export function treemapChart(id: string, nodes: TreeNode[], money: Money): string {
  const W = 640, H = 340;
  const groups = new Map<string, { label: string; value: number; items: TreeNode[] }>();
  for (const n of nodes.filter(n => n.value > 0)) {
    const g = groups.get(n.group) ?? { label: n.groupLabel, value: 0, items: [] };
    g.value += n.value; g.items.push(n); groups.set(n.group, g);
  }
  const gs = [...groups.entries()].sort((a, b) => b[1].value - a[1].value);
  const total = gs.reduce((a, [, g]) => a + g.value, 0);
  const gRects = squarify(gs.map(([, g]) => g.value), { x: 0, y: 0, w: W, h: H });
  const cells: string[] = [];
  gs.forEach(([gk, g], gi) => {
    const r = gRects[gi];
    const items = [...g.items].sort((a, b) => b.value - a.value);
    const head = r.h > 40 && r.w > 70 ? 16 : 0;
    const inner = squarify(items.map(i => i.value), { x: r.x + 1, y: r.y + head + 1, w: Math.max(0, r.w - 2), h: Math.max(0, r.h - head - 2) });
    const slotN = (DOMAIN_SLOT[gk] ?? gi) % 7;
    const fill = SLOT(slotN);
    const on = `var(--swc-on-${slotN + 1})`;   // white or ink, whichever clears contrast on this fill
    const headTxt = `${g.label} · ${money(g.value)}`;
    const maxCh = Math.floor((r.w - 10) / 6.2);
    cells.push(`<g class="swc-tm-g">${head ? `<text class="swc-tm-h" x="${r1(r.x + 6)}" y="${r1(r.y + 12)}">${esc(headTxt.length > maxCh ? headTxt.slice(0, Math.max(4, maxCh - 1)) + '…' : headTxt)}</text>` : ''}`);
    items.forEach((it, ii) => {
      const c = inner[ii];
      const pad = 1;
      const w = Math.max(0, c.w - 2 * pad), h = Math.max(0, c.h - 2 * pad);
      const show = w > 64 && h > 26;
      cells.push(`<rect class="swc-mark swc-tm" x="${r1(c.x + pad)}" y="${r1(c.y + pad)}" width="${r1(w)}" height="${r1(h)}" rx="3" fill="${fill}"
        data-k="${esc(it.key)}" data-module="${esc(it.key)}" tabindex="0" role="button"
        aria-label="${esc(`${it.label}: ${money(it.value)} (${(it.value / total * 100).toFixed(1)} %), ${g.label}`)}"
        data-tip="${esc(`${it.label} — ${money(it.value)} · ${(it.value / total * 100).toFixed(1)} % · ${g.label}`)}"/>
        ${show ? `<text class="swc-tm-t" fill="${on}" x="${r1(c.x + 7)}" y="${r1(c.y + 16)}">${esc(it.label.length > Math.floor(w / 6.4) ? it.label.slice(0, Math.max(3, Math.floor(w / 6.4) - 1)) + '…' : it.label)}</text>
        ${h > 38 ? `<text class="swc-tm-v" fill="${on}" x="${r1(c.x + 7)}" y="${r1(c.y + 30)}">${esc(money(it.value))}</text>` : ''}` : ''}`);
    });
    cells.push('</g>');
  });
  return `<figure class="swc" data-chart="${esc(id)}">
    <svg viewBox="0 0 ${W} ${H}" role="group" aria-labelledby="${id}-t"><title id="${id}-t">Where the money is: ${gs.length} software domains, ${nodes.length} modules</title>${cells.join('')}</svg>
    ${legend(gs.map(([gk, g], gi) => [SLOT(DOMAIN_SLOT[gk] ?? gi), `${g.label} ${(g.value / total * 100).toFixed(0)} %`]))}
    ${table('Cost by module', ['Module', 'Domain', 'Cost', 'Share'], [...nodes].filter(n => n.value > 0).sort((a, b) => b.value - a.value).map(n => [n.label, n.groupLabel, money(n.value), `${(n.value / total * 100).toFixed(1)} %`]))}
  </figure>`;
}

// ── Tornado: what moves the total ────────────────────────────────────────────────────────────────────────────────────

export interface TornadoRow { label: string; low: number; base: number; high: number; lowLabel?: string; highLabel?: string }

export function tornadoChart(id: string, rows: TornadoRow[], money: Money): string {
  const rs = [...rows].sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low));
  const W = 640, rowH = 34, left = 210, right = 20, top = 22;
  const H = top + rs.length * rowH + 8;
  const base = rs[0]?.base ?? 0;
  const span = Math.max(1, ...rs.map(r => Math.max(Math.abs(r.low - base), Math.abs(r.high - base))));
  const cx = left + (W - left - right) / 2;
  const half = (W - left - right) / 2 - 64;
  const sx = (d: number) => half * d / span;
  const bars = rs.map((r, i) => {
    const y = top + i * rowH;
    const dl = r.low - base, dh = r.high - base;
    const seg = (d: number, tag: string, slot: number, txt: string) => {
      const x0 = d < 0 ? cx + sx(d) : cx;
      const w = Math.abs(sx(d));
      const path = d < 0
        ? `<path class="swc-mark" d="M${r1(cx)} ${y + 8}h${r1(-(w - Math.min(4, w)))}a4 4 0 0 0 -4 4v${rowH - 24}a4 4 0 0 0 4 4h${r1(w - Math.min(4, w))}z" fill="${SLOT(slot)}" data-k="${esc(r.label + tag)}" data-tip="${esc(txt)}"/>`
        : hbar(x0, y + 8, w, rowH - 16, SLOT(slot), r.label + tag, txt);
      return path;
    };
    const lowTxt = `${r.label} — ${r.lowLabel ?? 'low'}: ${money(r.low)} (${dl >= 0 ? '+' : ''}${money(dl)})`;
    const highTxt = `${r.label} — ${r.highLabel ?? 'high'}: ${money(r.high)} (${dh >= 0 ? '+' : ''}${money(dh)})`;
    return `<text class="swc-lbl" x="${left - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(r.label)}</text>
      ${dl !== 0 ? seg(dl, '-lo', 2, lowTxt) : ''}${dh !== 0 ? seg(dh, '-hi', 1, highTxt) : ''}
      <text class="swc-val" x="${r1(cx + sx(Math.min(dl, dh)) - 6)}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(money(Math.min(r.low, r.high)))}</text>
      <text class="swc-val" x="${r1(cx + sx(Math.max(dl, dh)) + 6)}" y="${y + rowH / 2 + 4}">${esc(money(Math.max(r.low, r.high)))}</text>`;
  }).join('');
  return `<figure class="swc" data-chart="${esc(id)}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t"><title id="${id}-t">What moves the programme total from ${esc(money(base))}</title>
      <line class="swc-axis" x1="${cx}" x2="${cx}" y1="${top - 14}" y2="${H - 4}"/>
      <text class="swc-axis-t" x="${cx}" y="${top - 6}" text-anchor="middle">Base ${esc(money(base))}</text>${bars}</svg>
    ${legend([[SLOT(2), 'Lower case'], [SLOT(1), 'Higher case']])}
    ${table('Sensitivity of the programme total', ['Driver', 'Low', 'Base', 'High'], rs.map(r => [r.label, money(r.low), money(r.base), money(r.high)]))}
  </figure>`;
}

// ── Scenarios: one figure per scenario against the baseline ─────────────────────────────────────────────────────────

export interface ScenarioBar { key: string; label: string; value: number; base?: boolean }

/** One bar per scenario (single series, no legend); the baseline bar in ink and a dashed rule at its value. */
export function scenarioChart(id: string, bars: ScenarioBar[], measure: string, money: Money): string {
  if (!bars.length) return '';
  // Drawn wide (it spans the card) so a short list does not scale its text up.
  const W = 1000, rowH = 30, left = 230, right = 170, top = 8;
  const H = top + bars.length * rowH + 6;
  const max = niceMax(Math.max(...bars.map(b => b.value), 0));
  const sx = (v: number) => (W - left - right) * Math.max(0, v) / max;
  const base = bars.find(b => b.base);
  const rows = bars.map((b, i) => {
    const y = top + i * rowH;
    const d = base && !b.base ? b.value - base.value : null;
    const dTxt = d == null ? 'baseline' : `${d >= 0 ? '+' : '−'}${money(Math.abs(d))}`;
    return `<text class="swc-lbl${b.base ? ' swc-strong' : ''}" x="${left - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(b.label.length > 28 ? b.label.slice(0, 27) + '…' : b.label)}</text>
      ${hbar(left, y + 7, sx(b.value), rowH - 14, b.base ? 'var(--swc-ink)' : SLOT(0), b.key, `${b.label}: ${money(b.value)} (${dTxt})`)}
      <text class="swc-val${b.base ? ' swc-strong' : ''}" x="${r1(left + sx(b.value) + 6)}" y="${y + rowH / 2 + 4}">${esc(money(b.value))}${d == null ? '' : ` · ${esc(dTxt)}`}</text>`;
  }).join('');
  const rule = base ? `<line class="swc-base" x1="${r1(left + sx(base.value))}" x2="${r1(left + sx(base.value))}" y1="${top}" y2="${H - 4}"/>` : '';
  return `<figure class="swc" data-chart="${esc(id)}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t"><title id="${id}-t">${esc(measure)} by scenario${base ? `, against the baseline ${esc(base.label)}` : ''}</title>${rows}${rule}</svg>
    ${table(`${measure} by scenario`, ['Scenario', measure, 'Against baseline'], bars.map(b => [b.label, money(b.value), b.base ? 'baseline' : base ? `${b.value - base.value >= 0 ? '+' : '−'}${money(Math.abs(b.value - base.value))}` : '']))}
  </figure>`;
}

// ── Distribution: the Monte Carlo band ──────────────────────────────────────────────────────────────────────────────

export function distributionChart(id: string, hist: Array<{ lo: number; hi: number; count: number }>,
  marks: { p10: number; p50: number; p90: number; headline: number; headlinePct: number }, money: Money): string {
  const W = 640, H = 220, left = 16, right = 16, top = 30, bottom = 34;
  if (!hist.length) return '';
  const lo = hist[0].lo, hi = hist[hist.length - 1].hi;
  const maxC = Math.max(...hist.map(b => b.count));
  const sx = (v: number) => left + (W - left - right) * (v - lo) / ((hi - lo) || 1);
  const sy = (c: number) => (H - top - bottom) * c / (maxC || 1);
  const bw = (W - left - right) / hist.length;
  const bars = hist.map((b, i) => {
    const h = sy(b.count);
    return vbar(left + i * bw + 1, H - bottom - h, bw - 2, h, 'var(--swc-1)', `b${i}`, `${money(b.lo)} – ${money(b.hi)}: ${b.count} of the trials`);
  }).join('');
  const marker = (v: number, label: string, cls: string, dy: number) =>
    `<line class="swc-marker ${cls}" x1="${r1(sx(v))}" x2="${r1(sx(v))}" y1="${top - 4}" y2="${H - bottom}"/>
     <text class="swc-mk-t ${cls}" x="${r1(sx(v))}" y="${top - 10 + dy}" text-anchor="middle">${esc(label)}</text>`;
  return `<figure class="swc" data-chart="${esc(id)}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t"><title id="${id}-t">Range of the programme total over the simulation: P10 ${esc(money(marks.p10))}, P50 ${esc(money(marks.p50))}, P90 ${esc(money(marks.p90))}</title>
      <line class="swc-axis" x1="${left}" x2="${W - right}" y1="${H - bottom}" y2="${H - bottom}"/>
      ${bars}
      ${marker(marks.p10, `P10 ${money(marks.p10)}`, 'swc-mk-p', 0)}${marker(marks.p50, `P50 ${money(marks.p50)}`, 'swc-mk-p', 0)}${marker(marks.p90, `P90 ${money(marks.p90)}`, 'swc-mk-p', 0)}
      ${marker(marks.headline, `Headline ≈ P${marks.headlinePct}`, 'swc-mk-h', H - top - bottom + 34)}
      <text class="swc-axis-t" x="${left}" y="${H - 6}">${esc(money(lo))}</text><text class="swc-axis-t" x="${W - right}" y="${H - 6}" text-anchor="end">${esc(money(hi))}</text>
    </svg>
    ${table('Simulated programme total', ['Bin', 'Trials'], hist.map(b => [`${money(b.lo)} – ${money(b.hi)}`, String(b.count)]))}
  </figure>`;
}

// ── Spend profile: nominal £ per year, stacked by kind, with the SOP line ───────────────────────────────────────────

export interface SpendYearView { label: string; parts: Record<string, number>; total: number }

export function spendChart(id: string, years: SpendYearView[], kinds: Array<[string, string]>, sopIndex: number, money: Money): string {
  // Drawn wide (it spans the page) so its text stays at reading size when scaled.
  const W = 1000, H = 300, left = 8, right = 8, top = 24, bottom = 34;
  const maxT = niceMax(Math.max(...years.map(y => y.total)));
  const n = years.length;
  const slot = (W - left - right) / n;
  const bw = Math.min(24, slot * 0.66);
  const sy = (v: number) => (H - top - bottom) * v / maxT;
  const cols = years.map((y, i) => {
    const x = left + i * slot + (slot - bw) / 2;
    let base = H - bottom;
    const live = kinds.filter(([k]) => (y.parts[k] ?? 0) > 0);
    return live.map(([k, label], j) => {
      const h = sy(y.parts[k]);
      const seg = vbar(x, base - h + (j > 0 ? 1 : 0), bw, Math.max(0, h - (j > 0 ? 1 : 0)), SLOT(kinds.findIndex(kk => kk[0] === k)), `${y.label}-${k}`,
        `${y.label} · ${label}: ${money(y.parts[k])} (year total ${money(y.total)})`, j === live.length - 1);
      base -= h;
      return seg;
    }).join('') + (i % Math.ceil(n / 12) === 0 || i === sopIndex ? `<text class="swc-axis-t" x="${r1(x + bw / 2)}" y="${H - bottom + 14}" text-anchor="middle">${esc(y.label.replace('Year ', 'Y').replace('Dev ', 'D'))}</text>` : '');
  }).join('');
  const xs = left + sopIndex * slot;
  const grid = [0.5, 1].map(f => `<line class="swc-grid" x1="${left}" x2="${W - right}" y1="${r1(H - bottom - sy(maxT * f))}" y2="${r1(H - bottom - sy(maxT * f))}"/>
    <text class="swc-axis-t" x="${left}" y="${r1(H - bottom - sy(maxT * f) - 4)}">${esc(money(maxT * f))}</text>`).join('');
  return `<figure class="swc" data-chart="${esc(id)}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t"><title id="${id}-t">Spend per year: development years then production years after start of production</title>
      ${grid}<line class="swc-axis" x1="${left}" x2="${W - right}" y1="${H - bottom}" y2="${H - bottom}"/>${cols}
      <line class="swc-sop" x1="${r1(xs)}" x2="${r1(xs)}" y1="${top - 10}" y2="${H - bottom}"/>
      <text class="swc-mk-t" x="${r1(xs + 4)}" y="${top - 12}">Start of production</text>
      <text class="swc-axis-t" x="${left}" y="${H - 4}">D = development year · Y = production year</text></svg>
    ${legend(kinds.map(([, l], i) => [SLOT(i), l]))}
    ${table('Nominal spend per year', ['Year', ...kinds.map(k => k[1]), 'Total'], years.map(y => [y.label, ...kinds.map(([k]) => money(y.parts[k] ?? 0)), money(y.total)]))}
  </figure>`;
}

// ── Interaction & motion ───────────────────────────────────────────────────────────────────────────────────────────

const reduced = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';   // power2-out, the app's curve
const prevGeom = new Map<string, Map<string, string>>();

/** Hover / focus tooltips for every `[data-tip]` mark, and the reveal / morph motion. Call after each render of `root`. */
export function wireCharts(root: HTMLElement): void {
  let tip = root.querySelector<HTMLElement>(':scope > .swc-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'swc-tip'; tip.setAttribute('role', 'status'); root.appendChild(tip); }
  const show = (el: Element, ev?: PointerEvent) => {
    const t = el.getAttribute('data-tip');
    if (!t || !tip) return;
    tip.textContent = t;
    const box = root.getBoundingClientRect();
    const r = (el as SVGGraphicsElement).getBoundingClientRect();
    const x = ev ? ev.clientX - box.left : r.left + r.width / 2 - box.left;
    const y = (ev ? ev.clientY : r.top) - box.top;
    tip.style.left = `${Math.max(8, Math.min(box.width - 240, x + 12))}px`;
    tip.style.top = `${Math.max(0, y - 36)}px`;
    tip.classList.add('is-on');
  };
  if (!root.dataset.swcWired) {
    root.dataset.swcWired = '1';
    root.addEventListener('pointermove', e => { const el = (e.target as Element).closest?.('[data-tip]'); if (el) show(el, e); else tip!.classList.remove('is-on'); });
    root.addEventListener('pointerleave', () => tip!.classList.remove('is-on'));
    root.addEventListener('focusin', e => { const el = (e.target as Element).closest?.('[data-tip]'); if (el) show(el); });
    root.addEventListener('focusout', () => tip!.classList.remove('is-on'));
  }
  // Motion per chart: reveal on first render, morph on later renders.
  root.querySelectorAll<HTMLElement>('figure.swc[data-chart]').forEach(fig => {
    const id = fig.dataset.chart!;
    const marks = Array.from(fig.querySelectorAll<SVGPathElement | SVGRectElement>('.swc-mark[data-k]'));
    const before = prevGeom.get(id);
    const now = new Map<string, string>();
    for (const m of marks) now.set(m.getAttribute('data-k')!, m.tagName === 'rect'
      ? `${m.getAttribute('x')},${m.getAttribute('y')},${m.getAttribute('width')},${m.getAttribute('height')}` : m.getAttribute('d') ?? '');
    prevGeom.set(id, now);
    if (reduced() || typeof (fig as HTMLElement).animate !== 'function') return;
    if (!before) {
      // First render: each mark grows out of its baseline (clip, not scale), the whole chart inside 150 ms of stagger.
      const step = Math.min(12, 150 / Math.max(1, marks.length));
      marks.forEach((m, i) => {
        const col = m.classList.contains('swc-col');
        try {
          m.animate([{ clipPath: col ? 'inset(100% 0 0 0)' : 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
            { duration: 260, delay: i * step, easing: EASE, fill: 'backwards' });
        } catch { /* no clip-path animation — the chart simply appears */ }
      });
      return;
    }
    // Live update: every mark that existed before moves from its old shape to the new one.
    for (const m of marks) {
      const was = before.get(m.getAttribute('data-k')!);
      const is = now.get(m.getAttribute('data-k')!);
      if (!was || was === is) continue;
      try {
        if (m.tagName === 'path') m.animate([{ d: `path("${was}")` }, { d: `path("${is}")` }], { duration: 220, easing: EASE });
        else {
          const [x, y, w, h] = was.split(',');
          m.animate([{ x: `${x}px`, y: `${y}px`, width: `${w}px`, height: `${h}px` }, { x: `${m.getAttribute('x')}px`, y: `${m.getAttribute('y')}px`, width: `${m.getAttribute('width')}px`, height: `${m.getAttribute('height')}px` }],
            { duration: 220, easing: EASE });
        }
      } catch { /* a browser without path / geometry animation shows the new state at once */ }
    }
  });
}

export const CHART_CSS = `
.sw-cockpit{--swc-1:#2a78d6;--swc-2:#eb6834;--swc-3:#1baf7a;--swc-4:#eda100;--swc-5:#e87ba4;--swc-6:#008300;--swc-7:#6250d6;--swc-ink:var(--sw-text-primary);
  --swc-on-1:#0b0b0b;--swc-on-2:#0b0b0b;--swc-on-3:#0b0b0b;--swc-on-4:#0b0b0b;--swc-on-5:#0b0b0b;--swc-on-6:#fff;--swc-on-7:#fff}
html:not([data-theme="light"]) .sw-cockpit{--swc-1:#3987e5;--swc-2:#d95926;--swc-3:#199e70;--swc-4:#c98500;--swc-5:#d55181;--swc-6:#008300;--swc-7:#9085e9;--swc-on-7:#0b0b0b}
.swc{margin:0;position:relative;min-width:0}
.swc svg{width:100%;height:auto;display:block;overflow:visible}
.swc-lbl{font-size:12px;fill:var(--sw-text-body)}
.swc-val{font-size:11.5px;fill:var(--sw-text-secondary);font-variant-numeric:tabular-nums}
.swc-strong{font-weight:700;fill:var(--sw-text-primary)}
.swc-axis{stroke:var(--sw-border);stroke-width:1}
.swc-grid{stroke:var(--sw-border-light,var(--sw-border));stroke-width:1}
.swc-axis-t{font-size:10.5px;fill:var(--sw-text-secondary);font-variant-numeric:tabular-nums}
.swc-conn{stroke:var(--sw-text-muted);stroke-width:1;opacity:.6}
.swc-sop{stroke:var(--sw-text-primary);stroke-width:1.5}
.swc-base{stroke:var(--sw-text-primary);stroke-width:1.5;stroke-dasharray:4 3}
.swc-marker{stroke:var(--sw-text-secondary);stroke-width:1}
.swc-mk-h{stroke:var(--sw-text-primary);stroke-width:2}
.swc-mk-t{font-size:10.5px;fill:var(--sw-text-secondary);font-variant-numeric:tabular-nums}
.swc-mk-t.swc-mk-h{fill:var(--sw-text-primary);font-weight:700;stroke:none}
.swc-mark{transition:opacity var(--dur-hover,200ms) ease}
.swc svg:hover .swc-mark{opacity:.55}
.swc svg .swc-mark:hover,.swc svg .swc-mark:focus-visible{opacity:1}
.swc-tm{stroke:var(--sw-surface);stroke-width:1;cursor:pointer;outline:none}
.swc-tm:focus-visible{stroke:var(--sw-text-primary);stroke-width:2}
.swc-tm-h{font-size:11px;font-weight:700;fill:var(--sw-text-primary)}
.swc-tm-t{font-size:11px;font-weight:600;pointer-events:none}
.swc-tm-v{font-size:10.5px;pointer-events:none;font-variant-numeric:tabular-nums}
.swc-legend{list-style:none;display:flex;flex-wrap:wrap;gap:6px 14px;margin:6px 0 0;padding:0;font-size:.72rem;color:var(--sw-text-secondary)}
.swc-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.swc-data{margin-top:6px;font-size:.72rem}
.swc-data summary{cursor:pointer;color:var(--sw-text-secondary)}
.swc-tw{overflow-x:auto;max-height:260px}
.swc-data table{border-collapse:collapse;width:100%;margin-top:6px}
.swc-data th,.swc-data td{padding:3px 8px;border-bottom:1px solid var(--sw-border);text-align:left;color:var(--sw-text-body);font-variant-numeric:tabular-nums}
.swc-data caption{text-align:left;color:var(--sw-text-secondary);padding-bottom:4px}
.swc-tip{position:absolute;z-index:5;pointer-events:none;max-width:260px;padding:6px 9px;border-radius:7px;font-size:.74rem;line-height:1.35;
  background:var(--sw-text-primary);color:var(--sw-surface);opacity:0;transform:translateY(4px);
  transition:opacity 150ms cubic-bezier(.22,.61,.36,1),transform 150ms cubic-bezier(.22,.61,.36,1)}
.swc-tip.is-on{opacity:1;transform:none}
@media (prefers-reduced-motion: reduce){.swc-tip{transition:none}}
/* Phone width: a chart keeps reading-size text and scrolls inside its own frame (the page never scrolls sideways). */
@media (max-width:560px){.swc{overflow-x:auto;-webkit-overflow-scrolling:touch}.swc svg{min-width:520px}.swc .swc-legend,.swc .swc-data{position:sticky;left:0;max-width:calc(100vw - 48px)}}
`;
