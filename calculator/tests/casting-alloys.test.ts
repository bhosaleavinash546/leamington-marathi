import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import { assertPartCostInvariants } from './helpers/engine-invariants.js';

const lib = DEFAULT_RATE_LIBRARY;

const NEW_CASTINGS = [
  // Structural HPDC / megacasting aluminium
  'mat-aural5', 'mat-silafont36', 'mat-castasil37', 'mat-magsimal59', 'mat-al-hpdc-lowco2',
  // Die-cast aluminium (extended)
  'mat-a413', 'mat-a319', 'mat-a390',
  // Gravity / permanent-mould aluminium
  'mat-a357',
  // Grey & ductile iron (extended)
  'mat-gjl200', 'mat-gjl300', 'mat-gjs500', 'mat-gjs700', 'mat-gjv450', 'mat-simo', 'mat-adi',
  // Magnesium (extended)
  'mat-mag-am60', 'mat-mag-am50', 'mat-mag-ae44',
  // Zinc (extended)
  'mat-za8', 'mat-za27',
  // Steel & superalloy castings
  'mat-gs-c25', 'mat-17-4ph-cast', 'mat-inconel718-cast',
];

const price = (id: string) => lib.materials.find(m => m.id === id)!.pricePerKg;

describe('casting alloy coverage', () => {
  it('all new casting families are present in the rate library', () => {
    const ids = new Set(lib.materials.map(m => m.id));
    expect(NEW_CASTINGS.filter(id => !ids.has(id))).toEqual([]);
  });

  it('new casting records are well-formed', () => {
    for (const id of NEW_CASTINGS) {
      const m = lib.materials.find(x => x.id === id)!;
      expect(m.grade.length).toBeGreaterThan(0);
      expect(m.category.length).toBeGreaterThan(0);
      expect(m.pricePerKg).toBeGreaterThan(0);
      expect(m.densityKgPerM3).toBeGreaterThan(1500);   // magnesium is the lightest cast metal
      expect(m.densityKgPerM3).toBeLessThan(8300);       // nickel superalloy is the densest
      expect(m.scrapRecoveryPricePerKg).toBeGreaterThanOrEqual(0);
      expect(m.scrapRecoveryPricePerKg).toBeLessThanOrEqual(m.pricePerKg);
      expect(['High', 'Medium', 'Low']).toContain(m.confidence);
    }
  });

  it('price ladder is sane (superalloy > stainless > steel > light alloy > iron)', () => {
    expect(price('mat-inconel718-cast')).toBeGreaterThan(price('mat-17-4ph-cast'));  // Ni superalloy tops
    expect(price('mat-17-4ph-cast')).toBeGreaterThan(price('mat-ss304-cast'));       // PH stainless > CF8
    expect(price('mat-ss304-cast')).toBeGreaterThan(price('mat-gs-c25'));            // stainless > carbon steel
    expect(price('mat-mag-ae44')).toBeGreaterThan(price('mat-mag-am60'));            // rare-earth Mg premium
    expect(price('mat-a390')).toBeGreaterThan(price('mat-a413'));                    // hypereutectic premium
    expect(price('mat-simo')).toBeGreaterThan(price('mat-gjs500'));                  // heat-resistant iron > plain ductile
    expect(price('mat-adi')).toBeGreaterThan(price('mat-gjs700'));                   // austempered > as-cast ductile
    expect(price('mat-za27')).toBeGreaterThan(price('mat-zamak3'));                  // high-strength ZA > Zamak
  });

  it('all casting alloys carry the 2026-07 index-anchored date', () => {
    const castCategories = /Die Cast Aluminium|Structural HPDC Aluminium|Gravity\/Sand Aluminium|Grey Cast Iron|Ductile Cast Iron|Compacted Graphite Iron|Copper Alloy|Magnesium Alloy|Cast Stainless Steel|Cast Carbon Steel|Nickel Superalloy Casting|Zinc Die Cast/;
    const casts = lib.materials.filter(m => castCategories.test(m.category));
    expect(casts.length).toBeGreaterThan(30);
    for (const m of casts) expect(m.effectiveDate).toBe('2026-07');
  });

  it('a new structural HPDC alloy drives the cost engine without error', () => {
    const input: UniversalStackInput = {
      partName: 'Megacasting rear underbody',
      rawMaterial: { materialId: 'mat-silafont36', netWeightKg: 24, materialUtilization: 0.6 },
      operations: [{
        operationName: 'HPDC', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled',
        cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.75, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.9,
      }],
      tooling: { totalToolingCost: 900000, amortizationVolume: 150000, mode: 'amortized' },
      packagingPerPart: 2.5, logisticsPerPart: 3.0, overheadPct: 0.12, marginPct: 0.08,
    };
    assertPartCostInvariants(computeUniversalStack(input, lib));
  });
});
