/**
 * £ figures held as constants on a UK basis — services bought in (heat treatment,
 * NDT, toll grinding), tool and NRE prices, consumables — moved to the country
 * being costed.
 *
 * WHY. Labour, machine-hours, materials and energy reach the cost through the
 * country's rate book. A £ constant does not: it was the UK's figure in every
 * country. The live India run of the PRCR002 housing (Oct 2026) found the T6 heat
 * treat at the UK's £1.10/kg; the all-commodity audit that followed ("twice the UK"
 * probe — a test country with every rate at 2× the UK must cost exactly 2×) found
 * 25 more: aluminium-extrusion dies, gear heat treat and NRE, laminate prices, the
 * stamping die's design hours, casting cores, PCB adders, and the forms' defaults.
 *
 * ONE RULE. Every £ constant states its COUNTRY BASIS — what its cost is made of —
 * and is multiplied by `countryFactor(basis)`: 1 in the UK, the country's own
 * economics elsewhere. A traded good (tool steel, cutting inserts, electronic
 * components, hot-runner systems) is `'global'` and says so. The UK is unchanged
 * by construction.
 *
 * The factors are derived from the country table (REGIONAL_DATA), not from local
 * supplier quotes — a quote typed into the form replaces any of them.
 */
import { activeRates } from './rate-context.js';
import { computeHeatTreatRate } from './gear-heat-treat-rate.js';
import { REGIONAL_DATA, SURFACE_REGIONAL_FACTORS, toolroomFactorFor, type ManufacturingRegion } from './regional-rates.js';
import { DEFAULT_RATE_LIBRARY } from './rate-library.js';

/** The country of the active rate book (rate-context.ts); the UK when it names none. */
export function activeRegion(): ManufacturingRegion {
  const code = activeRates().regional?.code as ManufacturingRegion | undefined;
  return code && REGIONAL_DATA[code] ? code : 'UK';
}

/** Heat-treatment service factor vs the UK: the heat-treat model's country ratio for a
 *  batch furnace + quench + temper (energy, furnace labour, capital, overhead). */
export function heatTreatServiceFactor(region: ManufacturingRegion = activeRegion()): number {
  if (region === 'UK') return 1;
  const uk = computeHeatTreatRate('quench_temper', 'UK').ratePerKg;
  return Math.round(computeHeatTreatRate('quench_temper', region).ratePerKg / uk * 10_000) / 10_000;
}

/** NDT / NDI / test service factor vs the UK: ½ inspector-pay ratio + ½ machine multiplier. */
export function ndtServiceFactor(region: ManufacturingRegion = activeRegion()): number {
  if (region === 'UK') return 1;
  const r = REGIONAL_DATA[region];
  return Math.round((0.5 * r.labour.inspector / REGIONAL_DATA.UK.labour.inspector + 0.5 * r.machineRateMultiplier) * 10_000) / 10_000;
}

/** A bought-in PROCESS service (toll grinding, slug prep, laser weld, coating, rework):
 *  ½ semi-skilled-pay ratio + ½ machine multiplier. */
export function processServiceFactor(region: ManufacturingRegion = activeRegion()): number {
  if (region === 'UK') return 1;
  const r = REGIONAL_DATA[region];
  return Math.round((0.5 * r.labour.semiskilled / REGIONAL_DATA.UK.labour.semiskilled + 0.5 * r.machineRateMultiplier) * 10_000) / 10_000;
}

/** Engineering time (CNC programming, PPAP, nesting, design): the engineer-pay ratio. */
export function engineerFactor(region: ManufacturingRegion = activeRegion()): number {
  if (region === 'UK') return 1;
  return Math.round(REGIONAL_DATA[region].labour.engineer / REGIONAL_DATA.UK.labour.engineer * 10_000) / 10_000;
}

/** What a £ constant's cost is made of. */
export type CountryBasis =
  /** Tools, dies, moulds, fixtures, patterns: toolroom labour + machining (toolroomFactorFor). */
  | 'toolroom'
  /** Programming, PPAP, design hours. */
  | 'engineer'
  /** Heat-treatment and nitriding services. */
  | 'heatTreat'
  /** NDT, NDI, electrical test, inspection. */
  | 'inspection'
  /** Bought-in process services and process-dominated consumables. */
  | 'process'
  /** Process chemicals and paints (the surface-finishing chemical factor). */
  | 'chemical'
  /** A traded good priced the same everywhere — stated, not scaled. */
  | 'global'
  /** Priced as this library material: the active book's £/kg ÷ the UK's. */
  | { material: string }
  /** `globalShare` of the £ is a traded good (tool steel, sand); the rest follows `rest`. */
  | { globalShare: number; rest: CountryBasis };

/** The factor a UK-basis £ figure is multiplied by in `region` (1 in the UK). */
export function countryFactor(basis: CountryBasis, region: ManufacturingRegion = activeRegion()): number {
  if (region === 'UK' || !REGIONAL_DATA[region]) return 1;
  if (typeof basis === 'object') {
    if ('material' in basis) {
      const uk = DEFAULT_RATE_LIBRARY.materials.find(m => m.id === basis.material)?.pricePerKg;
      const here = activeRates().materials.find(m => m.id === basis.material)?.pricePerKg;
      return uk && here ? Math.round(here / uk * 10_000) / 10_000 : 1;
    }
    const g = Math.min(1, Math.max(0, basis.globalShare));
    return Math.round((g + (1 - g) * countryFactor(basis.rest, region)) * 10_000) / 10_000;
  }
  switch (basis) {
    case 'toolroom': return toolroomFactorFor(region);
    case 'engineer': return engineerFactor(region);
    case 'heatTreat': return heatTreatServiceFactor(region);
    case 'inspection': return ndtServiceFactor(region);
    case 'process': return processServiceFactor(region);
    case 'chemical': return SURFACE_REGIONAL_FACTORS[region]?.chemical ?? 1;
    case 'global': return 1;
  }
}

/** A UK-basis £ figure in the active country, rounded to 4 dp. */
export function inCountry(gbpUK: number, basis: CountryBasis, region: ManufacturingRegion = activeRegion()): number {
  return Math.round(gbpUK * countryFactor(basis, region) * 10_000) / 10_000;
}

/** "× India process-service factor 0.4512" — for a basis string; empty in the UK. */
export function countryNote(basis: CountryBasis, region: ManufacturingRegion = activeRegion()): string {
  const f = countryFactor(basis, region);
  if (region === 'UK' || f === 1) return '';
  const label = typeof basis === 'object'
    ? ('material' in basis ? `${basis.material} price ratio` : `${Math.round(basis.globalShare * 100)}% traded + ${typeof basis.rest === 'string' ? basis.rest : 'mixed'}`)
    : basis === 'process' ? 'process-service' : basis === 'heatTreat' ? 'heat-treat' : basis;
  return ` × ${REGIONAL_DATA[region].name} ${label} factor ${f}`;
}
