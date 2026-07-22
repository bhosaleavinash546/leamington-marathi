/**
 * Bulk actuals import — parse a pasted/uploaded CSV of real PO/quote prices into
 * CalibrationRecords, so a fleet of historical actuals can seed the learn-from-
 * actuals loop across many segments at once (instead of one prompt at a time).
 *
 * Header-driven and forgiving: column order is free, headers are matched by
 * synonym. Required columns: commodity, estimate (the model's should-cost at the
 * time), actual (the real price). Optional: region, material, currency, date, note.
 * Pure — the caller passes `nowMs` so no clock is read here.
 */
import type { CalibrationRecord } from './calibration.js';

export interface ActualsImportResult {
  records: CalibrationRecord[];
  imported: number;
  skipped: number;
  errors: string[];
}

/** Split one CSV line, honouring double-quoted fields (which may contain commas). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else { cur += ch; }
    } else if (ch === '"') { inQ = true; }
    else if (ch === ',') { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Header synonym → canonical field.
const HEADER_ALIASES: Record<string, string> = {
  commodity: 'commodity', process: 'commodity', commodity_type: 'commodity',
  estimate: 'estimate', estimated: 'estimate', shouldcost: 'estimate', should_cost: 'estimate', model: 'estimate', modelcost: 'estimate', model_cost: 'estimate',
  actual: 'actual', actualcost: 'actual', actual_cost: 'actual', po: 'actual', po_price: 'actual', quote: 'actual', price: 'actual', paid: 'actual',
  region: 'region', country: 'region',
  material: 'material', materialfamily: 'material', material_family: 'material', family: 'material',
  currency: 'currency', ccy: 'currency',
  date: 'date', loggedat: 'date', logged_at: 'date', savedat: 'date',
  note: 'note', notes: 'note', part: 'note', partname: 'note', part_name: 'note', partnumber: 'note', part_number: 'note', description: 'note',
};

// Commodity label → canonical engine key (else the normalised value is kept).
const COMMODITY_ALIASES: Record<string, string> = {
  im: 'injection_moulding', injection: 'injection_moulding', injection_molding: 'injection_moulding',
  blow: 'blow_moulding', blow_molding: 'blow_moulding', ebm: 'blow_moulding',
  sheet: 'sheet_metal', stamping: 'sheet_metal', sheetmetal: 'sheet_metal', sheet_metal_stamping: 'sheet_metal',
  sheet_metal_fabrication: 'sheet_metal_fab', smf: 'sheet_metal_fab',
  cnc: 'machining', machined: 'machining',
  cast: 'casting', hpdc: 'casting', die_casting: 'casting',
  forged: 'forging',
  cast_machine: 'cast_and_machine',
  roto: 'rotational_moulding', rotomoulding: 'rotational_moulding', rotational_molding: 'rotational_moulding',
  thermoform: 'thermoforming',
  harness: 'wiring_harness',
  biw: 'biw_assembly',
};

const canonicalCommodity = (raw: string): string => {
  const n = norm(raw);
  return COMMODITY_ALIASES[n] ?? n;
};

const CURRENCIES = new Set(['GBP', 'EUR', 'USD', 'CNY', 'INR']);

/** Parse a CSV of actuals into CalibrationRecords. `nowMs` stamps rows lacking a
 *  parseable date (preserving file order via a per-row offset). */
export function parseActualsCsv(text: string, nowMs: number): ActualsImportResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { records: [], imported: 0, skipped: 0, errors: ['Need a header row plus at least one data row.'] };
  }
  const header = splitCsvLine(lines[0]).map(h => HEADER_ALIASES[norm(h)] ?? norm(h));
  const col = (name: string) => header.indexOf(name);
  const iCommodity = col('commodity'), iEstimate = col('estimate'), iActual = col('actual');
  const missing = [
    iCommodity < 0 ? 'commodity' : '', iEstimate < 0 ? 'estimate/should-cost' : '', iActual < 0 ? 'actual/PO/quote' : '',
  ].filter(Boolean);
  if (missing.length) {
    return { records: [], imported: 0, skipped: 0, errors: [`Missing required column(s): ${missing.join(', ')}. Header seen: ${header.join(', ')}`] };
  }
  const iRegion = col('region'), iMaterial = col('material'), iCurrency = col('currency'), iDate = col('date'), iNote = col('note');

  const num = (s: string | undefined): number => {
    if (s == null) return NaN;
    return parseFloat(s.replace(/[£€$¥₹,\s]/g, ''));
  };

  const records: CalibrationRecord[] = [];
  let skipped = 0;
  const rows = lines.slice(1);
  for (let r = 0; r < rows.length; r++) {
    const cells = splitCsvLine(rows[r]);
    const rowNo = r + 2;   // 1-indexed incl. header
    const commodity = canonicalCommodity(cells[iCommodity] ?? '');
    const estimate = num(cells[iEstimate]);
    const actual = num(cells[iActual]);
    if (!commodity) { skipped++; errors.push(`Row ${rowNo}: missing commodity`); continue; }
    if (!Number.isFinite(estimate) || estimate <= 0) { skipped++; errors.push(`Row ${rowNo}: bad estimate "${cells[iEstimate] ?? ''}"`); continue; }
    if (!Number.isFinite(actual) || actual <= 0) { skipped++; errors.push(`Row ${rowNo}: bad actual "${cells[iActual] ?? ''}"`); continue; }

    let savedAt = nowMs + r * 1000;
    if (iDate >= 0 && cells[iDate]) {
      const d = Date.parse(cells[iDate]);
      if (Number.isFinite(d)) savedAt = d;
    }
    const cur = iCurrency >= 0 ? (cells[iCurrency] ?? '').toUpperCase().trim() : '';
    records.push({
      id: `imp-${nowMs}-${r}`,
      savedAt,
      commodity,
      region: iRegion >= 0 && cells[iRegion] ? cells[iRegion].toUpperCase().trim() : undefined,
      materialFamily: iMaterial >= 0 && cells[iMaterial] ? cells[iMaterial].trim() : undefined,
      shouldCost: estimate,
      actualCost: actual,
      currency: CURRENCIES.has(cur) ? cur : 'GBP',
      note: iNote >= 0 && cells[iNote] ? cells[iNote].trim() : undefined,
    });
  }
  return { records, imported: records.length, skipped, errors };
}
