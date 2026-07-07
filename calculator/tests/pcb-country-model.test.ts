import { describe, it, expect, afterEach } from 'vitest';
import {
  PCB_COUNTRY_RATES,
  computePCBCountryCost,
  applyPCBCountryRateOverrides,
  getActivePCBCountryOverrides,
  type PCBCostInput,
} from '../server/data/pcb-country-rates.js';

// Regression tests for the 360-audit country-model implementation:
// energy / packaging / yield elements, sourcing-adjusted BOM, duty base,
// sea freight, and admin-editable overrides.

const BASE: PCBCostInput = {
  widthMm: 100, heightMm: 80, layers: 4, surfaceFinish: 'enig',
  throughVias: 200, blindVias: 0, microVias: 0, hdiStructure: 'none',
  impedanceControlled: false, smtPlacements: 300, throughHoleJoints: 20,
  manualJoints: 5, bgaCount: 1, aoiRequired: true, ictTimeSec: 60,
  conformalCoatAreaCm2: 0, totalBOMCostGBP: 25, orderQuantity: 1000,
};

afterEach(() => { applyPCBCountryRateOverrides({}); }); // never leak overrides across tests

describe('country cost model — new elements (energy / packaging / yield)', () => {
  it('breakdown carries positive energy, packaging and yieldLoss elements', () => {
    const r = computePCBCountryCost(BASE, 'cn');
    expect(r.breakdown.energy).toBeGreaterThan(0);
    expect(r.breakdown.packaging).toBeGreaterThan(0);
    expect(r.breakdown.yieldLoss).toBeGreaterThan(0);
  });

  it('the new elements are included in totalPerBoard', () => {
    const r = computePCBCountryCost(BASE, 'cn');
    const sum = r.pcbFabPerBoard + r.assemblyPerBoard + r.logisticsPerBoard + r.bomCostPerBoard
      + r.breakdown.energy + r.breakdown.packaging + r.breakdown.yieldLoss;
    expect(r.totalPerBoard).toBeCloseTo(sum, 1); // rounding tolerance
  });

  it('energy reflects actual country tariffs (Germany > China, same board)', () => {
    const de = computePCBCountryCost(BASE, 'de');
    const cn = computePCBCountryCost(BASE, 'cn');
    expect(de.breakdown.energy).toBeGreaterThan(cn.breakdown.energy);
  });

  it('yield cost scales with placement count via country dppm', () => {
    const dense = computePCBCountryCost({ ...BASE, smtPlacements: 900 }, 'cn');
    const sparse = computePCBCountryCost({ ...BASE, smtPlacements: 100 }, 'cn');
    expect(dense.breakdown.yieldLoss).toBeGreaterThan(sparse.breakdown.yieldLoss);
  });
});

describe('country cost model — sourcing, duty, freight (audit fixes)', () => {
  it('BOM varies by country via the sourcing index (CN discount vs UK premium)', () => {
    const cn = computePCBCountryCost(BASE, 'cn');
    const gb = computePCBCountryCost(BASE, 'gb');
    expect(cn.bomCostPerBoard).toBeLessThan(BASE.totalBOMCostGBP);   // 0.88×
    expect(gb.bomCostPerBoard).toBeGreaterThan(BASE.totalBOMCostGBP); // 1.22×
  });

  it('import duty base includes the BOM (customs value of a populated assembly)', () => {
    const cn = computePCBCountryCost(BASE, 'cn');
    const dutyRate = PCB_COUNTRY_RATES.cn.logistics.importDutyFraction;
    const expected = (cn.pcbFabPerBoard + cn.assemblyPerBoard + cn.bomCostPerBoard) * dutyRate;
    expect(cn.breakdown.importDuty).toBeCloseTo(expected, 1);
  });

  it('volume orders (≥2500) ship sea and cost less freight than air', () => {
    const air = computePCBCountryCost({ ...BASE, orderQuantity: 1000 }, 'cn');
    const sea = computePCBCountryCost({ ...BASE, orderQuantity: 5000 }, 'cn');
    expect(sea.breakdown.logistics).toBeLessThan(air.breakdown.logistics);
  });
});

describe('admin-editable country rates (overrides)', () => {
  it('a numeric override changes the computed cost and reset restores it', () => {
    const before = computePCBCountryCost(BASE, 'cn');
    const r = applyPCBCountryRateOverrides({ cn: { assembly: { smtLineRatePerHr: 22 } } });
    expect(r.appliedPaths).toContain('cn.assembly.smtLineRatePerHr');
    const after = computePCBCountryCost(BASE, 'cn');
    expect(after.assemblyPerBoard).toBeGreaterThan(before.assemblyPerBoard);

    applyPCBCountryRateOverrides({});
    const restored = computePCBCountryCost(BASE, 'cn');
    expect(restored.assemblyPerBoard).toBeCloseTo(before.assemblyPerBoard, 6);
  });

  it('rejects __proto__, unknown countries/paths, strings and negatives', () => {
    const r = applyPCBCountryRateOverrides({
      __proto__: { polluted: 1 },
      zz: { assembly: { smtLineRatePerHr: 9 } },
      cn: {
        name: 'Hacked',                          // string leaf — not overridable
        assembly: { smtLineRatePerHr: -5 },      // negative — rejected
        pcbFab: { nonsense: 3 },                 // unknown path — rejected
      },
    } as unknown as Record<string, unknown>);
    expect(r.appliedPaths).toEqual([]);
    expect(r.rejectedPaths.length).toBeGreaterThanOrEqual(4);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined(); // no pollution
    expect(PCB_COUNTRY_RATES.cn.name).not.toBe('Hacked');
  });

  it('overrides are baseline-relative (never compounding) and reported', () => {
    applyPCBCountryRateOverrides({ cn: { assembly: { smtLineRatePerHr: 20 } } });
    applyPCBCountryRateOverrides({ cn: { assembly: { smtLineRatePerHr: 20 } } });
    expect(PCB_COUNTRY_RATES.cn.assembly.smtLineRatePerHr).toBe(20); // not 20-on-20
    expect(getActivePCBCountryOverrides()).toEqual({ cn: { assembly: { smtLineRatePerHr: 20 } } });
  });
});
