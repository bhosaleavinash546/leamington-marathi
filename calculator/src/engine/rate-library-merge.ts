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
/**
 * Resolve aliases into real rows, so the engine never has to know about them.
 *
 * Each alias says "when the formulas ask for `slot`, use `useId`". Rather than
 * teach every lookup about aliases — there are several, and one missed site is
 * a silently different machine — the slot is materialised as its own row
 * carrying the target's economics. The engine then finds `slot` exactly as it
 * always did.
 *
 * The row keeps the TARGET's description and records where it came from, so a
 * report names JLR's asset rather than ours, and anyone reading it can see the
 * substitution rather than having to know about it.
 *
 * An alias pointing at an id that is not in the library is dropped and
 * reported. Costing on a slot the plant believed it had replaced — quietly
 * falling back to our machine — is the outcome worth refusing.
 */
export function applyAliases(lib: RateLibrary): { library: RateLibrary; errors: string[] } {
  const aliases = lib.aliases ?? [];
  if (!aliases.length) return { library: lib, errors: [] };

  const errors: string[] = [];
  const machines = [...lib.machines];
  const labour = [...lib.labour];

  for (const a of aliases) {
    const slot = a.slot?.trim(), useId = a.useId?.trim();
    if (!slot || !useId) { errors.push(`Alias with a blank slot or target is ignored.`); continue; }
    if (slot === useId) continue;   // a no-op, not an error

    if (a.kind === 'machine') {
      const target = lib.machines.find(m => m.id === useId);
      if (!target) { errors.push(`Alias ${slot} -> ${useId}: no machine '${useId}' in this sheet.`); continue; }
      const i = machines.findIndex(m => m.id === slot);
      const row = {
        ...target, id: slot,
        sourceNote: `${useId}${target.sourceNote ? ` — ${target.sourceNote}` : ''} (used for ${slot})`,
      };
      if (i >= 0) machines[i] = row; else machines.push(row);
    } else if (a.kind === 'labour') {
      const target = lib.labour.find(l => l.id === useId);
      if (!target) { errors.push(`Alias ${slot} -> ${useId}: no labour grade '${useId}' in this sheet.`); continue; }
      const i = labour.findIndex(l => l.id === slot);
      const row = {
        ...target, id: slot,
        sourceNote: `${useId}${target.sourceNote ? ` — ${target.sourceNote}` : ''} (used for ${slot})`,
      };
      if (i >= 0) labour[i] = row; else labour.push(row);
    } else {
      errors.push(`Alias ${slot}: kind must be 'machine' or 'labour'.`);
    }
  }
  return { library: { ...lib, machines, labour }, errors };
}

export function resolveActiveLibrary(opts: {
  builtIn: RateLibrary;
  company?: RateLibrary | null;
  overrides?: RateOverride[];
  source: RateSource;
}): { library: RateLibrary; effectiveSource: RateSource } {
  const useCompany = opts.source === 'company' && opts.company != null;
  const base = useCompany ? (opts.company as RateLibrary) : opts.builtIn;
  // Aliases first: an override edits a cell on a row, and the row a slot points
  // at must exist before a cell on it can be edited.
  const aliased = applyAliases(base).library;
  const library = applyRateOverrides(aliased, opts.overrides ?? []);
  return { library, effectiveSource: useCompany ? 'company' : 'builtin' };
}
