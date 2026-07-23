import { describe, it, expect } from 'vitest';
import {
  adviseForgingProcess,
  analyseForgingDFM,
  estimateForgingSecondaryAdders,
  estimateForgingDieLife,
  forgingHeatKwhPerKg,
  FORGING_PROCESS_REFERENCE,
  FORGING_HEAT_KWH_PER_KG,
  FORGING_DIE_LIFE_BASE,
  type ForgingAdvisorInputs,
  type ForgingAlloyFamily,
} from '../src/engine/modules/forging-advisor.js';
import { computeForgingDrivers } from '../src/engine/modules/forging.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { assertPartCostInvariants } from './helpers/engine-invariants.js';

const base: ForgingAdvisorInputs = {
  annualVolume: 20000,
  partWeightKg: 5,
  complexity: 'medium',
  alloyFamily: 'alloy-steel',
};

describe('forging process advisor', () => {
  it('routes ring/flange geometry to seamless ring rolling', () => {
    const r = adviseForgingProcess({ ...base, isRingShape: true, partWeightKg: 20 });
    expect(r.process).toBe('ring-rolling');
  });

  it('routes titanium and superalloy to precision/near-net forging', () => {
    expect(adviseForgingProcess({ ...base, alloyFamily: 'titanium' }).process).toBe('precision');
    expect(adviseForgingProcess({ ...base, alloyFamily: 'superalloy' }).process).toBe('precision');
  });

  it('routes small high-volume simple steel to cold forging', () => {
    const r = adviseForgingProcess({ ...base, partWeightKg: 0.3, annualVolume: 500000, complexity: 'low', alloyFamily: 'carbon-steel' });
    expect(r.process).toBe('cold-forming');
    expect(r.reference.yieldBand[0]).toBeGreaterThan(0.8);   // near-net yield
  });

  it('routes very large or one-off parts to open-die', () => {
    expect(adviseForgingProcess({ ...base, partWeightKg: 800 }).process).toBe('open-die');
    expect(adviseForgingProcess({ ...base, annualVolume: 50 }).process).toBe('open-die');
  });

  it('defaults volume alloy-steel work to closed-die impression forging', () => {
    const r = adviseForgingProcess(base);
    expect(r.process).toBe('closed-die');
    expect(r.processRoute.some(s => /flash trim/i.test(s))).toBe(true);
  });

  it('adds NDT to secondary steps for safety-critical parts', () => {
    const r = adviseForgingProcess({ ...base, safetyCritical: true });
    expect(r.suggestedSecondary.some(s => /NDT/i.test(s))).toBe(true);
  });

  it('every process reference is internally consistent', () => {
    for (const ref of Object.values(FORGING_PROCESS_REFERENCE)) {
      expect(ref.yieldBand[0]).toBeLessThan(ref.yieldBand[1]);
      expect(ref.yieldBand[1]).toBeLessThanOrEqual(1);
      expect(ref.weightRangeKg[0]).toBeLessThan(ref.weightRangeKg[1]);
      expect(ref.minWebMm).toBeGreaterThan(0);
    }
  });
});

describe('forging DFM rules', () => {
  it('flags a web below the process minimum as critical', () => {
    const r = analyseForgingDFM({ process: 'closed-die', minWebThicknessMm: 1.5, draftAngleDeg: 5 });
    expect(r.issues.some(i => i.severity === 'critical' && /web/i.test(i.title))).toBe(true);
    expect(r.score).toBeLessThan(10);
  });

  it('flags insufficient die draft', () => {
    const r = analyseForgingDFM({ process: 'closed-die', minWebThicknessMm: 6, draftAngleDeg: 1 });
    expect(r.issues.some(i => /draft/i.test(i.title))).toBe(true);
  });

  it('flags grain flow not aligned with the load path', () => {
    const r = analyseForgingDFM({ process: 'closed-die', minWebThicknessMm: 6, draftAngleDeg: 5, grainFlowAligned: false });
    expect(r.issues.some(i => /grain flow/i.test(i.title))).toBe(true);
  });

  it('flags deep thin ribs and sharp fillets', () => {
    const r = analyseForgingDFM({ process: 'closed-die', minWebThicknessMm: 6, draftAngleDeg: 5, ribHeightToThickness: 6, filletRadiusMm: 1 });
    expect(r.issues.some(i => /deep thin rib/i.test(i.title))).toBe(true);
    expect(r.issues.some(i => /fillet/i.test(i.title))).toBe(true);
  });

  it('raises a near-net opportunity for excess machining stock', () => {
    const r = analyseForgingDFM({ process: 'closed-die', minWebThicknessMm: 6, draftAngleDeg: 5, machiningStockMm: 5 });
    expect(r.issues.some(i => i.severity === 'opportunity' && /machining stock/i.test(i.title))).toBe(true);
  });

  it('returns a clean score for compliant geometry', () => {
    const r = analyseForgingDFM({ process: 'closed-die', minWebThicknessMm: 5, draftAngleDeg: 5, filletRadiusMm: 5 });
    expect(r.score).toBe(10);
    expect(r.issues).toEqual([]);
  });
});

describe('forging secondary-process adders', () => {
  it('solution-age costs more than normalise per kg', () => {
    const norm = estimateForgingSecondaryAdders({ alloyFamily: 'alloy-steel', partWeightKg: 4, heatTreat: 'normalise' });
    const sa = estimateForgingSecondaryAdders({ alloyFamily: 'titanium', partWeightKg: 4, heatTreat: 'solution-age' });
    expect(sa.totalPerPartGbp).toBeGreaterThan(norm.totalPerPartGbp);
  });

  it('CT NDT costs more than UT and MPI, and sums all adders', () => {
    const r = estimateForgingSecondaryAdders({
      alloyFamily: 'alloy-steel', partWeightKg: 4, heatTreat: 'quench-temper', descale: true, coining: true, ndt: 'ct',
    });
    expect(r.adders.length).toBe(4);
    const summed = r.adders.reduce((s, a) => s + a.costPerPartGbp, 0);
    expect(r.totalPerPartGbp).toBeCloseTo(summed, 6);
    const mpi = estimateForgingSecondaryAdders({ alloyFamily: 'alloy-steel', partWeightKg: 4, ndt: 'mpi' });
    const ut = estimateForgingSecondaryAdders({ alloyFamily: 'alloy-steel', partWeightKg: 4, ndt: 'ut' });
    const ctCost = r.adders.find(a => /NDT/.test(a.label))!.costPerPartGbp;
    expect(ctCost).toBeGreaterThan(ut.adders[0].costPerPartGbp);
    expect(ut.adders[0].costPerPartGbp).toBeGreaterThan(mpi.adders[0].costPerPartGbp);
  });

  it('returns no adders when nothing is requested', () => {
    const r = estimateForgingSecondaryAdders({ alloyFamily: 'alloy-steel', partWeightKg: 4 });
    expect(r.adders).toEqual([]);
    expect(r.totalPerPartGbp).toBe(0);
  });
});

describe('forging NDT/coining adders flow into part cost', () => {
  it('NDT + coining raise the finished part cost', () => {
    const common = {
      materialId: 'mat-ti-6al4v-forge',
      partWeightKg: 3,
      flashAndScaleKg: 1.5,
      yieldFraction: 0.75,
      forgeId: 'forge-press-500t',
      labourId: 'lab-uk-skilled',
      strokesToForm: 3,
      cycleTimeHr: 0.05,
      oee: 0.75,
      manning: 1,
      labourEfficiency: 0.9,
      heatingEnergyKwhPerKg: 0.35,
      dieLife: 5000,
      dieCost: 60000,
      amortizationVolume: 20000,
    };
    const tail = { packagingPerPart: 0.5, logisticsPerPart: 0.8, overheadPct: 0.12, marginPct: 0.08 };

    const plain = computeForgingDrivers(common);
    const withNDT = computeForgingDrivers({ ...common, ndtCostPerPart: 32, coiningCostPerPart: 0.55 });

    const cPlain = computeUniversalStack({ partName: 'Ti disc', ...plain, ...tail }, DEFAULT_RATE_LIBRARY);
    const cNDT = computeUniversalStack({ partName: 'Ti disc', ...withNDT, ...tail }, DEFAULT_RATE_LIBRARY);

    assertPartCostInvariants(cPlain);
    assertPartCostInvariants(cNDT);
    expect(cNDT.total).toBeGreaterThan(cPlain.total);
  });
});

describe('alloy-aware forging heating energy (F2-C)', () => {
  const ALL: ForgingAlloyFamily[] = [
    'carbon-steel', 'alloy-steel', 'microalloyed-steel', 'stainless-steel',
    'aluminium', 'titanium', 'superalloy', 'copper',
  ];

  it('covers every alloy family with a positive, physically-plausible kWh/kg', () => {
    for (const f of ALL) {
      const e = forgingHeatKwhPerKg(f);
      expect(e).toBe(FORGING_HEAT_KWH_PER_KG[f]);
      expect(e).toBeGreaterThan(0);
      expect(e).toBeLessThan(1); // sanity bound — no family should exceed ~1 kWh/kg
    }
  });

  it('orders heating energy by forging temperature: aluminium < carbon-steel < superalloy', () => {
    expect(forgingHeatKwhPerKg('aluminium'))
      .toBeLessThan(forgingHeatKwhPerKg('carbon-steel'));
    expect(forgingHeatKwhPerKg('carbon-steel'))
      .toBeLessThan(forgingHeatKwhPerKg('superalloy'));
    // copper forges warm — below the steels; stainless runs hotter than carbon steel.
    expect(forgingHeatKwhPerKg('copper')).toBeLessThan(forgingHeatKwhPerKg('carbon-steel'));
    expect(forgingHeatKwhPerKg('stainless-steel')).toBeGreaterThan(forgingHeatKwhPerKg('carbon-steel'));
  });

  it('aluminium takes roughly half the heat of steel', () => {
    const ratio = forgingHeatKwhPerKg('aluminium') / forgingHeatKwhPerKg('carbon-steel');
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.7);
  });
});

describe('alloy-aware forging die life (F2-A) ordering', () => {
  it('aluminium dies outlast carbon-steel dies, which outlast superalloy dies', () => {
    const al = estimateForgingDieLife({ alloyFamily: 'aluminium', complexity: 'moderate' });
    const cs = estimateForgingDieLife({ alloyFamily: 'carbon-steel', complexity: 'moderate' });
    const su = estimateForgingDieLife({ alloyFamily: 'superalloy', complexity: 'moderate' });
    expect(al).toBeGreaterThan(cs);
    expect(cs).toBeGreaterThan(su);
    // Base table agrees with the ordering.
    expect(FORGING_DIE_LIFE_BASE.aluminium).toBeGreaterThan(FORGING_DIE_LIFE_BASE['carbon-steel']);
    expect(FORGING_DIE_LIFE_BASE['carbon-steel']).toBeGreaterThan(FORGING_DIE_LIFE_BASE.superalloy);
  });
});
