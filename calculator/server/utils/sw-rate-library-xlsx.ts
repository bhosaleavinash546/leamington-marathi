/**
 * Excel (.xlsx) template + parser for the SW Should-Cost rate library
 * (base £/PM and the regional / dev-source / ASIL / complexity / reuse
 * multipliers). Each multiplier group is one sheet of key, value, source,
 * as-of date, confidence, note.
 *
 * Parses back into a Partial<SWRateLibrary>, which the SW engine already merges
 * over its built-in defaults (resolveRateLibrary) — so a full OR partial upload
 * works, satisfying "full library and/or overrides".
 */
import * as XLSX from 'xlsx';
import type { SWRateLibrary, SWRateEntry, RateConfidence } from '../../src/engine/sw-rate-library.js';

export interface SWParseResult {
  library: Partial<SWRateLibrary> | null;
  errors: string[];
  counts: Record<string, number>;
}

const GROUPS: Array<{ sheet: string; key: keyof SWRateLibrary }> = [
  { sheet: 'Regions',      key: 'regionMultipliers' },
  { sheet: 'DevSource',    key: 'devSourceMultipliers' },
  { sheet: 'ASIL-Dev',     key: 'asilDevMultipliers' },
  { sheet: 'ASIL-Test',    key: 'asilTestMultipliers' },
  { sheet: 'Complexity',   key: 'complexityMultipliers' },
  { sheet: 'Reuse',        key: 'reuseFactors' },
];
const HEAD = ['key', 'value', 'source', 'asOf', 'confidence', 'note'];

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => { const n = typeof v === 'string' ? Number(v.replace(/[£$€,\s]/g, '')) : Number(v); return Number.isFinite(n) ? n : NaN; };
const conf = (v: unknown): RateConfidence => { const s = str(v); return s === 'High' || s === 'Medium' || s === 'Low' ? s : 'Medium'; };

// ─── Build / export ────────────────────────────────────────────────────────────

export function buildSWRateWorkbook(lib: SWRateLibrary): Buffer {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 52 }, { wch: 10 }, { wch: 12 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  const entryRow = (k: string, e: SWRateEntry) => [k, e.value, e.source, e.asOf, e.confidence, e.note ?? ''];

  add('Base', [HEAD, entryRow('ukBaseRatePerPM', lib.ukBaseRatePerPM)]);
  for (const g of GROUPS) {
    const rec = lib[g.key] as Record<string, SWRateEntry>;
    add(g.sheet, [HEAD, ...Object.entries(rec).map(([k, e]) => entryRow(k, e))]);
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

// ─── Parse ──────────────────────────────────────────────────────────────────---

function readGroup(wb: XLSX.WorkBook, sheet: string, errors: string[]): Record<string, SWRateEntry> {
  const ws = wb.Sheets[sheet];
  if (!ws) return {};
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
  const out: Record<string, SWRateEntry> = {};
  for (const [i, r] of rows.entries()) {
    const key = str(r.key);
    if (!key) continue;
    const value = num(r.value);
    if (!Number.isFinite(value)) { errors.push(`${sheet} row ${i + 2} (${key}): value is not a number`); continue; }
    if (value < 0) { errors.push(`${sheet} row ${i + 2} (${key}): value must not be negative`); continue; }
    out[key] = { value, source: str(r.source), asOf: str(r.asOf), confidence: conf(r.confidence), note: str(r.note) || undefined };
  }
  return out;
}

export function parseSWRateWorkbook(buf: Buffer): SWParseResult {
  const errors: string[] = [];
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(buf, { type: 'buffer' }); }
  catch { return { library: null, errors: ['File is not a readable .xlsx workbook.'], counts: {} }; }

  const lib: Partial<SWRateLibrary> = {};
  const counts: Record<string, number> = {};

  // Base rate (single row on the Base sheet).
  const baseRows = wb.Sheets['Base'] ? XLSX.utils.sheet_to_json(wb.Sheets['Base'], { defval: '' }) as Record<string, unknown>[] : [];
  const baseRow = baseRows.find(r => str(r.key) === 'ukBaseRatePerPM') ?? baseRows[0];
  if (baseRow && str(baseRow.value ?? baseRow.key)) {
    const v = num(baseRow.value);
    if (Number.isFinite(v) && v > 0) {
      lib.ukBaseRatePerPM = { value: v, source: str(baseRow.source), asOf: str(baseRow.asOf), confidence: conf(baseRow.confidence), note: str(baseRow.note) || undefined };
      counts.base = 1;
    } else if (baseRow.value !== '') {
      errors.push('Base: ukBaseRatePerPM must be a positive number');
    }
  }

  for (const g of GROUPS) {
    const rec = readGroup(wb, g.sheet, errors);
    if (Object.keys(rec).length) { (lib as Record<string, unknown>)[g.key] = rec; counts[g.sheet] = Object.keys(rec).length; }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0 && errors.length === 0) errors.push('No rate rows found — is this the SW rate template?');
  if (errors.length) return { library: null, errors, counts };
  return { library: lib, errors: [], counts };
}
