/**
 * Rates module fallbacks need, read from the ACTIVE rate book (rate-context.ts) —
 * never copied as literals, and never the UK book when another country is being
 * costed. Five modules once fell back to £0.23 or £0.20/kWh after the library
 * tariff had moved; later the fallback read the UK tariff in every country
 * (country-rates review, Oct 2026). The file keeps its name for its importers.
 */
import { activeElectricityPerKwh, activeMachineRate } from './rate-context.js';

/** Electricity £/kWh of the country being costed (UK when none is set). */
export function tariffElectricityPerKwh(): number {
  return activeElectricityPerKwh();
}

/** A library machine's £/hr, by id, in the country being costed. */
export function libraryMachineRate(id: string): number {
  return activeMachineRate(id);
}
