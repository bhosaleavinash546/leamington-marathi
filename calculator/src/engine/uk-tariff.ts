/**
 * The UK library rates that module fallbacks need, read from the library — never
 * copied as literals. Five modules once fell back to £0.23 or £0.20/kWh after the
 * library tariff had moved; a copied number cannot follow a rate refresh.
 */
import { DEFAULT_RATE_LIBRARY } from './rate-library.js';

/** UK industrial electricity, £/kWh — the library's `energy-uk`. */
export function ukElectricityPerKwh(): number {
  return DEFAULT_RATE_LIBRARY.energy.find(e => e.id === 'energy-uk')!.electricityPerKwh;
}

/** A library machine's £/hr, by id. */
export function libraryMachineRate(id: string): number {
  const m = DEFAULT_RATE_LIBRARY.machines.find(x => x.id === id);
  if (!m) throw new Error(`machine ${id} is not in the rate library`);
  return m.computedRatePerHr;
}
