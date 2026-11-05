/**
 * Service, toolroom and tool £ rates read through the ACTIVE rate book (rates flow R2, Nov 2026) — never the literal.
 *
 * The figures are the built-in Services & toolroom rows (service-rates-data.ts), which a company book may replace: a UK
 * row (no country) in the UK, a row with `country` = CC in that country only.
 *
 * `serviceUk(id)` returns the figure ON ITS UK BASIS, because every site that prices with it applies its country basis
 * after (`inCountry(…, basis)`, `× activeToolroomFactor()`, `× processServiceFactor()` …) exactly as it always did — so
 * the built-in book costs to the penny what it cost before, in every country. In a country whose book has its OWN row
 * for the id, the site's factor must not apply to the country's own figure: the value is returned divided by that
 * factor, so the site's multiplication gives the country's figure back (to float precision; sites round to 4 dp or £1).
 * A UK company row is never read in another country: a country with no own row takes the BUILT-IN UK value.
 */
// The data first: a module that builds a constant table with `serviceView` may be evaluated while this module's other
// imports are still in progress (an import cycle through the rate library), so nothing here reads them at load.
import { SERVICE_RATES } from './service-rates-data.js';
import type { RateLibrary, ServiceRate } from './types.js';
import { activeRatesOrNull } from './rate-context.js';
import { countryFactor, type CountryBasis } from './regional-services.js';
import type { ManufacturingRegion } from './regional-rates.js';

// `var`, not `const`: hoisted, so a table built during an import cycle finds it undefined (and fills it) instead of in
// its temporal dead zone.
// eslint-disable-next-line no-var
var builtInMap: Map<string, ServiceRate> | undefined;

/** The built-in row of an id (throws on an unknown id — a typo must not price at 0). */
export function builtInService(id: string): ServiceRate {
  builtInMap ??= new Map(SERVICE_RATES.map(r => [r.id, r]));
  const r = builtInMap.get(id);
  if (!r) throw new Error(`Service rate '${id}' is not in the Services & toolroom table`);
  return r;
}

/** A row's basis text as the CountryBasis the sites apply ("toolroom", "material:mat-x", "global 0.3 + process"). */
export function parseServiceBasis(text: string): CountryBasis {
  const t = text.trim();
  const share = /^global\s+([0-9.]+)\s*\+\s*(.+)$/.exec(t);
  if (share) return { globalShare: Number(share[1]), rest: parseServiceBasis(share[2]) };
  const mat = /^material:(.+)$/.exec(t);
  if (mat) return { material: mat[1].trim() };
  return t as CountryBasis;
}

/** The basis strings a Services row may carry (the parser checks a company row against this). */
export function serviceBasisError(text: string): string | null {
  const ok = (b: CountryBasis): boolean => typeof b === 'string'
    ? ['toolroom', 'engineer', 'heatTreat', 'inspection', 'process', 'chemical', 'global'].includes(b)
    : 'material' in b ? !!b.material : (b.globalShare >= 0 && b.globalShare <= 1 && ok(b.rest));
  return ok(parseServiceBasis(text)) ? null
    : `'${text}' is not a country basis — one of toolroom, engineer, heatTreat, inspection, process, chemical, global, `
      + '"global 0.3 + process" or "material:<material id>"';
}

// eslint-disable-next-line no-var
var byBook: WeakMap<object, Map<string, ServiceRate>> | undefined;
/** The book's own row for `id` in `region`, if it has one. */
function ownRow(lib: RateLibrary, id: string, region: string): ServiceRate | undefined {
  byBook ??= new WeakMap();
  let m = byBook.get(lib);
  if (!m) {
    m = new Map();
    for (const r of lib.services ?? []) m.set(`${r.id}|${r.country && r.country !== 'UK' ? r.country : 'UK'}`, r);
    byBook.set(lib, m);
  }
  return m.get(`${id}|${region}`);
}

/** The country the active book is for ('UK' for the base book or none). */
function bookRegion(lib: RateLibrary): string {
  return lib.regional?.code ?? 'UK';
}

/**
 * The figure for `id` on its UK basis, as the site multiplies it by its country factor (see the header). The built-in
 * value when no book is active or the book has no row of its own.
 */
export function serviceUk(id: string): number {
  const def = builtInService(id);
  const lib = activeRatesOrNull();
  if (!lib) return def.value;
  const region = bookRegion(lib);
  const own = ownRow(lib, id, region);
  if (!own) return def.value;
  if (region === 'UK') return own.value;
  const f = countryFactor(parseServiceBasis(def.basis), region as ManufacturingRegion);
  return f > 0 ? own.value / f : own.value;
}

/** Where the active book's figure for `id` comes from — for a basis line ("company UK row", "built-in"). */
export function serviceSource(id: string): 'company' | 'built-in' {
  const lib = activeRatesOrNull();
  if (!lib) return 'built-in';
  const own = ownRow(lib, id, bookRegion(lib));
  const def = builtInService(id);
  return own && !(bookRegion(lib) === 'UK' && own.value === def.value && !own.country) ? 'company' : 'built-in';
}

/**
 * An object whose listed keys read `serviceUk(id)` on every access (so a constant table keeps its shape and its sites
 * stay as they were), with any other fields kept as plain values.
 */
export function serviceView<K extends string, X extends object = Record<never, never>>(ids: Record<K, string>, plain?: X):
  Readonly<Record<K, number>> & X {
  const o = { ...(plain ?? {}) } as Record<string, unknown>;
  for (const [k, id] of Object.entries(ids) as Array<[K, string]>) {
    builtInService(id);   // an unknown id fails at load, not at the first costing
    Object.defineProperty(o, k, { get: () => serviceUk(id), enumerable: true });
  }
  return o as Readonly<Record<K, number>> & X;
}
