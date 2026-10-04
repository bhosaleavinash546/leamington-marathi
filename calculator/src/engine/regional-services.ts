/**
 * Bought-in SERVICES priced as £ constants on a UK basis — casting and forging
 * heat treatment (£/kg) and NDT (£/part) — moved to the country being costed.
 *
 * The live India run of the PRCR002 aluminium housing (country-rates review, Oct
 * 2026) showed the T6 heat treat at the UK's £1.10/kg in India: these constants
 * were applied in every country. They keep their UK value as the UK basis and are
 * scaled by the country's own economics:
 *  - heat treatment by the heat-treat model's country ratio (gear-heat-treat-rate.ts,
 *    built from the same country table: energy, furnace labour, capital, overhead)
 *    for a batch furnace + quench + temper — the nearest process in cost structure;
 *  - NDT by ½ the inspector-labour ratio + ½ the machine-rate multiplier (an
 *    inspector at an X-ray / CT cell).
 * The country is the active rate book's (rate-context.ts); 1 in the UK.
 */
import { activeRates } from './rate-context.js';
import { computeHeatTreatRate } from './gear-heat-treat-rate.js';
import { REGIONAL_DATA, type ManufacturingRegion } from './regional-rates.js';

function activeRegion(): ManufacturingRegion {
  const code = activeRates().regional?.code as ManufacturingRegion | undefined;
  return code && REGIONAL_DATA[code] ? code : 'UK';
}

/** Heat-treatment service factor vs the UK for the active country. */
export function heatTreatServiceFactor(region: ManufacturingRegion = activeRegion()): number {
  if (region === 'UK') return 1;
  const uk = computeHeatTreatRate('quench_temper', 'UK').ratePerKg;
  return Math.round(computeHeatTreatRate('quench_temper', region).ratePerKg / uk * 10_000) / 10_000;
}

/** NDT service factor vs the UK for the active country. */
export function ndtServiceFactor(region: ManufacturingRegion = activeRegion()): number {
  if (region === 'UK') return 1;
  const r = REGIONAL_DATA[region];
  return Math.round((0.5 * r.labour.inspector / REGIONAL_DATA.UK.labour.inspector + 0.5 * r.machineRateMultiplier) * 10_000) / 10_000;
}
