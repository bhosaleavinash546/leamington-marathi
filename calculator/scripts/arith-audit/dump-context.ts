/**
 * Arithmetic audit — what a dump was costed AT (7-country review, 3 Nov 2026).
 *
 * The shadow models were written for the UK at 50,000 a year, a 5-year programme, delivered (DAP). A dump of
 * `scripts/arith-audit/dump.ts` now states its own `region`, `annual`, `terms` (and may state `programmeYears`);
 * this reads them and builds the rate BOOK of that region exactly as the headless chain does
 * (`server/services/bulk-run.ts::regionalBook`: `recomputeMachineRates` of the base book, then
 * `buildRegionalLibrary` for any region but the UK). That is data — £/h, £/kg, the tariff, the book's toolroom
 * factor — never the costing functions the models check; each model still does its own arithmetic.
 *
 * Shop defaults are restated here from `REGIONAL_DATA` (regional-rates.ts `regionalShopDefaults`): overhead
 * = 12 % × the country's overhead multiplier (rounded to a whole %), margin 8 %, and ex-works means NO freight.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { buildRegionalLibrary, REGIONAL_DATA, type ManufacturingRegion } from '../../src/engine/regional-rates.js';
import { TOOLROOM_RATES_UK } from '../../src/engine/toolmaking.js';
import { countryFactor, type CountryBasis } from '../../src/engine/regional-services.js';
import type { RateLibrary } from '../../src/engine/types.js';

export interface DumpContext {
  region: ManufacturingRegion;
  annual: number;
  years: number;
  amort: number;
  terms: 'DAP' | 'EXW';
  book: RateLibrary;
  /** The UK book, for a figure the product states on a UK basis and scales (its basis prints the factor). */
  ukBook: RateLibrary;
  machineRate(id: string): number;
  labourRate(id: string): number;
  material(id: string): RateLibrary['materials'][number];
  /** £/kWh — the region's book carries one tariff. */
  tariff: number;
  /** The book's toolroom factor (set by buildRegionalLibrary; 1 in the UK). */
  toolroomFactor: number;
  /** UK toolroom £/h × the factor, to the penny (toolmaking.ts TOOLROOM_RATES). */
  toolroom: { [K in keyof typeof TOOLROOM_RATES_UK]: number };
  /** The factor a UK-basis £ constant takes in this region (the book's factor table; 1 in the UK). */
  factor(basis: CountryBasis): number;
  overheadPct: number;
  marginPct: number;
}

/** Read the costing conditions off every part dump in `dumpDir` (they must agree) and build that region's book. */
export function dumpContext(dumpDir: string): DumpContext {
  const seen = new Set<string>();
  let region = 'UK', annual = 50_000, years = 5, terms: 'DAP' | 'EXW' = 'DAP';
  for (const f of readdirSync(dumpDir)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const d = JSON.parse(readFileSync(join(dumpDir, f), 'utf8'));
    if (d.status !== 'costed') continue;
    region = d.region ?? 'UK';
    annual = Number(d.annual ?? 50_000);
    years = Number(d.programmeYears ?? 5);
    terms = d.terms === 'EXW' ? 'EXW' : 'DAP';
    seen.add(`${region}|${annual}|${years}|${terms}`);
  }
  if (seen.size > 1) throw new Error(`dump ${dumpDir} mixes costing conditions: ${[...seen].join(', ')}`);
  const r = region as ManufacturingRegion;
  if (!REGIONAL_DATA[r]) throw new Error(`unknown region ${region}`);
  const ukBook = recomputeMachineRates(recomputeMachineRates(DEFAULT_RATE_LIBRARY));
  const book = r === 'UK' ? ukBook : buildRegionalLibrary(recomputeMachineRates(recomputeMachineRates(DEFAULT_RATE_LIBRARY)), r);
  const tf = r === 'UK' ? 1 : (book.regional?.toolroomFactor ?? 1);
  const toolroom = Object.fromEntries(Object.entries(TOOLROOM_RATES_UK)
    .map(([k, v]) => [k, Math.round(v * tf * 100) / 100])) as DumpContext['toolroom'];
  const find = <T extends { id: string }>(list: T[], id: string, what: string) => {
    const x = list.find(e => e.id === id);
    if (!x) throw new Error(`${what} ${id} not in the ${region} book`);
    return x;
  };
  return {
    region: r, annual, years, amort: annual * years, terms, book, ukBook,
    machineRate: id => find(book.machines, id, 'machine').computedRatePerHr,
    labourRate: id => find(book.labour, id, 'labour').fullyLoadedRatePerHr,
    material: id => find(book.materials, id, 'material'),
    tariff: book.energy[0].electricityPerKwh,
    toolroomFactor: tf,
    toolroom,
    factor: (basis: CountryBasis) => {
      if (r === 'UK') return 1;
      if (typeof basis === 'object' && 'material' in basis) {
        const uk = ukBook.materials.find(m => m.id === basis.material)?.pricePerKg;
        const here = book.materials.find(m => m.id === basis.material)?.pricePerKg;
        return uk && here ? Math.round(here / uk * 10_000) / 10_000 : 1;
      }
      return countryFactor(basis, r);
    },
    overheadPct: Math.round(12 * REGIONAL_DATA[r].overheadMultiplier) / 100,
    marginPct: 0.08,
  };
}

/** A one-line header each model prints, so a log says what it checked against. */
export const contextLine = (c: DumpContext) =>
  `costed in ${c.region} at ${c.annual.toLocaleString('en-GB')}/yr × ${c.years} yr, ${c.terms}; toolroom factor ${c.toolroomFactor}, overhead ${Math.round(c.overheadPct * 100)} %`;
