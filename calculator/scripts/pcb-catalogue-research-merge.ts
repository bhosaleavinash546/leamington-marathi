/**
 * Merge researched distributor prices into the offline component catalogue
 * (server/data/pcb-component-catalogue.json) — the research of 6 Oct 2026,
 * docs/pcb/component-database-2026-10.md.
 *
 *   npx tsx scripts/pcb-catalogue-research-merge.ts <research dir> [--write]
 *
 * Input: one JSON file per research domain (shape in the research rules): each part with
 * up to 3 OBSERVATIONS — distributor, quantity break, unit price, currency, URL, date.
 *
 * Rules (each one is written onto the entry it shapes):
 *  1. Only franchised / authorised distributors count, read on the distributor's own site or an
 *     aggregator that names it (PRICE_HOSTS — a broker storefront relisting a Mouser row is not);
 *     brokers and marketplaces are dropped, and
 *     so is Rochester Electronics (an authorised AFTERMARKET house: end-of-life stock at its own
 *     prices, e.g. LTC6813 $15.93 @1k against LCSC $10.82 @100 — not a production supply price),
 *     and so are breaks below 100 units (one-off prices run 2–3× the volume price).
 *  2. Prices convert to GBP with the engine's own FX table (src/engine/insights.ts).
 *  3. With 3+ observations, one more than 2.5× from the median of the others is dropped.
 *  4. The 1k price is the median of the observations at 500–2,500 units (a single other
 *     break is moved to 1k along the part's slope).
 *  5. The slope is the part's own: from ONE distributor's two breaks (b = ln(Pa/Pb)/ln(qb/qa)),
 *     clamped to 0.02–0.18. Otherwise the catalogue's franchise curve (10k = 1k × 0.85 →
 *     b = 0.0706). Two DIFFERENT distributors' breaks are never turned into a slope: the gap
 *     between them is the distributors' price spread, not a volume discount (DS90UB954:
 *     Mouser $14.78 @1k vs Digi-Key $10.79 @2.5k read as b = 0.34).
 *  5a. A price read on a sibling orderable code (another temperature grade, packing or
 *     revision) says so in the entry's source, and the sibling code becomes an alias.
 *  6. 10k / 100k / 200k / 300k = P1k × (Q / 1000)^−b. Distributors publish nothing above reel
 *     quantity: 100k–300k are DERIVED, and say so. They are not contract prices.
 *  7. A part with no valid observation is NOT added (no unsourced price enters the catalogue);
 *     it is listed in the report.
 *  8. A researched entry replaces an estimate of the same part (keeping its aliases). New
 *     research on a part already priced from distributor observations ADDS to them (a
 *     cross-check never discards the earlier listing; a repeated distributor + break is kept
 *     once) and the part is re-priced from the union. A distributor entry without stored
 *     observations (the 1 Oct pass kept no URL) is replaced by research that has them.
 *  9. Family keys (an estimate named by a family, "TC387", "LM74700") take the price of the
 *     catalogued member named in scripts/pcb-research/family-links.json — a reviewed list, never
 *     a guess. They stay labelled estimates (the BOM line does not say which variant) and say so.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FX_TO_GBP } from '../src/engine/insights.js';

type Obs = { distributor: string; qty: number; price: number; currency: string; url: string; date: string };
type Researched = { mpn: string; family?: string; mfr: string; desc: string; category: string; pkg: string; aecq: boolean;
  ecuRoles?: string[]; observedMpn?: string; observations: Obs[]; notes?: string };
type Gbp = { q1k: number; q10k: number; q100k: number; q200k?: number; q300k?: number };
type Entry = { mpn: string; family: string; mfr: string; desc: string; category: string; pkg: string; aecq: boolean;
  aliases?: string[]; gbp: Gbp; confidence: 'distributor' | 'estimate'; source: string; asOf: string;
  ecuRoles?: string[]; observations?: Array<Obs & { gbp: number }>; volumeModel?: { b: number; basis: string; derivedAbove: number } };

export const FRANCHISED = /^(digi-?key|mouser|arrow|avnet|farnell|newark|element ?14|rs( components)?|tme|rutronik|future( electronics)?|tti|lcsc|verical|heilind|allied|sager|master electronics)/i;
/** Where a price may be read: the distributor's own site, or an aggregator that names the distributor and break.
 *  Broker storefronts that relist distributor rows (OEMsTrade, omo-ic), datasheet sites and maker pages are not. */
export const PRICE_HOSTS = /(^|\.)(digikey\.[a-z.]+|mouser\.[a-z.]+|arrow\.com|avnet\.com|farnell\.com|newark\.com|element14\.com|rs-online\.com|rsdelivers\.com|tme\.(eu|com)|rutronik(24)?\.com|futureelectronics\.com|tti(inc)?\.com|lcsc\.com|verical\.com|heilind\.com|alliedelec\.com|sager\.com|masterelectronics\.com|findchips\.com|octopart\.com|digipart\.com|trustedparts\.com)$/i;
const hostOf = (u: string) => String(u).replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
export const DEFAULT_B = -Math.log(0.85) / Math.log(10);   // the catalogue's franchise curve, 0.0706
const CATEGORIES = new Set(['ic_bga', 'ic_qfn', 'ic_soic', 'ic_tqfp', 'passive_0402', 'passive_0603', 'passive_0805', 'passive_1206',
  'fuse_tvs', 'crystal_osc', 'connector_smt', 'through_hole', 'relay_switch', 'led', 'transformer', 'mechanical', 'power_module']);
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface Priced { gbp: Gbp; b: number; basis: string; obs: Array<Obs & { gbp: number }>; distributors: string[]; dropped: string[] }

/** The volume model of one part from its observations (rules 1–6). Null when nothing valid is left. */
export function priceFromObservations(raw: Obs[]): Priced | null {
  const dropped: string[] = [];
  let obs = (raw ?? []).filter(o => {
    // A one-off price (1, 25, 30 units) says little about volume and runs 2–3× the 1k
    // price; only breaks of 100 units or more are used.
    const ok = FRANCHISED.test(String(o.distributor).trim()) && PRICE_HOSTS.test(hostOf(o.url)) && Number(o.price) > 0 && Number(o.qty) >= 100 && FX_TO_GBP[String(o.currency).toUpperCase()] != null;
    if (!ok) dropped.push(`${o.distributor} ${o.price} ${o.currency} @${o.qty}`);
    return ok;
  }).map(o => ({ ...o, qty: Number(o.qty), price: Number(o.price), gbp: Number(o.price) * FX_TO_GBP[String(o.currency).toUpperCase()] }));
  if (!obs.length) return null;
  // Rule 3 — outliers, judged at a common quantity (1k) so a reel break is not an "outlier".
  const at1k = (o: { qty: number; gbp: number }, b = DEFAULT_B) => o.gbp * Math.pow(o.qty / 1000, b);
  if (obs.length >= 3) {
    obs = obs.filter((o, i) => {
      const others = obs.filter((_, j) => j !== i).map(x => at1k(x));
      const m = median(others), v = at1k(o);
      const bad = v > m * 2.5 || v < m / 2.5;
      if (bad) dropped.push(`${o.distributor} ${o.price} ${o.currency} @${o.qty} (outlier vs median)`);
      return !bad;
    });
  }
  // Rule 5 — the part's own slope.
  let b = NaN, basis = '';
  const byDist = new Map<string, typeof obs>();
  for (const o of obs) { const k = o.distributor.toLowerCase(); byDist.set(k, [...(byDist.get(k) ?? []), o]); }
  const own: number[] = [];
  for (const list of byDist.values()) {
    const s = [...list].sort((x, y) => x.qty - y.qty);
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      if (s[j].qty / s[i].qty >= 2 && s[i].gbp > s[j].gbp) own.push(Math.log(s[i].gbp / s[j].gbp) / Math.log(s[j].qty / s[i].qty));
    }
  }
  const near1k = obs.filter(o => o.qty >= 500 && o.qty <= 2500);
  if (own.length) { b = median(own); basis = `slope from the part's own breaks (${own.length} pair${own.length > 1 ? 's' : ''})`; }
  if (!Number.isFinite(b)) { b = DEFAULT_B; basis = 'franchise curve (no second break found): 10k = 1k × 0.85'; }
  b = Math.min(0.18, Math.max(0.02, b));
  // Rule 4 — the 1k price.
  const ref = near1k.length ? near1k : obs;
  const p1k = median(ref.map(o => at1k(o, b)));
  const at = (q: number) => r4(p1k * Math.pow(q / 1000, -b));
  return {
    gbp: { q1k: r4(p1k), q10k: at(10_000), q100k: at(100_000), q200k: at(200_000), q300k: at(300_000) },
    b: Math.round(b * 10000) / 10000, basis, obs, distributors: [...new Set(obs.map(o => o.distributor))], dropped,
  };
}

function sourceText(p: Priced, sibling?: string): string {
  const sym = (c: string) => ({ USD: '$', GBP: '£', EUR: '€' }[c.toUpperCase()] ?? `${c} `);
  const list = p.obs.map(o => `${o.distributor} ${sym(o.currency)}${o.price} @${o.qty.toLocaleString('en-GB')}`).join('; ');
  const sib = sibling ? `Priced on the sibling orderable code ${sibling} (the listed code was not found at a distributor). ` : '';
  return `${sib}${list} (search of distributor listings, ${p.obs[0]?.date ?? ''}). 10k/100k/200k/300k derived: P1k × (Q/1000)^−${p.b}, ${p.basis}. Above the largest published break these are modelled, not quoted.`;
}

/** Merge research into the catalogue file (rules 7–8). Returns the report. */
export function mergeResearch(catalogue: { parts: Entry[] }, research: Researched[], date: string) {
  const report = { added: [] as string[], replacedEstimate: [] as string[], updated: [] as string[], keptExisting: [] as string[], notFound: [] as string[], badCategory: [] as string[], repriced: [] as string[], removed: [] as string[] };
  const index = new Map<string, number>();
  catalogue.parts.forEach((e, i) => { for (const k of [e.mpn, e.family, ...(e.aliases ?? [])]) if (k) index.set(norm(k), i); });
  for (const r of research) {
    const pre = index.get(norm(r.mpn.trim()));
    const prior = pre != null ? (catalogue.parts[pre].observations ?? []) : [];
    const seen = new Set<string>();
    const union = [...prior, ...(r.observations ?? [])].filter(o => {
      const k = `${String(o.distributor).toLowerCase()}|${o.qty}|${o.price}`; if (seen.has(k)) return false; seen.add(k); return true;
    });
    const priced = priceFromObservations(union);
    if (!priced) { report.notFound.push(`${r.mpn}${r.notes ? ` — ${r.notes}` : ''}`); continue; }
    const category = CATEGORIES.has(r.category) ? r.category : 'ic_soic';
    if (!CATEGORIES.has(r.category)) report.badCategory.push(`${r.mpn}: ${r.category}`);
    const entry: Entry = {
      mpn: r.mpn.trim(), family: (r.family || r.mpn).trim(), mfr: r.mfr, desc: r.desc, category, pkg: r.pkg, aecq: !!r.aecq,
      gbp: priced.gbp, confidence: 'distributor', source: sourceText(priced, r.observedMpn && norm(r.observedMpn) !== norm(r.mpn) ? r.observedMpn.trim() : undefined), asOf: date,
      ecuRoles: r.ecuRoles?.length ? r.ecuRoles : undefined,
      observations: priced.obs.map(o => ({ distributor: o.distributor, qty: o.qty, price: o.price, currency: o.currency.toUpperCase(), url: o.url, date: o.date, gbp: r4(o.gbp) })),
      volumeModel: { b: priced.b, basis: priced.basis, derivedAbove: Math.max(...priced.obs.map(o => o.qty)) },
    };
    if (r.observedMpn && norm(r.observedMpn) !== norm(entry.mpn)) entry.aliases = [r.observedMpn];
    const hit = index.get(norm(entry.mpn)) ?? (norm(entry.family).length >= 6 ? index.get(norm(entry.family)) : undefined);
    if (hit == null) {
      index.set(norm(entry.mpn), catalogue.parts.length);
      catalogue.parts.push(entry);
      report.added.push(entry.mpn);
      continue;
    }
    const old = catalogue.parts[hit];
    const aliases = [...new Set([...(old.aliases ?? []), ...(entry.aliases ?? []), ...(norm(old.mpn) !== norm(entry.mpn) ? [old.mpn] : [])])];
    if (old.confidence === 'estimate') {
      catalogue.parts[hit] = { ...entry, family: old.family || entry.family, aliases: aliases.length ? aliases : undefined };
      report.replacedEstimate.push(`${old.mpn} → ${entry.mpn}`);
    } else if (old.observations?.length) {
      if (priced.obs.length > old.observations.length) {
        const sib = /^Priced on the sibling orderable code (\S+) /.exec(old.source)?.[1];
        catalogue.parts[hit] = { ...old, gbp: priced.gbp, source: sourceText(priced, sib), asOf: date,
          observations: entry.observations, volumeModel: entry.volumeModel, aliases: aliases.length ? aliases : undefined };
        report.updated.push(`${entry.mpn} (cross-checked: ${priced.distributors.join(', ')})`);
      } else report.keptExisting.push(`${entry.mpn} (no new observation)`);
    } else {
      // An older distributor price kept no URL: a listing that can be re-checked replaces it.
      catalogue.parts[hit] = { ...entry, family: old.family || entry.family, aliases: aliases.length ? aliases : undefined };
      report.updated.push(`${entry.mpn} (URL-backed; was £${old.gbp.q1k} @1k unsourced → £${entry.gbp.q1k})`);
    }
  }
  // Entries researched earlier are re-priced from their stored observations, so one rule set
  // prices the whole catalogue (the source's sibling sentence is kept).
  for (const e of catalogue.parts) {
    if (!e.observations?.length || research.some(r => norm(r.mpn) === norm(e.mpn))) continue;
    const p = priceFromObservations(e.observations);
    if (!p) { report.removed.push(`${e.mpn}: no observation passes the rules any more`); continue; }
    const sib = /^Priced on the sibling orderable code (\S+) /.exec(e.source)?.[1];
    if (JSON.stringify(p.gbp) !== JSON.stringify(e.gbp)) report.repriced.push(`${e.mpn}: 1k £${e.gbp.q1k} → £${p.gbp.q1k}, b ${e.volumeModel?.b} → ${p.b}`);
    if (p.obs.length !== e.observations.length) report.repriced.push(`${e.mpn}: observations ${e.observations.length} → ${p.obs.length} (${p.dropped.join('; ')})`);
    const disputed = /( DISPUTED: .*)$/.exec(e.source)?.[1] ?? '';   // an audit's dispute stays until a quote settles it
    e.gbp = p.gbp; e.source = sourceText(p, sib) + disputed;
    e.observations = p.obs.map(o => ({ distributor: o.distributor, qty: o.qty, price: o.price, currency: o.currency.toUpperCase(), url: o.url, date: o.date, gbp: r4(o.gbp) }));
    e.volumeModel = { b: p.b, basis: p.basis, derivedAbove: Math.max(...p.obs.map(o => o.qty)) };
  }
  // An entry left with no valid observation leaves the catalogue (no unsourced price).
  const gone = new Set(report.removed.map(x => x.split(':')[0]));
  catalogue.parts = catalogue.parts.filter(e => !gone.has(e.mpn));
  // Every entry carries 200k / 300k: the earlier entries by their own stated curve.
  for (const e of catalogue.parts) {
    if (e.gbp.q200k != null && e.gbp.q300k != null) continue;
    const b = e.volumeModel?.b ?? DEFAULT_B;
    e.gbp.q200k = r4(e.gbp.q100k * Math.pow(2, -b));
    e.gbp.q300k = r4(e.gbp.q100k * Math.pow(3, -b));
  }
  return report;
}

/** Rule 9: a family key priced as its reviewed catalogued member. */
export function applyFamilyLinks(catalogue: { parts: Entry[] }, links: Record<string, { member: string; why?: string }>) {
  const out: string[] = [];
  for (const [key, l] of Object.entries(links)) {
    const e = catalogue.parts.find(p => p.mpn === key);
    const m = catalogue.parts.find(p => p.mpn === l.member);
    if (!e || !m || e.confidence !== 'estimate' || m.confidence !== 'distributor') { out.push(`${key}: link not applied (${!e ? 'no key' : !m ? 'no member' : 'confidence'})`); continue; }
    // The original estimate is stated once and kept: a re-run must not record the linked price as "was".
    const was = Number(/Was an engineering estimate of £([\d.]+)/.exec(e.source)?.[1] ?? e.gbp.q1k);
    e.gbp = { ...m.gbp };
    e.volumeModel = m.volumeModel ? { ...m.volumeModel } : undefined;
    e.source = `Family key priced as its catalogued member ${m.mpn} (distributor-priced, ${m.asOf}${l.why ? `; ${l.why}` : ''}). `
      + `A BOM line that names only the family does not say which variant, so this stays an estimate to verify. Was an engineering estimate of £${was} @1k.`;
    e.asOf = m.asOf;
    out.push(`${key}: £${was} → £${m.gbp.q1k} (${m.mpn})`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: pcb-catalogue-research-merge.ts <research dir> [--write]'); process.exit(1); }
  const file = new URL('../server/data/pcb-component-catalogue.json', import.meta.url);
  const cat = JSON.parse(readFileSync(file, 'utf8'));
  const research: Researched[] = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json') && !/^ecu-map|existing|merge-report|audit-exclusions/.test(f))) {
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const p of j.parts ?? []) research.push(p);
  }
  // The audit's decisions (audit-exclusions.json in the research dir), each with its reason.
  const auditFile = join(dir, 'audit-exclusions.json');
  const audit: { parts?: Record<string, string>; observations?: Array<{ mpn: string; url: string; reason: string }>; disputed?: Record<string, string> } =
    readdirSync(dir).includes('audit-exclusions.json') ? JSON.parse(readFileSync(auditFile, 'utf8')) : {};
  for (const r of research) {
    if (audit.parts?.[r.mpn]) { r.notes = `excluded by audit: ${audit.parts[r.mpn]}`; r.observations = []; }
    for (const x of audit.observations ?? []) if (x.mpn === r.mpn) r.observations = r.observations.filter(o => !String(o.url).includes(x.url));
  }
  const date = new Date().toISOString().slice(0, 10);
  const report = mergeResearch(cat, research, date);
  const linksFile = new URL('./pcb-research/family-links.json', import.meta.url);
  try { (report as Record<string, string[]>).familyLinked = applyFamilyLinks(cat, JSON.parse(readFileSync(linksFile, 'utf8')).links); } catch { /* no link file */ }
  for (const [mpn, why] of Object.entries(audit.disputed ?? {})) {
    const e = cat.parts.find((p: Entry) => p.mpn === mpn);
    if (e && !e.source.includes('DISPUTED:')) e.source = `${e.source} DISPUTED: ${why}.`;
  }
  cat.asOf = date;
  cat.basis = 'unit price, GBP, AEC-Q grade where automotive. Researched entries: 1k = median of franchised-distributor prices near 1,000; 10k/100k/200k/300k derived along the part\'s own break slope (else the franchise curve 10k = 1k × 0.85). Estimates are labelled.';
  console.log(JSON.stringify({ researched: research.length, total: cat.parts.length,
    distributor: cat.parts.filter((p: Entry) => p.confidence === 'distributor').length,
    counts: Object.fromEntries(Object.entries(report).map(([k, v]) => [k, (v as string[]).length])) }, null, 1));
  writeFileSync(join(dir, 'merge-report.json'), JSON.stringify(report, null, 1));
  if (process.argv.includes('--write')) { writeFileSync(file, JSON.stringify(cat, null, 1) + '\n'); console.log('written', file.pathname); }
}
