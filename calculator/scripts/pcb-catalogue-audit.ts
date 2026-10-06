/**
 * Whole-catalogue audit of server/data/pcb-component-catalogue.json — run after any merge or import.
 *
 *   npx tsx scripts/pcb-catalogue-audit.ts [--json]
 *
 * ERRORS (exit 1) break a rule the catalogue promises:
 *   breaks not 1k ≥ 10k ≥ 100k ≥ 200k ≥ 300k > 0; an observation from a non-franchised source,
 *   a refused host, under 100 units or in an unknown currency; a researched entry whose price is not
 *   what its own observations give under the merge rules; a family link not equal to its member;
 *   a part number that does not look itself up; one key resolving to two entries.
 * WARNINGS are for a person to read: a 1k price far outside the class range a BOM line of that kind
 *   would get; distributors disagreeing by more than 2× at a common quantity; a 1k price moved there
 *   from a break under 500 units; disputed or non-AEC-Q entries.
 */
import { readFileSync } from 'node:fs';
import { priceFromObservations, FRANCHISED, PRICE_HOSTS } from './pcb-catalogue-research-merge.js';
import { catalogueEntry } from '../server/utils/pcb-price-catalogue.js';
import { classRange } from '../server/utils/pcb-class-pricing.js';
import { FX_TO_GBP } from '../src/engine/insights.js';

type Obs = { distributor: string; qty: number; price: number; currency: string; url: string; date: string; gbp?: number };
type E = { mpn: string; family?: string; aliases?: string[]; desc: string; category: string; pkg: string; aecq: boolean; confidence: string; source: string;
  gbp: { q1k: number; q10k: number; q100k: number; q200k?: number; q300k?: number }; observations?: Obs[]; volumeModel?: { b: number } };

const cat = JSON.parse(readFileSync(new URL('../server/data/pcb-component-catalogue.json', import.meta.url), 'utf8')) as { parts: E[] };
const links = JSON.parse(readFileSync(new URL('./pcb-research/family-links.json', import.meta.url), 'utf8')).links as Record<string, { member: string }>;
const errors: string[] = [], warnings: Record<string, string[]> = {};
const warn = (k: string, s: string) => (warnings[k] ??= []).push(s);
const host = (u: string) => u.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

const byKey = new Map<string, Set<string>>();
for (const e of cat.parts) for (const k of [e.mpn, ...(e.aliases ?? [])]) (byKey.get(norm(k)) ?? byKey.set(norm(k), new Set()).get(norm(k))!).add(e.mpn);

for (const e of cat.parts) {
  const g = e.gbp;
  if (!(g.q1k >= g.q10k && g.q10k >= g.q100k && g.q100k >= (g.q200k ?? 0) && (g.q200k ?? 0) >= (g.q300k ?? 0) && (g.q300k ?? 0) > 0)) errors.push(`${e.mpn}: breaks not monotone ${JSON.stringify(g)}`);
  for (const o of e.observations ?? []) {
    if (!FRANCHISED.test(o.distributor)) errors.push(`${e.mpn}: non-franchised ${o.distributor}`);
    if (!PRICE_HOSTS.test(host(o.url))) errors.push(`${e.mpn}: refused host ${host(o.url)}`);
    if (o.qty < 100) errors.push(`${e.mpn}: break ${o.qty} < 100`);
    if (FX_TO_GBP[o.currency] == null) errors.push(`${e.mpn}: currency ${o.currency}`);
  }
  if (e.observations?.length && e.confidence === 'distributor') {
    const p = priceFromObservations(e.observations)!;
    if (!p || Math.abs(p.gbp.q1k - g.q1k) > 1e-4 || Math.abs((p.gbp.q300k ?? 0) - (g.q300k ?? 0)) > 1e-4) errors.push(`${e.mpn}: stored price ≠ its observations (${g.q1k} vs ${p?.gbp.q1k})`);
    const at1k = e.observations.map(o => (o.gbp ?? o.price * FX_TO_GBP[o.currency]) * Math.pow(o.qty / 1000, e.volumeModel?.b ?? 0.0706));
    const spread = Math.max(...at1k) / Math.min(...at1k);
    if (spread > 2) warn('distributors disagree > 2× at 1k', `${e.mpn}: ${spread.toFixed(1)}× (${e.observations.map(o => `${o.distributor} ${o.price} ${o.currency} @${o.qty}`).join('; ')})`);
    if (!e.observations.some(o => o.qty >= 500)) warn('1k price moved up from breaks under 500 only', `${e.mpn}: largest break ${Math.max(...e.observations.map(o => o.qty))}`);
  }
  const hit = catalogueEntry(e.mpn);
  if (!hit || hit.mpn !== e.mpn) errors.push(`${e.mpn}: looks up as ${hit?.mpn ?? 'nothing'}`);
  for (const k of [e.mpn, ...(e.aliases ?? [])]) { const s = byKey.get(norm(k))!; if (s.size > 1) errors.push(`${k}: key resolves to ${[...s].join(' / ')}`); }
  // Plausibility: the range a BOM line of this kind would get with no catalogue hit.
  const r = classRange({ componentType: e.category, description: e.desc, pkg: e.pkg, automotive: e.aecq }, e.aecq);
  if (g.q1k > r.hi * 3 || g.q1k < r.lo / 3) warn('1k price far outside its class range (×3)', `${e.mpn} [${e.confidence}]: £${g.q1k} vs ${r.key} £${r.lo}–${r.hi}`);
  if (/DISPUTED:/.test(e.source)) warn('disputed', e.mpn);
  if (!e.aecq) warn('not AEC-Q', e.mpn);
}
for (const [k, l] of Object.entries(links)) {
  const e = cat.parts.find(p => p.mpn === k), m = cat.parts.find(p => p.mpn === l.member);
  if (!e || !m || JSON.stringify(e.gbp) !== JSON.stringify(m.gbp)) errors.push(`family link ${k} → ${l.member} not applied`);
}

const out = { parts: cat.parts.length, distributor: cat.parts.filter(p => p.confidence === 'distributor').length, errors,
  warnings: Object.fromEntries(Object.entries(warnings).map(([k, v]) => [k, { count: v.length, items: v }])) };
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`${out.parts} parts, ${out.distributor} distributor-priced — ${errors.length} errors`);
  for (const e of errors) console.log('  ERROR', e);
  for (const [k, v] of Object.entries(warnings)) console.log(`  WARN ${k}: ${v.length}`);
}
process.exit(errors.length ? 1 : 0);
