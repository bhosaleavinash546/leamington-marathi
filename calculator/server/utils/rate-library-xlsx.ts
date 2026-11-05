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
  RateAlias, CommodityType, CountryRateRows,
  RateLibrary, MaterialRate, MachineRate, LabourRate, EnergyRate, OverheadDefault, ServiceRate, Confidence,
} from '../../src/engine/types.js';
import {
  computeMachineRatePerHr, companyDelta, companyRowReport, rateValueError, resolveActiveLibrary, applyAliases, mergeCompanyRows,
  isBaseRow, rowCountry, type CompanyRowReport, type CountryBookOf,
} from '../../src/engine/rate-library-merge.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { buildRegionalLibrary, resolveManufacturingRegion, REGIONAL_DATA, type ManufacturingRegion } from '../../src/engine/regional-rates.js';
import { inCountry } from '../../src/engine/regional-services.js';
import { parseServiceBasis } from '../../src/engine/service-rates.js';
import { BUILT_IN_SHOP_ROW } from '../../src/engine/shop-defaults-data.js';
export { isBaseRow };

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
  overhead: 'Overhead',
  services: 'Services & toolroom',
  aliases: 'Aliases',
} as const;
/** The FX sheet of a pre-R2 workbook: ignored with a warning (FX is the published central-bank rate, never a company row). */
const LEGACY_FX_SHEET = 'FX';

/** The currency every money row is in — a country row too (convert at the published rate; rates flow R2). */
export const BOOK_CURRENCY = 'GBP';

/**
 * The Overhead rows the built-in book shipped before R2 ("Industry benchmark", never read by a costing): a workbook that
 * still carries one at its old values is a copy of the old template, not a company figure — it is dropped with a warning.
 */
const LEGACY_OVERHEAD: Record<string, [string, number, number]> = {
  'oh-machining-t2': ['machining', 0.12, 0.08], 'oh-machining-t1': ['machining', 0.15, 0.10], 'oh-sheet-metal-t2': ['sheet_metal', 0.10, 0.07],
  'oh-injection-moulding-t2': ['injection_moulding', 0.11, 0.08], 'oh-casting-t2': ['casting', 0.10, 0.08], 'oh-forging-t2': ['forging', 0.12, 0.08],
  'oh-painting-t2': ['painting', 0.08, 0.06], 'oh-biw-t2': ['biw_assembly', 0.10, 0.07], 'oh-pcb-fab-t2': ['pcb_fab', 0.08, 0.10],
  'oh-pcba-t2': ['pcba', 0.08, 0.10], 'oh-cast-and-machine-t2': ['cast_and_machine', 0.12, 0.09], 'oh-blow-moulding-t2': ['blow_moulding', 0.10, 0.08],
  'oh-aluminium_extrusion-t1': ['aluminium_extrusion', 0.12, 0.08], 'oh-aluminium_extrusion-t2': ['aluminium_extrusion', 0.10, 0.07],
  'oh-aluminium_extrusion-t3': ['aluminium_extrusion', 0.08, 0.05], 'oh-extrusion-t1': ['extrusion', 0.12, 0.10], 'oh-extrusion-t2': ['extrusion', 0.09, 0.07],
  'oh-extrusion-t3': ['extrusion', 0.07, 0.05], 'oh-thermoforming-t1': ['thermoforming', 0.13, 0.10], 'oh-thermoforming-t2': ['thermoforming', 0.10, 0.08],
  'oh-thermoforming-t3': ['thermoforming', 0.07, 0.05], 'oh-rotomoulding-t2': ['rotational_moulding', 0.11, 0.09],
  'oh-sheet-metal-fab-t2': ['sheet_metal_fab', 0.10, 0.08], 'oh-rubber-t2': ['rubber', 0.11, 0.09], 'oh-composites-t2': ['composites', 0.14, 0.10],
  'oh-wiring-harness-t2': ['wiring_harness', 0.10, 0.08], 'oh-battery-pack-t1': ['battery_pack', 0.08, 0.06], 'oh-e-motor-t1': ['e_motor', 0.10, 0.07],
};

/** The commodities an Overhead row may name ('*' = every commodity). */
const OVERHEAD_COMMODITIES = new Set<string>(['*', 'machining', 'sheet_metal', 'sheet_metal_fab', 'injection_moulding', 'blow_moulding',
  'extrusion', 'aluminium_extrusion', 'thermoforming', 'rotational_moulding', 'casting', 'forging', 'gear', 'painting', 'biw_assembly',
  'pcb_fab', 'pcba', 'cast_and_machine', 'rubber', 'composites', 'wiring_harness', 'battery_pack', 'e_motor', 'assembly']);

/** A country cell → its region code: blank / UK / GB → 'UK'; a code or a country name; null when it is not a country. */
export function countryCode(raw: unknown): string | null {
  const t = str(raw);
  if (!t) return 'UK';
  const up = t.toUpperCase();
  if (up === 'UK' || up === 'GB') return 'UK';
  if ((REGIONAL_DATA as Record<string, unknown>)[up]) return up;
  return resolveManufacturingRegion(t);
}

/** Columns a sheet must have (header row). Materials, Machines, Labour and Energy are required sheets. */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  [SHEETS.materials]: ['id', 'grade', 'category', 'pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3', 'currency'],
  [SHEETS.machines]: ['id', 'machineClass', 'annualDepreciation', 'maintenance', 'energy', 'floorSpace', 'indirectSupport',
    'financeCost', 'annualAvailableHours', 'machineUtilization', 'currency'],
  [SHEETS.labour]: ['id', 'skillLevel', 'fullyLoadedRatePerHr', 'currency'],
  [SHEETS.energy]: ['id', 'electricityPerKwh', 'gasPerKwh', 'currency'],
  [SHEETS.overhead]: ['id', 'commodityType', 'overheadPct', 'marginPct'],
  [SHEETS.services]: ['id', 'value', 'currency'],
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

/** The Instructions sheet — the merge rule, in the words the admin reads before typing. */
export const TEMPLATE_INSTRUCTIONS: string[][] = [
  ['CostVision company rate book — how an upload is read'],
  [''],
  ['1. Merge by id', 'Each row is matched to the built-in row with the same id (and, on Materials, Machines, Overhead and Services, the same country). Your row replaces that built-in row; every row you do not change stays built-in.'],
  ['2. Unchanged rows are ignored', 'A row whose values all equal the built-in values is NOT saved. It keeps following future built-in refreshes (new rate books, new machines). You may delete unchanged rows.'],
  ['3. What "changed" means', 'A value different from the built-in value: a price, scrap credit, density, category or grade (Materials); a build-up figure, hours, utilisation or class (Machines); the £/h or skill (Labour); a tariff (Energy); overhead or margin (Overhead); the £ figure (Services & toolroom). Editing only sourceNote, effectiveDate, confidence or region does not change a row.'],
  ['4. Changed rows are pinned', 'A changed row stays at your value until you upload again or reset — later built-in refreshes do not move it.'],
  ['5. New ids', 'Materials, Machines and Labour accept new ids (your own grades and assets) with every required column filled; a new material needs a category the built-in book uses. Energy and Services take only the template ids; Overhead takes one row per commodity and country.'],
  ['6. A row applies to its country ONLY', 'A row changes the costing in the country it names and nowhere else. Materials, Machines, Overhead and Services have a country column: blank (or UK) = the UK; a country code (CN, IN, DE …) = that country. Labour and Energy name the country in the id: lab-uk-… and energy-uk are the UK, lab-cn-skilled and energy-cn are China. Every country you add no row for keeps its own published rate book — a UK row never changes another country, and there is no fallback to a UK row.'],
  ['6a. A country row', 'Type the figure as it is in that country (in £ at the published exchange rate). It replaces the country book\'s row for that id: a machine row is its full build-up (hours, utilisation and £ a year), a material its £/kg. A country row may name an id the country book does not have (your own asset there).'],
  ['7. Currency', 'Every money row is in GBP (£): the currency column must say GBP. Type numbers only — no £ / € / $ signs, no thousands separators, no units.'],
  ['8. Fractions', 'machineUtilization, overheadPct and marginPct are fractions: 0.80, not 80.'],
  ['8a. Machine electricity', 'Machines energy is £ a year at the built-in UK tariff £0.182/kWh (kWh a year × 0.182). The costing prices those kWh at YOUR Energy sheet energy-uk tariff, so a tariff change moves every UK machine £/h too.'],
  ['8b. Unit sanity', 'A changed figure more than 10× or under a tenth of the built-in figure for the same id (and country) is refused as a likely unit error (pence for pounds, £/t for £/kg). Add a genuine outlier as a new id.'],
  ['9. Overhead sheet', 'Overhead % (of material + process + labour + tooling) and margin % (of the subtotal) by commodity and country. commodityType * = every commodity of that country. Precedence: your row for the commodity and country, then your * row for the country, then the built-in (12 % / 8 %; a country with no row keeps its published default). A figure typed into a costing form is a quote and still wins. supplierTier, if present, is descriptive only.'],
  ['10. Services & toolroom sheet', 'Toolroom £/h, tool steel £/kg, bought-out tool parts, fixtures, tool wear £/min, heat treatment, HIP, NDT stations, process services, foundry consumables and NRE items the rules price with. value is the UK figure; with a country it is that country\'s own figure, used as given. Without one, a country takes the built-in UK figure × its country factor (the basis column: toolroom, heatTreat, inspection, process, engineer, global …) — the basis column is the code\'s and cannot be changed.'],
  ['11. Refused', 'Zero or negative prices, labour rates, tariffs, densities or service figures; zero hours; utilisation ≤ 0 or > 1; text in a number cell; duplicate ids (per country); a country that is not one of the 39; unknown ids where a sheet takes only template ids; a missing sheet or column. Every error names the sheet, row and column.'],
  ['12. Cell overrides', 'An upload CLEARS every cell override an administrator set; the upload reply lists the ones it removed. Precedence: cell override > company row > built-in. A cell override edits the UK row.'],
  ['13. FX', 'There is no FX sheet: exchange rates are the published central-bank rates of the built-in and country books. An old workbook with an FX sheet is accepted and the sheet is ignored (the reply says so).'],
  ['Required sheets', 'Materials, Machines, Labour, Energy (Overhead, Services & toolroom and Aliases are optional).'],
];

// ─── Build the template / export the current library ───────────────────────────

/**
 * The workbook. `template: true` (GET /template) writes the BASE (UK) rows only — country rows are not pre-filled, so
 * nobody "uploads" a frozen copy of a country book they never typed — and the Instructions sheet first. The export of
 * the resolved book (GET /export) writes the UK rows and the company's rows for other countries (with their country).
 * No FX sheet (rates flow R2).
 */
export function buildRateLibraryWorkbook(lib: RateLibrary, opts: { template?: boolean } = {}): Buffer {
  const wb = XLSX.utils.book_new();
  const base = <T extends { id: string; region?: string }>(t: 'materials' | 'machines' | 'labour' | 'energy', rows: T[]) =>
    opts.template ? rows.filter(r => isBaseRow(t, r)) : rows;
  const cc = (c: string) => (c === 'UK' ? '' : c);
  const countryRows = (t: 'materials' | 'machines') => opts.template ? [] : Object.entries(lib.countryRows ?? {})
    .flatMap(([code, rows]) => ((rows as CountryRateRows)[t] ?? []).map(r => [code, r] as const));

  const add = (name: string, rows: unknown[][], cols: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = cols.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  add(SHEETS.instructions, TEMPLATE_INSTRUCTIONS, [34, 140]);

  const matRow = (m: MaterialRate, country: string) => [m.id, country, m.grade, m.category, m.pricePerKg, m.scrapRecoveryPricePerKg, m.densityKgPerM3, BOOK_CURRENCY, m.region, m.effectiveDate, m.sourceNote, m.confidence];
  add(SHEETS.materials, [
    ['id', 'country', 'grade', 'category', 'pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3', 'currency', 'region', 'effectiveDate', 'sourceNote', 'confidence'],
    ...base('materials', lib.materials).map(m => matRow(m, '')),
    ...countryRows('materials').map(([c, m]) => matRow(m as MaterialRate, c)),
  ], [22, 9, 20, 16, 12, 20, 14, 9, 12, 14, 40, 12]);

  const machRow = (m: MachineRate, country: string) => [m.id, country, m.machineClass, m.region, m.buildup.annualDepreciation, m.buildup.maintenance, m.buildup.energy, m.buildup.floorSpace, m.buildup.indirectSupport, m.buildup.financeCost, m.buildup.annualAvailableHours, m.buildup.machineUtilization, BOOK_CURRENCY, m.effectiveDate, m.sourceNote, m.confidence, m.computedRatePerHr];
  add(SHEETS.machines, [
    ['id', 'country', 'machineClass', 'region', 'annualDepreciation', 'maintenance', 'energy', 'floorSpace', 'indirectSupport', 'financeCost', 'annualAvailableHours', 'machineUtilization', 'currency', 'effectiveDate', 'sourceNote', 'confidence', 'computedRatePerHr (auto)'],
    ...base('machines', lib.machines).map(m => machRow(m, '')),
    ...countryRows('machines').map(([c, m]) => machRow(m as MachineRate, c)),
  ], [22, 9, 22, 12, 18, 14, 12, 12, 16, 14, 20, 18, 9, 14, 36, 12, 22]);

  add(SHEETS.labour, [
    ['id', 'region', 'skillLevel', 'fullyLoadedRatePerHr', 'currency', 'effectiveDate', 'sourceNote', 'confidence'],
    ...base('labour', lib.labour).map(l => [l.id, l.region, l.skillLevel, l.fullyLoadedRatePerHr, BOOK_CURRENCY, l.effectiveDate, l.sourceNote, l.confidence]),
  ], [22, 14, 18, 20, 9, 14, 40, 12]);

  add(SHEETS.energy, [
    ['id', 'region', 'electricityPerKwh', 'gasPerKwh', 'currency', 'effectiveDate', 'sourceNote', 'confidence'],
    ...base('energy', lib.energy).map(e => [e.id, e.region, e.electricityPerKwh, e.gasPerKwh, BOOK_CURRENCY, e.effectiveDate, e.sourceNote, e.confidence]),
  ], [22, 14, 18, 14, 9, 14, 40, 12]);

  const ohRows = opts.template ? lib.overheadDefaults.filter(o => rowCountry(o) === 'UK') : lib.overheadDefaults;
  add(SHEETS.overhead, [
    ['id', 'country', 'commodityType', 'overheadPct', 'marginPct', 'sourceNote'],
    ...ohRows.map(o => [o.id, cc(rowCountry(o)), o.commodityType, o.overheadPct, o.marginPct, o.sourceNote]),
  ], [22, 9, 22, 12, 12, 60]);

  const svcRows = (lib.services ?? []).filter(r => !opts.template || rowCountry(r) === 'UK');
  add(SHEETS.services, [
    ['id', 'country', 'label', 'value', 'unit', 'basis', 'currency', 'effectiveDate', 'sourceNote', 'confidence'],
    ...svcRows.map(r => [r.id, cc(rowCountry(r)), r.label, r.value, r.unit, r.basis, BOOK_CURRENCY, r.effectiveDate, r.sourceNote, r.confidence]),
  ], [30, 9, 46, 12, 14, 22, 9, 14, 60, 12]);

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

/** A country's built-in book (the comparison base of a company country row), memoised per built-in book. */
const countryBooks = new WeakMap<RateLibrary, Map<string, RateLibrary>>();
export function countryBookOf(builtIn: RateLibrary): CountryBookOf {
  let m = countryBooks.get(builtIn);
  if (!m) { m = new Map(); countryBooks.set(builtIn, m); }
  const cache = m;
  return (cc: string) => {
    if (!(REGIONAL_DATA as Record<string, unknown>)[cc] || cc === 'UK') return null;
    let b = cache.get(cc);
    if (!b) { b = buildRegionalLibrary(recomputeMachineRates(builtIn), cc as ManufacturingRegion); cache.set(cc, b); }
    return b;
  };
}

/**
 * Parse and validate an uploaded workbook against the built-in book it is merged over.
 *
 * Refused (each error names the sheet, the Excel row and the column): a missing required sheet or column; text, a
 * currency symbol or a thousands separator in a number cell; a blank number; zero where it would price an item free;
 * a negative; zero hours; utilisation ≤ 0 or > 1 ("80 … use 0.80"); a currency other than GBP; a duplicate id (per
 * country); a country that is not one of the regions; an id the built-in does not have on a sheet that takes only
 * template ids; a new row missing a required field; a material category the built-in book does not use; an Overhead
 * commodity the tool does not know, or two rows for one commodity and country. An FX sheet (pre-R2) is ignored, with a
 * warning.
 */
export function parseRateLibraryWorkbook(buf: Buffer, builtIn: RateLibrary = DEFAULT_RATE_LIBRARY): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(buf, { type: 'buffer' }); }
  catch { return { library: null, delta: null, report: null, errors: ['File is not a readable .xlsx workbook.'], warnings: [], counts: {} }; }
  const countryBook = countryBookOf(builtIn);

  for (const sh of REQUIRED_SHEETS) {
    if (!wb.Sheets[sh]) errors.push(`${sh}: sheet is missing — start from the template (GET /api/rate-library/template).`);
  }
  if (wb.Sheets[LEGACY_FX_SHEET]) {
    warnings.push(`${LEGACY_FX_SHEET}: sheet ignored — exchange rates are the published central-bank rates of the built-in and country books, not a company rate (the template has no FX sheet since Nov 2026).`);
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
      errors.push(`${at(sh, n, 'currency')}: ${raw ? `'${raw}'` : 'blank'} — every row is in GBP: write GBP and the figure in pounds (a country row too, at the published exchange rate).`);
    }
  };
  /** The row's country (a region code; 'UK' when blank). An unknown one is refused. */
  const country = (sh: string, n: number, r: SheetRow): string => {
    const c = countryCode(r.country);
    if (!c) { errors.push(`${at(sh, n, 'country')}: '${str(r.country)}' is not a country the tool costs in — use a code such as UK, CN, IN, DE (or leave blank for the UK).`); return 'UK'; }
    return c;
  };

  const withRow = new Map<string, number>();   // `${sheet}|${id}|${country}` → its Excel row, for messages after the read
  const known = {
    materials: new Set(builtIn.materials.map(m => m.id)), machines: new Set(builtIn.machines.map(m => m.id)),
    labour: new Set(builtIn.labour.map(l => l.id)), energy: new Set(builtIn.energy.map(e => e.id)),
    overheadDefaults: new Set(builtIn.overheadDefaults.map(o => o.id)), services: new Set((builtIn.services ?? []).map(o => o.id)),
  };
  /** Rows with an id, each (id, country) once; a row with figures but no id is refused rather than dropped. */
  const withIds = (sh: string, table: keyof typeof known, allowNew: boolean, byCountry: boolean) => {
    const seen = new Map<string, number>();
    const out: Array<{ r: SheetRow; n: number; cc: string }> = [];
    sheetRows(sh).forEach((r, i) => {
      const n = rowNo(r, i);
      const id = str(r.id);
      if (!id) {
        if (Object.entries(r).some(([k, v]) => k !== 'id' && str(v) !== '')) errors.push(`${at(sh, n, 'id')}: blank — every row needs an id.`);
        return;
      }
      const cc = byCountry ? country(sh, n, r) : 'UK';
      const key = `${id}|${cc}`;
      const first = seen.get(key);
      if (first != null) { errors.push(`${at(sh, n, 'id')}: duplicate id '${id}'${cc !== 'UK' ? ` for ${cc}` : ''} (first on row ${first}).`); return; }
      seen.set(key, n);
      withRow.set(`${sh}|${id}|${cc}`, n);
      // a country row may name an id that country's book does not have (the company's own asset there)
      // (a sheet that takes only template ids takes only them in every country)
      const isNew = cc === 'UK' || !allowNew ? !known[table].has(id) : false;
      if (isNew && !allowNew) {
        errors.push(`${at(sh, n, 'id')}: unknown id '${id}' — the ${sh} sheet takes only the template's ids.`);
        return;
      }
      out.push({ r, n, cc });
    });
    return out;
  };
  /** Labour / Energy name their country in the id; a country column, if the sheet has one, must agree. */
  const idCountryAgrees = (sh: string, n: number, r: SheetRow, id: string, idCc: string) => {
    if (!('country' in r) || !str(r.country)) return;
    const c = countryCode(r.country);
    if (c !== idCc) errors.push(`${at(sh, n, 'country')}: '${str(r.country)}' — on the ${sh} sheet the id names the country ('${id}' is ${idCc}); a row for another country takes that country's id (lab-<cc>-…, energy-<cc>).`);
  };
  const categories = new Set(builtIn.materials.map(m => m.category));

  const M = SHEETS.materials;
  const materialsAll = withIds(M, 'materials', true, true).map(({ r, n, cc }) => {
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
      region: str(r.region) || (cc === 'UK' ? 'UK' : cc), effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
    };
    if (row.scrapRecoveryPricePerKg > row.pricePerKg && row.pricePerKg > 0) {
      errors.push(`${at(M, n, 'scrapRecoveryPricePerKg')}: ${row.scrapRecoveryPricePerKg} is more than the price ${row.pricePerKg} — a scrap credit cannot exceed the price.`);
    }
    return { row, cc };
  });

  const MA = SHEETS.machines;
  const machinesAll = withIds(MA, 'machines', true, true).map(({ r, n, cc }) => {
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
    const row: MachineRate = {
      id: str(r.id), machineClass: needText(MA, n, r, 'machineClass'), region: str(r.region) || (cc === 'UK' ? 'UK' : cc), buildup,
      computedRatePerHr: computeMachineRatePerHr(buildup),   // always derived, never trusted from the file
      effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
    };
    return { row, cc };
  });
  const materials = materialsAll.filter(x => x.cc === 'UK').map(x => x.row);
  const machines = machinesAll.filter(x => x.cc === 'UK').map(x => x.row);
  const countryRows: Record<string, CountryRateRows> = {};
  for (const { row, cc } of materialsAll) if (cc !== 'UK') ((countryRows[cc] ??= {}).materials ??= []).push(row);
  for (const { row, cc } of machinesAll) if (cc !== 'UK') ((countryRows[cc] ??= {}).machines ??= []).push(row);

  const L = SHEETS.labour;
  const labour: LabourRate[] = withIds(L, 'labour', true, false).map(({ r, n }) => {
    currency(L, n, r);
    const id = str(r.id);
    const m = /^lab-([a-z]{2})-/.exec(id);
    idCountryAgrees(L, n, r, id, m && m[1] !== 'uk' ? m[1].toUpperCase() : 'UK');
    return {
      id, region: str(r.region) || 'UK', skillLevel: needText(L, n, r, 'skillLevel'),
      fullyLoadedRatePerHr: need(L, n, r, 'fullyLoadedRatePerHr'),
      effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
    };
  });

  const E = SHEETS.energy;
  const energy: EnergyRate[] = withIds(E, 'energy', false, false).map(({ r, n }) => {
    currency(E, n, r);
    const id = str(r.id);
    idCountryAgrees(E, n, r, id, id === 'energy-uk' ? 'UK' : id.replace(/^energy-/, '').toUpperCase());
    return {
      id, region: str(r.region),
      electricityPerKwh: need(E, n, r, 'electricityPerKwh'),
      gasPerKwh: need(E, n, r, 'gasPerKwh'),
      effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
    };
  });

  // Overhead (rates flow R2): one row per commodity and country; '*' = every commodity of that country.
  const O = SHEETS.overhead;
  const ohSeen = new Map<string, number>();
  const overheadDefaults: OverheadDefault[] = [];
  for (const { r, n, cc } of withIds(O, 'overheadDefaults', true, true)) {
    const id = str(r.id);
    const commodityType = needText(O, n, r, 'commodityType');
    const overheadPct = need(O, n, r, 'overheadPct');
    const marginPct = need(O, n, r, 'marginPct');
    const legacy = LEGACY_OVERHEAD[id];
    if (legacy && cc === 'UK' && legacy[0] === commodityType && Math.abs(legacy[1] - overheadPct) < 1e-9 && Math.abs(legacy[2] - marginPct) < 1e-9) {
      warnings.push(`${at(O, n, 'id')}: '${id}' is a pre-Nov-2026 template row at its old "Industry benchmark" values, which no costing ever read — ignored. To set an overhead, give the commodity (or *) and country your figures.`);
      continue;
    }
    if (commodityType && !OVERHEAD_COMMODITIES.has(commodityType)) {
      errors.push(`${at(O, n, 'commodityType')}: '${commodityType}' is not a commodity — use * (every commodity) or one of ${[...OVERHEAD_COMMODITIES].filter(c => c !== '*').join(', ')}.`);
    }
    const k = `${commodityType}|${cc}`;
    const first = ohSeen.get(k);
    if (first != null) { errors.push(`${at(O, n, 'commodityType')}: a second row for ${commodityType === '*' ? 'every commodity' : commodityType} in ${cc} (first on row ${first}) — one row per commodity and country.`); continue; }
    ohSeen.set(k, n);
    overheadDefaults.push({ id, commodityType: commodityType as CommodityType | '*', ...(cc !== 'UK' ? { country: cc } : {}),
      ...(str(r.supplierTier) ? { supplierTier: str(r.supplierTier) } : {}), overheadPct, marginPct, sourceNote: str(r.sourceNote) });
  }
  // The built-in '*' UK row is the default whichever id a company row uses for the same slot: a second id for it is a
  // company UK '*' row and replaces the built-in's figure there (by commodity and country, not by id).
  const ukStar = overheadDefaults.find(o => o.commodityType === '*' && rowCountry(o) === 'UK' && o.id !== BUILT_IN_SHOP_ROW.id);
  if (ukStar) {
    errors.push(`${at(O, withRow.get(`${O}|${ukStar.id}|UK`) ?? 0, 'id')}: the UK row for every commodity is '${BUILT_IN_SHOP_ROW.id}' — change its figures rather than adding '${ukStar.id}'.`);
  }

  // Services & toolroom (rates flow R2): only the template's ids; the basis is the code's.
  const SV = SHEETS.services;
  const builtInSvc = new Map((builtIn.services ?? []).map(x => [x.id, x]));
  const services: ServiceRate[] = withIds(SV, 'services', false, true).map(({ r, n, cc }) => {
    currency(SV, n, r);
    const id = str(r.id);
    const b = builtInSvc.get(id)!;
    if (str(r.basis) && b && str(r.basis) !== b.basis) {
      warnings.push(`${at(SV, n, 'basis')}: '${str(r.basis)}' ignored — the basis of '${id}' is the code's (${b.basis}): it is how a country with no row of its own moves the UK figure.`);
    }
    return {
      id, ...(cc !== 'UK' ? { country: cc } : {}), label: str(r.label) || b?.label || id, value: need(SV, n, r, 'value'),
      unit: b?.unit ?? str(r.unit), basis: b?.basis ?? 'global',
      effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
    };
  });

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

  const nCountry = Object.values(countryRows).reduce((t, c) => t + (c.materials?.length ?? 0) + (c.machines?.length ?? 0), 0);
  const counts: Record<string, number> = { materials: materials.length, machines: machines.length, labour: labour.length, energy: energy.length,
    overheadDefaults: overheadDefaults.length, services: services.length, countryRows: nCountry, aliases: aliases.length };
  // Unit sanity (rates flow R1): a changed figure more than 10× or under a tenth of the built-in figure for the SAME id (and,
  // R2, the same country — a country row is compared with that country's own book) is refused — prices in pence, £/t for
  // £/kg, g/cm³ for kg/m³, a monthly machine cost. The 10× bound is a validation threshold (CostVision engineering
  // judgement, not a sourced figure); a genuine outlier goes in as a new id.
  const RATIO = 10;
  const cellErrors = errors.length;   // a cell already refused (utilisation 80) is not ALSO reported as a unit error
  const sane = (sh: string, id: string, cc: string, col: string, v: number, b: number | undefined) => {
    if (cellErrors || !(b && b > 0) || !(v > 0)) return;
    const r = v / b;
    if (r > RATIO || r < 1 / RATIO) {
      const n = withRow.get(`${sh}|${id}|${cc}`) ?? 0;
      errors.push(`${at(sh, n, col)}: ${v} is ${r >= 1 ? `${+r.toFixed(1)}×` : `1/${+(1 / r).toFixed(1)} of`} the built-in ${cc !== 'UK' ? `${cc} ` : ''}${+b.toPrecision(6)} — `
        + `looks like a unit error (pence for pounds, £/t for £/kg, g/cm³ for kg/m³?). A company rate more than ${RATIO}× or under a tenth `
        + 'of the built-in figure for the same id is refused (a sanity bound, engineering judgement); add a genuine outlier as a new id.');
    }
  };
  const byId = <T extends { id: string }>(rs: T[] | undefined) => new Map((rs ?? []).map(r => [r.id, r]));
  const bookOf = (cc: string) => (cc === 'UK' ? builtIn : countryBook(cc));
  for (const { row: m, cc } of materialsAll) {
    const b = byId(bookOf(cc)?.materials).get(m.id); if (!b) continue;
    sane(M, m.id, cc, 'pricePerKg', m.pricePerKg, b.pricePerKg);
    sane(M, m.id, cc, 'scrapRecoveryPricePerKg', m.scrapRecoveryPricePerKg, b.scrapRecoveryPricePerKg);
    sane(M, m.id, cc, 'densityKgPerM3', m.densityKgPerM3, b.densityKgPerM3);
  }
  for (const { row: m, cc } of machinesAll) {
    const b = byId(bookOf(cc)?.machines).get(m.id); if (!b) continue;
    sane(MA, m.id, cc, 'annualDepreciation…financeCost (the £/h)', m.computedRatePerHr, computeMachineRatePerHr(b.buildup));
  }
  const bLab = byId(builtIn.labour), bEn = byId(builtIn.energy);
  for (const l of labour) sane(L, l.id, 'UK', 'fullyLoadedRatePerHr', l.fullyLoadedRatePerHr, bLab.get(l.id)?.fullyLoadedRatePerHr);
  for (const e of energy) {
    sane(E, e.id, 'UK', 'electricityPerKwh', e.electricityPerKwh, bEn.get(e.id)?.electricityPerKwh);
    sane(E, e.id, 'UK', 'gasPerKwh', e.gasPerKwh, bEn.get(e.id)?.gasPerKwh);
  }
  for (const v of services) {
    const b = builtInSvc.get(v.id); if (!b) continue;
    const cc = rowCountry(v);
    // a country's built-in figure is the UK figure × its country factor (what that country costs without a row)
    const base = cc === 'UK' ? b.value : inCountry(b.value, parseServiceBasis(b.basis), cc as ManufacturingRegion);
    sane(SV, v.id, cc, 'value', v.value, base);
  }

  // Warnings: a likely typo (a new id within two edits of a built-in id), and template rows the sheet left out.
  const sheetIds: Array<[string, 'materials' | 'machines' | 'labour', Array<{ id: string }>]> = [[M, 'materials', materials], [MA, 'machines', machines], [L, 'labour', labour]];
  for (const [sh, t, rowsOf] of sheetIds) {
    for (const r of rowsOf) {
      if (known[t].has(r.id)) continue;
      const near = [...known[t]].find(k => editDistanceAtMost(k, r.id, 2));
      if (near) warnings.push(`${at(sh, withRow.get(`${sh}|${r.id}|UK`) ?? 0, 'id')}: '${r.id}' is a NEW id, added beside the built-in '${near}' — if it is a typo, '${near}' stays at its built-in rate.`);
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
    materials, machines, labour, energy, fx: [], overheadDefaults, services,
    ...(Object.keys(countryRows).length ? { countryRows } : {}),
    ...(aliases.length ? { aliases } : {}),
    version: 'company-upload', lastModified: '',   // stamped by the caller
  };
  // Only what the sheet changes or adds is stored. A changed row that still carries the built-in's source note (or
  // none) would cite the built-in source for the company's figure — it says it is the company's.
  const delta = companyDelta(builtIn, library, countryBook);
  const companyNote = 'Company rate book (uploaded workbook)';
  for (const t of ['materials', 'machines', 'labour', 'energy', 'overheadDefaults', 'services'] as const) {
    const byKey = new Map(((builtIn[t] ?? []) as Array<{ id: string; sourceNote?: string; country?: string }>).map(x => [`${x.id}|${rowCountry(x)}`, x]));
    for (const row of (delta[t] ?? []) as Array<{ id: string; sourceNote?: string; country?: string }>) {
      const b = byKey.get(`${row.id}|${rowCountry(row)}`);
      if (!row.sourceNote || (b && row.sourceNote === b.sourceNote)) row.sourceNote = companyNote;
    }
  }
  for (const [cc, rws] of Object.entries(delta.countryRows ?? {})) {
    for (const t of ['materials', 'machines'] as const) {
      const bk = byId(countryBook(cc)?.[t] as Array<{ id: string; sourceNote?: string }> | undefined);
      for (const row of (rws[t] ?? []) as Array<{ id: string; sourceNote?: string }>) {
        if (!row.sourceNote || row.sourceNote === bk.get(row.id)?.sourceNote) row.sourceNote = `${companyNote}, ${cc} row`;
      }
    }
  }
  const report = companyRowReport(builtIn, delta, countryBook);
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
