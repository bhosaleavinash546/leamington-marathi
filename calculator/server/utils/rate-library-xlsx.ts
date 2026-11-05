/**
 * Excel (.xlsx) template + parser for the manufacturing rate library.
 *
 * Admins download a multi-tab template (one sheet per rate table), fill in their
 * company's numbers, and upload it. This module turns a RateLibrary into that
 * workbook and parses an uploaded workbook back into a validated RateLibrary.
 *
 * Pure data transforms over the `xlsx` library — unit-tested by round-tripping
 * the built-in library through build → parse.
 */

import * as XLSX from 'xlsx';
import type {
  RateAlias,
  RateLibrary, MaterialRate, MachineRate, LabourRate, EnergyRate, FXRate, OverheadDefault, Confidence,
} from '../../src/engine/types.js';
import {
  computeMachineRatePerHr, companyDelta, companyRowReport, rateValueError, resolveActiveLibrary, applyAliases, mergeCompanyRows,
  type CompanyRowReport,
} from '../../src/engine/rate-library-merge.js';
import { DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';

export interface ParseResult {
  /** Every row the sheet holds, as read (validated). Null when the sheet was refused. */
  library: RateLibrary | null;
  /**
   * The company rows to store: the rows whose values differ from the built-in, and new ids (plus the aliases). Unchanged
   * rows are dropped so they keep following future built-in refreshes (rates flow review R1, Nov 2026).
   */
  delta: RateLibrary | null;
  /** What the upload changes, adds and leaves built-in. */
  report: CompanyRowReport | null;
  errors: string[];
  /**
   * Accepted but worth a look: a new id one or two letters from a built-in id (a typo adds a row and leaves the built-in
   * in force), template rows absent from the sheet (they stay built-in).
   */
  warnings: string[];
  counts: Record<string, number>;
}

const SHEETS = {
  instructions: 'Instructions',
  materials: 'Materials',
  machines: 'Machines',
  labour: 'Labour',
  energy: 'Energy',
  fx: 'FX',
  overhead: 'Overhead',
  aliases: 'Aliases',
} as const;

/** The currency every money row of the base book is in. Country rows in their own currency are R2. */
export const BOOK_CURRENCY = 'GBP';

/** Columns a sheet must have (header row). Materials, Machines, Labour and Energy are required sheets. */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  [SHEETS.materials]: ['id', 'grade', 'category', 'pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3', 'currency'],
  [SHEETS.machines]: ['id', 'machineClass', 'annualDepreciation', 'maintenance', 'energy', 'floorSpace', 'indirectSupport',
    'financeCost', 'annualAvailableHours', 'machineUtilization', 'currency'],
  [SHEETS.labour]: ['id', 'skillLevel', 'fullyLoadedRatePerHr', 'currency'],
  [SHEETS.energy]: ['id', 'electricityPerKwh', 'gasPerKwh', 'currency'],
  [SHEETS.fx]: ['id', 'fromCurrency', 'toCurrency', 'rate'],
  [SHEETS.overhead]: ['id', 'commodityType', 'supplierTier', 'overheadPct', 'marginPct'],
};
const REQUIRED_SHEETS: string[] = [SHEETS.materials, SHEETS.machines, SHEETS.labour, SHEETS.energy];

/** A plain number written as text ("12.5") is still unambiguous; anything else in a number cell is refused. */
const PLAIN_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;

/** A number cell: a number, or text that is only a number. Blank → NaN; anything else → the text, to be refused. */
const cellNumber = (v: unknown): number | { text: string } => {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim();
  if (s === '') return NaN;
  return PLAIN_NUMBER.test(s) ? Number(s) : { text: s };
};
const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const conf = (v: unknown): Confidence => {
  const s = str(v);
  return s === 'High' || s === 'Medium' || s === 'Low' ? s : 'Medium';
};

/** Ids of the base (UK) book: country rows (`lab-<cc>-*`, `energy-<cc>`, a machine with a country region) are not. */
export function isBaseRow(table: 'materials' | 'machines' | 'labour' | 'energy', row: { id: string; region?: string }): boolean {
  if (table === 'labour') { const m = /^lab-([a-z]{2})-/.exec(row.id); return !m || m[1] === 'uk'; }
  if (table === 'energy') return row.id === 'energy-uk';
  if (table === 'machines') return !row.region || row.region === 'UK';
  return true;
}

/** The Instructions sheet — the merge rule, in the words the admin reads before typing. */
export const TEMPLATE_INSTRUCTIONS: string[][] = [
  ['CostVision company rate book — how an upload is read'],
  [''],
  ['1. Merge by id', 'Each row is matched to the built-in row with the same id. Your row replaces that built-in row; every row you do not change stays built-in.'],
  ['2. Unchanged rows are ignored', 'A row whose values all equal the built-in values is NOT saved. It keeps following future built-in refreshes (new rate books, new machines). You may delete unchanged rows.'],
  ['3. What "changed" means', 'A value different from the built-in value: a price, scrap credit, density, category or grade (Materials); a build-up figure, hours, utilisation or class (Machines); the £/h or skill (Labour); a tariff (Energy). Editing only sourceNote, effectiveDate, confidence or region does not change a row.'],
  ['4. Changed rows are pinned', 'A changed row stays at your value until you upload again or reset — later built-in refreshes do not move it.'],
  ['5. New ids', 'Materials, Machines and Labour accept new ids (your own grades and assets) with every required column filled; a new material needs a category the built-in book already uses. Energy, FX and Overhead take only the template ids.'],
  ['6. Country rows', 'Country rows (lab-cn-…, energy-cn …) are not in this template: other countries use their own published books.'],
  ['7. Currency', 'Every money row is in GBP (£): the currency column must say GBP. Type numbers only — no £ / € / $ signs, no thousands separators, no units.'],
  ['8. Fractions', 'machineUtilization, overheadPct and marginPct are fractions: 0.80, not 80.'],
  ['8a. Machine electricity', 'Machines energy is £ a year at the built-in UK tariff £0.182/kWh (kWh a year × 0.182). The costing prices those kWh at YOUR Energy sheet energy-uk tariff, so a tariff change moves every machine £/h too.'],
  ['8b. Unit sanity', 'A changed figure more than 10× or under a tenth of the built-in figure for the same id is refused as a likely unit error (pence for pounds, £/t for £/kg). Add a genuine outlier as a new id.'],
  ['9. Refused', 'Zero or negative prices, labour rates, tariffs or densities; zero hours; utilisation ≤ 0 or > 1; text in a number cell; duplicate ids; unknown ids where a sheet takes only template ids; a missing sheet or column. Every error names the sheet, row and column.'],
  ['10. Cell overrides', 'An upload CLEARS every cell override an administrator set; the upload reply lists the ones it removed. Precedence: cell override > company row > built-in.'],
  ['11. Not used by the part costing yet', 'Overhead: overhead and margin come from the country shop defaults. FX: read only by the EV battery / e-motor modules.'],
  ['Required sheets', 'Materials, Machines, Labour, Energy (FX, Overhead and Aliases are optional).'],
];

// ─── Build the template / export the current library ───────────────────────────

/**
 * The workbook. `template: true` (GET /template) writes the BASE (UK) rows only — country rows are not pre-filled, so
 * nobody "uploads" a frozen copy of a country book they never typed — and the Instructions sheet first. The export of
 * the resolved book (GET /export) writes every row.
 */
export function buildRateLibraryWorkbook(lib: RateLibrary, opts: { template?: boolean } = {}): Buffer {
  const wb = XLSX.utils.book_new();
  const base = <T extends { id: string; region?: string }>(t: 'materials' | 'machines' | 'labour' | 'energy', rows: T[]) =>
    opts.template ? rows.filter(r => isBaseRow(t, r)) : rows;

  const add = (name: string, rows: unknown[][], cols: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = cols.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  add(SHEETS.instructions, TEMPLATE_INSTRUCTIONS, [34, 140]);

  add(SHEETS.materials, [
    ['id', 'grade', 'category', 'pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3', 'currency', 'region', 'effectiveDate', 'sourceNote', 'confidence'],
    ...base('materials', lib.materials).map(m => [m.id, m.grade, m.category, m.pricePerKg, m.scrapRecoveryPricePerKg, m.densityKgPerM3, BOOK_CURRENCY, m.region, m.effectiveDate, m.sourceNote, m.confidence]),
  ], [22, 20, 16, 12, 20, 14, 9, 12, 14, 40, 12]);

  add(SHEETS.machines, [
    ['id', 'machineClass', 'region', 'annualDepreciation', 'maintenance', 'energy', 'floorSpace', 'indirectSupport', 'financeCost', 'annualAvailableHours', 'machineUtilization', 'currency', 'effectiveDate', 'sourceNote', 'confidence', 'computedRatePerHr (auto)'],
    ...base('machines', lib.machines).map(m => [m.id, m.machineClass, m.region, m.buildup.annualDepreciation, m.buildup.maintenance, m.buildup.energy, m.buildup.floorSpace, m.buildup.indirectSupport, m.buildup.financeCost, m.buildup.annualAvailableHours, m.buildup.machineUtilization, BOOK_CURRENCY, m.effectiveDate, m.sourceNote, m.confidence, m.computedRatePerHr]),
  ], [22, 22, 12, 18, 14, 12, 12, 16, 14, 20, 18, 9, 14, 36, 12, 22]);

  add(SHEETS.labour, [
    ['id', 'region', 'skillLevel', 'fullyLoadedRatePerHr', 'currency', 'effectiveDate', 'sourceNote', 'confidence'],
    ...base('labour', lib.labour).map(l => [l.id, l.region, l.skillLevel, l.fullyLoadedRatePerHr, BOOK_CURRENCY, l.effectiveDate, l.sourceNote, l.confidence]),
  ], [22, 14, 18, 20, 9, 14, 40, 12]);

  add(SHEETS.energy, [
    ['id', 'region', 'electricityPerKwh', 'gasPerKwh', 'currency', 'effectiveDate', 'sourceNote', 'confidence'],
    ...base('energy', lib.energy).map(e => [e.id, e.region, e.electricityPerKwh, e.gasPerKwh, BOOK_CURRENCY, e.effectiveDate, e.sourceNote, e.confidence]),
  ], [22, 14, 18, 14, 9, 14, 40, 12]);

  add(SHEETS.fx, [
    ['id', 'fromCurrency', 'toCurrency', 'rate', 'effectiveDate', 'sourceNote'],
    ...lib.fx.map(f => [f.id, f.fromCurrency, f.toCurrency, f.rate, f.effectiveDate, f.sourceNote]),
  ], [16, 14, 12, 12, 14, 40]);

  add(SHEETS.overhead, [
    ['id', 'commodityType', 'supplierTier', 'overheadPct', 'marginPct', 'sourceNote'],
    ...lib.overheadDefaults.map(o => [o.id, o.commodityType, o.supplierTier, o.overheadPct, o.marginPct, o.sourceNote]),
  ], [22, 20, 16, 12, 12, 40]);

  // Optional. Blank by default — the ids above are then used exactly as they
  // stand. A plant that keeps its own asset register fills this in instead of
  // renaming the rows above, which would break every costing.
  const exampleMachine = lib.machines[0]?.id ?? 'mach-vmc3';
  const exampleLabour = lib.labour[0]?.id ?? 'lab-uk-skilled';
  add(SHEETS.aliases, [
    ['kind', 'slot', 'useId', 'note'],
    ['# machine or labour', '# the id the tool asks for', '# your id to use instead',
     '# delete these two example rows before uploading'],
    ['# machine', exampleMachine, 'YOUR-ASSET-ID', 'example only'],
    ['# labour', exampleLabour, 'YOUR-GRADE-ID', 'example only'],
  ], [14, 30, 30, 46]);

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

// ─── Parse an uploaded workbook back into a validated library ──────────────────

type SheetRow = Record<string, unknown> & { __rowNum__?: number };

function rows(wb: XLSX.WorkBook, sheet: string): SheetRow[] {
  const ws = wb.Sheets[sheet];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as SheetRow[];
}

function headerRow(wb: XLSX.WorkBook, sheet: string): string[] {
  const ws = wb.Sheets[sheet];
  if (!ws) return [];
  const first = (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][])[0] ?? [];
  return first.map(c => str(c));
}

/**
 * Parse and validate an uploaded workbook against the built-in book it is merged over.
 *
 * Refused (each error names the sheet, the Excel row and the column): a missing required sheet or column; text, a
 * currency symbol or a thousands separator in a number cell; a blank number; zero where it would price an item free;
 * a negative; zero hours; utilisation ≤ 0 or > 1 ("80 … use 0.80"); a currency other than GBP; a duplicate id; an id
 * the built-in does not have on a sheet that takes only template ids; a new row missing a required field; a material
 * category the built-in book does not use.
 */
export function parseRateLibraryWorkbook(buf: Buffer, builtIn: RateLibrary = DEFAULT_RATE_LIBRARY): ParseResult {
  const errors: string[] = [];
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(buf, { type: 'buffer' }); }
  catch { return { library: null, delta: null, report: null, errors: ['File is not a readable .xlsx workbook.'], warnings: [], counts: {} }; }

  for (const sh of REQUIRED_SHEETS) {
    if (!wb.Sheets[sh]) errors.push(`${sh}: sheet is missing — start from the template (GET /api/rate-library/template).`);
  }
  // A sheet with a missing column is not read row by row: one line per column says what to fix.
  const readable = new Set<string>();
  for (const [sh, cols] of Object.entries(REQUIRED_COLUMNS)) {
    if (!wb.Sheets[sh]) continue;
    const head = new Set(headerRow(wb, sh));
    const missing = cols.filter(c => !head.has(c));
    for (const c of missing) errors.push(`${sh} row 1, column ${c}: column is missing — start from the template (GET /api/rate-library/template).`);
    if (!missing.length) readable.add(sh);
  }
  const sheetRows = (sh: string): SheetRow[] => (readable.has(sh) ? rows(wb, sh) : []);
  const rowNo = (r: SheetRow, i: number) => (typeof r.__rowNum__ === 'number' ? r.__rowNum__ + 1 : i + 2);
  const at = (sh: string, n: number, col: string) => `${sh} row ${n}, column ${col}`;

  /** A number cell, validated by the shared rule (`rateValueError`); `field` names the rule when it differs from the column. */
  const need = (sh: string, n: number, r: SheetRow, col: string, field = col): number => {
    const v = cellNumber(r[col]);
    if (typeof v === 'object') {
      errors.push(`${at(sh, n, col)}: '${v.text}' is text — type the number only (no £ / € / $ signs, thousands separators or units).`);
      return 0;
    }
    if (Number.isNaN(v)) { errors.push(`${at(sh, n, col)}: blank — a number is required.`); return 0; }
    const e = rateValueError(field, v);
    if (e) { errors.push(`${at(sh, n, col)}: ${v} ${e}.`); return v; }
    return v;
  };
  const needText = (sh: string, n: number, r: SheetRow, col: string): string => {
    const t = str(r[col]);
    if (!t) errors.push(`${at(sh, n, col)}: blank — required.`);
    return t;
  };
  const currency = (sh: string, n: number, r: SheetRow) => {
    const raw = str(r.currency);
    const c = raw.toUpperCase();
    if (c !== BOOK_CURRENCY && raw !== '£') {
      errors.push(`${at(sh, n, 'currency')}: ${raw ? `'${raw}'` : 'blank'} — the base book is in GBP: write GBP and the figure in pounds (country rows in their own currency come with the country sheets).`);
    }
  };

  const withRow = new Map<string, number>();   // `${sheet}|${id}` → its Excel row, for messages after the read
  /** Rows with an id, each id once; a row with figures but no id is refused rather than dropped. */
  const withIds = (sh: string, table: keyof typeof known, allowNew: boolean) => {
    const seen = new Map<string, number>();
    const out: Array<{ r: SheetRow; n: number; isNew: boolean }> = [];
    sheetRows(sh).forEach((r, i) => {
      const n = rowNo(r, i);
      const id = str(r.id);
      if (!id) {
        if (Object.entries(r).some(([k, v]) => k !== 'id' && str(v) !== '')) errors.push(`${at(sh, n, 'id')}: blank — every row needs an id.`);
        return;
      }
      const first = seen.get(id);
      if (first != null) { errors.push(`${at(sh, n, 'id')}: duplicate id '${id}' (first on row ${first}).`); return; }
      seen.set(id, n);
      withRow.set(`${sh}|${id}`, n);
      const isNew = !known[table].has(id);
      if (isNew && !allowNew) {
        errors.push(`${at(sh, n, 'id')}: unknown id '${id}' — the ${sh} sheet takes only the template's ids.`);
        return;
      }
      out.push({ r, n, isNew });
    });
    return out;
  };

  const known = {
    materials: new Set(builtIn.materials.map(m => m.id)), machines: new Set(builtIn.machines.map(m => m.id)),
    labour: new Set(builtIn.labour.map(l => l.id)), energy: new Set(builtIn.energy.map(e => e.id)),
    fx: new Set(builtIn.fx.map(f => f.id)), overheadDefaults: new Set(builtIn.overheadDefaults.map(o => o.id)),
  };
  const categories = new Set(builtIn.materials.map(m => m.category));

  const M = SHEETS.materials;
  const materials: MaterialRate[] = withIds(M, 'materials', true).map(({ r, n }) => {
    const category = needText(M, n, r, 'category');
    if (category && !categories.has(category)) {
      errors.push(`${at(M, n, 'category')}: '${category}' is not a category the built-in book uses — the material would drop out of every material list (use one of the template's categories).`);
    }
    currency(M, n, r);
    const row: MaterialRate = {
      id: str(r.id), grade: needText(M, n, r, 'grade'), category,
      pricePerKg: need(M, n, r, 'pricePerKg'),
      scrapRecoveryPricePerKg: need(M, n, r, 'scrapRecoveryPricePerKg'),
      densityKgPerM3: need(M, n, r, 'densityKgPerM3'),
      region: str(r.region) || 'UK', effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
    };
    if (row.scrapRecoveryPricePerKg > row.pricePerKg && row.pricePerKg > 0) {
      errors.push(`${at(M, n, 'scrapRecoveryPricePerKg')}: ${row.scrapRecoveryPricePerKg} is more than the price ${row.pricePerKg} — a scrap credit cannot exceed the price.`);
    }
    return row;
  });

  const MA = SHEETS.machines;
  const machines: MachineRate[] = withIds(MA, 'machines', true).map(({ r, n }) => {
    currency(MA, n, r);
    const buildup = {
      annualDepreciation: need(MA, n, r, 'annualDepreciation'),
      maintenance: need(MA, n, r, 'maintenance'),
      energy: need(MA, n, r, 'energy'),
      floorSpace: need(MA, n, r, 'floorSpace'),
      indirectSupport: need(MA, n, r, 'indirectSupport'),
      financeCost: need(MA, n, r, 'financeCost'),
      annualAvailableHours: need(MA, n, r, 'annualAvailableHours'),
      machineUtilization: need(MA, n, r, 'machineUtilization'),
    };
    const annual = buildup.annualDepreciation + buildup.maintenance + buildup.energy + buildup.floorSpace + buildup.indirectSupport + buildup.financeCost;
    if (!(annual > 0)) errors.push(`${MA} row ${n}, columns annualDepreciation…financeCost: the build-up adds to £0 a year — a machine rate must be more than 0.`);
    return {
      id: str(r.id), machineClass: needText(MA, n, r, 'machineClass'), region: str(r.region) || 'UK', buildup,
      computedRatePerHr: computeMachineRatePerHr(buildup),   // always derived, never trusted from the file
      effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
    };
  });

  const L = SHEETS.labour;
  const labour: LabourRate[] = withIds(L, 'labour', true).map(({ r, n }) => {
    currency(L, n, r);
    return {
      id: str(r.id), region: str(r.region) || 'UK', skillLevel: needText(L, n, r, 'skillLevel'),
      fullyLoadedRatePerHr: need(L, n, r, 'fullyLoadedRatePerHr'),
      effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
    };
  });

  const E = SHEETS.energy;
  const energy: EnergyRate[] = withIds(E, 'energy', false).map(({ r, n }) => {
    currency(E, n, r);
    return {
      id: str(r.id), region: str(r.region),
      electricityPerKwh: need(E, n, r, 'electricityPerKwh'),
      gasPerKwh: need(E, n, r, 'gasPerKwh'),
      effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
    };
  });

  const F = SHEETS.fx;
  const fx: FXRate[] = withIds(F, 'fx', false).map(({ r, n }) => ({
    id: str(r.id), fromCurrency: needText(F, n, r, 'fromCurrency'), toCurrency: needText(F, n, r, 'toCurrency'),
    rate: need(F, n, r, 'rate'),
    effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote),
  }));

  const O = SHEETS.overhead;
  const overheadDefaults: OverheadDefault[] = withIds(O, 'overheadDefaults', false).map(({ r, n }) => ({
    id: str(r.id), commodityType: needText(O, n, r, 'commodityType') as OverheadDefault['commodityType'],
    supplierTier: needText(O, n, r, 'supplierTier'),
    overheadPct: need(O, n, r, 'overheadPct'),
    marginPct: need(O, n, r, 'marginPct'),
    sourceNote: str(r.sourceNote),
  }));

  // Optional sheet. Rows whose kind starts with '#' are the template's own
  // commentary and examples — a plant that ignores the sheet must not have them
  // loaded as real mappings.
  const aliasRows = rows(wb, SHEETS.aliases)
    .map((r, i) => ({ r, n: rowNo(r, i) }))
    .filter(({ r }) => {
      const k = str(r.kind);
      return k && !k.startsWith('#') && str(r.slot) && str(r.useId);
    });
  const aliases: RateAlias[] = aliasRows.map(({ r, n }) => {
    const kind = str(r.kind).toLowerCase();
    if (kind !== 'machine' && kind !== 'labour') {
      errors.push(`${at(SHEETS.aliases, n, 'kind')}: kind must be 'machine' or 'labour', not '${kind}'.`);
    }
    return { kind: kind as RateAlias['kind'], slot: str(r.slot), useId: str(r.useId), note: str(r.note) };
  });

  // Check the targets here, while there is still a row number to quote. A target may be a row of this sheet or a
  // built-in row (the company book is merged over it). The engine-side `applyAliases` checks again — a library can
  // reach it from the database without passing through this parser.
  for (const [i, a] of aliases.entries()) {
    const pool = a.kind === 'labour'
      ? new Set([...labour.map(l => l.id), ...known.labour]) : new Set([...machines.map(m => m.id), ...known.machines]);
    if (a.useId && !pool.has(a.useId)) {
      errors.push(`${at(SHEETS.aliases, aliasRows[i].n, 'useId')}: no ${a.kind} '${a.useId}' in the ${a.kind === 'labour' ? 'Labour' : 'Machines'} sheet or the built-in book.`);
    }
  }

  const counts: Record<string, number> = { materials: materials.length, machines: machines.length, labour: labour.length, energy: energy.length, fx: fx.length, overheadDefaults: overheadDefaults.length, aliases: aliases.length };
  // Unit sanity (rates flow R1): a changed figure more than 10× or under a tenth of the built-in figure for the SAME id is
  // refused — prices in pence, £/t for £/kg, g/cm³ for kg/m³, a monthly machine cost. The 10× bound is a validation
  // threshold (CostVision engineering judgement, not a sourced figure); a genuine outlier goes in as a new id.
  const RATIO = 10;
  const cellErrors = errors.length;   // a cell already refused (utilisation 80) is not ALSO reported as a unit error
  const sane = (sh: string, id: string, col: string, v: number, b: number | undefined) => {
    if (cellErrors || !(b && b > 0) || !(v > 0)) return;
    const r = v / b;
    if (r > RATIO || r < 1 / RATIO) {
      const n = withRow.get(`${sh}|${id}`) ?? 0;
      errors.push(`${at(sh, n, col)}: ${v} is ${r >= 1 ? `${+r.toFixed(1)}×` : `1/${+(1 / r).toFixed(1)} of`} the built-in ${+b.toPrecision(6)} — `
        + `looks like a unit error (pence for pounds, £/t for £/kg, g/cm³ for kg/m³?). A company rate more than ${RATIO}× or under a tenth `
        + 'of the built-in figure for the same id is refused (a sanity bound, engineering judgement); add a genuine outlier as a new id.');
    }
  };
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map(r => [r.id, r]));
  const bMat = byId(builtIn.materials), bMach = byId(builtIn.machines), bLab = byId(builtIn.labour), bEn = byId(builtIn.energy), bFx = byId(builtIn.fx);
  for (const m of materials) {
    const b = bMat.get(m.id); if (!b) continue;
    sane(M, m.id, 'pricePerKg', m.pricePerKg, b.pricePerKg);
    sane(M, m.id, 'scrapRecoveryPricePerKg', m.scrapRecoveryPricePerKg, b.scrapRecoveryPricePerKg);
    sane(M, m.id, 'densityKgPerM3', m.densityKgPerM3, b.densityKgPerM3);
  }
  for (const m of machines) {
    const b = bMach.get(m.id); if (!b) continue;
    sane(MA, m.id, 'annualDepreciation…financeCost (the £/h)', m.computedRatePerHr, computeMachineRatePerHr(b.buildup));
  }
  for (const l of labour) sane(L, l.id, 'fullyLoadedRatePerHr', l.fullyLoadedRatePerHr, bLab.get(l.id)?.fullyLoadedRatePerHr);
  for (const e of energy) {
    sane(E, e.id, 'electricityPerKwh', e.electricityPerKwh, bEn.get(e.id)?.electricityPerKwh);
    sane(E, e.id, 'gasPerKwh', e.gasPerKwh, bEn.get(e.id)?.gasPerKwh);
  }
  for (const f of fx) sane(F, f.id, 'rate', f.rate, bFx.get(f.id)?.rate);

  // Warnings: a likely typo (a new id within two edits of a built-in id), and template rows the sheet left out.
  const warnings: string[] = [];
  const sheetIds: Array<[string, 'materials' | 'machines' | 'labour', Array<{ id: string }>]> = [[M, 'materials', materials], [MA, 'machines', machines], [L, 'labour', labour]];
  for (const [sh, t, rowsOf] of sheetIds) {
    for (const r of rowsOf) {
      if (known[t].has(r.id)) continue;
      const near = [...known[t]].find(k => editDistanceAtMost(k, r.id, 2));
      if (near) warnings.push(`${at(sh, withRow.get(`${sh}|${r.id}`) ?? 0, 'id')}: '${r.id}' is a NEW id, added beside the built-in '${near}' — if it is a typo, '${near}' stays at its built-in rate.`);
    }
  }
  if (!errors.length) {
    const present = (t: 'materials' | 'machines' | 'labour' | 'energy', rowsOf: Array<{ id: string }>) => {
      const have = new Set(rowsOf.map(r => r.id));
      const absent = (builtIn[t] as Array<{ id: string; region?: string }>).filter(r => isBaseRow(t, r) && !have.has(r.id)).length;
      return absent;
    };
    for (const [sh, t, rowsOf] of [[M, 'materials', materials], [MA, 'machines', machines], [L, 'labour', labour], [E, 'energy', energy]] as const) {
      const n = present(t, rowsOf);
      if (n) warnings.push(`${sh}: ${n} template row${n === 1 ? ' is' : 's are'} not in the sheet — ${n === 1 ? 'it keeps its' : 'they keep their'} built-in value${n === 1 ? '' : 's'}.`);
    }
  }

  if (errors.length) return { library: null, delta: null, report: null, errors, warnings, counts };

  const library: RateLibrary = {
    materials, machines, labour, energy, fx, overheadDefaults,
    ...(aliases.length ? { aliases } : {}),
    version: 'company-upload', lastModified: '',   // stamped by the caller
  };
  // Only what the sheet changes or adds is stored. A changed row that still carries the built-in's source note (or
  // none) would cite the built-in source for the company's figure — it says it is the company's.
  const delta = companyDelta(builtIn, library);
  for (const t of ['materials', 'machines', 'labour', 'energy', 'fx', 'overheadDefaults'] as const) {
    const byId = new Map((builtIn[t] as Array<{ id: string; sourceNote?: string }>).map(x => [x.id, x]));
    for (const row of delta[t] as Array<{ id: string; sourceNote?: string }>) {
      const b = byId.get(row.id);
      if (!row.sourceNote || (b && row.sourceNote === b.sourceNote)) row.sourceNote = 'Company rate book (uploaded workbook)';
    }
  }
  const report = companyRowReport(builtIn, delta);
  return { library, delta, report, errors: [], warnings, counts: { ...counts, changed: report.changed.length, added: report.added.length } };
}

/**
 * A workbook as the book a costing runs on — exactly what the upload route makes of it: the company rows merged by id
 * over the built-in, then the Aliases sheet materialised (`resolveActiveLibrary`). `scripts/bulk-cost.ts --rates`
 * costed on the raw parse and dropped the aliases (rates flow review R1, Nov 2026).
 */
export function bookFromWorkbook(buf: Buffer, builtIn: RateLibrary = DEFAULT_RATE_LIBRARY):
  { library: RateLibrary | null; errors: string[]; counts: Record<string, number>; report: CompanyRowReport | null } {
  const parsed = parseRateLibraryWorkbook(buf, builtIn);
  if (!parsed.delta) return { library: null, errors: parsed.errors, counts: parsed.counts, report: null };
  const { library } = resolveActiveLibrary({ builtIn, company: parsed.delta, source: 'company' });
  const aliasErrors = applyAliases(mergeCompanyRows(builtIn, parsed.delta)).errors;
  if (aliasErrors.length) return { library: null, errors: aliasErrors, counts: parsed.counts, report: parsed.report };
  return { library, errors: [], counts: parsed.counts, report: parsed.report };
}

/** Levenshtein distance ≤ `max` (early exit) — the typo check on a new id. */
function editDistanceAtMost(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}
