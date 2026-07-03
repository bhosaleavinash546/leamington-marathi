import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import { assertPartCostInvariants } from './helpers/engine-invariants.js';

const lib = DEFAULT_RATE_LIBRARY;
const price = (id: string) => lib.materials.find(m => m.id === id)!.pricePerKg;

// New grades added while refreshing the remaining commodities.
const NEW_GRADES = [
  // Machining stock — metals
  'mat-en8', 'mat-ss304-bar', 'mat-ss303', 'mat-al6082-bar', 'mat-al2011', 'mat-brass-cz121', 'mat-bronze-pb1',
  // Machining stock — engineering plastics
  'mat-pom-c', 'mat-pa6-cast', 'mat-ptfe', 'mat-peek-stock', 'mat-acrylic-cast', 'mat-uhmwpe',
  // Blow moulding
  'mat-hdpe-bm', 'mat-hdpe-fuel-coex', 'mat-pa6-bm', 'mat-pc-bm',
  // Rubber
  'mat-fvmq', 'mat-acm', 'mat-aem', 'mat-eco', 'mat-csm',
  // Composite
  'mat-cf-uni-t800', 'mat-smc-gf', 'mat-bmc', 'mat-csm-gf', 'mat-cf-peek-organo', 'mat-nomex-honeycomb', 'mat-pet-foam-core',
  // Paint
  'mat-paint-1k-primer', 'mat-paint-sb-basecoat', 'mat-paint-uv-clear', 'mat-paint-pvc-underbody',
];

describe('2026-07 refresh — remaining commodities', () => {
  it('every material except the virtual placeholder is on the 2026-07 basis', () => {
    const stale = lib.materials.filter(m => m.id !== 'mat-virtual' && m.effectiveDate !== '2026-07');
    expect(stale.map(m => `${m.id}:${m.effectiveDate}`)).toEqual([]);
  });

  it('the virtual pass-through material is intentionally left un-refreshed', () => {
    const v = lib.materials.find(m => m.id === 'mat-virtual')!;
    expect(v.effectiveDate).not.toBe('2026-07');
  });

  it('all new grades are present', () => {
    const ids = new Set(lib.materials.map(m => m.id));
    expect(NEW_GRADES.filter(id => !ids.has(id))).toEqual([]);
  });

  it('every material record library-wide is well-formed', () => {
    for (const m of lib.materials) {
      expect(m.grade.length).toBeGreaterThan(0);
      expect(m.category.length).toBeGreaterThan(0);
      expect(m.pricePerKg).toBeGreaterThan(0);
      expect(m.densityKgPerM3).toBeGreaterThan(0);
      expect(m.scrapRecoveryPricePerKg).toBeGreaterThanOrEqual(0);
      expect(m.scrapRecoveryPricePerKg).toBeLessThanOrEqual(m.pricePerKg);
      expect(['High', 'Medium', 'Low']).toContain(m.confidence);
    }
  });

  it('material ids remain unique across the whole library', () => {
    const ids = lib.materials.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('price ladders are sane within each refreshed commodity', () => {
    // Engineering plastics
    expect(price('mat-peek-stock')).toBeGreaterThan(price('mat-ptfe'));       // PEEK tops
    expect(price('mat-ptfe')).toBeGreaterThan(price('mat-pom-c'));
    // Machining metals
    expect(price('mat-ss303')).toBeGreaterThan(price('mat-ss304-bar'));       // free-machining premium
    expect(price('mat-bronze-pb1')).toBeGreaterThan(price('mat-brass-cz121'));
    // Rubber
    expect(price('mat-fvmq')).toBeGreaterThan(price('mat-nbr'));              // fluorosilicone specialty
    expect(price('mat-aem')).toBeGreaterThan(price('mat-acm'));
    // Composite
    expect(price('mat-cf-uni-t800')).toBeGreaterThan(price('mat-gfrp-prepreg-e'));  // CF UD > E-glass prepreg
    expect(price('mat-cf-peek-organo')).toBeGreaterThan(price('mat-smc-gf'));
    // Blow moulding
    expect(price('mat-hdpe-fuel-coex')).toBeGreaterThan(price('mat-hdpe-bm'));      // barrier coex premium
    // Paint
    expect(price('mat-paint-uv-clear')).toBeGreaterThan(price('mat-paint-1k-primer'));
  });

  it('a refreshed engineering-plastic stock drives the cost engine without error', () => {
    const input: UniversalStackInput = {
      partName: 'Machined acetal manifold',
      rawMaterial: { materialId: 'mat-pom-c', netWeightKg: 0.4, materialUtilization: 0.35 },
      operations: [{
        operationName: 'CNC Mill', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled',
        cycleTimeHr: 0.25, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: 0.25, labourEfficiency: 0.9,
      }],
      tooling: { totalToolingCost: 800, amortizationVolume: 2000, mode: 'amortized' },
      packagingPerPart: 0.1, logisticsPerPart: 0.2, overheadPct: 0.12, marginPct: 0.08,
    };
    assertPartCostInvariants(computeUniversalStack(input, lib));
  });
});
