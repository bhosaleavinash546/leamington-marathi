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
import { fingerprintRateLibrary } from '../utils/rate-library-fingerprint.js';

/** A region code from a code or a name; 'UK' when absent or unknown. */
export function regionOf(raw: string | undefined | null): ManufacturingRegion {
  return (raw && resolveManufacturingRegion(raw)) || 'UK';
}

/** The active book rebuilt for `region` (the active book itself for the UK). */
export function rateBookForRegion(region: ManufacturingRegion | undefined): RateLibrary {
  const base = recomputeMachineRates(resolveActiveRateBook());
  return !region || region === 'UK' ? base : buildRegionalLibrary(base, region);
}

/** Country-book fingerprints by (resolved base fingerprint, region): the rebuild is a pure function of the two. */
const _regionalPrint = new Map<string, string>();

/**
 * The fingerprint of the book a server costing in `region` resolves — after the company merge, the cell overrides and
 * the country rebuild (rates flow review R1). Every cache whose result depends on rates keys on `key`: the /analyze
 * cache keyed on `version|lastModified` (a cell override left it unchanged) and /reanalyze carried no book at all, so an
 * upload, override or source switch replayed the old book's rule £ for 30 days. `base` is the UK-basis resolved book's
 * fingerprint — the one `/api/rate-library/versions/:id` reproduces and the screen stamp prints.
 */
export function rateBookPrint(region: ManufacturingRegion | undefined): { base: string; regional: string; key: string } {
  const resolved = resolveActiveRateBook();
  const base = fingerprintRateLibrary(resolved);
  if (!region || region === 'UK') return { base, regional: base, key: base };
  const k = `${base}|${region}`;
  let regional = _regionalPrint.get(k);
  if (!regional) {
    regional = fingerprintRateLibrary(buildRegionalLibrary(recomputeMachineRates(resolved), region));
    if (_regionalPrint.size > 400) _regionalPrint.clear();
    _regionalPrint.set(k, regional);
  }
  return { base, regional, key: `${base}:${regional}` };
}

export { regionalShopDefaults };
