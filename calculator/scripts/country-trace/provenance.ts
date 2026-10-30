/**
 * Country rate provenance — for every real part costed in a country, where every £ of the cost comes from.
 *
 *   npx tsx scripts/country-trace/provenance.ts [out.json] [CN,IN,PL,HU]
 *
 * Each part of the real-parts baseline is costed headless (`costMeasuredPart`, the product's own chain) ex-works at
 * 50,000 a year over 5 years, in each country. Every line is then split by WHERE ITS RATE COMES FROM:
 *
 *   own        the country's own sourced rate — a book material, its labour, its tariff, the machine's running
 *              costs under the country's operating model (energy, floor, support staff), a sourced machine capex group;
 *   heldCap    machine CAPITAL with no country capex: the UK book's × the book's capitalHeldFactor (China 0.55,
 *              Poland 0.72; Hungary 1.0 = at par);
 *   matFactor  a material with no country price: the UK book's × the regional factor (Hungary: at par, ×1);
 *   derived    £ constants moved by a country factor DERIVED from the country's own labour and machine rates
 *              (tooling build-ups, consumables, bought-in services — regional-services.ts);
 *   heldMult   overhead % and packaging × a held, unsourced country multiplier;
 *   margin     the supplier margin (8 %, a commercial assumption, not a country rate).
 *
 * It recomputes nothing the costing does — it reads the costing's own trace and the country book it priced in.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { costMeasuredPart } from '../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { buildRegionalLibrary, REGIONAL_DATA, type ManufacturingRegion } from '../../src/engine/regional-rates.js';
import { COUNTRY_BOOKS, machineGroupOf } from '../../src/engine/country-books.js';

const OUT = process.argv[2] ?? 'country-provenance.json';
const REGIONS = (process.argv[3] ?? 'CN,IN,PL,HU').split(',') as ManufacturingRegion[];
const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const baseline = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as
  { part: string; answers: Record<string, string>; geometry: never; outcome: { commodity?: string } }[];

type Cls = 'own' | 'heldCap' | 'matFactor' | 'derived' | 'heldMult' | 'margin';
const CLASSES: Cls[] = ['own', 'heldCap', 'matFactor', 'derived', 'heldMult', 'margin'];
const out: Record<string, unknown> = {};

for (const region of REGIONS) {
  const book = COUNTRY_BOOKS[region];
  const lib = buildRegionalLibrary(UK, region);
  const rd = REGIONAL_DATA[region];
  const tot: Record<Cls, number> = { own: 0, heldCap: 0, matFactor: 0, derived: 0, heldMult: 0, margin: 0 };
  const heldMachines = new Map<string, number>(), factorMaterials = new Map<string, number>(), heldLabour = new Map<string, number>();
  const parts: Array<Record<string, unknown>> = [];
  let grand = 0;
  for (const p of baseline) {
    const r = await costMeasuredPart(p.geometry, p.part, { partNumber: p.part, file: p.part, annualVolume: 50_000,
      ...(p.outcome.commodity ? { commodity: p.outcome.commodity } : {}) },
    p.answers, region, { annualVolume: 50_000, programmeYears: 5, deliveryTerms: 'EXW' }, UK, { partNumber: p.part, file: p.part, status: 'error' });
    if (r.status !== 'costed' || !r.trace || !r.breakdown) continue;
    const b = r.breakdown;
    const c: Record<Cls, number> = { own: 0, heldCap: 0, matFactor: 0, derived: 0, heldMult: 0, margin: 0 };
    // ── material: the metal / resin at its source; consumables (£ constants × a derived factor); module energy (own tariff)
    const rm = (r.trace.drivers as { rawMaterial?: { materialId?: string; consumablesCostPerPart?: number; energyKwh?: { gas?: number; electricity?: number } } }).rawMaterial ?? {};
    const tariff = lib.energy.find(e => e.id === `energy-${region.toLowerCase()}`) ?? rd.energy;
    const cons = rm.consumablesCostPerPart ?? 0;
    const energy = (rm.energyKwh?.electricity ?? 0) * tariff.electricityPerKwh + (rm.energyKwh?.gas ?? 0) * tariff.gasPerKwh;
    const metal = Math.max(0, b.rawMaterial - cons - energy);
    const ownMat = !!(rm.materialId && book?.materials[rm.materialId]) || /^mat-al-billet-/.test(rm.materialId ?? '');
    if (ownMat) c.own += metal; else { c.matFactor += metal; factorMaterials.set(rm.materialId ?? '?', (factorMaterials.get(rm.materialId ?? '?') ?? 0) + metal); }
    c.derived += cons; c.own += energy;
    // ── process: each machine's rate split into its capital (depreciation + maintenance + finance) and running costs
    for (const o of r.trace.operations) {
      const m = lib.machines.find(x => x.id === o.machineId);
      const bu = m?.buildup;
      const capShare = bu ? (bu.annualDepreciation + bu.maintenance + bu.financeCost)
        / (bu.annualDepreciation + bu.maintenance + bu.financeCost + bu.energy + bu.floorSpace + bu.indirectSupport) : 0;
      const grouped = !!(book && machineGroupOf(book, o.machineId));
      const cap = o.processCost * capShare;
      if (!book) c.heldCap += o.processCost;                       // no book: the whole rate is UK × the machine factor
      else if (grouped) c.own += o.processCost;
      else { c.heldCap += cap; c.own += o.processCost - cap; heldMachines.set(o.machineId, (heldMachines.get(o.machineId) ?? 0) + cap); }
      // labour: the book's categories / grades — Hungary's engineer is the one held category
      const heldEng = region === 'HU' && /engineer/.test(o.labourId ?? '');
      if (heldEng) { c.heldMult += o.labourCost; heldLabour.set(o.labourId, (heldLabour.get(o.labourId) ?? 0) + o.labourCost); }
      else c.own += o.labourCost;
    }
    // what the per-operation lines do not reach (rule-priced services, bench steps outside an op) — derived £ constants
    const opSum = r.trace.operations.reduce((s, o) => s + o.processCost + o.labourCost, 0);
    c.derived += Math.max(0, b.process + b.labour - opSum);
    c.derived += b.tooling;
    c.heldMult += b.overhead + b.packaging + b.logistics;
    c.margin += b.margin;
    const sum = CLASSES.reduce((s, k) => s + c[k], 0);
    for (const k of CLASSES) tot[k] += c[k];
    grand += r.total!;
    parts.push({ part: p.part, commodity: r.commodity, total: r.total, rateBook: r.trace.rateBook, ownPct: Math.round(c.own / sum * 1000) / 10,
      split: Object.fromEntries(CLASSES.map(k => [k, Math.round(c[k] * 10_000) / 10_000])), reconciles: Math.abs(sum - r.total!) < 0.01 });
  }
  const pct = Object.fromEntries(CLASSES.map(k => [k, Math.round(tot[k] / grand * 1000) / 10]));
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, gbp]) => ({ id, gbp: Math.round(gbp * 100) / 100 }));
  out[region] = { book: book ? `${book.region} ${book.asOf}` : 'none (UK × factors)', capitalHeldFactor: book?.machines.capitalHeldFactor ?? null,
    parts: parts.length, totalGbp: Math.round(grand * 100) / 100, sharePct: pct,
    topHeldCapitalMachines: top(heldMachines), topFactorMaterials: top(factorMaterials), heldLabour: top(heldLabour), perPart: parts };
  console.log(`${region}: ${parts.length} parts £${grand.toFixed(2)} — own ${pct.own}% · held machine capital ${pct.heldCap}% · material ×factor ${pct.matFactor}% · derived ${pct.derived}% · held multipliers ${pct.heldMult}% · margin ${pct.margin}%`
    + `${parts.every(x => x.reconciles) ? '' : ' (SOME PARTS DO NOT RECONCILE)'}`);
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
