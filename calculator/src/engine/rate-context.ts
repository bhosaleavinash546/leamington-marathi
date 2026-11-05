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
import { bookEnergyTariff } from './book-tariff.js';

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

/** Electricity £/kWh of the active book — its own tariff by id (`energy-uk` / `energy-<cc>`), never the first row. */
export function activeElectricityPerKwh(): number {
  return bookEnergyTariff(activeRates()).electricityPerKwh;
}

/**
 * A machine's £/hr in the active book. A missing id throws exactly as the stack does (core.ts) — it used to fall back
 * silently to the built-in UK row, so one costing priced a rule item at a UK rate the stack then refused (R1, Nov 2026).
 * A company book is merged by id over the built-in, so a built-in id cannot go missing from it.
 */
export function activeMachineRate(id: string): number {
  const m = activeRates().machines.find(x => x.id === id);
  if (!m) throw new Error(`Machine '${id}' not found in rate library`);
  return m.computedRatePerHr;
}

/** A labour grade's £/hr in the active book — a missing id throws, as the stack does (no silent UK fallback). */
export function activeLabourRate(id: string): number {
  const l = activeRates().labour.find(x => x.id === id);
  if (!l) throw new Error(`Labour rate '${id}' not found in rate library`);
  return l.fullyLoadedRatePerHr;
}

/**
 * Toolroom £/hr factor vs the UK for the active book — 1 for the UK or any
 * library that does not say which country it is. Set by `buildRegionalLibrary`.
 */
export function activeToolroomFactor(): number {
  return activeRates().regional?.toolroomFactor ?? 1;
}

/** The active book's country name for a basis line ("China"), "UK" for the UK book or one that names no country. */
export function activeCountryName(): string {
  const r = activeRates().regional;
  return r && r.code !== 'UK' ? (r.name || r.code) : 'UK';
}

/**
 * A country factor as a basis line prints it, ALWAYS — "China toolroom 0.3417", "UK toolroom 1.00" (report standard
 * round, Nov 2026: tool prices printed "£6,000 × 1 steel" beside £2,050 — the toolroom factor applied silently). It sits
 * inside a chain with no bracket between it and the "=", so `scripts/arith-audit/basis-check.py` evaluates the chain.
 */
export function factorText(kind: string, factor: number): string {
  const name = activeCountryName();
  return `${name} ${kind} ${factor === 1 ? '1.00' : String(factor)}`;
}

/**
 * A £ figure as a basis line prints it (live run, 4 Nov 2026): to the penny when the penny IS the figure (a UK book rate,
 * £28.03/h, £4.00/h), else to 4 dp — a country book's rate held in £ (China's inspector £3.4707/h). A report in another
 * currency converts the printed figure, so a rate rounded to the penny printed the wrong local rate ("bench ¥11.99/h", the
 * costing held ¥11.97) and a station line that did not re-add.
 */
export function gbpFigure(v: number): string {
  return Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? v.toFixed(2) : v.toFixed(4);
}
