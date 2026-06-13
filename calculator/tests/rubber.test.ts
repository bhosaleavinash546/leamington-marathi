import { describe, it, expect } from 'vitest';
import { computeRubberDrivers } from '../src/engine/modules/rubber.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const STACK_DEFAULTS = {
  partName: 'Test Rubber Part',
  packagingPerPart: 0.05,
  logisticsPerPart: 0.10,
  overheadPct: 0.11,
  marginPct: 0.09,
};

const RUB_INPUTS = {
  materialId: 'mat-epdm',
  partWeightKg: 0.050,
  flashAndRunnerWeightKg: 0.010,
  process: 'compression_mould' as const,
  machineId: 'compression-mould-std',
  labourId: 'lab-uk-semiskilled',
  cycleTimeSec: 120,
  cavities: 4,
  oee: 0.80,
  manning: 1,
  labourEfficiency: 0.90,
  rejectRate: 0.03,
  mouldCost: 5000,
  mouldLife: 200000,
  amortizationVolume: 50000,
};

describe('Rubber module — compression moulding', () => {
  it('material utilization = partWt / (partWt + flashWt)', () => {
    const d = computeRubberDrivers(RUB_INPUTS);
    const expected = 0.05 / (0.05 + 0.01);
    expect(d.rawMaterial.materialUtilization).toBeCloseTo(expected, 6);
  });

  it('reject uplift scales netWeightKg and cycleTimeHr', () => {
    const d = computeRubberDrivers(RUB_INPUTS);
    const uplift = 1 / (1 - 0.03);
    expect(d.rawMaterial.netWeightKg).toBeCloseTo(0.05 * uplift, 6);
    const expectedCycleHr = (120 / 3600) * uplift;
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(expectedCycleHr, 6);
  });

  it('partsPerCycle = cavities', () => {
    const d = computeRubberDrivers(RUB_INPUTS);
    expect(d.operations[0].partsPerCycle).toBe(4);
  });

  it('mould life accounting — numMoulds = ceil(amortVol / (mouldLife × cavities))', () => {
    const d = computeRubberDrivers(RUB_INPUTS);
    const numMoulds = Math.ceil(50000 / (200000 * 4));
    expect(d.tooling.totalToolingCost).toBe(5000 * numMoulds);
  });

  it('no reject rate → uplift = 1', () => {
    const d = computeRubberDrivers({ ...RUB_INPUTS, rejectRate: 0 });
    expect(d.rawMaterial.netWeightKg).toBeCloseTo(0.05, 6);
  });

  it('optional cure oven operation added when cureTimeSec > 0 and cureOvenMachineId set', () => {
    const d = computeRubberDrivers({
      ...RUB_INPUTS,
      cureTimeSec: 300,
      cureOvenMachineId: 'cure-oven-rubber',
    });
    expect(d.operations).toHaveLength(2);
    expect(d.operations[1].operationName).toBe('Vulcanisation Cure');
  });

  it('no cure oven op without cureOvenMachineId', () => {
    const d = computeRubberDrivers({ ...RUB_INPUTS, cureTimeSec: 300 });
    expect(d.operations).toHaveLength(1);
  });

  it('full stack computes a positive total cost', () => {
    const d = computeRubberDrivers(RUB_INPUTS);
    const result = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(result.total).toBeGreaterThan(0.01);
    expect(result.breakdown.rawMaterial).toBeGreaterThan(0);
    expect(result.breakdown.process).toBeGreaterThan(0);
  });

  it('bonding primer adds to consumables cost', () => {
    const d = computeRubberDrivers({ ...RUB_INPUTS, bondingPrimerCostPerPart: 0.15 });
    expect(d.rawMaterial.consumablesCostPerPart).toBeCloseTo(0.15, 6);
  });
});

describe('Rubber module — LSR injection', () => {
  const lsrInputs = {
    ...RUB_INPUTS,
    materialId: 'mat-lsr',
    process: 'injection_mould_lsr' as const,
    machineId: 'lsr-injection-machine',
    cycleTimeSec: 45,
    cavities: 16,
    mouldCost: 25000,
    mouldLife: 500000,
    rejectRate: 0.01,
  };

  it('16-cavity LSR mould — partsPerCycle = 16', () => {
    const d = computeRubberDrivers(lsrInputs);
    expect(d.operations[0].partsPerCycle).toBe(16);
  });

  it('full stack runs without error', () => {
    const d = computeRubberDrivers(lsrInputs);
    const result = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(result.total).toBeGreaterThan(0);
  });
});

describe('Regional rates — buildRegionalLibrary', () => {
  it('China library has lower labour than UK', () => {
    const uk = DEFAULT_RATE_LIBRARY;
    const cn = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'CN');
    const ukSkilled = uk.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr;
    const cnSkilled = cn.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr;
    expect(cnSkilled).toBeLessThan(ukSkilled);
  });

  it('China library has lower machine rates than UK', () => {
    const uk = DEFAULT_RATE_LIBRARY;
    const cn = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'CN');
    const ukRate = uk.machines[0].computedRatePerHr;
    const cnRate = cn.machines[0].computedRatePerHr;
    expect(cnRate).toBeLessThan(ukRate);
  });

  it('Germany library has higher labour than UK', () => {
    const uk = DEFAULT_RATE_LIBRARY;
    const de = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'DE');
    const ukSkilled = uk.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr;
    const deSkilled = de.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr;
    expect(deSkilled).toBeGreaterThan(ukSkilled);
  });

  it('Vietnam is cheapest labour out of all 20 regions', () => {
    const regions = ['UK','DE','FR','IT','ES','PL','CZ','RO','HU','SE','NL','TR','CN','IN','MX','US','TH','VN','BR','KR'] as const;
    const rates = regions.map(r => ({
      region: r,
      rate: buildRegionalLibrary(DEFAULT_RATE_LIBRARY, r).labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr,
    }));
    const cheapest = rates.reduce((a, b) => a.rate < b.rate ? a : b);
    expect(cheapest.region).toBe('VN');
  });

  it('UK region returns same library as base (UK multipliers = 1)', () => {
    const uk = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'UK');
    const base = DEFAULT_RATE_LIBRARY;
    const ukLabour = uk.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr;
    const baseLabour = base.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr;
    expect(ukLabour).toBeCloseTo(baseLabour, 2);
  });
});
