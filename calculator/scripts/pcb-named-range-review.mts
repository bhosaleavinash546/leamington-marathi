/**
 * Named-IC range review (27 Nov 2026): each named range in pcb.ts (IC_PRICE_HINTS, read as ~10k reel prices) against
 * the distributor- / maker-priced catalogue parts its test matches, at 10k. A range whose sourced parts fall outside it
 * is listed; a range with no sourced part says so.
 *
 *   npx tsx scripts/pcb-named-range-review.mts [--json] [--write]   → server/data/pcb-named-range-evidence.json
 *
 * icKnownRange reads the file: ≥ 3 sourced parts → the range IS their min–max at 10k, the point never above their median;
 * 1–2 → the stated range widened to take them in; none → the stated range, unchanged. Re-run after a catalogue merge.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { IC_PRICE_HINTS } from '../server/routes/pcb.js';
const cat = JSON.parse(readFileSync(new URL('../server/data/pcb-component-catalogue.json', import.meta.url), 'utf8')).parts;
const rows = IC_PRICE_HINTS.filter(h => !h.generic).map(h => {
  const m = /£\s*([0-9.]+)\s*[–-]\s*([0-9.]+)/.exec(h.price)!;
  const lo = Number(m[1]), hi = Number(m[2]);
  const hits = cat.filter((e: any) => e.confidence === 'distributor' && h.test(String(e.mpn).toUpperCase()))
    .map((e: any) => ({ mpn: e.mpn, q10k: e.gbp.q10k, aecq: e.aecq }));
  const v = hits.map((x: any) => x.q10k).sort((a: number, b: number) => a - b);
  const below = hits.filter((x: any) => x.q10k < lo).length, above = hits.filter((x: any) => x.q10k > hi).length;
  return { label: h.label, range: [lo, hi], n: v.length, min: v[0] ?? null, median: v.length ? v[Math.floor(v.length / 2)] : null, max: v[v.length - 1] ?? null,
    below, above, verdict: !v.length ? 'no sourced part' : below || above ? `${below} below, ${above} above` : 'inside', parts: hits };
});
if (process.argv.includes('--write')) writeFileSync(new URL('../server/data/pcb-named-range-evidence.json', import.meta.url), JSON.stringify({
  asOf: '2026-11-27', method: 'distributor- / maker-priced catalogue parts each named range matches, their 10k price (£)',
  ranges: Object.fromEntries(rows.map(r => [r.label, { stated: r.range, n: r.n, min: r.min, median: r.median, max: r.max, parts: r.parts }])) }, null, 1) + '\n');
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) console.log(`${r.label.slice(0, 52).padEnd(52)} £${r.range[0]}–${r.range[1]}`.padEnd(70), `n ${String(r.n).padStart(3)}`, r.n ? `£${r.min!.toFixed(2)} / ${r.median!.toFixed(2)} / ${r.max!.toFixed(2)}` : '', ' ', r.verdict);
