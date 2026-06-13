/**
 * Coverage-gap tests: BOM CSV parsing, commodity switching via engine,
 * PPV (purchase price variance) helpers, and scenario edge cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parseBOMCSV, VALID_COMPONENT_TYPES } from '../src/engine/bom-csv.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { saveScenario, listScenarios, clearScenarios, importScenarios, exportScenarios } from '../src/engine/scenario.js';
import type { UniversalStackInput } from '../src/engine/types.js';

// ─── BOM CSV Parsing ──────────────────────────────────────────────────────────

describe('parseBOMCSV', () => {
  it('parses a CSV with header row correctly', () => {
    const csv = [
      'refDes,componentType,description,qty,unitPriceGBP,moq',
      'R1,passive_0402,Resistor 10k,1,0.01,1000',
      'U1,ic_qfn,Microcontroller,1,2.50,10',
    ].join('\n');

    const { rows, skipped } = parseBOMCSV(csv);
    expect(rows).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(rows[0].refDes).toBe('R1');
    expect(rows[0].componentType).toBe('passive_0402');
    expect(rows[0].qty).toBe(1);
    expect(rows[0].unitPriceGBP).toBeCloseTo(0.01);
    expect(rows[1].componentType).toBe('ic_qfn');
    expect(rows[1].unitPriceGBP).toBeCloseTo(2.50);
  });

  it('parses a CSV without header row', () => {
    const csv = 'C1,passive_0603,Cap 100nF,4,0.005,1000\n';
    const { rows } = parseBOMCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].refDes).toBe('C1');
    expect(rows[0].componentType).toBe('passive_0603');
    expect(rows[0].qty).toBe(4);
  });

  it('falls back to passive_0402 for unknown componentType', () => {
    const csv = 'X1,unknown_type,Some Part,1,1.00,1\n';
    const { rows } = parseBOMCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].componentType).toBe('passive_0402');
  });

  it('accepts all valid component types without fallback', () => {
    const csvLines = VALID_COMPONENT_TYPES.map((t, i) =>
      `REF${i},${t},Description,2,0.50,100`
    ).join('\n');
    const { rows } = parseBOMCSV(csvLines);
    expect(rows).toHaveLength(VALID_COMPONENT_TYPES.length);
    rows.forEach((row, i) => {
      expect(row.componentType).toBe(VALID_COMPONENT_TYPES[i]);
    });
  });

  it('skips rows with fewer than 6 columns', () => {
    const csv = [
      'refDes,componentType,description,qty,unitPriceGBP,moq',
      'R1,passive_0402,Resistor,1,0.01',   // only 5 columns
      'R2,passive_0402,Resistor 2,1,0.02,100',
    ].join('\n');
    const { rows, skipped } = parseBOMCSV(csv);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('defaults qty to 1 on parse error', () => {
    const csv = 'R1,passive_0402,Resistor,abc,0.01,100\n';
    const { rows } = parseBOMCSV(csv);
    expect(rows[0].qty).toBe(1);
  });

  it('defaults unitPriceGBP to 0 on parse error', () => {
    const csv = 'R1,passive_0402,Resistor,1,badprice,100\n';
    const { rows } = parseBOMCSV(csv);
    expect(rows[0].unitPriceGBP).toBe(0);
  });

  it('defaults moq to 1 on parse error', () => {
    const csv = 'R1,passive_0402,Resistor,1,0.01,badmoq\n';
    const { rows } = parseBOMCSV(csv);
    expect(rows[0].moq).toBe(1);
  });

  it('handles CRLF line endings', () => {
    const csv = 'R1,passive_0402,Resistor,1,0.01,100\r\nC1,passive_0603,Cap,2,0.005,500\r\n';
    const { rows } = parseBOMCSV(csv);
    expect(rows).toHaveLength(2);
  });

  it('returns empty rows for empty input', () => {
    const { rows, skipped } = parseBOMCSV('');
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it('trims whitespace from refDes and description', () => {
    const csv = '  R1 ,passive_0402,  Resistor 10k  ,1,0.01,100\n';
    const { rows } = parseBOMCSV(csv);
    expect(rows[0].refDes).toBe('R1');
    expect(rows[0].description).toBe('Resistor 10k');
  });
});

// ─── Commodity switching (engine level) ──────────────────────────────────────

describe('Commodity type routing — computeUniversalStack', () => {
  const baseUniversal = (overrides: Partial<UniversalStackInput> = {}): UniversalStackInput => ({
    partName: 'Test',
    rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.80 },
    operations: [{
      operationName: 'Op1',
      machineId: 'mach-lathe-cnc',
      labourId: 'lab-uk-skilled',
      cycleTimeHr: 0.05,
      partsPerCycle: 1,
      oee: 0.85,
      manning: 1,
      labourTimeHr: 0.05,
      labourEfficiency: 0.92,
    }],
    tooling: { totalToolingCost: 0, amortizationVolume: 1, mode: 'amortized' },
    packagingPerPart: 0,
    logisticsPerPart: 0,
    overheadPct: 0,
    marginPct: 0,
    ...overrides,
  });

  it('produces a positive total for machining with aluminium', () => {
    const r = computeUniversalStack(baseUniversal(), DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
    expect(r.breakdown.rawMaterial).toBeGreaterThan(0);
    expect(r.breakdown.process).toBeGreaterThan(0);
  });

  it('zero operations gives zero process cost', () => {
    const r = computeUniversalStack(baseUniversal({ operations: [] }), DEFAULT_RATE_LIBRARY);
    expect(r.breakdown.process).toBe(0);
    expect(r.breakdown.labour).toBe(0);
  });

  it('directCost mode bypasses material lookup', () => {
    const r = computeUniversalStack(
      baseUniversal({ rawMaterial: { materialId: 'mat-al6061', directCost: 5.00, netWeightKg: 0.5, materialUtilization: 1 } }),
      DEFAULT_RATE_LIBRARY
    );
    expect(r.breakdown.rawMaterial).toBeCloseTo(5.00, 4);
  });

  it('overhead and margin scale correctly', () => {
    const input = baseUniversal({ overheadPct: 0.10, marginPct: 0.20 });
    const r = computeUniversalStack(input, DEFAULT_RATE_LIBRARY);
    const factoryCost = r.breakdown.rawMaterial + r.breakdown.process + r.breakdown.labour
      + r.breakdown.tooling + r.breakdown.packaging + r.breakdown.logistics;
    expect(r.breakdown.overhead).toBeCloseTo(factoryCost * 0.10, 4);
    const subtotal = factoryCost + r.breakdown.overhead;
    expect(r.breakdown.margin).toBeCloseTo(subtotal * 0.20, 4);
  });

  it('tooling amortization adds correct per-part cost', () => {
    const input = baseUniversal({
      tooling: { totalToolingCost: 10000, amortizationVolume: 1000, mode: 'amortized' },
    });
    const r = computeUniversalStack(input, DEFAULT_RATE_LIBRARY);
    expect(r.breakdown.tooling).toBeCloseTo(10, 4); // 10000 / 1000
  });

  it('tooling cost zero with one_time_nre mode contributes zero per-part cost', () => {
    const input = baseUniversal({
      tooling: { totalToolingCost: 0, amortizationVolume: 1000, mode: 'one_time_nre' },
    });
    const r = computeUniversalStack(input, DEFAULT_RATE_LIBRARY);
    expect(r.breakdown.tooling).toBe(0);
  });

  it('packaging and logistics are passed through directly', () => {
    const input = baseUniversal({ packagingPerPart: 1.23, logisticsPerPart: 4.56 });
    const r = computeUniversalStack(input, DEFAULT_RATE_LIBRARY);
    expect(r.breakdown.packaging).toBeCloseTo(1.23, 4);
    expect(r.breakdown.logistics).toBeCloseTo(4.56, 4);
  });
});

// ─── Scenario import/export edge cases ────────────────────────────────────────

describe('Scenario import/export edge cases', () => {
  beforeEach(() => clearScenarios());

  const mockInput: UniversalStackInput = {
    partName: 'Mock Part',
    rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.3, materialUtilization: 0.8 },
    operations: [],
    tooling: { totalToolingCost: 0, amortizationVolume: 1000, mode: 'amortized' },
    packagingPerPart: 0, logisticsPerPart: 0, overheadPct: 0.1, marginPct: 0.05,
  };

  it('importScenarios rejects non-array JSON', () => {
    const { imported, errors } = importScenarios('{"id":"x"}');
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('array');
  });

  it('importScenarios rejects malformed items', () => {
    const { imported, errors } = importScenarios('[{"id":"x","name":"missing result field"}]');
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it('importScenarios skips duplicate IDs', () => {
    const r = computeUniversalStack(mockInput, DEFAULT_RATE_LIBRARY);
    saveScenario('Original', '', mockInput, r);
    const json = exportScenarios();
    const { imported } = importScenarios(json);
    expect(imported).toBe(0); // already exists
  });

  it('importScenarios handles invalid JSON gracefully', () => {
    const { imported, errors } = importScenarios('{ not valid json }');
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/parse error/i);
  });

  it('exportScenarios produces valid JSON array', () => {
    const r = computeUniversalStack(mockInput, DEFAULT_RATE_LIBRARY);
    saveScenario('Export test', 'desc', mockInput, r);
    const json = exportScenarios();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Export test');
  });

  it('scenarios are sorted by createdAt ascending after import', () => {
    const r = computeUniversalStack(mockInput, DEFAULT_RATE_LIBRARY);
    const sc1 = saveScenario('First', '', mockInput, r);
    const sc2 = saveScenario('Second', '', mockInput, r);
    const json = exportScenarios();
    clearScenarios();
    importScenarios(json);

    const list = listScenarios();
    expect(list[0].id).toBe(sc1.id);
    expect(list[1].id).toBe(sc2.id);
  });
});
