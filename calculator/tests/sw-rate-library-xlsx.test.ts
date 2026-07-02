import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { DEFAULT_SW_RATE_LIBRARY, resolveRateLibrary } from '../src/engine/sw-rate-library.js';
import { buildSWRateWorkbook, parseSWRateWorkbook } from '../server/utils/sw-rate-library-xlsx.js';

const lib = DEFAULT_SW_RATE_LIBRARY;

describe('SW rate library Excel round-trip', () => {
  it('build → parse preserves the base rate and all multiplier groups', () => {
    const { library, errors, counts } = parseSWRateWorkbook(buildSWRateWorkbook(lib));
    expect(errors).toEqual([]);
    expect(library).not.toBeNull();
    expect(library!.ukBaseRatePerPM!.value).toBeCloseTo(lib.ukBaseRatePerPM.value, 4);
    expect(library!.regionMultipliers!.UK.value).toBeCloseTo(lib.regionMultipliers.UK.value, 4);
    expect(library!.asilDevMultipliers!.D.value).toBeCloseTo(lib.asilDevMultipliers.D.value, 4);
    expect(counts.Regions).toBe(Object.keys(lib.regionMultipliers).length);
  });

  it('a parsed partial library merges cleanly over the built-in defaults', () => {
    const { library } = parseSWRateWorkbook(buildSWRateWorkbook(lib));
    const merged = resolveRateLibrary(library!);
    expect(merged.reuseFactors.Platform.value).toBeCloseTo(lib.reuseFactors.Platform.value, 4);
  });

  it('accepts a partial upload (only some sheets) as an override', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['key', 'value', 'source', 'asOf', 'confidence', 'note'],
      ['UK', 1.0, 'internal', '2026-06', 'High', ''],
      ['India', 0.15, 'internal', '2026-06', 'High', ''],
    ]), 'Regions');
    const { library, errors } = parseSWRateWorkbook(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
    expect(errors).toEqual([]);
    expect(library!.regionMultipliers!.India.value).toBe(0.15);
    expect(library!.asilDevMultipliers).toBeUndefined();   // sheet omitted → group absent
    // engine fills the omitted groups from defaults
    const merged = resolveRateLibrary(library!);
    expect(merged.regionMultipliers.India.value).toBe(0.15);
    expect(merged.asilDevMultipliers.D.value).toBe(lib.asilDevMultipliers.D.value);
  });

  it('rejects a negative multiplier and names the cell', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['key', 'value', 'source', 'asOf', 'confidence', 'note'],
      ['China', -0.3, 's', '2026-06', 'Low', ''],
    ]), 'Regions');
    const { library, errors } = parseSWRateWorkbook(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
    expect(library).toBeNull();
    expect(errors.some(e => e.includes('China') && e.includes('negative'))).toBe(true);
  });

  it('rejects a non-template workbook', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], ['y']]), 'Random');
    const { library, errors } = parseSWRateWorkbook(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
    expect(library).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });
});
