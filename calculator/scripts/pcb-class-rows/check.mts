/**
 * Class rows against the catalogue's own distributor prices (EDU audit G-12, Nov 2026; the round-5 method).
 * For every distributor-priced, AEC-Q catalogue entry: the class row a BOM line of its kind would take (classRange, on
 * an automotive board), and its 10k price. Per row: n, p10 / p50 / p90 of the 10k prices, the row's range and the
 * point the tool prices an unread line at (lower-half midpoint). Read-only.
 *   npx tsx scripts/pcb-class-rows/check.mts [--json out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { classRange, classDefaultPrice } from '../../server/utils/pcb-class-pricing.js';

type E = { mpn: string; desc: string; category: string; pkg: string; aecq: boolean; confidence: string; mfr?: string;
  gbp: { q1k: number; q10k: number }; observations?: Array<{ distributor: string }> };
const cat = JSON.parse(readFileSync(new URL('../../server/data/pcb-component-catalogue.json', import.meta.url), 'utf8')) as { parts: E[] };
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const rows = new Map<string, { lo: number; hi: number; point: number; label: string; prices: number[]; parts: string[]; distributors: Set<string> }>();
for (const e of cat.parts) {
  if (e.confidence !== 'distributor' || !e.aecq || !(e.gbp.q10k > 0)) continue;
  const r = classRange({ componentType: e.category, description: e.desc, pkg: e.pkg, automotive: true }, true);
  const row = rows.get(r.key) ?? rows.set(r.key, { lo: r.lo, hi: r.hi, point: classDefaultPrice(r), label: r.label, prices: [], parts: [], distributors: new Set() }).get(r.key)!;
  row.prices.push(e.gbp.q10k); row.parts.push(`${e.mpn} £${e.gbp.q10k}`);
  for (const o of e.observations ?? []) row.distributors.add(o.distributor);
}
const out = [...rows.entries()].map(([key, r]) => ({ key, label: r.label, n: r.prices.length, distributors: r.distributors.size,
  row: [r.lo, r.hi], point: r.point, p10: +q(r.prices, 0.1).toFixed(4), p50: +q(r.prices, 0.5).toFixed(4), p90: +q(r.prices, 0.9).toFixed(4),
  pointVsMedian: +(r.point / q(r.prices, 0.5)).toFixed(2), parts: r.parts }))
  .sort((a, b) => b.n - a.n);
if (process.argv.includes('--json')) writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(out, null, 1));
for (const r of out) console.log(`${String(r.n).padStart(4)} ${r.key.padEnd(52)} row £${r.row[0]}–${r.row[1]} point £${r.point}  p10 ${r.p10} p50 ${r.p50} p90 ${r.p90}  point/median ${r.pointVsMedian}`);

/**
 * --write <file>: the AEC-Q ranges the evidence sets (server/data/pcb-class-rows.json). A row takes [p10, p90] of its
 * catalogue 10k prices when it has ≥ 10 parts from ≥ 2 distributors. Not rows where the catalogue is not the population
 * an unread line comes from: plain resistors (the catalogued ones are mostly precision / anti-surge / AEC-Q200 parts,
 * so they would lift a generic thick-film line) and the imager (its own volume rule, decision 9 Oct 2026).
 */
const EXCLUDE = /^passive_\d+\.res\.|\.imager\./;
if (process.argv.includes('--write')) {
  const file = process.argv[process.argv.indexOf('--write') + 1];
  const sig = (v: number) => Number(v.toPrecision(3));
  const rowsOut = Object.fromEntries(out.filter(r => r.n >= 10 && r.distributors >= 2 && !EXCLUDE.test(r.key))
    .map(r => [r.key, { lo: sig(r.p10), hi: sig(r.p90), n: r.n, distributors: r.distributors, p50: sig(r.p50), was: r.row }]));
  writeFileSync(file, JSON.stringify({
    about: 'AEC-Q class ranges from the catalogue\'s own distributor prices at 10k (p10–p90), written by scripts/pcb-class-rows/check.mts --write — never by hand (EDU audit G-12, Nov 2026). Applies to the automotive range only; non-automotive ranges are unchanged.',
    asOf: new Date().toISOString().slice(0, 10), rows: rowsOut }, null, 1) + '\n');
  console.log(`wrote ${Object.keys(rowsOut).length} rows to ${file}`);
}
