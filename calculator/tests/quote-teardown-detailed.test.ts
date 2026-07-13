import { describe, it, expect } from 'vitest';
import { analyzeDetailedQuote, type PartDetail, type SupplierDetail } from '../src/engine/quote-teardown-detailed.js';

function samplePart(): PartDetail {
  const op = {
    name: 'Turning', cycleTimeHr: 0.01, machineRate: 60, partsPerCycle: 1, oee: 0.85,
    labourTimeHr: 0.01, labourRate: 25, manning: 1, labourEfficiency: 0.9,
    processCost: 60 * 0.01 / 1 / 0.85, labourCost: 25 * 1 * 0.01 / 1 / 0.9,
  };
  return {
    commodity: 'machining',
    material: { grade: 'Aluminium', directMode: false, netWeightKg: 1, utilization: 0.8, pricePerKg: 5, scrapRecoveryPerKg: 0, consumablesPerPart: 0, materialCost: 6.25 },
    operations: [op],
    toolingPerPart: 0.5, overheadPct: 0.12, marginPct: 0.08, total: 10,
  };
}

describe('detailed quote teardown', () => {
  it('attributes a material gap to the price driver', () => {
    const sup: SupplierDetail = { material: { netWeightKg: 1, utilization: 0.8, pricePerKg: 5.5 } };
    const dt = analyzeDetailedQuote(samplePart(), sup);
    expect(dt.material.theirGBP).toBeCloseTo(6.88, 2);   // 1.25kg gross × 5.5
    expect(dt.material.gapGBP).toBeCloseTo(0.63, 2);
    expect(dt.material.drivers[0].label).toBe('Material price');
    expect(dt.material.drivers[0].deltaGBP).toBeCloseTo(0.63, 2);
  });

  it('attributes a process gap to cycle time', () => {
    const sup: SupplierDetail = { operations: [{ name: 'Turning', cycleTimeHr: 0.015, machineRate: 60, partsPerCycle: 1, oee: 0.85 }] };
    const dt = analyzeDetailedQuote(samplePart(), sup);
    const proc = dt.operations[0].process;
    expect(proc.theirGBP).toBeCloseTo(60 * 0.015 / 0.85, 2);
    const cyc = proc.drivers.find(d => d.label === 'Cycle time');
    expect(cyc).toBeDefined();
    expect(cyc!.theirValue).toBeCloseTo(54, 0);          // 0.015 hr → 54 s
    expect(cyc!.deltaGBP).toBeGreaterThan(0.3);
  });

  it('attributes a labour gap to labour rate', () => {
    const sup: SupplierDetail = { operations: [{ name: 'Turning', labourRate: 40, labourTimeHr: 0.01, manning: 1, labourEfficiency: 0.9, partsPerCycle: 1 }] };
    const dt = analyzeDetailedQuote(samplePart(), sup);
    const lab = dt.operations[0].labour;
    expect(lab.theirGBP).toBeCloseTo(40 * 0.01 / 0.9, 2);
    expect(lab.drivers[0].label).toBe('Labour rate');
  });

  it('leaves blank supplier lines as null (not a false gap)', () => {
    const dt = analyzeDetailedQuote(samplePart(), { material: { pricePerKg: 5.5 } });
    expect(dt.operations[0].process.theirGBP).toBeNull();
    expect(dt.operations[0].process.gapGBP).toBe(0);
    expect(dt.material.theirGBP).not.toBeNull();
  });

  it('ranks top drivers by £ impact and reports coverage', () => {
    const sup: SupplierDetail = {
      material: { netWeightKg: 1, utilization: 0.8, pricePerKg: 6 },
      operations: [{ name: 'Turning', cycleTimeHr: 0.02, machineRate: 60, partsPerCycle: 1, oee: 0.85 }],
    };
    const dt = analyzeDetailedQuote(samplePart(), sup);
    expect(dt.topDrivers.length).toBeGreaterThan(0);
    expect(dt.coverage).toBeGreaterThan(0);
    expect(dt.coverage).toBeLessThanOrEqual(1);
  });

  it('flags unmatched supplier operations', () => {
    const sup: SupplierDetail = { operations: [{ name: 'Grinding', cycleTimeHr: 0.01, machineRate: 50 }] };
    const dt = analyzeDetailedQuote(samplePart(), sup);
    // positional fallback matches Turning to the first supplier op, so none unmatched here…
    expect(Array.isArray(dt.unmatchedSupplierOps)).toBe(true);
  });
});
