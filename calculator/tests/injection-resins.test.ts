import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import { assertPartCostInvariants } from './helpers/engine-invariants.js';

const lib = DEFAULT_RATE_LIBRARY;

const NEW_RESINS = [
  // Styrenics
  'mat-asa', 'mat-san',
  // Filled / modified PP
  'mat-pp-t20', 'mat-pp-t30', 'mat-pp-lgf30', 'mat-tpo',
  // Elastomer / optical
  'mat-tpv', 'mat-pmma',
  // High-temp / e-mobility / connectors
  'mat-pps-gf40', 'mat-ppa-gf35', 'mat-pei', 'mat-pei-gf30', 'mat-lcp-gf30',
  // Extended polyamide
  'mat-pa66-gf35', 'mat-pa66-gf50', 'mat-pa66-min', 'mat-pa12',
  // Blends
  'mat-pc-pbt', 'mat-mppe',
  // Flame-retardant
  'mat-pc-fr', 'mat-pa66-gf25-fr',
  // Sustainability
  'mat-pcr-pp', 'mat-bio-pa610', 'mat-pc-glazing',
];

const price = (id: string) => lib.materials.find(m => m.id === id)!.pricePerKg;

describe('injection-moulding resin coverage', () => {
  it('all new resin families are present in the rate library', () => {
    const ids = new Set(lib.materials.map(m => m.id));
    expect(NEW_RESINS.filter(id => !ids.has(id))).toEqual([]);
  });

  it('new resin records are well-formed', () => {
    for (const id of NEW_RESINS) {
      const m = lib.materials.find(x => x.id === id)!;
      expect(m.grade.length).toBeGreaterThan(0);
      expect(m.pricePerKg).toBeGreaterThan(0);
      expect(m.densityKgPerM3).toBeGreaterThan(700);
      expect(m.densityKgPerM3).toBeLessThan(2000);          // plausible polymer density
      expect(m.scrapRecoveryPricePerKg).toBeLessThanOrEqual(m.pricePerKg);
      expect(['High', 'Medium', 'Low']).toContain(m.confidence);
    }
  });

  it('price ladder is sane (specialty > engineering > commodity)', () => {
    expect(price('mat-pp-lgf30')).toBeGreaterThan(price('mat-pp-homo'));   // reinforced > natural PP
    expect(price('mat-pa66-gf50')).toBeGreaterThan(price('mat-pa66-gf35')); // more glass = dearer
    expect(price('mat-pps-gf40')).toBeGreaterThan(price('mat-pa66'));       // high-temp specialty
    expect(price('mat-pei')).toBeGreaterThan(price('mat-abs'));
    expect(price('mat-peek')).toBeGreaterThan(price('mat-pei'));            // PEEK tops the ladder
    expect(price('mat-pcr-pp')).toBeLessThan(price('mat-pp-homo'));         // recycled cheaper than virgin
  });

  it('all injection-moulding resins carry the 2026-07 index-anchored date', () => {
    const resins = lib.materials.filter(m => /Thermoplastic|High-Performance Thermoplastic|Thermoplastic Elastomer/.test(m.category));
    expect(resins.length).toBeGreaterThan(40);
    for (const m of resins) expect(m.effectiveDate).toBe('2026-07');
  });

  it('a new automotive resin drives the cost engine without error', () => {
    const input: UniversalStackInput = {
      partName: 'TPO bumper fascia',
      rawMaterial: { materialId: 'mat-tpo', netWeightKg: 3.5, materialUtilization: 0.95 },
      operations: [{
        operationName: 'Injection', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled',
        cycleTimeHr: 0.02, partsPerCycle: 1, oee: 0.8, manning: 0.5, labourTimeHr: 0.02, labourEfficiency: 0.9,
      }],
      tooling: { totalToolingCost: 120000, amortizationVolume: 200000, mode: 'amortized' },
      packagingPerPart: 0.3, logisticsPerPart: 0.4, overheadPct: 0.12, marginPct: 0.08,
    };
    assertPartCostInvariants(computeUniversalStack(input, lib));
  });
});
