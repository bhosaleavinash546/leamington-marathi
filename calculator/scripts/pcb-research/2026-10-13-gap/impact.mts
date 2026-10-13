// Round 4 impact: for each part now distributor-priced that was not, what a BOM line naming it got before (old estimate or the class-range default) v the sourced price.
// Usage: npx tsx scripts/pcb-research/2026-10-13-gap/impact.mts <catalogue-before.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { classRange, classDefaultPrice } from '../../../server/utils/pcb-class-pricing.js';
const before = JSON.parse(readFileSync(process.argv[2], 'utf8')).parts as any[];
const after = JSON.parse(readFileSync(new URL('../../../server/data/pcb-component-catalogue.json', import.meta.url), 'utf8')).parts as any[];
const had = new Map(before.map(e => [e.mpn, e]));
const rows: any[] = [];
for (const e of after) {
  const b = had.get(e.mpn);
  const isNew = !b, wasEst = b && b.confidence === 'estimate' && e.confidence === 'distributor';
  if (!isNew && !wasEst) continue;
  if (e.confidence !== 'distributor') continue;
  // What a BOM line naming this part got before: the old estimate, else the class range's default point (automotive board when AEC-Q).
  const cr = classRange({ componentType: e.category, description: e.desc, pkg: e.pkg }, !!e.aecq);
  const prior = wasEst ? b.gbp.q1k : classDefaultPrice(cr);
  rows.push({ mpn: e.mpn, cat: e.category, desc: e.desc, now: e.gbp.q1k, prior, basis: wasEst ? 'estimate' : cr.label, ratio: e.gbp.q1k / prior });
}
const off2 = rows.filter(r => r.ratio > 2 || r.ratio < 0.5);
console.log(`${rows.length} parts now distributor-priced that were not; before, ${off2.length} (${Math.round(off2.length / rows.length * 100)}%) were priced more than 2x away from the sourced price`);
const lo = rows.filter(r => r.ratio > 2).length, hi = rows.filter(r => r.ratio < 0.5).length;
console.log(`  under-priced before (sourced > 2x the old figure): ${lo};  over-priced before (< half): ${hi}`);
const sumNow = rows.reduce((s, r) => s + r.now, 0), sumPrior = rows.reduce((s, r) => s + r.prior, 0);
console.log(`  one of each: £${sumNow.toFixed(2)} sourced vs £${sumPrior.toFixed(2)} before`);
rows.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
for (const r of rows.slice(0, 15)) console.log(`  ${r.mpn.padEnd(28)} £${r.now.toFixed(4).padStart(9)} now vs £${r.prior.toFixed(4).padStart(9)} before (${r.basis}) ×${r.ratio.toFixed(2)}`);
writeFileSync(process.argv[3], JSON.stringify(rows, null, 1));
