/**
 * Market factors (BMW inverter review, 26 Nov 2026) — the ratio of a market's own-stock reel price to the catalogue's
 * price for the same automotive part at the same quantity, by group, written from data, never by hand.
 *
 *   npx tsx scripts/pcb-market-factors.mts [--write]        → server/data/pcb-market-factors.json
 *
 * Pairs: every part in server/data/pcb-component-market.json (szlcsc own stock, ex-VAT, read 25 Nov 2026) whose
 * catalogue entry is distributor- or maker-priced and AEC-Q; ratio = market reel price ÷ cataloguePriceAt(entry, reel qty).
 * Groups: TI ICs, other ICs, discretes / magnetics / passives (marketFactorGroup). Median and quartiles; a group needs ≥ 5
 * pairs to be used. Re-run after a catalogue merge or a market-file change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogueEntry, cataloguePriceAt } from '../server/utils/pcb-price-catalogue.js';
import { marketFactorGroup, type MarketFactorGroup } from '../server/data/pcb-component-market.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const market = JSON.parse(readFileSync(join(ROOT, 'server/data/pcb-component-market.json'), 'utf8'));
const q = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); const k = (s.length - 1) * p, f = Math.floor(k), c = Math.min(f + 1, s.length - 1); return s[f] + (s[c] - s[f]) * (k - f); };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const out: Record<string, unknown> = { asOf: market.asOf, method: 'market own-stock reel price ÷ catalogue price at the reel quantity, automotive parts priced both ways (median, quartiles)', markets: {}, pairs: {} };
for (const [m, data] of Object.entries<any>(market.markets)) {
  const groups: Record<string, number[]> = {};
  const pairs: unknown[] = [];
  for (const [k, mp] of Object.entries<any>(data.parts)) {
    const e = catalogueEntry(mp.part) ?? catalogueEntry(k);
    if (!e || e.confidence !== 'distributor' || !e.aecq) continue;
    const cat = cataloguePriceAt(e.mpn, mp.reelQty);
    if (!cat) continue;
    const g: MarketFactorGroup = marketFactorGroup(e.category, e.mfr, e.mpn);
    (groups[g] ??= []).push(mp.gbp / cat);
    pairs.push({ part: mp.part, catalogue: e.mpn, maker: e.mfr, group: g, reelQty: mp.reelQty, marketGBP: mp.gbp, catalogueGBP: cat, ratio: r3(mp.gbp / cat), url: mp.url });
  }
  (out.markets as Record<string, unknown>)[m] = Object.fromEntries(Object.entries(groups).map(([g, v]) => [g, { group: g, n: v.length, median: r3(q(v, 0.5)), q1: r3(q(v, 0.25)), q3: r3(q(v, 0.75)) }]));
  (out.pairs as Record<string, unknown>)[m] = pairs;
}
console.log(JSON.stringify(out.markets, null, 1));
if (process.argv.includes('--write')) writeFileSync(join(ROOT, 'server/data/pcb-market-factors.json'), JSON.stringify(out, null, 1) + '\n');
