/**
 * Round 4 validation (13 Oct 2026): check every research file before the merge sees it.
 *
 *   npx tsx scripts/pcb-research/2026-10-13-gap/validate.mts [--json out.json]
 *
 * Errors (the part must not merge as written): unknown category, an observation the merge would not accept as a source
 * (host / distributor / qty / currency), a placeholder or descriptive "code", the same code in two files with different
 * identities, observations missing a URL or date.
 * Flags (a person reads them): the 1k price far outside the category's class range, two distributors > 2.5× apart, a
 * price that RISES with quantity, an "automotive" claim with no AEC marker in the code or description, a passive with no
 * value in its description.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRANCHISED, PRICE_HOSTS, STAGING_HOSTS, priceFromObservations } from '../../pcb-catalogue-research-merge.js';
import { FX_TO_GBP_TABLE as FX } from '../../../src/engine/insights.js';
import { classRange } from '../../../server/utils/pcb-class-pricing.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const CATS = new Set(['ic_bga', 'ic_qfn', 'ic_soic', 'ic_tqfp', 'passive_0402', 'passive_0603', 'passive_0805', 'passive_1206',
  'fuse_tvs', 'crystal_osc', 'connector_smt', 'through_hole', 'relay_switch', 'led', 'transformer', 'mechanical', 'power_module']);
const host = (u: string) => String(u).replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
const norm = (s: string) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

type Obs = { distributor: string; qty: number; price: number; currency: string; url: string; date: string };
type Part = { mpn: string; family?: string; mfr: string; desc: string; category: string; pkg: string; aecq: boolean; observations: Obs[]; observedMpn?: string; notes?: string };

const files = readdirSync(DIR).filter(f => f.endsWith('.json') && !/merge-report|audit-exclusions|validation|review-decisions/.test(f));
const errors: string[] = [], flags: string[] = [];
const seen = new Map<string, { file: string; mfr: string; desc: string }>();
let parts = 0, priced = 0, twoDist = 0, notResearched = 0;
const byFile: Record<string, { parts: number; priced: number; twoDist: number; notResearched: number }> = {};

for (const f of files) {
  const j = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  const list: Part[] = j.parts ?? [];
  const nr = (j.notResearched ?? []).length;
  byFile[f] = { parts: list.length, priced: 0, twoDist: 0, notResearched: nr };
  notResearched += nr;
  for (const p of list) {
    parts++;
    const id = `${f}:${p.mpn}`;
    // Micron, Epson, OSRAM and Infineon orderable codes contain spaces ("MT62F2G32D4DS-026 AAT:B TR") — only a placeholder is an error.
    if (!p.mpn || /MATRIX|placeholder|TBD|\s{2,}|series|family/i.test(p.mpn)) errors.push(`${id}: not an orderable code`);
    if (!CATS.has(p.category)) errors.push(`${id}: category "${p.category}"`);
    const k = norm(p.mpn);
    const prev = seen.get(k);
    if (prev && prev.mfr.toLowerCase() !== String(p.mfr).toLowerCase()) errors.push(`${id}: also in ${prev.file} as ${prev.mfr}`);
    else if (prev) flags.push(`${id}: also researched in ${prev.file} (observations will be unioned)`);
    seen.set(k, { file: f, mfr: p.mfr, desc: p.desc });
    const obs = p.observations ?? [];
    for (const o of obs) {
      const why: string[] = [];
      if (!FRANCHISED.test(String(o.distributor).trim())) why.push('distributor not franchised');
      if (!PRICE_HOSTS.test(host(o.url)) || STAGING_HOSTS.test(host(o.url))) why.push(`host ${host(o.url)}`);
      if (!(Number(o.qty) >= 100)) why.push(`qty ${o.qty}`);
      if (FX[String(o.currency).toUpperCase()] == null) why.push(`currency ${o.currency}`);
      if (!o.url || !o.date) why.push('no url/date');
      if (why.length) flags.push(`${id}: observation ${o.distributor} ${o.price} ${o.currency} @${o.qty} dropped by merge — ${why.join(', ')}`);
    }
    const pr = priceFromObservations(obs);
    if (!pr) continue;
    priced++; byFile[f].priced++;
    if (pr.distributors.length >= 2) { twoDist++; byFile[f].twoDist++; }
    // price rises with quantity within one distributor
    const byD = new Map<string, Obs[]>();
    for (const o of obs) byD.set(o.distributor.toLowerCase(), [...(byD.get(o.distributor.toLowerCase()) ?? []), o]);
    for (const [d, l] of byD) {
      const s = [...l].sort((a, b) => a.qty - b.qty);
      for (let i = 1; i < s.length; i++) if (s[i].price > s[i - 1].price * 1.001 && s[i].currency === s[i - 1].currency) flags.push(`${id}: ${d} price rises with quantity (${s[i - 1].price}@${s[i - 1].qty} → ${s[i].price}@${s[i].qty})`);
    }
    const g = pr.obs.map(o => o.gbp * Math.pow(o.qty / 1000, 0.07));
    if (Math.max(...g) / Math.min(...g) > 2.5) flags.push(`${id}: observations > 2.5× apart at 1k (${g.map(x => x.toFixed(3)).join(' / ')})`);
    const cr = classRange({ componentType: p.category, description: p.desc, pkg: p.pkg, automotive: p.aecq, bomSource: 'file' }, p.aecq);
    if (cr && (pr.gbp.q1k > cr.hi * 3 || pr.gbp.q1k < cr.lo / 3)) flags.push(`${id}: £${pr.gbp.q1k.toFixed(4)} @1k vs class ${cr.label} £${cr.lo}–${cr.hi}`);
    if (p.aecq && !/aec|q1\b|-q1|automotive|q100|q101|q200/i.test(`${p.mpn} ${p.desc} ${p.notes ?? ''}`)) flags.push(`${id}: aecq:true with no AEC / automotive marker in code, desc or notes`);
    if (/^passive/.test(p.category) && !/\d\s*(p|n|u|µ|m)?(f|h|Ω|ohm|r|k\b|m\b)/i.test(p.desc)) flags.push(`${id}: passive with no value in desc`);
  }
}

const out = { files: byFile, totals: { parts, priced, twoDist, unpriced: parts - priced, notResearched }, errors, flags };
console.log(`${parts} parts researched, ${priced} priced (${twoDist} by 2+ distributors), ${parts - priced} unpriced, ${notResearched} not reached — ${errors.length} errors, ${flags.length} flags`);
for (const [f, s] of Object.entries(byFile)) console.log(`  ${f.padEnd(30)} ${String(s.parts).padStart(3)} parts  ${String(s.priced).padStart(3)} priced  ${String(s.twoDist).padStart(3)} 2+dist  ${String(s.notResearched).padStart(3)} not reached`);
for (const e of errors) console.log(`ERROR ${e}`);
const i = process.argv.indexOf('--json');
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 2));
else for (const fl of flags) console.log(`FLAG  ${fl}`);
