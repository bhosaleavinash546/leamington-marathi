/**
 * The energy tariff a rate book prices kWh at — picked BY ID, never by position (rates flow review R1, Nov 2026).
 *
 * The UK book is `energy-uk`; a country book built by `buildRegionalLibrary` carries exactly its own `energy-<cc>`.
 * Taking `energy[0]` priced every UK kWh (melt, heat treat, extrusion, module fallbacks) at whichever row an uploaded
 * sheet happened to list first — `energy-cn` on a sheet sorted by id.
 */
import type { EnergyRate, RateLibrary } from './types.js';

/** The id of the tariff a book prices its own kWh at: `energy-<cc>` for a country book, `energy-uk` otherwise. */
export function bookEnergyId(lib: Pick<RateLibrary, 'regional'>): string {
  const code = lib.regional?.code;
  return `energy-${code ? code.toLowerCase() : 'uk'}`;
}

/** The book's own tariff. Throws when it is missing — the stack throws on a missing machine too; never a silent other row. */
export function bookEnergyTariff(lib: Pick<RateLibrary, 'regional' | 'energy'>): EnergyRate {
  const id = bookEnergyId(lib);
  const t = lib.energy.find(e => e.id === id);
  if (!t) throw new Error(`Energy tariff '${id}' not found in rate library`);
  return t;
}
