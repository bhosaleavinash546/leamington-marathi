/**
 * Country rate book — writes a country's OWN rates from a dated config (October 2026: India).
 *
 *   npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-india.json          # dry run: the register, nothing written
 *   npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-india.json --write  # writes the book and the India literals
 *
 * The config is assembled from sourced research by `scripts/rate-refresh/india-2026-10/build-config.py`; every
 * figure there carries its URL and date, and every judgement (which grade follows which anchor) is written down.
 * This script only does the arithmetic and writes:
 *   - src/engine/country-books/in.ts — material £/kg by id, the machine operating model + capex groups, process
 *     labour grades (generated; never edited by hand);
 *   - REGIONAL_DATA.IN in regional-rates.ts — the eight labour categories and machineRateMultiplier (the median India ÷
 *     UK machine rate in the new book: the regional service factors — heat treat, NDT, process, toolroom — read it);
 *   - the book's own lab-in-* entries in rate-library.ts (they win over the regional table, so they must agree);
 *   - BILLET_PREMIUM_USD_PER_T.IN in al-extrusion-data.ts;
 *   - scripts/rate-refresh/india-2026-10/register.csv — every rate, current v new, with its decision and basis.
 *
 * Pricing methods (see build-config.py): direct = the research figure; ladder = India anchor × (book UK grade ÷ book UK
 * base) — the India level, the book's grade premium (floored at the anchor where the family says so); floor = the
 * book's India price raised to the metal it contains; anything not in a family is HELD and says why.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { REGIONAL_DATA, buildRegionalLibrary, EXTRUSION_COUNTRY_PRICES, THERMOFORMING_COUNTRY_PRICES } from '../src/engine/regional-rates.js';
import { countryMachine, type CountryBook } from '../src/engine/country-books.js';
import type { Confidence } from '../src/engine/types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!cfgPath) { console.error('usage: country-book.ts <config.json> [--write]'); process.exit(2); }
const cfg = JSON.parse(readFileSync(resolve(process.cwd(), cfgPath), 'utf8'));
const FX: number = cfg.fxInrPerGbp;
if (Math.abs(REGIONAL_DATA.IN.fxToGBP - FX) > 0.05) throw new Error(`config FX ${FX} ≠ REGIONAL_DATA.IN.fxToGBP ${REGIONAL_DATA.IN.fxToGBP}`);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const gbp = (inr: number) => r4(inr / FX);

const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
// The register's "current" column is the frozen snapshot of the India book taken BEFORE this book existed (UK × the
// regional factors), so a re-run never reports new-as-current.
const SNAP = JSON.parse(readFileSync(resolve(ROOT, 'scripts/rate-refresh/india-2026-10/current-india-book.json'), 'utf8')) as {
  regional: { labour: Record<string, number>; energy: { electricityPerKwh: number; gasPerKwh: number }; machineRateMultiplier: number };
  labour: Array<{ id: string; inrPerHr: number }>; machines: Array<{ id: string; inrPerHr: number; class: string }>;
  materials: Array<{ id: string; grade: string; category: string; inrPerKg: number }> };
void buildRegionalLibrary;

type Row = { kind: string; id: string; name: string; currentInr: number | null; newInr: number | null; unit: string; decision: string; basis: string; source: string };
const register: Row[] = [];

// ── materials ────────────────────────────────────────────────────────────────
const materials: CountryBook['materials'] = {};
const ukMat = new Map(UK.materials.map(m => [m.id, m]));
const curMat = new Map(SNAP.materials.map(m => [m.id, m]));
for (const f of cfg.materialFamilies) {
  const srcText = (f.sources as Array<{ source: string; date?: string }>).map(s => `${s.source}${s.date ? ` (${s.date})` : ''}`).join(' ; ');
  for (const id of f.members as string[]) {
    const uk = ukMat.get(id), cur = curMat.get(id);
    if (!uk || !cur) throw new Error(`material ${id} is not in the library`);
    // A grade that already carries an India-specific price (the extrusion / thermoforming country tables) keeps it —
    // a quoted India figure outranks an anchor × the book's premium.
    const own = EXTRUSION_COUNTRY_PRICES[id]?.IN ?? THERMOFORMING_COUNTRY_PRICES[id]?.IN;
    if (own !== undefined) {
      register.push({ kind: 'material', id, name: uk.grade, currentInr: cur.inrPerKg, newInr: cur.inrPerKg, unit: '₹/kg',
        decision: 'held (already an India-specific price)', basis: `${f.family} — the country table's India price £${own}/kg outranks the ladder`, source: '' });
      continue;
    }
    let inr: number, how: string;
    const curInr = cur.inrPerKg;
    if (f.method === 'direct') { inr = f.anchorInrPerKg; how = 'direct'; }
    else if (f.method === 'ladder') {
      const proxy = (f.proxies ?? {})[id] ? ukMat.get(f.proxies[id]) : undefined;   // a duplicate grade takes its twin's premium
      const ratio = (proxy ?? uk).pricePerKg / f.base;
      const r = f.floorAtAnchor ? Math.max(1, ratio) : ratio;
      inr = f.anchorInrPerKg * r;
      how = `ladder ×${r.toFixed(3)} (book £${(proxy ?? uk).pricePerKg}${proxy ? ` [${proxy.id}]` : ''} ÷ base £${f.base})`;
    } else if (f.method === 'floor') {
      inr = Math.max(curInr, f.anchorInrPerKg);
      how = curInr >= f.anchorInrPerKg ? 'held (already above the metal it contains)' : 'floor (raised to metal content)';
    } else throw new Error(`method ${f.method}`);
    const decision = Math.abs(inr - curInr) < 0.005 * curInr ? 'held (evidence agrees)' : how.startsWith('held') ? 'held' : 'updated';
    if (!decision.startsWith('held')) {
      materials[id] = { gbpPerKg: gbp(inr), basis: `${f.family}: ${f.anchorBasis}; ${how}`, source: srcText, confidence: f.confidence as Confidence };
    }
    register.push({ kind: 'material', id, name: uk.grade, currentInr: r2(curInr), newInr: r2(decision.startsWith('held') ? curInr : inr), unit: '₹/kg',
      decision, basis: `${f.family} — ${how}`, source: srcText });
  }
}
const priced = new Set(register.map(r => r.id));
for (const m of SNAP.materials) {
  if (priced.has(m.id)) continue;
  const why = Object.entries(cfg.held as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(' | ');
  register.push({ kind: 'material', id: m.id, name: m.grade, currentInr: m.inrPerKg, newInr: m.inrPerKg, unit: '₹/kg',
    decision: 'held (no India evidence this round)', basis: m.category, source: why.slice(0, 0) });
}

// ── labour ───────────────────────────────────────────────────────────────────
const cats = cfg.labour.categories as Record<string, { inrPerHr: number; basis: string; source: string }>;
const labourGbp: Record<string, number> = {};
for (const [k, v] of Object.entries(cats)) {
  labourGbp[k] = r2(v.inrPerHr / FX);
  register.push({ kind: 'labour', id: `category:${k}`, name: k, currentInr: r2(SNAP.regional.labour[k] * FX),
    newInr: r2(labourGbp[k] * FX), unit: '₹/h fully loaded', decision: 'updated', basis: v.basis, source: v.source });
}
const labourGrades: CountryBook['labourGrades'] = {};
for (const [k, v] of Object.entries(cfg.labour.grades as Record<string, { inrPerHr: number; basis: string; source: string }>)) {
  labourGrades[k] = { gbpPerHr: r2(v.inrPerHr / FX), basis: `${v.basis}. Included: ${cfg.labour.loadingIncluded}. NOT included: ${cfg.labour.loadingNotIncluded}`, source: v.source, confidence: 'Medium' };
  const cur = SNAP.labour.find(l => l.id === `lab-uk-${k}`);
  register.push({ kind: 'labour', id: `lab-uk-${k} (India)`, name: k, currentInr: cur ? cur.inrPerHr : null,
    newInr: r2(labourGrades[k].gbpPerHr * FX), unit: '₹/h fully loaded', decision: 'updated', basis: v.basis, source: v.source });
}

// ── energy (held) ────────────────────────────────────────────────────────────
const E = cfg.energy;
const curElec = SNAP.regional.energy.electricityPerKwh * FX, curGas = SNAP.regional.energy.gasPerKwh * FX;
register.push({ kind: 'energy', id: 'electricity', name: 'industrial electricity', currentInr: r2(curElec), newInr: r2(curElec), unit: '₹/kWh', decision: 'held (evidence agrees)', basis: E.basis, source: E.sources.map((s: { source: string }) => s.source).join(' ; ') });
register.push({ kind: 'energy', id: 'gas', name: 'industrial gas', currentInr: r2(curGas), newInr: r2(curGas), unit: '₹/kWh', decision: 'held (evidence agrees)', basis: E.basis, source: E.sources.map((s: { source: string }) => s.source).join(' ; ') });

// ── machines ─────────────────────────────────────────────────────────────────
const M = cfg.machines;
const rentGbpPerM2Yr = r4(M.rentInrPerSqftMonth * 12 * 10.7639 / FX);
const labourRatio = r4(labourGbp.skilled / REGIONAL_DATA.UK.labour.skilled);
const book: CountryBook = {
  region: 'IN', asOf: cfg.asOf, fxToGBP: FX, labourGrades, materials,
  machines: {
    hoursPerYear: M.hoursPerYear, shiftDepreciationFactor: r4(M.scheduleIIShiftFactor), lifeYears: M.lifeYears,
    financeRate: M.financeRate, ukFinanceRate: M.ukFinanceRate, maintenancePctOfCapex: M.maintenancePctOfCapex,
    rentGbpPerM2Yr, ukRentGbpPerM2Yr: M.ukRentGbpPerM2Yr, ukElectricityGbpPerKwh: M.ukElectricityGbpPerKwh,
    labourRatio, capitalHeldFactor: M.capitalHeldFactor,
    basis: `${M.hoursBasis}; ${M.scheduleIIBasis}; ${M.financeBasis}; rent ₹${M.rentInrPerSqftMonth}/sq ft/month (${M.rentBasis}); maintenance ${M.maintenanceBasis}`,
    heldBasis: M.notRebuiltBasis,
    groups: (M.groups as Array<{ id: string; match: string; refId: string; refCapexInr: number; basis: string; source: string; confidence: Confidence }>)
      .map(g => ({ id: g.id, match: g.match, refId: g.refId, refCapexGbp: r2(g.refCapexInr / FX), basis: g.basis, source: g.source, confidence: g.confidence })),
  },
};
const ratios: number[] = [];
const elec = REGIONAL_DATA.IN.energy.electricityPerKwh;
for (const m of UK.machines) {
  const cur = SNAP.machines.find(x => x.id === m.id)!;
  const nw = m.buildup ? countryMachine(book, m, UK.machines, elec, REGIONAL_DATA.IN.name) : null;
  if (nw && m.computedRatePerHr > 0) ratios.push(nw.computedRatePerHr / m.computedRatePerHr);
  const grouped = !!nw && /capex £/.test(nw.sourceNote);
  register.push({ kind: 'machine', id: m.id, name: m.machineClass, currentInr: cur.inrPerHr, newInr: nw ? r2(nw.computedRatePerHr * FX) : cur.inrPerHr,
    unit: '₹/h machine only', decision: !nw ? 'held (no build-up)' : grouped ? 'updated (India capex + operating model)' : 'updated (India operating model; capital held — capex not sourced)',
    basis: nw ? nw.sourceNote : 'no build-up: regional scaling', source: grouped ? (book.machines.groups.find(g => new RegExp(g.match).test(m.id))?.source ?? '') : '' });
}
ratios.sort((a, b) => a - b);
const machineMult = r2(ratios[Math.floor(ratios.length / 2)]);
register.push({ kind: 'factor', id: 'machineRateMultiplier', name: 'India ÷ UK machine rate (median, the service factors read it)', currentInr: SNAP.regional.machineRateMultiplier,
  newInr: machineMult, unit: 'ratio', decision: 'updated', basis: `median of ${ratios.length} machines in the new book`, source: '' });
const billet = cfg.alBilletPremiumUsdPerT;
register.push({ kind: 'material', id: 'BILLET_PREMIUM_USD_PER_T.IN', name: 'India Al billet premium over LME', currentInr: 550, newInr: billet.value, unit: 'USD/t', decision: 'updated', basis: billet.basis, source: billet.source });

// ── report ───────────────────────────────────────────────────────────────────
const count = (k: string, d: string) => register.filter(r => r.kind === k && r.decision.startsWith(d)).length;
console.log(`India book ${cfg.asOf}: materials ${count('material', 'updated')} updated / ${count('material', 'held')} held; `
  + `labour ${count('labour', 'updated')} updated; machines ${count('machine', 'updated (India capex')} on India capex, `
  + `${count('machine', 'updated (India operating')} on the operating model, ${count('machine', 'held')} held; energy held; `
  + `machineRateMultiplier ${SNAP.regional.machineRateMultiplier} → ${machineMult}; rent £${rentGbpPerM2Yr}/m²/yr; labour ratio ${labourRatio}`);
const csv = ['kind,id,name,current,new,change %,unit,decision,basis,source',
  ...register.map(r => [r.kind, r.id, r.name, r.currentInr ?? '', r.newInr ?? '',
    r.currentInr && r.newInr != null ? r2((r.newInr / r.currentInr - 1) * 100) : '', r.unit, r.decision, r.basis, r.source]
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
const regPath = resolve(ROOT, 'scripts/rate-refresh/india-2026-10/register.csv');

if (!WRITE) { console.log('dry run — nothing written (add --write)'); process.exit(0); }
writeFileSync(regPath, csv + '\n');

// in.ts
const IN_TS = resolve(ROOT, 'src/engine/country-books/in.ts');
writeFileSync(IN_TS, `/**
 * India rate book — GENERATED by \`scripts/country-book.ts\` from \`${cfgPath.replace(/^.*?scripts\//, 'scripts/')}\`.
 * Do not edit by hand: change the config (every figure carries its source there) and re-run the script.
 * Register of every rate (current v new, decision, basis): scripts/rate-refresh/india-2026-10/register.csv.
 */
import type { CountryBook } from '../country-books.js';

export const INDIA_BOOK: CountryBook = ${JSON.stringify(book, null, 1)};
`);

// REGIONAL_DATA.IN labour + machineRateMultiplier
const REG = resolve(ROOT, 'src/engine/regional-rates.ts');
let reg = readFileSync(REG, 'utf8');
const inBlock = /((?:  \/\/ India: labour from the India rate book[^\n]*\n  \/\/ machineRateMultiplier[^\n]*\n)?  IN: \{\n    name: 'India',[\s\S]*?\n  \},\n)/.exec(reg);
if (!inBlock) throw new Error('REGIONAL_DATA.IN block not found');
const L = labourGbp;
const newBlock = inBlock[1].replace(/^(?:  \/\/[^\n]*\n)+/, '')
  .replace(/labour: \{[^}]*\}/, `labour: { skilled: ${L.skilled}, semiskilled: ${L.semiskilled}, engineer: ${L.engineer}, foundry: ${L.foundry}, electronics: ${L.electronics}, inspector: ${L.inspector}, technician: ${L.technician}, supervisor: ${L.supervisor} }`)
  .replace(/machineRateMultiplier: [0-9.]+/, `machineRateMultiplier: ${machineMult}`);
reg = reg.replace(inBlock[1], `  // India: labour from the India rate book ${cfg.asOf} (scripts/country-book.ts; statutory-loaded, 4-cluster, see the book);\n  // machineRateMultiplier = median India ÷ UK machine rate in that book (the service factors read it).\n${newBlock}`);
writeFileSync(REG, reg);

// lab-in-* entries
const LIB = resolve(ROOT, 'src/engine/rate-library.ts');
let lib = readFileSync(LIB, 'utf8');
for (const [suffix, cat] of [['skilled', 'skilled'], ['semiskilled', 'semiskilled'], ['electronics', 'electronics'], ['engineer', 'engineer']] as const) {
  const re = new RegExp(`(id: 'lab-in-${suffix}',[\\s\\S]*?fullyLoadedRatePerHr: )[0-9.]+(,[\\s\\S]*?effectiveDate: ')[^']*(',[\\s\\S]*?sourceNote: ')[^']*(',[\\s\\S]*?confidence: ')[A-Za-z]+(')`);
  if (!re.test(lib)) throw new Error(`lab-in-${suffix} not found`);
  const v = cats[cat];
  lib = lib.replace(re, `$1${labourGbp[cat]}$2${cfg.asOf}$3India rate book ${cfg.asOf}: ₹${v.inrPerHr}/h fully loaded (4-cluster, statutory loading; scripts/country-book.ts)$4Medium$5`);
}
writeFileSync(LIB, lib);

// billet premium
const ALD = resolve(ROOT, 'src/engine/al-extrusion-data.ts');
let ald = readFileSync(ALD, 'utf8');
const billetRe = /  IN: \{ usdPerT: [0-9]+, sourced: (true|false), basis: '[^']*' \},/;
if (!billetRe.test(ald)) throw new Error('BILLET_PREMIUM_USD_PER_T.IN not found');
ald = ald.replace(billetRe, `  IN: { usdPerT: ${billet.value}, sourced: true, basis: '${String(billet.basis).replace(/'/g, '’')} (India rate book ${cfg.asOf})' },`);
writeFileSync(ALD, ald);
console.log('written: src/engine/country-books/in.ts, regional-rates.ts (IN), rate-library.ts (lab-in-*), al-extrusion-data.ts (IN billet), register.csv');
