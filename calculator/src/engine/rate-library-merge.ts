/**
 * Rate-library resolution — how the built-in defaults, an uploaded company
 * library, and row-level overrides combine into the ONE library the calculators
 * actually use. Pure and deterministic, so it unit-tests cleanly.
 *
 * Precedence (lowest → highest), row by row (rates flow review R1, Nov 2026):
 *   1. Built-in defaults        (shipped with the tool; every row the engine knows)
 *   2. Company rows             (admin upload: ONLY the rows whose values differ from the built-in, plus new ids)
 *   3. Cell overrides           (admin edits to individual cells, always applied on top)
 *
 * The company book is MERGED by id over the built-in — never a replacement of it. A company deployment used to cost on
 * the uploaded book whole, which froze every template row (country rows included) at upload date and hid every new
 * engine id (the Nov foundry / forge machines) behind "Machine '…' not found".
 */
import type { RateLibrary, MachineRateBuildup, MaterialRate, MachineRate, LabourRate, EnergyRate, FXRate, OverheadDefault } from './types.js';

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

/** The tables a company book can carry rows for, in workbook order. */
export const RATE_TABLES = ['materials', 'machines', 'labour', 'energy', 'fx', 'overheadDefaults'] as const;
type RowOf = { materials: MaterialRate; machines: MachineRate; labour: LabourRate; energy: EnergyRate; fx: FXRate; overheadDefaults: OverheadDefault };

/**
 * The fields that make a row "changed". A row whose fields here all equal the built-in row's is NOT a company rate: it
 * is not stored and keeps following future built-in refreshes. The text columns that only describe a figure (source
 * note, effective date, confidence, region) do not make a row changed. `computedRatePerHr` is derived, never compared.
 */
export const VALUE_FIELDS: { [T in RateTable]: string[] } = {
  materials: ['pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3', 'category', 'grade'],
  machines: ['buildup.annualDepreciation', 'buildup.maintenance', 'buildup.energy', 'buildup.floorSpace',
    'buildup.indirectSupport', 'buildup.financeCost', 'buildup.annualAvailableHours', 'buildup.machineUtilization', 'machineClass'],
  labour: ['fullyLoadedRatePerHr', 'skillLevel'],
  energy: ['electricityPerKwh', 'gasPerKwh'],
  fx: ['rate', 'fromCurrency', 'toCurrency'],
  overheadDefaults: ['overheadPct', 'marginPct', 'commodityType', 'supplierTier'],
};

const getPath = (row: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), row);

/** Same value: numbers to a relative 1e-9 (an Excel round trip is exact; this only absorbs float noise), text trimmed. */
function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  return String(a ?? '').trim() === String(b ?? '').trim();
}

/** The value fields of `row` that differ from `builtIn` (empty = an unchanged row). */
export function changedFields(table: RateTable, row: unknown, builtIn: unknown): string[] {
  return VALUE_FIELDS[table].filter(f => !sameValue(getPath(row, f), getPath(builtIn, f)));
}

export interface RowRef { table: RateTable; id: string; fields?: string[] }

/** What a company book does to the built-in, row by row — the upload response and the admin status report. */
export interface CompanyRowReport {
  /** Built-in ids the company book sets to a different value (pinned at the company value). */
  changed: RowRef[];
  /** Ids the built-in book does not have. */
  added: RowRef[];
  /** Company rows equal to the built-in value (only an upload made before R1 stores these; they cost as the built-in). */
  sameAsBuiltIn: RowRef[];
  /** Built-in rows the company book does not touch, per table — they follow every built-in refresh. */
  leftBuiltIn: Record<RateTable, number>;
}

export function companyRowReport(builtIn: RateLibrary, company: Partial<RateLibrary> | null | undefined): CompanyRowReport {
  const out: CompanyRowReport = { changed: [], added: [], sameAsBuiltIn: [],
    leftBuiltIn: { materials: 0, machines: 0, labour: 0, energy: 0, fx: 0, overheadDefaults: 0 } };
  for (const t of RATE_TABLES) {
    const base = builtIn[t] as Array<{ id: string }>;
    const rows = ((company?.[t] ?? []) as Array<{ id: string }>);
    const byId = new Map(base.map(r => [r.id, r]));
    const touched = new Set<string>();
    for (const r of rows) {
      const b = byId.get(r.id);
      if (!b) { out.added.push({ table: t, id: r.id }); continue; }
      touched.add(r.id);
      const f = changedFields(t, r, b);
      if (f.length) out.changed.push({ table: t, id: r.id, fields: f });
      else out.sameAsBuiltIn.push({ table: t, id: r.id });
    }
    out.leftBuiltIn[t] = base.filter(r => !touched.has(r.id)).length;
  }
  return out;
}

/**
 * Only the rows a company book actually sets: those that differ from the built-in, and new ids. Everything else is
 * dropped, so it keeps following the built-in — the rule written in the template's Instructions sheet.
 */
export function companyDelta(builtIn: RateLibrary, sheet: RateLibrary): RateLibrary {
  const keep = <T extends RateTable>(t: T): RowOf[T][] => {
    const byId = new Map((builtIn[t] as Array<{ id: string }>).map(r => [r.id, r]));
    return (sheet[t] as unknown as RowOf[T][]).filter(r => {
      const b = byId.get((r as { id: string }).id);
      return !b || changedFields(t, r, b).length > 0;
    });
  };
  return {
    materials: keep('materials'), machines: keep('machines'), labour: keep('labour'),
    energy: keep('energy'), fx: keep('fx'), overheadDefaults: keep('overheadDefaults'),
    ...(sheet.aliases?.length ? { aliases: sheet.aliases } : {}),
    version: sheet.version, lastModified: sheet.lastModified,
  };
}

/** Company rows over the built-in, by id: a company row replaces the built-in row with its id, a new id is appended. */
export function mergeCompanyRows(builtIn: RateLibrary, company: Partial<RateLibrary>): RateLibrary {
  const merge = <T extends { id: string }>(base: T[], over: T[] | undefined): T[] => {
    if (!over?.length) return base;
    const byId = new Map(over.map(r => [r.id, r]));
    const known = new Set(base.map(r => r.id));
    return [...base.map(r => byId.get(r.id) ?? r), ...over.filter(r => !known.has(r.id))];
  };
  const aliases = company.aliases?.length ? company.aliases : builtIn.aliases;
  return {
    ...builtIn,
    materials: merge(builtIn.materials, company.materials),
    machines: merge(builtIn.machines, company.machines),
    labour: merge(builtIn.labour, company.labour),
    energy: merge(builtIn.energy, company.energy),
    fx: merge(builtIn.fx, company.fx),
    overheadDefaults: merge(builtIn.overheadDefaults, company.overheadDefaults),
    ...(aliases ? { aliases } : {}),
    // The built-in version: every row the company did not set is the built-in's. The book's identity is its fingerprint.
    version: builtIn.version,
    lastModified: company.lastModified || builtIn.lastModified,
  };
}

/** "built-in" / "company book: 3 changed, 1 added" / "… + 2 cell overrides" — the label beside the fingerprint. */
export function describeActiveBook(o: { source: RateSource; report?: CompanyRowReport | null; overrideCount: number }): string {
  const parts: string[] = [];
  if (o.source === 'company' && o.report) {
    const pinned = o.report.sameAsBuiltIn.length ? `, ${o.report.sameAsBuiltIn.length} at built-in value` : '';
    parts.push(`company book: ${o.report.changed.length} changed, ${o.report.added.length} added${pinned}`);
  } else parts.push('built-in');
  if (o.overrideCount) parts.push(`${o.overrideCount} cell override${o.overrideCount === 1 ? '' : 's'}`);
  return parts.join(' + ');
}

export function resolveActiveLibrary(opts: {
  builtIn: RateLibrary;
  company?: RateLibrary | null;
  overrides?: RateOverride[];
  source: RateSource;
}): { library: RateLibrary; effectiveSource: RateSource } {
  const useCompany = opts.source === 'company' && opts.company != null;
  // Merged by id — never the company book whole (rates flow review R1).
  const base = useCompany ? mergeCompanyRows(opts.builtIn, opts.company as RateLibrary) : opts.builtIn;
  // Aliases first: an override edits a cell on a row, and the row a slot points
  // at must exist before a cell on it can be edited.
  const aliased = applyAliases(base).library;
  const library = applyRateOverrides(aliased, opts.overrides ?? []);
  return { library, effectiveSource: useCompany ? 'company' : 'builtin' };
}

/** The most hours a year has (a leap year): a machine cannot be available for more. */
export const HOURS_IN_A_YEAR = 8784;

/**
 * Why a rate cell's value cannot be costed, or null when it can — ONE rule for the workbook parser and the cell-override
 * route (a value refused in a sheet was accepted as an override). Zero is refused where it would price an item free (a
 * price, a labour rate, a tariff, an FX rate, a density); a scrap credit or one build-up component may be 0. Hours and
 * utilisation are bounded, and a percentage typed where a fraction belongs is named ("80 … use 0.80").
 */
export function rateValueError(field: string, v: number): string | null {
  const f = field.split('.').pop() ?? field;
  if (!Number.isFinite(v)) return 'is not a number';
  if (v < 0) return 'must not be negative';
  const pct = (x: number) => `looks like a percentage — use ${(x / 100).toFixed(2)}`;
  switch (f) {
    case 'pricePerKg': case 'densityKgPerM3': case 'fullyLoadedRatePerHr':
    case 'electricityPerKwh': case 'gasPerKwh': case 'rate':
      return v > 0 ? null : 'must be more than 0 (a zero rate would cost the item free)';
    case 'annualAvailableHours':
      return v <= 0 ? 'must be more than 0 hours' : v > HOURS_IN_A_YEAR ? `is more hours than a year has (${HOURS_IN_A_YEAR})` : null;
    case 'machineUtilization':
      return v <= 0 ? 'must be more than 0' : v > 1 ? (v <= 100 ? pct(v) : 'must be a fraction between 0 and 1') : null;
    case 'overheadPct': case 'marginPct':
      return v >= 1 ? (v <= 100 ? pct(v) : 'must be a fraction below 1') : null;
    default:
      return null;
  }
}

/** The numeric fields a cell override may set, per table (a misspelt field used to create a dead property). */
export const NUMERIC_FIELDS: { [T in RateTable]: string[] } = {
  materials: ['pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3'],
  machines: VALUE_FIELDS.machines.filter(f => f.startsWith('buildup.')),
  labour: ['fullyLoadedRatePerHr'],
  energy: ['electricityPerKwh', 'gasPerKwh'],
  fx: ['rate'],
  overheadDefaults: ['overheadPct', 'marginPct'],
};
