import { describe, it, expect } from 'vitest';
import { computeCarbon, gridCarbon } from '../src/engine/carbon.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { PartCostResult, UniversalStackInput } from '../src/engine/types.js';

const lib = DEFAULT_RATE_LIBRARY;
const result = { total: 50 } as PartCostResult;
const mkInput = (materialId: string, netKg: number, util = 1): UniversalStackInput =>
  ({ rawMaterial: { materialId, netWeightKg: netKg, materialUtilization: util } } as UniversalStackInput);

const firstMat = (pred: (grade: string, cat: string) => boolean) =>
  lib.materials.find(m => pred(m.grade.toLowerCase(), m.category.toLowerCase()))!.id;

describe('carbon co-costing', () => {
  it('aluminium embodies far more CO2 than steel for the same mass', () => {
    const al = firstMat((g, c) => (g + c).includes('alumin'));
    const steel = firstMat((g, c) => (g + c).includes('steel') && !(g + c).includes('stainless'));
    const alC = computeCarbon({ result, input: mkInput(al, 1), library: lib, commodity: 'machining', region: 'UK' });
    const stC = computeCarbon({ result, input: mkInput(steel, 1), library: lib, commodity: 'machining', region: 'UK' });
    expect(alC.materialKgCO2e).toBeGreaterThan(stC.materialKgCO2e * 2);
    expect(alC.totalKgCO2e).toBeGreaterThan(0);
  });

  it('a dirtier grid raises the process carbon', () => {
    const steel = firstMat((g, c) => (g + c).includes('steel'));
    const uk = computeCarbon({ result, input: mkInput(steel, 1), library: lib, commodity: 'casting', region: 'UK' });
    const cn = computeCarbon({ result, input: mkInput(steel, 1), library: lib, commodity: 'casting', region: 'CN' });
    expect(cn.processKgCO2e).toBeGreaterThan(uk.processKgCO2e);
    expect(gridCarbon('CN')).toBeGreaterThan(gridCarbon('UK'));
  });

  it('low utilisation (more scrap) increases gross material carbon', () => {
    const al = firstMat((g, c) => (g + c).includes('alumin'));
    const tight = computeCarbon({ result, input: mkInput(al, 1, 0.95), library: lib, commodity: 'machining', region: 'UK' });
    const wasteful = computeCarbon({ result, input: mkInput(al, 1, 0.4), library: lib, commodity: 'machining', region: 'UK' });
    expect(wasteful.materialKgCO2e).toBeGreaterThan(tight.materialKgCO2e);
  });

  it('per-kg intensity and total are consistent and positive', () => {
    const steel = firstMat((g, c) => (g + c).includes('steel'));
    const c = computeCarbon({ result, input: mkInput(steel, 2), library: lib, commodity: 'forging', region: 'DE' });
    expect(c.totalKgCO2e).toBeCloseTo(c.materialKgCO2e + c.processKgCO2e + c.logisticsKgCO2e, 1);
    expect(c.perNetKgCO2e).toBeCloseTo(c.totalKgCO2e / 2, 1);
  });
});
