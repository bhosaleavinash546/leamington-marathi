import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import { assertPartCostInvariants } from './helpers/engine-invariants.js';

const lib = DEFAULT_RATE_LIBRARY;

// The grade families added to close the sheet-metal coverage gaps.
const NEW_GRADES = [
  // AHSS
  'mat-dp780', 'mat-dp980', 'mat-dp1000', 'mat-trip780', 'mat-cp800', 'mat-ms1200', 'mat-ms1500',
  // Press-hardening / UHSS
  'mat-usibor1500', 'mat-usibor2000', 'mat-ms1300',
  // 3rd-gen AHSS
  'mat-qp980', 'mat-medmn1180',
  // HSLA / BH / IF
  'mat-hsla550', 'mat-bh260', 'mat-if-dx56', 'mat-if-hs260',
  // Coatings
  'mat-znni-eg', 'mat-zm-coated', 'mat-tinplate-etp',
  // Automotive aluminium
  'mat-aa6016-t4', 'mat-aa6111-t4', 'mat-aa7075-t6',
  // Sustainability
  'mat-greensteel-dc01', 'mat-al-recycled-5xxx',
];

describe('sheet-metal material coverage', () => {
  it('all new grade families are present in the rate library', () => {
    const ids = new Set(lib.materials.map(m => m.id));
    const missing = NEW_GRADES.filter(id => !ids.has(id));
    expect(missing).toEqual([]);
  });

  it('every material record is well-formed (positive price/density, valid confidence)', () => {
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

  it('material ids are unique across the whole library', () => {
    const ids = lib.materials.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('strength ordering is sane (higher grade ≥ lower grade price within a family)', () => {
    const price = (id: string) => lib.materials.find(m => m.id === id)!.pricePerKg;
    expect(price('mat-dp980')).toBeGreaterThan(price('mat-dp600'));      // AHSS climbs with strength
    expect(price('mat-usibor2000')).toBeGreaterThan(price('mat-usibor1500'));
    expect(price('mat-aa7075-t6')).toBeGreaterThan(price('mat-aa6016-t4')); // structural > skin
  });

  it('a new AHSS grade drives the universal cost engine without error', () => {
    const input: UniversalStackInput = {
      partName: 'AHSS bracket',
      rawMaterial: { materialId: 'mat-usibor1500', netWeightKg: 1.2, materialUtilization: 0.7 },
      operations: [{
        operationName: 'Laser', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled',
        cycleTimeHr: 0.03, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.03, labourEfficiency: 0.9,
      }],
      tooling: { totalToolingCost: 4000, amortizationVolume: 20000, mode: 'amortized' },
      packagingPerPart: 0.1, logisticsPerPart: 0.2, overheadPct: 0.12, marginPct: 0.08,
    };
    assertPartCostInvariants(computeUniversalStack(input, lib));
  });
});
