import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import {
  applyRateOverrides, resolveActiveLibrary, computeMachineRatePerHr, type RateOverride,
} from '../src/engine/rate-library-merge.js';
import { buildRateLibraryWorkbook, parseRateLibraryWorkbook } from '../server/utils/rate-library-xlsx.js';

const lib = DEFAULT_RATE_LIBRARY;

describe('rate-library merge — overrides', () => {
  it('overrides a single material price and leaves others untouched', () => {
    const target = lib.materials[0];
    const ov: RateOverride[] = [{ table: 'materials', id: target.id, field: 'pricePerKg', value: 999 }];
    const out = applyRateOverrides(lib, ov);
    expect(out.materials.find(m => m.id === target.id)!.pricePerKg).toBe(999);
    expect(out.materials[1].pricePerKg).toBe(lib.materials[1].pricePerKg); // untouched
    expect(lib.materials[0].pricePerKg).not.toBe(999);                     // input not mutated
  });

  it('ignores an override for an unknown row or field (no crash)', () => {
    const out = applyRateOverrides(lib, [
      { table: 'materials', id: 'does-not-exist', field: 'pricePerKg', value: 5 },
      { table: 'materials', id: lib.materials[0].id, field: 'nope.deep', value: 5 },
    ]);
    expect(out.materials[0].pricePerKg).toBe(lib.materials[0].pricePerKg);
  });

  it('recomputes a machine £/hr when its build-up is overridden', () => {
    const m = lib.machines[0];
    const bumped = m.buildup.maintenance + 100000;
    const out = applyRateOverrides(lib, [{ table: 'machines', id: m.id, field: 'buildup.maintenance', value: bumped }]);
    const om = out.machines.find(x => x.id === m.id)!;
    expect(om.buildup.maintenance).toBe(bumped);
    expect(om.computedRatePerHr).toBeCloseTo(computeMachineRatePerHr(om.buildup), 6);
    expect(om.computedRatePerHr).toBeGreaterThan(m.computedRatePerHr); // more cost → higher rate
  });
});

describe('rate-library merge — active source', () => {
  const company = { ...lib, materials: lib.materials.map((m, i) => i === 0 ? { ...m, pricePerKg: 1.23 } : m) };

  it('uses built-in when source is builtin', () => {
    const { library, effectiveSource } = resolveActiveLibrary({ builtIn: lib, company, source: 'builtin' });
    expect(effectiveSource).toBe('builtin');
    expect(library.materials[0].pricePerKg).toBe(lib.materials[0].pricePerKg);
  });

  it('uses company library when source is company', () => {
    const { library, effectiveSource } = resolveActiveLibrary({ builtIn: lib, company, source: 'company' });
    expect(effectiveSource).toBe('company');
    expect(library.materials[0].pricePerKg).toBe(1.23);
  });

  it('falls back to built-in when company library is missing', () => {
    const { effectiveSource } = resolveActiveLibrary({ builtIn: lib, company: null, source: 'company' });
    expect(effectiveSource).toBe('builtin');
  });

  it('layers overrides on top of whichever source is active', () => {
    const { library } = resolveActiveLibrary({
      builtIn: lib, company, source: 'company',
      overrides: [{ table: 'materials', id: company.materials[0].id, field: 'pricePerKg', value: 7.77 }],
    });
    expect(library.materials[0].pricePerKg).toBe(7.77);
  });
});

describe('rate-library Excel round-trip', () => {
  it('build → parse preserves row counts and a known price', () => {
    const buf = buildRateLibraryWorkbook(lib);
    const { library, errors, counts } = parseRateLibraryWorkbook(buf);
    expect(errors).toEqual([]);
    expect(library).not.toBeNull();
    expect(counts.materials).toBe(lib.materials.length);
    expect(counts.machines).toBe(lib.machines.length);
    expect(counts.labour).toBe(lib.labour.length);
    expect(library!.materials[0].pricePerKg).toBeCloseTo(lib.materials[0].pricePerKg, 4);
    // machine rate is re-derived from build-up on parse
    expect(library!.machines[0].computedRatePerHr).toBeCloseTo(computeMachineRatePerHr(library!.machines[0].buildup), 4);
  });

  it('rejects a workbook with a negative price and reports the cell', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['id', 'grade', 'category', 'pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3', 'region', 'effectiveDate', 'sourceNote', 'confidence'],
      ['mat-x', 'Al', 'metal', -5, 0, 2700, 'UK', '2026-01', '', 'High'],
    ]), 'Materials');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    const { library, errors } = parseRateLibraryWorkbook(buf);
    expect(library).toBeNull();
    expect(errors.some(e => e.includes('pricePerKg') && e.includes('negative'))).toBe(true);
  });

  it('rejects a non-template workbook', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['hello'], ['world']]), 'Random');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    const { library, errors } = parseRateLibraryWorkbook(buf);
    expect(library).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });
});
