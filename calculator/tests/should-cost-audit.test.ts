import { describe, it, expect } from 'vitest';
import { runShouldCostAudit, machineCapacityTonnes, type AuditContext } from '../src/engine/should-cost-audit.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const lib = DEFAULT_RATE_LIBRARY;

function mkInput(materialId: string, netWeightKg: number, amortizationVolume: number): UniversalStackInput {
  return {
    partName: 'test', rawMaterial: { materialId, netWeightKg, materialUtilization: 0.9 },
    operations: [], tooling: { totalToolingCost: 20000, amortizationVolume, mode: 'amortized' },
    packagingPerPart: 0.1, logisticsPerPart: 0.1, overheadPct: 0.12, marginPct: 0.08,
  };
}
const base = (over: Partial<AuditContext>): AuditContext => ({
  commodity: 'machining', input: mkInput('mat-al6061', 2, 100000), library: lib, annualVolume: 100000, ...over,
});

describe('machineCapacityTonnes', () => {
  it('parses tonnage from rate-library machine ids', () => {
    expect(machineCapacityTonnes('imm-200t')).toBe(200);
    expect(machineCapacityTonnes('forge-press-1600t')).toBe(1600);
    expect(machineCapacityTonnes('hpdc-800t')).toBe(800);
    expect(machineCapacityTonnes('press-400t')).toBe(400);
    expect(machineCapacityTonnes('blow-ebm-large')).toBeNull();
  });
});

describe('machine-undersized lesson', () => {
  it('flags a fuel-tank shot on the bottle machine and proposes the accumulator head', () => {
    const f = runShouldCostAudit(base({
      commodity: 'blow_moulding', sizingParams: { shotKg: 13 }, selectedMachineId: 'blow-ebm-2head',
    }));
    const m = f.find(x => x.id === 'machine-undersized');
    expect(m?.severity).toBe('high');
    expect(m?.correction).toEqual({ kind: 'machineId', machineId: 'blow-ebm-large' });
  });
  it('flags an undersized forge press', () => {
    const f = runShouldCostAudit(base({
      commodity: 'forging', sizingParams: { forgeTonnes: 1500 }, selectedMachineId: 'forge-press-500t',
    }));
    expect(f.find(x => x.id === 'machine-undersized')?.correction).toEqual({ kind: 'machineId', machineId: 'forge-press-2500t' });
  });
  it('does NOT flag when the selected machine is bigger than required', () => {
    const f = runShouldCostAudit(base({
      commodity: 'forging', sizingParams: { forgeTonnes: 1500 }, selectedMachineId: 'forge-press-8000t',
    }));
    expect(f.find(x => x.id === 'machine-undersized')).toBeUndefined();
  });
});

describe('tooling-amort lesson', () => {
  it('flags amort over a stale default and proposes annual volume', () => {
    const f = runShouldCostAudit(base({ input: mkInput('mat-al6061', 2, 500000), annualVolume: 100000 }));
    const a = f.find(x => x.id === 'amort-not-annual');
    expect(a?.correction).toEqual({ kind: 'amortVolume', value: 100000 });
  });
  it('is silent when amort already equals annual volume', () => {
    const f = runShouldCostAudit(base({ input: mkInput('mat-al6061', 2, 100000), annualVolume: 100000 }));
    expect(f.find(x => x.id === 'amort-not-annual')).toBeUndefined();
  });
});

describe('wall-plausibility lesson', () => {
  it('flags a wall thicker than the smallest bbox dimension', () => {
    const f = runShouldCostAudit(base({
      geometry: { wallMeanMm: 27, bboxMm: { x: 100, y: 50, z: 20 } },
    }));
    expect(f.find(x => x.id === 'wall-exceeds-bbox')?.severity).toBe('high');
  });
  it('flags the bumper 27 mm ray-cast on a thin shell as over-measured', () => {
    const f = runShouldCostAudit(base({
      geometry: { wallMeanMm: 27.1, volumeCm3: 2059.9, surfaceAreaCm2: 16261.7, fillRatio: 0.0036, bboxMm: { x: 1691, y: 647, z: 528 } },
    }));
    expect(f.find(x => x.id === 'wall-over-measured')?.actual).toBe('27.1 mm');
  });
});

describe('weight-vs-geometry lesson', () => {
  it('flags a net weight that contradicts volume × material density', () => {
    const dens = lib.materials.find(m => m.id === 'mat-al6061')!.densityKgPerM3;
    const volumeCm3 = 1000;
    const impliedKg = volumeCm3 * 1e-6 * dens;
    const f = runShouldCostAudit(base({
      input: mkInput('mat-al6061', impliedKg * 3, 100000),   // 3× too heavy for the geometry
      geometry: { volumeCm3 },
    }));
    expect(f.find(x => x.id === 'weight-geometry-mismatch')?.severity).toBe('medium');
  });
  it('is silent when weight matches the geometry', () => {
    const dens = lib.materials.find(m => m.id === 'mat-al6061')!.densityKgPerM3;
    const volumeCm3 = 1000;
    const f = runShouldCostAudit(base({
      input: mkInput('mat-al6061', volumeCm3 * 1e-6 * dens, 100000),
      geometry: { volumeCm3 },
    }));
    expect(f.find(x => x.id === 'weight-geometry-mismatch')).toBeUndefined();
  });
});

describe('thin-hollow-not-cast lesson', () => {
  it('flags a large thin hollow shell costed as a casting (the fuel-tank error)', () => {
    const f = runShouldCostAudit(base({
      commodity: 'casting',
      geometry: { fillRatio: 0.0178, bboxMm: { x: 1528, y: 658, z: 594 } },
    }));
    expect(f.find(x => x.id === 'thin-hollow-not-cast')?.severity).toBe('high');
  });
  it('does not flag a chunky casting', () => {
    const f = runShouldCostAudit(base({
      commodity: 'casting',
      geometry: { fillRatio: 0.35, bboxMm: { x: 200, y: 150, z: 120 } },
    }));
    expect(f.find(x => x.id === 'thin-hollow-not-cast')).toBeUndefined();
  });
});

describe('machining-over-envelope lesson', () => {
  it('flags a tiny part costed with huge machine time (servo-horn class)', () => {
    const input = mkInput('mat-al6061', 0.003, 100000);
    input.operations = [{ operationName: 'mill', machineId: 'mach-vmc5', labourId: 'lab-uk-skilled', cycleTimeHr: 4.4, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 4.4, labourEfficiency: 0.9 }];
    const f = runShouldCostAudit(base({
      commodity: 'machining', input,
      geometry: { volumeCm3: 1.2, surfaceAreaCm2: 13.5, bboxMm: { x: 47, y: 10, z: 7.5 } },
    }));
    expect(f.find(x => x.id === 'machining-over-envelope')?.severity).toBe('medium');
  });
});

describe('runShouldCostAudit ordering', () => {
  it('returns findings most-severe first', () => {
    const f = runShouldCostAudit(base({
      commodity: 'forging', sizingParams: { forgeTonnes: 1500 }, selectedMachineId: 'forge-press-500t',
      input: mkInput('mat-al6061', 2, 500000), annualVolume: 100000,   // also triggers low-severity amort
    }));
    expect(f.length).toBeGreaterThanOrEqual(2);
    expect(f[0].severity).toBe('high');           // machine-undersized first
    expect(f[f.length - 1].severity).toBe('low'); // amort last
  });
});
