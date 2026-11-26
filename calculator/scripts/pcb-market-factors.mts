/**
 * Market factors (BMW inverter review, 26 Nov 2026; widened 27 Nov 2026) — written from data, never by hand.
 *
 *   npx tsx scripts/pcb-market-factors.mts [--write]        → server/data/pcb-market-factors.json
 *
 * 1. CONVERSION. The China research read every part on szlcsc (own stock, CNY incl. VAT) AND on LCSC.com (US$, largest
 *    break): scripts/pcb-research/2026-11-25-v6/china-{semis,passives}.json. The szlcsc ex-VAT CNY price is a fixed
 *    multiple of the LCSC US$ price (median over every part read on both). So an LCSC.com US$ row in the catalogue is a
 *    China-market price once converted: £ = US$ × that multiple ÷ the tool's ¥ / £ (pcb-market-rows.mts, ¥8.88).
 * 2. PAIRS, automotive distributor-priced catalogue parts, the China price ÷ the price the NON-LCSC distributors give at
 *    the same quantity (the factor is applied only to parts with no China or LCSC price of their own, so its denominator
 *    must hold no LCSC row):
 *      szlcsc — a part read on szlcsc (pcb-component-market.json), at its reel quantity;
 *      lcsc   — a part with an LCSC.com US$ row of 1,000 parts or more, converted (1), at that row's quantity.
 *    A part in both is counted once, as szlcsc.
 * 3. GROUPS: TI ICs, other ICs, discretes / magnetics / passives (marketFactorGroup). Median and quartiles of the pooled
 *    pairs; each source's own median is kept beside them (`bySource`) so a disagreement between them shows. A group needs
 *    ≥ 5 pairs to be used. Re-run after a catalogue merge or a market-file change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogueEntry } from '../server/utils/pcb-price-catalogue.js';
import { marketFactorGroup, type MarketFactorGroup } from '../server/data/pcb-component-market.js';
import { priceFromObservations } from './pcb-catalogue-research-merge.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const market = JSON.parse(readFileSync(join(ROOT, 'server/data/pcb-component-market.json'), 'utf8'));
const cat = JSON.parse(readFileSync(join(ROOT, 'server/data/pcb-component-catalogue.json'), 'utf8')).parts;
const RESEARCH = join(ROOT, 'scripts/pcb-research/2026-11-25-v6');
const LCSC_MIN_QTY = 1000;
const q = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); const k = (s.length - 1) * p, f = Math.floor(k), c = Math.min(f + 1, s.length - 1); return s[f] + (s[c] - s[f]) * (k - f); };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const isLcsc = (o: { distributor: string }) => /^lcsc/i.test(String(o.distributor));

// 1. The szlcsc / LCSC multiple, from every part the China research read on both.
const both: number[] = [];
for (const f of ['china-semis.json', 'china-passives.json']) {
  const items = JSON.parse(readFileSync(join(RESEARCH, f), 'utf8')).items as Array<Record<string, any>>;
  const lcsc = new Map(items.filter(i => /lcsc\.com/i.test(String(i.seller))).map(i => [String(i.part), i]));
  for (const i of items) if (i.seller === 'szlcsc own stock') {
    const l = lcsc.get(String(i.part));
    if (l && Number(l.price) > 0 && Number(i.priceExVat) > 0) both.push(Number(i.priceExVat) / Number(l.price));
  }
}
const cnyPerGbp = Number(market.cnyPerGbp) || 8.88;
const conversion = { cnyExVatPerLcscUsd: r3(q(both, 0.5)), n: both.length, min: r3(Math.min(...both)), max: r3(Math.max(...both)), cnyPerGbp,
  gbpPerLcscUsd: Math.round(q(both, 0.5) / cnyPerGbp * 1e5) / 1e5,
  basis: `szlcsc own-stock ex-VAT CNY ÷ LCSC.com US$ (largest break), median of ${both.length} parts read on both (25 Nov 2026), ÷ ¥${cnyPerGbp} / £` };

/** A price at a quantity from a volume model (log-linear between breaks, along b outside them). */
const at = (g: Record<string, number>, b: number, qty: number) => {
  const pts: Array<[number, number]> = [[1e3, g.q1k], [1e4, g.q10k], [1e5, g.q100k], [2e5, g.q200k], [3e5, g.q300k]];
  if (qty <= 1000) return g.q1k * Math.pow(qty / 1000, -b);
  for (let i = 1; i < pts.length; i++) if (qty <= pts[i][0]) { const [qa, pa] = pts[i - 1], [qb, pb] = pts[i]; return pa + (pb - pa) * Math.log10(qty / qa) / Math.log10(qb / qa); }
  return g.q300k * Math.pow(qty / 3e5, -b);
};
const nonLcsc = (e: any) => priceFromObservations((e.observations ?? []).filter((o: any) => !isLcsc(o)));

type Pair = { part: string; catalogue: string; maker: string; group: MarketFactorGroup; source: 'szlcsc' | 'lcsc'; qty: number; chinaGBP: number; distributorGBP: number; ratio: number; url: string };
const pairs: Pair[] = [];
const seen = new Set<string>();
for (const [k, mp] of Object.entries<any>(market.markets.cn.parts)) {
  const e = catalogueEntry(mp.part) ?? catalogueEntry(k);
  if (!e || e.confidence !== 'distributor' || !e.aecq || !e.observations?.length) continue;
  const p = nonLcsc(e); if (!p) continue;
  const d = at(p.gbp as unknown as Record<string, number>, p.b, mp.reelQty);
  seen.add(e.mpn);
  pairs.push({ part: mp.part, catalogue: e.mpn, maker: e.mfr, group: marketFactorGroup(e.category, e.mfr), source: 'szlcsc', qty: mp.reelQty,
    chinaGBP: mp.gbp, distributorGBP: Math.round(d * 1e5) / 1e5, ratio: r3(mp.gbp / d), url: mp.url });
}
for (const e of cat) {
  if (seen.has(e.mpn) || e.confidence !== 'distributor' || !e.aecq || !e.observations?.length) continue;
  const L = (e.observations as any[]).filter(o => isLcsc(o) && String(o.currency).toUpperCase() === 'USD' && Number(o.qty) >= LCSC_MIN_QTY);
  if (!L.length) continue;
  const p = nonLcsc(e); if (!p) continue;
  const o = L.sort((a, b) => b.qty - a.qty)[0];
  const china = o.price * conversion.gbpPerLcscUsd, d = at(p.gbp as unknown as Record<string, number>, p.b, o.qty);
  pairs.push({ part: e.mpn, catalogue: e.mpn, maker: e.mfr, group: marketFactorGroup(e.category, e.mfr), source: 'lcsc', qty: o.qty,
    chinaGBP: Math.round(china * 1e5) / 1e5, distributorGBP: Math.round(d * 1e5) / 1e5, ratio: r3(china / d), url: o.url });
}
const stats = (v: number[]) => ({ n: v.length, median: r3(q(v, 0.5)), q1: r3(q(v, 0.25)), q3: r3(q(v, 0.75)) });
const groups = [...new Set(pairs.map(p => p.group))];
const cn = Object.fromEntries(groups.map(g => {
  const v = pairs.filter(p => p.group === g).map(p => p.ratio);
  const bySource = Object.fromEntries((['szlcsc', 'lcsc'] as const)
    .map(s => [s, pairs.filter(p => p.group === g && p.source === s).map(p => p.ratio)] as const)
    .filter(([, x]) => x.length).map(([s, x]) => [s, stats([...x])]));
  return [g, { group: g, ...stats(v), bySource }];
}));
const out = { asOf: '2026-11-27', method: `China price ÷ non-LCSC distributor price at the same quantity, automotive parts: szlcsc reads + LCSC.com rows ≥ ${LCSC_MIN_QTY.toLocaleString('en-GB')} converted (median, quartiles)`,
  conversion: { cn: conversion }, markets: { cn }, pairs: { cn: pairs } };
console.log(JSON.stringify({ conversion, factors: cn }, null, 1));
if (process.argv.includes('--write')) writeFileSync(join(ROOT, 'server/data/pcb-market-factors.json'), JSON.stringify(out, null, 1) + '\n');
