/**
 * Country rate book — writes a country's OWN rates from a dated config (October 2026: India, China).
 *
 *   npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-india.json          # dry run: the register, nothing written
 *   npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-india.json --write  # writes the book and the India literals
 *   npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-china.json --write  # the same for China
 *
 * A config names its country (`region`, `currency`, `currencySymbol`, `dir`, `snapshot`, `bookFile`, `bookConst`);
 * the India config predates those keys and takes the India defaults below. Local-currency figures are read from
 * `…Local…` keys, or the India config's `…Inr…` keys.
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
import { countryMachine, machineGroupOf, type CountryBook } from '../src/engine/country-books.js';
import { UK_ELECTRICITY_GBP_PER_KWH } from '../src/engine/uk-energy.js';   // the tariff the UK build-ups are written in (uk-book.ts)
import type { Confidence } from '../src/engine/types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!cfgPath) { console.error('usage: country-book.ts <config.json> [--write]'); process.exit(2); }
const cfg = JSON.parse(readFileSync(resolve(process.cwd(), cfgPath), 'utf8'));
const REGION: string = cfg.region ?? 'IN';
const RD = (REGIONAL_DATA as Record<string, typeof REGIONAL_DATA.IN>)[REGION];
if (!RD) throw new Error(`no REGIONAL_DATA for ${REGION}`);
const NAME = RD.name;
const SYM: string = cfg.currencySymbol ?? '₹';
const DIR: string = cfg.dir ?? 'scripts/rate-refresh/india-2026-10';
const SNAPSHOT: string = cfg.snapshot ?? `${DIR}/current-india-book.json`;
const BOOK_FILE: string = cfg.bookFile ?? 'src/engine/country-books/in.ts';
const BOOK_CONST: string = cfg.bookConst ?? 'INDIA_BOOK';
const cc = REGION.toLowerCase();
const FX: number = cfg.fxPerGbp ?? cfg.fxInrPerGbp;
if (Math.abs(RD.fxToGBP - FX) > 0.05) throw new Error(`config FX ${FX} ≠ REGIONAL_DATA.${REGION}.fxToGBP ${RD.fxToGBP}`);
/** A local-currency figure: `<stem>Local<tail>` or the India config's `<stem>Inr<tail>`. */
const local = (o: Record<string, unknown>, stem: string, tail: string): number => (o[`${stem}Local${tail}`] ?? o[`${stem}Inr${tail}`]) as number;
/** The snapshot's local value (`inrPerKg` / `cnyPerKg` …). */
const snapKey = (CUR: string, what: 'PerKg' | 'PerHr') => `${CUR.toLowerCase()}${what}`;
const CUR: string = cfg.currency ?? 'INR';
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const gbp = (inr: number) => r4(inr / FX);

const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
// The register's "current" column is the frozen snapshot of the India book taken BEFORE this book existed (UK × the
// regional factors), so a re-run never reports new-as-current.
const RAW = JSON.parse(readFileSync(resolve(ROOT, SNAPSHOT), 'utf8')) as {
  regional: { labour: Record<string, number>; energy: { electricityPerKwh: number; gasPerKwh: number }; machineRateMultiplier: number };
  labour: Array<Record<string, unknown> & { id: string }>; machines: Array<Record<string, unknown> & { id: string; class: string }>;
  materials: Array<Record<string, unknown> & { id: string; grade: string; category: string }> };
const SNAP = {
  regional: RAW.regional,
  labour: RAW.labour.map(l => ({ ...l, inrPerHr: l[snapKey(CUR, 'PerHr')] as number })),
  machines: RAW.machines.map(m => ({ ...m, inrPerHr: m[snapKey(CUR, 'PerHr')] as number })),
  materials: RAW.materials.map(m => ({ ...m, inrPerKg: m[snapKey(CUR, 'PerKg')] as number })),
};
void buildRegionalLibrary;

type Row = { kind: string; id: string; name: string; currentInr: number | null; newInr: number | null; unit: string; decision: string; basis: string; source: string };
const register: Row[] = [];

// ── materials ────────────────────────────────────────────────────────────────
const materials: CountryBook['materials'] = {};
// A ladder applies the UK book's grade premium as it stood when the India families were defined (the frozen UK
// snapshot, scripts/rate-refresh/uk-2026-10/current-uk-book.json) — the UK book 2026-10 re-based castings to their
// charge, and `f.base` in the India config is that snapshot's figure, so the live UK price would break the ratio.
const UK_SNAP = JSON.parse(readFileSync(resolve(ROOT, 'scripts/rate-refresh/uk-2026-10/current-uk-book.json'), 'utf8')) as {
  materials: Array<{ id: string; grade: string; gbpPerKg: number }> };
const ukMat = new Map(UK_SNAP.materials.map(m => [m.id, { id: m.id, grade: m.grade, pricePerKg: m.gbpPerKg }]));
const curMat = new Map(SNAP.materials.map(m => [m.id, m]));
for (const f of cfg.materialFamilies) {
  // each source once (a material note listed the same Mysteel page twice)
  const srcText = [...new Set((f.sources as Array<{ source: string; date?: string }>).map(s => `${s.source}${s.date ? ` (${s.date})` : ''}`))].join(' ; ');
  for (const id of f.members as string[]) {
    const uk = ukMat.get(id), cur = curMat.get(id);
    if (!uk || !cur) throw new Error(`material ${id} is not in the library`);
    // A grade that already carries an India-specific price (the extrusion / thermoforming country tables) keeps it —
    // a quoted India figure outranks an anchor × the book's premium.
    const own = (EXTRUSION_COUNTRY_PRICES[id] as Record<string, number> | undefined)?.[REGION] ?? (THERMOFORMING_COUNTRY_PRICES[id] as Record<string, number> | undefined)?.[REGION];
    if (own !== undefined) {
      register.push({ kind: 'material', id, name: uk.grade, currentInr: cur.inrPerKg, newInr: cur.inrPerKg, unit: `${SYM}/kg`,
        decision: `held (already a${/^[AEIOU]/.test(NAME) ? 'n' : ''} ${NAME}-specific price)`, basis: `${f.family} — the country table's ${NAME} price £${own}/kg outranks the ladder`, source: '' });
      continue;
    }
    let inr: number, how: string;
    const curInr = cur.inrPerKg;
    const anchor = local(f, 'anchor', 'PerKg');
    if (f.method === 'direct') { inr = anchor; how = 'direct'; }
    else if (f.method === 'ladder') {
      const proxy = (f.proxies ?? {})[id] ? ukMat.get(f.proxies[id]) : undefined;   // a duplicate grade takes its twin's premium
      const ratio = (proxy ?? uk).pricePerKg / f.base;
      const r = f.floorAtAnchor ? Math.max(1, ratio) : ratio;
      inr = anchor * r;
      // the base grade itself has nothing to explain ("ladder ×1.000 (book £0.86 ÷ base £0.86)" was noise in a report)
      how = Math.abs(r - 1) < 5e-4 && !proxy ? 'the anchor grade itself' : `ladder ×${r.toFixed(3)} (book £${(proxy ?? uk).pricePerKg}${proxy ? ` [${proxy.id}]` : ''} ÷ base £${f.base})`;
    } else if (f.method === 'ladder-add') {
      // alloy content is an absolute £/kg: the anchor + the book's premium over its base, at this country's FX
      const add = (((f.proxies ?? {})[id] ? ukMat.get(f.proxies[id]) : undefined) ?? uk).pricePerKg - f.base;
      inr = anchor + add * FX;
      how = Math.abs(add) < 5e-4 ? 'the anchor grade itself' : `ladder +${SYM}${(add * FX).toFixed(2)}/kg (the book's premium: £${uk.pricePerKg} - base £${f.base})`;
    } else if (f.method === 'floor') {
      inr = Math.max(curInr, anchor);
      how = curInr >= anchor ? 'held (already above the metal it contains)' : 'floor (raised to metal content)';
    } else throw new Error(`method ${f.method}`);
    const decision = Math.abs(inr - curInr) < 0.005 * curInr ? 'held (evidence agrees)' : how.startsWith('held') ? 'held' : 'updated';
    if (!decision.startsWith('held')) {
      materials[id] = { gbpPerKg: gbp(inr), basis: `${f.family}: ${f.anchorBasis}; ${how}`, source: srcText, confidence: f.confidence as Confidence };
    }
    register.push({ kind: 'material', id, name: uk.grade, currentInr: r2(curInr), newInr: r2(decision.startsWith('held') ? curInr : inr), unit: `${SYM}/kg`,
      decision, basis: `${f.family} — ${how}`, source: srcText });
  }
}
const priced = new Set(register.map(r => r.id));
for (const m of SNAP.materials) {
  if (priced.has(m.id)) continue;
  const why = Object.entries(cfg.held as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(' | ');
  register.push({ kind: 'material', id: m.id, name: m.grade, currentInr: m.inrPerKg, newInr: m.inrPerKg, unit: `${SYM}/kg`,
    decision: `held (no ${NAME} evidence this round)`, basis: m.category, source: why.slice(0, 0) });
}

// ── labour ───────────────────────────────────────────────────────────────────
type LabourCfg = { basis: string; source: string } & Record<string, unknown>;
const cats = cfg.labour.categories as Record<string, LabourCfg>;
const labourGbp: Record<string, number> = {};
const localHr = (v: LabourCfg) => local(v, '', 'PerHr') ?? (v.localPerHr as number) ?? (v.inrPerHr as number);
for (const [k, v] of Object.entries(cats)) {
  labourGbp[k] = r4(localHr(v) / FX);   // 4 dp: £0.01 is ¥0.09 / ₹1.27 — a note read ¥33.08 while ¥33.13 was costed
  register.push({ kind: 'labour', id: `category:${k}`, name: k, currentInr: r2(SNAP.regional.labour[k] * FX),
    newInr: r2(labourGbp[k] * FX), unit: `${SYM}/h fully loaded`, decision: 'updated', basis: v.basis, source: v.source });
}
const labourGrades: CountryBook['labourGrades'] = {};
for (const [k, v] of Object.entries(cfg.labour.grades as Record<string, LabourCfg>)) {
  labourGrades[k] = { gbpPerHr: r4(localHr(v) / FX), basis: `${v.basis}. Included: ${cfg.labour.loadingIncluded}. NOT included: ${cfg.labour.loadingNotIncluded}`, source: v.source, confidence: 'Medium' };
  const cur = SNAP.labour.find(l => l.id === `lab-uk-${k}`);
  register.push({ kind: 'labour', id: `lab-uk-${k} (${NAME})`, name: k, currentInr: cur ? cur.inrPerHr : null,
    newInr: r2(labourGrades[k].gbpPerHr * FX), unit: `${SYM}/h fully loaded`, decision: 'updated', basis: v.basis, source: v.source });
}

// ── energy: held (India) or updated (a config with electricityLocalPerKwh) ─────
const E = cfg.energy;
const curElec = SNAP.regional.energy.electricityPerKwh * FX, curGas = SNAP.regional.energy.gasPerKwh * FX;
const newElec: number | undefined = E.electricityLocalPerKwh, newGas: number | undefined = E.gasLocalPerKwh;
// a figure the evidence agrees with (within 0.5%) is HELD at the regional value, not re-rounded through the local currency
const moved = (nw: number | undefined, curLocal: number) => nw !== undefined && Math.abs(nw - curLocal) > 0.005 * curLocal;
const elecGbp = moved(newElec, SNAP.regional.energy.electricityPerKwh * FX) ? r4(newElec! / FX) : SNAP.regional.energy.electricityPerKwh;
const gasGbp = moved(newGas, SNAP.regional.energy.gasPerKwh * FX) ? r4(newGas! / FX) : SNAP.regional.energy.gasPerKwh;
const eSrc = E.sources.map((s: { source: string }) => s.source).join(' ; ');
register.push({ kind: 'energy', id: 'electricity', name: 'industrial electricity', currentInr: r2(curElec), newInr: r2(newElec ?? curElec), unit: `${SYM}/kWh`, decision: newElec !== undefined && Math.abs(newElec - curElec) > 0.005 * curElec ? 'updated' : 'held (evidence agrees)', basis: E.basis, source: eSrc });
register.push({ kind: 'energy', id: 'gas', name: 'industrial gas', currentInr: r2(curGas), newInr: r2(newGas ?? curGas), unit: `${SYM}/kWh`, decision: newGas !== undefined && Math.abs(newGas - curGas) > 0.005 * curGas ? 'updated' : 'held (evidence agrees)', basis: E.basis, source: eSrc });

// ── machines ─────────────────────────────────────────────────────────────────
const M = cfg.machines;
const rentGbpPerM2Yr = r4(M.rentLocalPerM2Month !== undefined ? M.rentLocalPerM2Month * 12 / FX : M.rentInrPerSqftMonth * 12 * 10.7639 / FX);
const labourRatio = r4(labourGbp.skilled / REGIONAL_DATA.UK.labour.skilled);
const book: CountryBook = {
  region: REGION, asOf: cfg.asOf, fxToGBP: FX, ...(REGION !== 'IN' ? { currencySymbol: SYM } : {}), labourGrades, materials,
  machines: {
    hoursPerYear: M.hoursPerYear, shiftDepreciationFactor: r4(M.shiftDepreciationFactor ?? M.scheduleIIShiftFactor), lifeYears: M.lifeYears,
    financeRate: M.financeRate, ukFinanceRate: M.ukFinanceRate, maintenancePctOfCapex: M.maintenancePctOfCapex,
    rentGbpPerM2Yr, ukRentGbpPerM2Yr: M.ukRentGbpPerM2Yr, ukElectricityGbpPerKwh: UK_ELECTRICITY_GBP_PER_KWH,
    labourRatio, capitalHeldFactor: M.capitalHeldFactor,
    basis: M.rentLocalPerM2Month !== undefined
      ? `${M.hoursBasis}; ${M.shiftBasis}; ${M.financeBasis}; rent ${SYM}${M.rentLocalPerM2Month}/m²/month (${M.rentBasis}); maintenance ${M.maintenanceBasis}`
      : `${M.hoursBasis}; ${M.scheduleIIBasis}; ${M.financeBasis}; rent ₹${M.rentInrPerSqftMonth}/sq ft/month (${M.rentBasis}); maintenance ${M.maintenanceBasis}`,
    heldBasis: M.notRebuiltBasis,
    groups: (M.groups as Array<{ id: string; match: string; refId: string; basis: string; source: string; confidence: Confidence } & Record<string, unknown>>)
      .map(g => ({ id: g.id, match: g.match, refId: g.refId, refCapexGbp: r2(local(g, 'refCapex', '') / FX), basis: g.basis, source: g.source, confidence: g.confidence })),
  },
};
const ratios: number[] = [];
const elec = elecGbp;
for (const m of UK.machines) {
  const cur = SNAP.machines.find(x => x.id === m.id)!;
  const nw = m.buildup ? countryMachine(book, m, UK.machines, elec, NAME) : null;
  if (nw && m.computedRatePerHr > 0) ratios.push(nw.computedRatePerHr / m.computedRatePerHr);
  const grouped = !!nw && !!machineGroupOf(book, m.id);
  register.push({ kind: 'machine', id: m.id, name: m.machineClass, currentInr: cur.inrPerHr, newInr: nw ? r2(nw.computedRatePerHr * FX) : cur.inrPerHr,
    unit: `${SYM}/h machine only`, decision: !nw ? 'held (no build-up)' : grouped ? `updated (${NAME} capex + operating model)` : `updated (${NAME} operating model; capital held — capex not sourced)`,
    basis: nw ? nw.sourceNote : 'no build-up: regional scaling', source: grouped ? (book.machines.groups.find(g => new RegExp(g.match).test(m.id))?.source ?? '') : '' });
}
ratios.sort((a, b) => a - b);
const machineMult = r2(ratios[Math.floor(ratios.length / 2)]);
register.push({ kind: 'factor', id: 'machineRateMultiplier', name: `${NAME} ÷ UK machine rate (median, the service factors read it)`, currentInr: SNAP.regional.machineRateMultiplier,
  newInr: machineMult, unit: 'ratio', decision: 'updated', basis: `median of ${ratios.length} machines in the new book`, source: '' });
const billet = cfg.alBilletPremiumUsdPerT;
if (billet) register.push({ kind: 'material', id: `BILLET_PREMIUM_USD_PER_T.${REGION}`, name: `${NAME} Al billet premium over LME`, currentInr: billet.current ?? 550, newInr: billet.value, unit: 'USD/t', decision: 'updated', basis: billet.basis, source: billet.source });

// ── report ───────────────────────────────────────────────────────────────────
const count = (k: string, d: string) => register.filter(r => r.kind === k && r.decision.startsWith(d)).length;
console.log(`${NAME} book ${cfg.asOf}: materials ${count('material', 'updated')} updated / ${count('material', 'held')} held; `
  + `labour ${count('labour', 'updated')} updated; machines ${count('machine', `updated (${NAME} capex`)} on ${NAME} capex, `
  + `${count('machine', `updated (${NAME} operating`)} on the operating model, ${count('machine', 'held')} held; energy ${newElec !== undefined ? `${SYM}${r2(curElec)} → ${SYM}${newElec}/kWh` : 'held'}; `
  + `machineRateMultiplier ${SNAP.regional.machineRateMultiplier} → ${machineMult}; rent £${rentGbpPerM2Yr}/m²/yr; labour ratio ${labourRatio}`);
const csv = ['kind,id,name,current,new,change %,unit,decision,basis,source',
  ...register.map(r => [r.kind, r.id, r.name, r.currentInr ?? '', r.newInr ?? '',
    r.currentInr && r.newInr != null ? r2((r.newInr / r.currentInr - 1) * 100) : '', r.unit, r.decision, r.basis, r.source]
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
const regPath = resolve(ROOT, `${DIR}/register.csv`);

if (!WRITE) { console.log('dry run — nothing written (add --write)'); process.exit(0); }
writeFileSync(regPath, csv + '\n');

// the book file
writeFileSync(resolve(ROOT, BOOK_FILE), `/**
 * ${NAME} rate book — GENERATED by \`scripts/country-book.ts\` from \`${cfgPath.replace(/^.*?scripts\//, 'scripts/')}\`.
 * Do not edit by hand: change the config (every figure carries its source there) and re-run the script.
 * Register of every rate (current v new, decision, basis): ${DIR}/register.csv.
 */
import type { CountryBook } from '../country-books.js';

export const ${BOOK_CONST}: CountryBook = ${JSON.stringify(book, null, 1)};
`);

// REGIONAL_DATA.<region> labour (+ energy) + machineRateMultiplier
const REG = resolve(ROOT, 'src/engine/regional-rates.ts');
let reg = readFileSync(REG, 'utf8');
const blockRe = new RegExp(`((?:  \\/\\/ ${NAME}: labour from the ${NAME} rate book[^\\n]*\\n  \\/\\/ machineRateMultiplier[^\\n]*\\n)?  ${REGION}: \\{\\n    name: '${NAME}',[\\s\\S]*?\\n  \\},\\n)`);
const inBlock = blockRe.exec(reg);
if (!inBlock) throw new Error(`REGIONAL_DATA.${REGION} block not found`);
const L = labourGbp;
let newBlock = inBlock[1].replace(/^(?:  \/\/[^\n]*\n)+/, '')
  .replace(/labour: \{[^}]*\}/, `labour: { skilled: ${L.skilled}, semiskilled: ${L.semiskilled}, engineer: ${L.engineer}, foundry: ${L.foundry}, electronics: ${L.electronics}, inspector: ${L.inspector}, technician: ${L.technician}, supervisor: ${L.supervisor} }`)
  .replace(/machineRateMultiplier: [0-9.]+/, `machineRateMultiplier: ${machineMult}`);
if (newElec !== undefined || newGas !== undefined) newBlock = newBlock.replace(/energy: \{[^}]*\}/, `energy: { electricityPerKwh: ${elecGbp}, gasPerKwh: ${gasGbp} }`);
reg = reg.replace(inBlock[1], `  // ${NAME}: labour from the ${NAME} rate book ${cfg.asOf} (scripts/country-book.ts; ${cfg.labour.short ?? 'statutory-loaded, 4-cluster, see the book'});\n  // machineRateMultiplier = median ${NAME} ÷ UK machine rate in that book (the service factors read it).\n${newBlock}`);
writeFileSync(REG, reg);

// lab-in-* entries
const LIB = resolve(ROOT, 'src/engine/rate-library.ts');
let lib = readFileSync(LIB, 'utf8');
for (const [suffix, cat] of [['skilled', 'skilled'], ['semiskilled', 'semiskilled'], ['electronics', 'electronics'], ['engineer', 'engineer']] as const) {
  const re = new RegExp(`(id: 'lab-${cc}-${suffix}',[\\s\\S]*?fullyLoadedRatePerHr: )[0-9.]+(,[\\s\\S]*?effectiveDate: ')[^']*(',[\\s\\S]*?sourceNote: ')[^']*(',[\\s\\S]*?confidence: ')[A-Za-z]+(')`);
  if (!re.test(lib)) throw new Error(`lab-${cc}-${suffix} not found`);
  const v = cats[cat];
  lib = lib.replace(re, `$1${labourGbp[cat]}$2${cfg.asOf}$3${NAME} rate book ${cfg.asOf}: ${SYM}${localHr(v)}/h fully loaded (${cfg.labour.short ?? '4-cluster, statutory loading'})$4Medium$5`);
}
// the book's own energy-<cc> entry wins over the regional table, so it must agree
if (newElec !== undefined || newGas !== undefined) {
  const re = new RegExp(`(id: 'energy-${cc}',[\\s\\S]*?electricityPerKwh: )[0-9.]+(,[\\s\\S]*?gasPerKwh: )[0-9.]+(,[\\s\\S]*?effectiveDate: ')[^']*(',[\\s\\S]*?sourceNote: )(?:'(?:[^'\\\\]|\\\\.)*'(?:\\s*\\+\\s*'(?:[^'\\\\]|\\\\.)*')*)(,[\\s\\S]*?confidence: ')[A-Za-z]+(')`);
  if (!re.test(lib)) throw new Error(`energy-${cc} not found`);
  lib = lib.replace(re, `$1${elecGbp}$2${gasGbp}$3${cfg.asOf}$4'${NAME} rate book ${cfg.asOf}: ${SYM}${newElec}/kWh electricity, ${SYM}${newGas}/kWh gas — ${String(E.basis).replace(/'/g, '’')}'$5Medium$6`);
}
writeFileSync(LIB, lib);

// billet premium
if (billet) {
  const ALD = resolve(ROOT, 'src/engine/al-extrusion-data.ts');
  let ald = readFileSync(ALD, 'utf8');
  const billetRe = new RegExp(`  ${REGION}: \\{ usdPerT: -?[0-9]+, sourced: (true|false), basis: '[^']*' \\},`);
  if (!billetRe.test(ald)) throw new Error(`BILLET_PREMIUM_USD_PER_T.${REGION} not found`);
  ald = ald.replace(billetRe, `  ${REGION}: { usdPerT: ${billet.value}, sourced: true, basis: '${String(billet.basis).replace(/'/g, '’')} (${NAME} rate book ${cfg.asOf})' },`);
  writeFileSync(ALD, ald);
}
console.log(`written: ${BOOK_FILE}, regional-rates.ts (${REGION}), rate-library.ts (lab-${cc}-*${newElec !== undefined ? `, energy-${cc}` : ''})${billet ? `, al-extrusion-data.ts (${REGION} billet)` : ''}, register.csv`);
