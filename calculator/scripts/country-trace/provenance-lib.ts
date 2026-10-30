/**
 * Country rate provenance — where every £ of a costing's rates comes from (the per-£ trace, 30 Oct 2026).
 * `provenanceFor(region)` costs every part of the real-parts baseline headless (`costMeasuredPart`, the product's own
 * chain) ex-works at 50,000 a year over 5 years and splits each £ by its rate's source:
 *
 *   own        the country's own sourced rate — a book material, its labour, its tariff, the machine's running costs
 *              under the country's operating model, a sourced country capex group;
 *   parSourced at par (×1) on a SOURCED UK / European-market price — a UK-book capex group or a UK-book material
 *              (Hungary: the same machine / material on the same market);
 *   heldCap    machine capital with no sourced price: the UK book's held build-up × a factor (or at par);
 *   matFactor  a material with no sourced price: the UK book's × the regional factor (or at par on a held UK price);
 *   derived    £ constants moved by a country factor (tooling, consumables, bought-in services) — derived from wages and
 *              machine rates, or a sourced service ratio where the book holds one;
 *   heldMult   overhead % and packaging × a held, unsourced country multiplier;
 *   margin     the supplier margin (a commercial assumption).
 * It recomputes nothing the costing does — it reads the costing's own trace and the book it priced in.
 */
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { buildRegionalLibrary, REGIONAL_DATA, type ManufacturingRegion } from '../../src/engine/regional-rates.js';
import { COUNTRY_BOOKS, machineGroupOf } from '../../src/engine/country-books.js';

export type Cls = 'own' | 'parSourced' | 'heldCap' | 'matFactor' | 'derived' | 'heldMult' | 'margin';
export const CLASSES: Cls[] = ['own', 'parSourced', 'heldCap', 'matFactor', 'derived', 'heldMult', 'margin'];
const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
/** A UK-book rate rebuilt from evidence (its note leads with the book), not a held benchmark. */
const ukSourcedMachine = (id: string) => /^UK book \d{4}-\d{2}-\d{2}[^:]*: machine only[\s\S]*Capex £/.test(UK.machines.find(m => m.id === id)?.sourceNote ?? '');
const ukSourcedMaterial = (id: string) => /^UK book \d{4}-\d{2}-\d{2}:/.test(UK.materials.find(m => m.id === id)?.sourceNote ?? '');

export interface PartProvenance { part: string; commodity?: string; total: number; ownPct: number; sourcedPct: number; split: Record<Cls, number>; reconciles: boolean }
export interface RegionProvenance {
  book: string; capitalHeldFactor: number | null; parts: number; totalGbp: number; sharePct: Record<Cls, number>;
  medianPartOwnPct: number; medianPartSourcedPct: number;
  topHeldCapitalMachines: Array<{ id: string; gbp: number }>; topFactorMaterials: Array<{ id: string; gbp: number }>;
  heldLabour: Array<{ id: string; gbp: number }>; perPart: PartProvenance[];
}

export async function provenanceFor(region: ManufacturingRegion, only?: string[]): Promise<RegionProvenance> {
  const baseline = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as
    { part: string; answers: Record<string, string>; geometry: never; outcome: { commodity?: string } }[];
  const book = COUNTRY_BOOKS[region];
  const lib = buildRegionalLibrary(UK, region);
  const rd = REGIONAL_DATA[region];
  const atPar = (book?.machines.capitalHeldFactor ?? 0) === 1;
  const tot = Object.fromEntries(CLASSES.map(k => [k, 0])) as Record<Cls, number>;
  const heldMachines = new Map<string, number>(), factorMaterials = new Map<string, number>(), heldLabour = new Map<string, number>();
  const parts: PartProvenance[] = [];
  let grand = 0;
  for (const p of baseline) {
    if (only && !only.includes(p.part)) continue;
    const r = await costMeasuredPart(p.geometry, p.part, { partNumber: p.part, file: p.part, annualVolume: 50_000,
      ...(p.outcome.commodity ? { commodity: p.outcome.commodity } : {}) },
    p.answers, region, { annualVolume: 50_000, programmeYears: 5, deliveryTerms: 'EXW' }, UK, { partNumber: p.part, file: p.part, status: 'error' });
    if (r.status !== 'costed' || !r.trace || !r.breakdown) continue;
    const b = r.breakdown;
    const c = Object.fromEntries(CLASSES.map(k => [k, 0])) as Record<Cls, number>;
    // material: the metal / resin at its source; consumables (£ constants × a factor); module energy (own tariff)
    const rm = (r.trace.drivers as { rawMaterial?: { materialId?: string; consumablesCostPerPart?: number; energyKwh?: { gas?: number; electricity?: number } } }).rawMaterial ?? {};
    const tariff = lib.energy.find(e => e.id === `energy-${region.toLowerCase()}`) ?? rd.energy;
    const cons = rm.consumablesCostPerPart ?? 0;
    const energy = (rm.energyKwh?.electricity ?? 0) * tariff.electricityPerKwh + (rm.energyKwh?.gas ?? 0) * tariff.gasPerKwh;
    const metal = Math.max(0, b.rawMaterial - cons - energy);
    const id = rm.materialId ?? '?';
    const ownMat = !!(book?.materials[id]) || /^mat-al-billet-/.test(id);
    const libMat = lib.materials.find(m => m.id === id);
    const parMat = !ownMat && !!libMat && /at par \(no country factor\)/.test(libMat.sourceNote) && ukSourcedMaterial(id);
    if (ownMat) c.own += metal; else if (parMat) c.parSourced += metal; else { c.matFactor += metal; factorMaterials.set(id, (factorMaterials.get(id) ?? 0) + metal); }
    c.derived += cons; c.own += energy;
    // process: each machine's rate split into its capital (depreciation + maintenance + finance) and running costs
    for (const o of r.trace.operations) {
      const m = lib.machines.find(x => x.id === o.machineId);
      const bu = m?.buildup;
      const capShare = bu ? (bu.annualDepreciation + bu.maintenance + bu.financeCost)
        / (bu.annualDepreciation + bu.maintenance + bu.financeCost + bu.energy + bu.floorSpace + bu.indirectSupport) : 0;
      const grouped = !!(book && machineGroupOf(book, o.machineId));
      const cap = o.processCost * capShare;
      if (!book) c.heldCap += o.processCost;
      else if (grouped) c.own += o.processCost;
      else if (atPar && ukSourcedMachine(o.machineId)) { c.parSourced += cap; c.own += o.processCost - cap; }
      else { c.heldCap += cap; c.own += o.processCost - cap; heldMachines.set(o.machineId, (heldMachines.get(o.machineId) ?? 0) + cap); }
      const heldEng = region === 'HU' && /engineer/.test(o.labourId ?? '') && !book?.labourGrades?.engineer;
      if (heldEng) { c.heldMult += o.labourCost; heldLabour.set(o.labourId, (heldLabour.get(o.labourId) ?? 0) + o.labourCost); }
      else c.own += o.labourCost;
    }
    const opSum = r.trace.operations.reduce((s, o) => s + o.processCost + o.labourCost, 0);
    c.derived += Math.max(0, b.process + b.labour - opSum);
    c.derived += b.tooling;
    c.heldMult += b.overhead + b.packaging + b.logistics;
    c.margin += b.margin;
    const sum = CLASSES.reduce((s, k) => s + c[k], 0);
    for (const k of CLASSES) tot[k] += c[k];
    grand += r.total!;
    parts.push({ part: p.part, commodity: r.commodity, total: r.total!, ownPct: Math.round(c.own / sum * 1000) / 10,
      sourcedPct: Math.round((c.own + c.parSourced) / sum * 1000) / 10,
      split: Object.fromEntries(CLASSES.map(k => [k, Math.round(c[k] * 10_000) / 10_000])) as Record<Cls, number>, reconciles: Math.abs(sum - r.total!) < 0.01 });
  }
  const pct = Object.fromEntries(CLASSES.map(k => [k, Math.round(tot[k] / (grand || 1) * 1000) / 10])) as Record<Cls, number>;
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, gbp]) => ({ id, gbp: Math.round(gbp * 100) / 100 }));
  return { book: book ? `${book.region} ${book.asOf}` : 'none (UK × factors)', capitalHeldFactor: book?.machines.capitalHeldFactor ?? null,
    parts: parts.length, totalGbp: Math.round(grand * 100) / 100, sharePct: pct,
    medianPartOwnPct: med(parts.map(x => x.ownPct)), medianPartSourcedPct: med(parts.map(x => x.sourcedPct)),
    topHeldCapitalMachines: top(heldMachines), topFactorMaterials: top(factorMaterials), heldLabour: top(heldLabour), perPart: parts };
}
