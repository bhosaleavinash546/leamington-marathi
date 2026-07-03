import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import { assertPartCostInvariants } from './helpers/engine-invariants.js';

const lib = DEFAULT_RATE_LIBRARY;

const NEW_BILLETS = [
  // Carbon & microalloyed (1045/4140 already exist as general stock — reused, not re-added)
  'mat-steel1141', 'mat-steel-38mnvs6',
  // Alloy & case-hardening
  'mat-steel4130', 'mat-steel8620', 'mat-steel-20mncr5', 'mat-steel-52100', 'mat-steel-300m',
  // Stainless
  'mat-ss410-bar', 'mat-ss304l-bar', 'mat-ss316l-bar', 'mat-ss17-4ph-bar', 'mat-ss15-5ph-bar',
  // Aluminium
  'mat-al6061-forge', 'mat-al6082-forge', 'mat-al7075-forge', 'mat-al2618-forge',
  // Titanium
  'mat-ti-cp-gr2', 'mat-ti-6al4v-forge',
  // Nickel superalloy
  'mat-inconel718-forge', 'mat-waspaloy-forge',
  // Copper
  'mat-brass-cz122-forge',
];

const price = (id: string) => lib.materials.find(m => m.id === id)!.pricePerKg;

describe('forging billet coverage', () => {
  it('all new billet families are present in the rate library', () => {
    const ids = new Set(lib.materials.map(m => m.id));
    expect(NEW_BILLETS.filter(id => !ids.has(id))).toEqual([]);
  });

  it('new billet records are well-formed', () => {
    for (const id of NEW_BILLETS) {
      const m = lib.materials.find(x => x.id === id)!;
      expect(m.grade.length).toBeGreaterThan(0);
      expect(m.category.length).toBeGreaterThan(0);
      expect(m.pricePerKg).toBeGreaterThan(0);
      expect(m.densityKgPerM3).toBeGreaterThan(2000);   // Al is the lightest forging stock
      expect(m.densityKgPerM3).toBeLessThan(8600);       // brass is the densest
      expect(m.scrapRecoveryPricePerKg).toBeGreaterThanOrEqual(0);
      expect(m.scrapRecoveryPricePerKg).toBeLessThanOrEqual(m.pricePerKg);
      expect(['High', 'Medium', 'Low']).toContain(m.confidence);
    }
  });

  it('price ladder is sane (superalloy > titanium > stainless > alloy steel > carbon)', () => {
    expect(price('mat-waspaloy-forge')).toBeGreaterThan(price('mat-inconel718-forge'));  // Co adder
    expect(price('mat-inconel718-forge')).toBeGreaterThan(price('mat-ti-6al4v-forge'));  // Ni superalloy > Ti
    expect(price('mat-ti-6al4v-forge')).toBeGreaterThan(price('mat-ti-cp-gr2'));         // alloyed Ti > CP Ti
    expect(price('mat-ss316l-bar')).toBeGreaterThan(price('mat-ss304l-bar'));            // Mo adder
    expect(price('mat-ss304l-bar')).toBeGreaterThan(price('mat-steel4140'));             // stainless > alloy steel
    expect(price('mat-steel4140')).toBeGreaterThan(price('mat-steel1045'));              // alloy > carbon
    expect(price('mat-steel-300m')).toBeGreaterThan(price('mat-steel4340'));             // UHS aero premium
    expect(price('mat-al7075-forge')).toBeGreaterThan(price('mat-al6061-forge'));        // Al-Zn > Al-Mg-Si
  });

  it('all forging billets carry the 2026-07 index-anchored date', () => {
    const billetCats = /Carbon Steel Billet|Alloy Steel Billet|Microalloyed Steel Billet|Stainless Steel Billet|Aluminium Forging Billet|Titanium Forging Billet|Nickel Superalloy Billet|Copper Alloy Billet/;
    const billets = lib.materials.filter(m => billetCats.test(m.category));
    expect(billets.length).toBeGreaterThan(20);
    for (const m of billets) expect(m.effectiveDate).toBe('2026-07');
  });

  it('a new alloy-steel billet drives the cost engine without error', () => {
    const input: UniversalStackInput = {
      partName: 'Forged stub axle',
      rawMaterial: { materialId: 'mat-steel4140', netWeightKg: 6, materialUtilization: 0.65 },
      operations: [{
        operationName: 'Forging', machineId: 'forge-press-500t', labourId: 'lab-uk-skilled',
        cycleTimeHr: 0.03, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: 0.03, labourEfficiency: 0.9,
      }],
      tooling: { totalToolingCost: 45000, amortizationVolume: 80000, mode: 'amortized' },
      packagingPerPart: 0.4, logisticsPerPart: 0.6, overheadPct: 0.12, marginPct: 0.08,
    };
    assertPartCostInvariants(computeUniversalStack(input, lib));
  });
});
