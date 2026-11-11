/**
 * KPI dashboard — file parsers (pure): the approved FX table and the costing-record import
 * (CSS System, CPSC II or any other tool's export, mapped to one documented template).
 *
 * Both refuse the whole file on any error and name sheet row + column, like the company
 * rate-book parser. Nothing is guessed: a blank cell stays missing, a currency must be a
 * real ISO 4217 code, a rate must be GBP per ONE unit (or given as units per GBP in its
 * own column and inverted, stated), and a rate more than 10× away from the built-in
 * reference is refused — that is almost always an inverted rate.
 */
import * as XLSX from 'xlsx';
import {
  isIsoCurrency, isIsoDate, RECORD_STATUSES, type FxRateRow, type FxReference, type RecordStatus,
} from '../../src/engine/kpi-dashboard.js';
import type { RecordInput } from '../data/kpi-store.js';

export interface ParseError { row: number; column: string; message: string }

/** Read the first sheet of a CSV / XLSX buffer into rows keyed by normalised header. */
export function readSheet(buf: Buffer): { rows: Record<string, unknown>[]; headers: string[] } {
  // raw: CSV text stays text — SheetJS otherwise reads "2026-11" (a monthly FX period) or
  // "01/02/2026" (an ambiguous date) as dates. A real Excel date cell still arrives as a Date.
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], headers: [] };
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
  const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const rows = raw.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [norm(k), v])));
  const headers = rows.length ? Object.keys(rows[0]) : (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })[0] ?? []).map(h => norm(String(h)));
  return { rows, headers };
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const str = (v: unknown) => (blank(v) ? null : String(v).trim());
function num(v: unknown): number | null | 'bad' {
  if (blank(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 'bad';
  const s = String(v).trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) return 'bad';
  return Number(s);
}
/** An Excel date cell as YYYY-MM-DD in the calendar it was typed in (SheetJS builds local-time Dates). */
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function date(v: unknown): string | null | 'bad' {
  if (blank(v)) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return localDay(v);
  const s = String(v).trim();
  return isIsoDate(s) ? s : 'bad';
}

// ─── FX table ─────────────────────────────────────────────────────────────────

export const FX_TEMPLATE_COLUMNS = ['currency', 'period', 'gbp_per_unit', 'units_per_gbp', 'source'] as const;

export function parseFxRows(rows: Record<string, unknown>[], headers: string[], ref: FxReference, nowIso: string): { rates: FxRateRow[]; errors: ParseError[]; notes: string[] } {
  const errors: ParseError[] = [];
  const notes: string[] = [];
  for (const need of ['currency', 'period', 'source']) if (!headers.includes(need)) errors.push({ row: 1, column: need, message: `Missing column "${need}"` });
  if (!headers.includes('gbp_per_unit') && !headers.includes('units_per_gbp')) errors.push({ row: 1, column: 'gbp_per_unit', message: 'Give the rate as "gbp_per_unit" (GBP for one unit) or "units_per_gbp" (units for £1)' });
  if (errors.length) return { rates: [], errors, notes };
  const seen = new Set<string>();
  const rates: FxRateRow[] = [];
  let inverted = 0;
  rows.forEach((r, i) => {
    const row = i + 2;
    if (Object.values(r).every(blank)) return;
    const ccy = str(r.currency)?.toUpperCase() ?? null;
    if (!ccy || !isIsoCurrency(ccy)) { errors.push({ row, column: 'currency', message: `"${r.currency ?? ''}" is not an ISO 4217 currency code` }); return; }
    if (ccy === 'GBP') { errors.push({ row, column: 'currency', message: 'GBP needs no rate (it is the reporting currency)' }); return; }
    let period = str(r.period);
    if (r.period instanceof Date) period = localDay(r.period);   // an Excel date cell is a DAILY rate
    if (!period || !(/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || isIsoDate(period))) { errors.push({ row, column: 'period', message: `Period "${r.period ?? ''}" must be YYYY-MM (monthly) or YYYY-MM-DD (daily)` }); return; }
    const gpu = num(r.gbp_per_unit); const upg = num(r.units_per_gbp);
    if (gpu === 'bad') { errors.push({ row, column: 'gbp_per_unit', message: `"${r.gbp_per_unit}" is not a number` }); return; }
    if (upg === 'bad') { errors.push({ row, column: 'units_per_gbp', message: `"${r.units_per_gbp}" is not a number` }); return; }
    if (gpu !== null && upg !== null) { errors.push({ row, column: 'gbp_per_unit', message: 'Give gbp_per_unit OR units_per_gbp, not both' }); return; }
    const rate = gpu !== null ? gpu : upg !== null && upg > 0 ? 1 / upg : null;
    if (upg !== null) inverted++;
    if (rate === null || !(rate > 0)) { errors.push({ row, column: gpu !== null ? 'gbp_per_unit' : 'units_per_gbp', message: 'Rate must be greater than zero' }); return; }
    const refRate = ref.rates[ccy];
    if (refRate && (rate > refRate * 10 || rate < refRate / 10)) {
      errors.push({ row, column: gpu !== null ? 'gbp_per_unit' : 'units_per_gbp', message: `£${rate.toPrecision(4)} per ${ccy} is more than 10× away from the reference £${refRate.toPrecision(4)} — is the rate inverted?` });
      return;
    }
    const source = str(r.source);
    if (!source) { errors.push({ row, column: 'source', message: 'Every rate needs a source (e.g. "JLR Treasury approved rate, Nov 2026")' }); return; }
    const key = `${ccy}|${period}`;
    if (seen.has(key)) { errors.push({ row, column: 'period', message: `${ccy} ${period} appears twice in the file` }); return; }
    seen.add(key);
    rates.push({ currency: ccy, period, gbpPerUnit: rate, source, loadedAt: nowIso });
  });
  if (inverted) notes.push(`${inverted} rate(s) given as units per £1 were stored as GBP per unit (1 ÷ rate).`);
  if (!rates.length && !errors.length) errors.push({ row: 2, column: 'currency', message: 'The file has no rate rows' });
  return { rates: errors.length ? [] : rates, errors, notes };
}

// ─── Costing-record import ───────────────────────────────────────────────────

export const IMPORT_COLUMNS: { key: string; required: boolean; note: string }[] = [
  { key: 'source_tool', required: true, note: 'Tool the record comes from, e.g. "CSS System", "CPSC II"' },
  { key: 'source_record_id', required: true, note: 'The record id in that tool — re-importing the same id updates the record' },
  { key: 'owner', required: true, note: 'Who did the costing (name or email as the tool holds it)' },
  { key: 'part_number', required: false, note: 'Identifies the component; without it the record cannot be de-duplicated' },
  { key: 'component_name', required: true, note: '' },
  { key: 'commodity', required: false, note: '' },
  { key: 'programme', required: false, note: 'e.g. L460, L461, L663, EMA, JEA' },
  { key: 'model_year', required: false, note: 'Four-digit year, e.g. 2027' },
  { key: 'powertrain', required: false, note: 'e.g. MHEV, Petrol PHEV, Diesel PHEV, Petrol, BEV' },
  { key: 'country', required: false, note: 'Manufacturing country / market' },
  { key: 'status', required: true, note: 'draft, completed, reviewed or approved' },
  { key: 'costing_date', required: true, note: 'YYYY-MM-DD — drives the date filter and the FX month' },
  { key: 'should_cost', required: false, note: 'Per piece, in should_currency' },
  { key: 'should_currency', required: false, note: 'ISO 4217' },
  { key: 'should_terms', required: false, note: 'DAP or EXW' },
  { key: 'current_cost', required: false, note: 'Per piece, in current_currency (quote / PO price)' },
  { key: 'current_currency', required: false, note: 'ISO 4217' },
  { key: 'current_terms', required: false, note: 'DAP or EXW' },
  { key: 'current_source', required: false, note: 'quote, purchase order, contract …' },
  { key: 'annual_volume', required: false, note: 'Parts a year' },
  { key: 'volume_validated', required: false, note: 'yes / no — only validated volumes feed the annualised figure' },
  { key: 'saving_status', required: false, note: 'validated or implemented (blank = none)' },
  { key: 'saving_per_piece', required: false, note: 'In saving_currency' },
  { key: 'saving_currency', required: false, note: 'ISO 4217' },
  { key: 'is_test', required: false, note: 'yes to exclude from reporting' },
  { key: 'notes', required: false, note: '' },
];

export type ImportRow = Omit<RecordInput, 'ownerId'> & { sourceTool: string; sourceRef: string; ownerLabel: string };

export function parseImportRows(rows: Record<string, unknown>[], headers: string[]): { records: ImportRow[]; errors: ParseError[] } {
  const errors: ParseError[] = [];
  for (const c of IMPORT_COLUMNS) if (c.required && !headers.includes(c.key)) errors.push({ row: 1, column: c.key, message: `Missing column "${c.key}"` });
  if (errors.length) return { records: [], errors };
  const records: ImportRow[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const row = i + 2;
    if (Object.values(r).every(blank)) return;
    const err = (column: string, message: string) => errors.push({ row, column, message });
    const before = errors.length;
    const tool = str(r.source_tool); const ref = str(r.source_record_id); const owner = str(r.owner); const name = str(r.component_name);
    if (!tool) err('source_tool', 'Required');
    else if (tool.toLowerCase() === 'costvision') err('source_tool', 'CostVision records are saved from CostVision, not imported');
    if (!ref) err('source_record_id', 'Required');
    if (!owner) err('owner', 'Required');
    if (!name) err('component_name', 'Required');
    const status = str(r.status)?.toLowerCase();
    if (!status || !RECORD_STATUSES.includes(status as RecordStatus)) err('status', `"${r.status ?? ''}" must be one of ${RECORD_STATUSES.join(', ')}`);
    const cd = date(r.costing_date);
    if (cd === null || cd === 'bad') err('costing_date', `"${r.costing_date ?? ''}" must be a date YYYY-MM-DD`);
    const my = num(r.model_year);
    if (my === 'bad' || (my !== null && (!Number.isInteger(my) || my < 2000 || my > 2100))) err('model_year', `"${r.model_year}" must be a four-digit year`);
    const money = (vk: string, ck: string, tk: string | null) => {
      const v = num(r[vk]); const c = str(r[ck])?.toUpperCase() ?? null; const t = tk ? str(r[tk])?.toUpperCase() ?? null : null;
      if (v === 'bad' || (typeof v === 'number' && v < 0)) err(vk, `"${r[vk]}" must be a number ≥ 0`);
      if (typeof v === 'number' && !c) err(ck, `A ${vk.replace(/_/g, ' ')} needs its currency`);
      if (c && !isIsoCurrency(c)) err(ck, `"${c}" is not an ISO 4217 currency code`);
      if (tk && t && t !== 'DAP' && t !== 'EXW') err(tk, `"${t}" must be DAP or EXW`);
      return { v: typeof v === 'number' ? v : null, c: typeof v === 'number' ? c : null, t: (t === 'DAP' || t === 'EXW' ? t : null) as 'DAP' | 'EXW' | null };
    };
    const should = money('should_cost', 'should_currency', 'should_terms');
    const current = money('current_cost', 'current_currency', 'current_terms');
    const saving = money('saving_per_piece', 'saving_currency', null);
    const vol = num(r.annual_volume);
    if (vol === 'bad' || (typeof vol === 'number' && (vol < 0 || !Number.isInteger(vol)))) err('annual_volume', `"${r.annual_volume}" must be a whole number of parts`);
    const ss = str(r.saving_status)?.toLowerCase() ?? null;
    if (ss && ss !== 'validated' && ss !== 'implemented') err('saving_status', `"${ss}" must be validated, implemented or blank`);
    if (ss && saving.v === null) err('saving_per_piece', 'A saving status needs the saving per piece');
    const yes = (v: unknown) => /^(y|yes|true|1)$/i.test(String(v ?? '').trim());
    const key = `${tool}|${ref}`;
    if (tool && ref) { if (seen.has(key)) err('source_record_id', `${tool} ${ref} appears twice in the file`); seen.add(key); }
    if (errors.length > before) return;
    records.push({
      sourceTool: tool!, sourceRef: ref!, ownerLabel: owner!, partNumber: str(r.part_number), componentName: name!,
      commodity: str(r.commodity), programme: str(r.programme), modelYear: typeof my === 'number' ? my : null,
      powertrain: str(r.powertrain), country: str(r.country), status: status as RecordStatus, costingDate: cd as string,
      shouldCost: should.v, shouldCcy: should.c, shouldTerms: should.t,
      currentCost: current.v, currentCcy: current.c, currentTerms: current.t, currentSource: str(r.current_source),
      annualVolume: typeof vol === 'number' ? vol : null, volumeValidated: yes(r.volume_validated),
      savingStatus: (ss as 'validated' | 'implemented' | null), savingPerPiece: saving.v, savingCcy: saving.c,
      isTest: yes(r.is_test), notes: str(r.notes) ?? '',
    });
  });
  if (!records.length && !errors.length) errors.push({ row: 2, column: 'source_tool', message: 'The file has no record rows' });
  return { records: errors.length ? [] : records, errors };
}

/** A blank import template (CSV) with one illustrative row marked is_test = yes. */
export function importTemplateCsv(): string {
  const head = IMPORT_COLUMNS.map(c => c.key).join(',');
  const example = ['CSS System', 'CSS-000123', 'A. Engineer', 'LR123456', 'Front knuckle', 'Casting', 'L460', '2027', 'BEV', 'GB', 'completed',
    '2026-10-01', '24.50', 'GBP', 'DAP', '27.90', 'EUR', 'DAP', 'quote', '120000', 'no', '', '', '', 'yes', 'Example row — delete before loading'].join(',');
  return `${head}\r\n${example}\r\n`;
}
