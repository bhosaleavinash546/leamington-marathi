/**
 * The rate book a server-side costing runs in: the deployment's ACTIVE book
 * (company rates when an admin loaded them, else built-in) rebuilt for the
 * requested country — the same rebuild the screen and the bulk path make.
 * One function, so the CAD route, the AI agent and anything after them cannot
 * each pick their own (the agent used the built-in UK book whatever the region).
 */
import { recomputeMachineRates } from '../../src/engine/rate-library.js';
import { buildRegionalLibrary, resolveManufacturingRegion, regionalShopDefaults, type ManufacturingRegion } from '../../src/engine/regional-rates.js';
import type { RateLibrary } from '../../src/engine/types.js';
import { resolveActiveRateBook } from '../routes/rate-library.js';

/** A region code from a code or a name; 'UK' when absent or unknown. */
export function regionOf(raw: string | undefined | null): ManufacturingRegion {
  return (raw && resolveManufacturingRegion(raw)) || 'UK';
}

/** The active book rebuilt for `region` (the active book itself for the UK). */
export function rateBookForRegion(region: ManufacturingRegion | undefined): RateLibrary {
  const base = recomputeMachineRates(resolveActiveRateBook());
  return !region || region === 'UK' ? base : buildRegionalLibrary(base, region);
}

export { regionalShopDefaults };
