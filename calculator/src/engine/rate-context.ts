/**
 * The ACTIVE rate book — the one a costing is being made in.
 *
 * Most rates reach the cost through `computeUniversalStack(input, library)`, which
 * is handed the country's library. But a few are used one step earlier, to work
 * out a value that is then passed in as £:
 * - the toolroom £/hr behind every mould, die and pattern build-up;
 * - the machine and labour £/hr behind a few rule-priced items (shot blast, the
 *   stamping-vs-laser route price, CNC programming);
 * - the electricity tariff a module falls back to.
 * Those read the library through this module. Before it, they read the UK book
 * directly, so a China costing carried UK-built tools and UK-priced blast.
 *
 * Synchronous scope: `withRates(lib, fn)` sets the book for `fn` and restores it
 * after — rule evaluation and costing are synchronous, so nothing interleaves.
 * The screen sets it whenever its library changes (`setActiveRates`). Absent,
 * it is the built-in UK library, so nothing that never names a country moves.
 */
import type { RateLibrary } from './types.js';
import { DEFAULT_RATE_LIBRARY } from './rate-library.js';

let active: RateLibrary | null = null;

/** The rate book in force: the scoped or screen-set one, else the UK library. */
export function activeRates(): RateLibrary {
  return active ?? DEFAULT_RATE_LIBRARY;
}

/** Set the rate book for everything that follows (the screen, on a library change). */
export function setActiveRates(lib: RateLibrary | null): void {
  active = lib;
}

/** Run `fn` with `lib` as the rate book, then restore the previous one. */
export function withRates<T>(lib: RateLibrary | null | undefined, fn: () => T): T {
  if (!lib) return fn();
  const prev = active;
  active = lib;
  try { return fn(); } finally { active = prev; }
}

/** Electricity £/kWh of the active book (its first tariff — a regional library has exactly one). */
export function activeElectricityPerKwh(): number {
  const lib = activeRates();
  return (lib.energy[0] ?? DEFAULT_RATE_LIBRARY.energy[0]).electricityPerKwh;
}

/** A machine's £/hr in the active book. */
export function activeMachineRate(id: string): number {
  const m = activeRates().machines.find(x => x.id === id) ?? DEFAULT_RATE_LIBRARY.machines.find(x => x.id === id);
  if (!m) throw new Error(`machine ${id} is not in the rate library`);
  return m.computedRatePerHr;
}

/** A labour grade's £/hr in the active book. */
export function activeLabourRate(id: string): number {
  const l = activeRates().labour.find(x => x.id === id) ?? DEFAULT_RATE_LIBRARY.labour.find(x => x.id === id);
  if (!l) throw new Error(`labour ${id} is not in the rate library`);
  return l.fullyLoadedRatePerHr;
}

/**
 * Toolroom £/hr factor vs the UK for the active book — 1 for the UK or any
 * library that does not say which country it is. Set by `buildRegionalLibrary`.
 */
export function activeToolroomFactor(): number {
  return activeRates().regional?.toolroomFactor ?? 1;
}
