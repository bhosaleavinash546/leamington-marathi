/**
 * Rate-library resolution — how the built-in defaults, an uploaded company
 * library, and row-level overrides combine into the ONE library the calculators
 * actually use. Pure and deterministic, so it unit-tests cleanly.
 *
 * Precedence (lowest → highest):
 *   1. Built-in defaults        (shipped with the tool)
 *   2. Company library          (admin-uploaded full library, when source = 'company')
 *   3. Row overrides            (admin edits to individual cells, always applied on top)
 */

import { createHash } from 'node:crypto';
import type { RateLibrary, MachineRateBuildup } from './types.js';

export type RateTable = 'materials' | 'machines' | 'labour' | 'energy' | 'fx' | 'overheadDefaults';
export type RateSource = 'builtin' | 'company';

export interface RateOverride {
  table: RateTable;
  id: string;      // row id being overridden
  field: string;   // field name, dot-path for nested (e.g. 'buildup.energy')
  value: number;
}

/** Recompute a machine's £/hr from its cost build-up (single source of truth). */
export function computeMachineRatePerHr(b: MachineRateBuildup): number {
  const totalAnnual = b.annualDepreciation + b.maintenance + b.energy + b.floorSpace + b.indirectSupport + b.financeCost;
  const effectiveHrs = Math.max(1, b.annualAvailableHours * b.machineUtilization);
  return totalAnnual / effectiveHrs;
}

/** Fields that must never appear in an override path — guards against prototype pollution. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** Derived fields that are recomputed and so must not be overridden directly. */
const DERIVED_FIELDS = new Set(['computedRatePerHr']);

function setPath(obj: Record<string, unknown>, path: string, value: number): void {
  const parts = path.split('.');
  if (parts.some(p => FORBIDDEN_KEYS.has(p))) return; // reject __proto__/prototype/constructor
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!Object.prototype.hasOwnProperty.call(cur, k) || typeof cur[k] !== 'object' || cur[k] === null) return;
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Apply row-level overrides to a library (returns a new library; input untouched).
 * When a machine's build-up is changed, its £/hr is recomputed so the two stay
 * consistent. Overrides that target an unknown row/field are ignored, not fatal.
 */
export function applyRateOverrides(lib: RateLibrary, overrides: RateOverride[]): RateLibrary {
  if (!overrides.length) return lib;
  const next: RateLibrary = JSON.parse(JSON.stringify(lib));
  const touchedMachines = new Set<string>();

  for (const o of overrides) {
    const rows = next[o.table] as unknown as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(rows)) continue;
    const row = rows.find(r => r.id === o.id);
    if (!row) continue;
    if (!Number.isFinite(o.value) || o.value < 0) continue;           // no NaN/negatives
    if (DERIVED_FIELDS.has(o.field.split('.').pop() ?? '')) continue; // don't override recomputed fields
    setPath(row, o.field, o.value);
    if (o.table === 'machines') touchedMachines.add(o.id);
  }

  // Keep computed machine rates consistent with any changed build-up.
  for (const m of next.machines) {
    if (touchedMachines.has(m.id) && m.buildup) m.computedRatePerHr = computeMachineRatePerHr(m.buildup);
  }
  return next;
}

/** Resolve the effective library the calculators should use. */
export function resolveActiveLibrary(opts: {
  builtIn: RateLibrary;
  company?: RateLibrary | null;
  overrides?: RateOverride[];
  source: RateSource;
}): { library: RateLibrary; effectiveSource: RateSource } {
  const useCompany = opts.source === 'company' && opts.company != null;
  const base = useCompany ? (opts.company as RateLibrary) : opts.builtIn;
  const library = applyRateOverrides(base, opts.overrides ?? []);
  return { library, effectiveSource: useCompany ? 'company' : 'builtin' };
}

/**
 * A stable identity for a rate book, derived from its content.
 *
 * Every run records this. It is what makes a costing reproducible: the library's
 * own `version` field is author-supplied and not unique — an uploaded sheet is
 * always stamped `company-upload` — so two different books share it and a report
 * cannot say which one produced its numbers. A content hash can, and it works
 * the same for the built-in book, an uploaded sheet, and a resolved library with
 * cell overrides applied, because it hashes what was actually costed on.
 *
 * Key order is normalised so a re-serialised library fingerprints identically.
 */
export function fingerprintRateLibrary(lib: RateLibrary): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, stable(val)]),
      );
    }
    return v;
  };
  // `lastModified` is a timestamp, not a rate: the upload route stamps it with
  // `now`, so including it would make the same sheet fingerprint differently on
  // every upload and defeat the whole point.
  const { lastModified: _ignored, ...rest } = lib as RateLibrary & { lastModified?: string };
  return createHash('sha256').update(JSON.stringify(stable(rest))).digest('hex').slice(0, 16);
}
