/**
 * China component market rows (EDU v6, Nov 2026) — written from the page-read research, never by hand.
 *
 *   npx tsx scripts/pcb-market-rows.mts [--write]        → server/data/pcb-component-market.json
 *
 * Source: scripts/pcb-research/2026-11-25-v6/china-{passives,semis}.json — szlcsc (立创商城) OWN-STOCK whole-reel prices,
 * read 25 Nov 2026 on the page that names each part, VAT (13 %) taken off. LCSC.com rows are the same price table at a
 * fixed factor (the research found szlcsc ex-VAT CNY = 5.2–5.4 × LCSC USD on all 217 passives), so they are a cross-check,
 * never a second price.
 *
 * Rules:
 *  1. One price a part: its szlcsc ex-VAT whole-reel price, CNY → £ at ¥8.88 / £ (the tool's China basis).
 *  2. A part with (almost) no stock (< 50 pieces) and more than 3× from the median of the OTHER parts of its class is
 *     dropped — a stale listed price (GCM32DR71C106 at 10× its siblings, stock 0) or a precision variant on a few pieces
 *     (NCU18XH103D60RB ±0.5 %, stock 5) — listed in `dropped`. A part in stock is a market price whatever its value: a
 *     class spans 1 nF to 22 µF, and the p10–p90 range already trims the ends.
 *  3. A row needs ≥ MIN_PARTS parts; it is [p10, p90] with its median (the class point never above the median).
 *  4. Each research class maps onto the tool's own class key (pcb-class-pricing.ts) by an explicit table below; a
 *     key the tool cannot return fails the build (tests/pcb-v6-market.test.ts checks it again).
 *  5. Every researched part is also kept by part number: a named part on a China build prices at its own reel price
 *     when lower than the catalogue's (the AURIX case, EDU v3).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classRowByKey } from '../server/utils/pcb-class-pricing.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'scripts/pcb-research/2026-11-25-v6');
const CNY_PER_GBP = 8.88;
const MIN_PARTS = 8;

type Item = { class: string; part: string; maker: string; description: string; package: string; grade: string; seller: string; code: string;
  qty: number; price: number; currency: string; priceExVat: number | null; stock: number; url: string; date: string };

/** Research class (its leading number, file) → the tool's class key(s). A function picks by package where a class spans two. */
const MAP: Record<string, (it: Item) => string | null> = {
  'P1': () => 'passive_0402.cap', 'P2': () => 'passive_0603.cap', 'P3': () => 'passive_0805.cap',
  'P4': () => 'passive_1206.cap', 'P5': () => 'passive_1206.cap',   // the tool's 1206 row holds 1210 too (tableTypeOf)
  'P6': () => 'passive_0402.res', 'P7': () => 'passive_0603.res', 'P8': () => 'passive_0805.res', 'P9': () => 'passive_1206.res',
  'P10': () => 'passive_1206.res_pwr',
  'P11': it => /0402/.test(it.package) ? 'passive_0402.ind' : /0603/.test(it.package) ? 'passive_0603.ind' : null,
  'P12': it => /0402/.test(it.package) ? 'passive_0402.ntc' : /0603/.test(it.package) ? 'passive_0603.ntc' : null,
  'P13': () => 'passive_1206.ind', 'P14': () => 'passive_1206.ind',
  'P15': () => 'transformer.cmc', 'P16': () => 'passive_1206.alu',
  'S1': () => 'discrete.SOT-23 / SOD-123 discrete', 'S2': () => 'discrete.SOT-23 / SOD-123 discrete',
  'S3': () => 'fuse_tvs.tvs', 'S4': () => 'discrete.ESD / TVS protection SOT-23', 'S5': () => 'fuse_tvs.rect',
  'S6': () => 'led.ind', 'S7': () => 'crystal_osc.xtal',
  'S8': it => /SOT-?223|DPAK|TO-?252/i.test(it.package) ? 'ic_soic.ldo' : 'ic_soic.sot',
  'S9': it => /SOT-?23|SC-?70/i.test(it.package) ? 'ic_soic.sot' : 'ic_soic.opamp',
  'S10': () => 'ic_soic.logic', 'S11': () => 'ic_soic.eeprom', 'S12': () => 'ic_soic.can',
  'S13': () => 'ic_soic.sot', 'S14': () => 'testpoint.any', 'S15': () => 'through_hole.header',
};

const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const sig = (v: number) => Number(v.toPrecision(3));
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

const parts: Array<{ key: string; part: string; maker: string; gbp: number; reelQty: number; stock: number; url: string; date: string; desc: string }> = [];
for (const [file, pre] of [['china-passives.json', 'P'], ['china-semis.json', 'S']] as const) {
  const d = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as { items: Item[] };
  for (const it of d.items) {
    if (!/szlcsc/i.test(it.seller) || !(Number(it.priceExVat) > 0)) continue;
    const n = /^(\d+)\./.exec(it.class)?.[1];
    const key = n ? MAP[`${pre}${n}`]?.(it) ?? null : null;
    if (!key) continue;
    if (!classRowByKey(`${key}.automotive`)) throw new Error(`${it.class} maps to ${key}, which the class table does not have`);
    parts.push({ key, part: it.part, maker: it.maker, gbp: Number(it.priceExVat) / CNY_PER_GBP, reelQty: it.qty, stock: it.stock, url: it.url, date: it.date, desc: it.description.slice(0, 80) });
  }
}

const byKey = new Map<string, typeof parts>();
for (const p of parts) (byKey.get(p.key) ?? byKey.set(p.key, []).get(p.key)!).push(p);
const rows: Record<string, unknown> = {}, dropped: Array<Record<string, unknown>> = [], thin: string[] = [];
const kept: typeof parts = [];
for (const [key, ps] of byKey) {
  const keep = ps.filter(p => {
    const others = ps.filter(o => o !== p).map(o => o.gbp);
    const med = others.length ? q(others, 0.5) : p.gbp;
    const ok = p.stock >= 50 || (p.gbp <= 3 * med && p.gbp >= med / 3);
    if (!ok) dropped.push({ key, part: p.part, gbp: sig(p.gbp), classMedianOfOthers: sig(med), stock: p.stock, url: p.url });
    return ok;
  });
  kept.push(...keep);
  if (keep.length < MIN_PARTS) { thin.push(`${key} (${keep.length})`); continue; }
  const g = keep.map(p => p.gbp);
  rows[key] = { lo: sig(q(g, 0.1)), hi: sig(q(g, 0.9)), p50: sig(q(g, 0.5)), n: keep.length,
    makers: [...new Set(keep.map(p => p.maker.replace(/\(.*\)/, '').trim()))].slice(0, 8) };
}
const partIndex = Object.fromEntries(kept.map(p => [norm(p.part), { part: p.part, gbp: Number(p.gbp.toFixed(6)), reelQty: p.reelQty, url: p.url, date: p.date }]));

const out = {
  about: 'China component market (EDU v6, Nov 2026): szlcsc own-stock whole-reel prices ex-VAT, page-read 25 Nov 2026 (scripts/pcb-research/2026-11-25-v6/), at ¥8.88 / £. Written by scripts/pcb-market-rows.mts — never by hand. Class rows: p10–p90 + median of ≥ 8 automotive parts; parts more than 3× from their class median dropped.',
  asOf: '2026-11-25', source: "szlcsc.com (LCSC's China store) own stock, whole reel, ex-VAT (÷ 1.13)", cnyPerGbp: CNY_PER_GBP,
  markets: { cn: { rows, parts: partIndex } }, dropped, thin,
};
console.log(`rows ${Object.keys(rows).length}: ${Object.entries(rows).map(([k, v]) => `${k} n=${(v as { n: number }).n}`).join('; ')}`);
console.log(`thin (not a row): ${thin.join(', ') || '—'}; dropped ${dropped.length}; parts ${Object.keys(partIndex).length}`);
if (process.argv.includes("--dropped")) for (const d of dropped) console.log(JSON.stringify(d));
if (process.argv.includes("--write")) writeFileSync(join(ROOT, 'server/data/pcb-component-market.json'), JSON.stringify(out, null, 1) + '\n');
