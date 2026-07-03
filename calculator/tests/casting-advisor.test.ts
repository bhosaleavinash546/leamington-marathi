import { describe, it, expect } from 'vitest';
import {
  adviseCastingProcess,
  analyseCastingDFM,
  estimateCastingSecondaryAdders,
  CASTING_PROCESS_REFERENCE,
  type CastingAdvisorInputs,
} from '../src/engine/modules/casting-advisor.js';
import { computeCastAndMachineDrivers } from '../src/engine/modules/cast-and-machine.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { assertPartCostInvariants } from './helpers/engine-invariants.js';

const base: CastingAdvisorInputs = {
  annualVolume: 30000,
  partWeightKg: 2,
  minWallThicknessMm: 2.5,
  complexity: 'medium',
  alloyFamily: 'aluminium',
};

describe('casting process advisor', () => {
  it('routes nickel superalloy to investment casting with HIP + NDT', () => {
    const r = adviseCastingProcess({ ...base, alloyFamily: 'superalloy', partWeightKg: 1.5 });
    expect(r.process).toBe('investment');
    expect(r.suggestedSecondary).toContain('HIP');
  });

  it('routes large high-volume structural aluminium to megacasting', () => {
    const r = adviseCastingProcess({ ...base, partWeightKg: 40, annualVolume: 120000 });
    expect(r.process).toBe('megacasting');
    expect(r.reference.weightRangeKg[1]).toBeGreaterThanOrEqual(40);
  });

  it('routes thin-wall high-volume aluminium to HPDC', () => {
    const r = adviseCastingProcess({ ...base, annualVolume: 50000, minWallThicknessMm: 2, partWeightKg: 1.5 });
    expect(r.process).toBe('hpdc');
  });

  it('adds a porosity-mitigation step for leak-tight HPDC', () => {
    const r = adviseCastingProcess({ ...base, annualVolume: 50000, minWallThicknessMm: 2, pressureTight: true });
    expect(r.process).toBe('hpdc');
    expect(r.processRoute.some(s => /impregnation/i.test(s))).toBe(true);
  });

  it('routes medium-volume aluminium needing T6 to gravity die', () => {
    const r = adviseCastingProcess({ ...base, annualVolume: 5000, minWallThicknessMm: 5 });
    expect(r.process).toBe('gravity');
    expect(r.suggestedSecondary).toContain('T6 heat treat');
  });

  it('routes ductile iron and large/low-volume parts to sand casting', () => {
    expect(adviseCastingProcess({ ...base, alloyFamily: 'ductile-iron' }).process).toBe('sand');
    expect(adviseCastingProcess({ ...base, partWeightKg: 200 }).process).toBe('sand');
    expect(adviseCastingProcess({ ...base, annualVolume: 500 }).process).toBe('sand');
  });

  it('every process reference is internally consistent', () => {
    for (const ref of Object.values(CASTING_PROCESS_REFERENCE)) {
      expect(ref.yieldBand[0]).toBeLessThan(ref.yieldBand[1]);
      expect(ref.yieldBand[0]).toBeGreaterThan(0);
      expect(ref.yieldBand[1]).toBeLessThanOrEqual(1);
      expect(ref.weightRangeKg[0]).toBeLessThan(ref.weightRangeKg[1]);
      expect(ref.minWallMm).toBeGreaterThan(0);
    }
  });
});

describe('casting DFM rules', () => {
  it('flags a wall below the process minimum as critical', () => {
    const r = analyseCastingDFM({
      process: 'hpdc', minWallThicknessMm: 0.6, maxWallThicknessMm: 2, draftAngleDeg: 1,
    });
    expect(r.issues.some(i => i.severity === 'critical' && /wall/i.test(i.title))).toBe(true);
    expect(r.score).toBeLessThan(10);
  });

  it('flags non-uniform sections as a shrinkage-porosity risk', () => {
    const r = analyseCastingDFM({
      process: 'gravity', minWallThicknessMm: 3, maxWallThicknessMm: 15, draftAngleDeg: 2,
    });
    expect(r.issues.some(i => /non-uniform sections/i.test(i.title))).toBe(true);
  });

  it('flags leak-tight HPDC without porosity mitigation', () => {
    const r = analyseCastingDFM({
      process: 'hpdc', minWallThicknessMm: 2, maxWallThicknessMm: 4, draftAngleDeg: 1,
      pressureTight: true, porosityMitigated: false,
    });
    expect(r.issues.some(i => /leak-tight hpdc/i.test(i.title))).toBe(true);
    // once mitigated, the finding clears
    const ok = analyseCastingDFM({
      process: 'hpdc', minWallThicknessMm: 2, maxWallThicknessMm: 4, draftAngleDeg: 1,
      pressureTight: true, porosityMitigated: true,
    });
    expect(ok.issues.some(i => /leak-tight hpdc/i.test(i.title))).toBe(false);
  });

  it('raises a near-net opportunity for excess machining stock', () => {
    const r = analyseCastingDFM({
      process: 'sand', minWallThicknessMm: 5, maxWallThicknessMm: 6, draftAngleDeg: 2, machiningStockMm: 4,
    });
    expect(r.issues.some(i => i.severity === 'opportunity' && /machining stock/i.test(i.title))).toBe(true);
  });

  it('returns a clean score for compliant geometry', () => {
    const r = analyseCastingDFM({
      process: 'hpdc', minWallThicknessMm: 2, maxWallThicknessMm: 4, draftAngleDeg: 1.5,
    });
    expect(r.score).toBe(10);
    expect(r.issues).toEqual([]);
  });
});

describe('casting secondary-process adders', () => {
  it('prices HIP per kg with a superalloy premium over aluminium', () => {
    const al = estimateCastingSecondaryAdders({ alloyFamily: 'aluminium', partWeightKg: 2, hip: true });
    const su = estimateCastingSecondaryAdders({ alloyFamily: 'superalloy', partWeightKg: 2, hip: true });
    expect(su.totalPerPartGbp).toBeGreaterThan(al.totalPerPartGbp);
  });

  it('T6 heat treat costs more than T5', () => {
    const t5 = estimateCastingSecondaryAdders({ alloyFamily: 'aluminium', partWeightKg: 3, heatTreat: 't5' });
    const t6 = estimateCastingSecondaryAdders({ alloyFamily: 'aluminium', partWeightKg: 3, heatTreat: 't6' });
    expect(t6.totalPerPartGbp).toBeGreaterThan(t5.totalPerPartGbp);
  });

  it('CT NDT costs more than X-ray and sums all adders', () => {
    const r = estimateCastingSecondaryAdders({
      alloyFamily: 'aluminium', partWeightKg: 2, heatTreat: 't6', hip: true, ndt: 'ct', shotBlast: true, fettling: 'medium',
    });
    expect(r.adders.length).toBe(5);
    const summed = r.adders.reduce((s, a) => s + a.costPerPartGbp, 0);
    expect(r.totalPerPartGbp).toBeCloseTo(summed, 6);
    const xray = estimateCastingSecondaryAdders({ alloyFamily: 'aluminium', partWeightKg: 2, ndt: 'xray' });
    expect(r.adders.find(a => /NDT/.test(a.label))!.costPerPartGbp)
      .toBeGreaterThan(xray.adders.find(a => /NDT/.test(a.label))!.costPerPartGbp);
  });

  it('returns no adders when nothing is requested', () => {
    const r = estimateCastingSecondaryAdders({ alloyFamily: 'aluminium', partWeightKg: 2 });
    expect(r.adders).toEqual([]);
    expect(r.totalPerPartGbp).toBe(0);
  });
});

describe('cast-and-machine HIP/NDT adders flow into part cost', () => {
  it('HIP + NDT raise the finished part cost', () => {
    const common = {
      castingSubtype: 'investment' as const,
      materialId: 'mat-inconel718-cast',
      castPartWeightKg: 1.5,
      finishedWeightKg: 1.3,
      castingYield: 0.5,
      rejectRate: 0.05,
      castingLabourId: 'lab-uk-skilled',
      castingOee: 0.7,
      castingManning: 1,
      castingLabourEfficiency: 0.9,
      investment: {
        waxCostPerPart: 2, shellBuildCostPerPart: 4, pourLabourId: 'lab-uk-skilled',
        pourCycleHr: 0.5, pourMachineId: 'mach-lathe-cnc', waxDieCost: 18000,
      },
      geometryComplexity: 4 as const,
      machiningOps: [],
      machiningSetup: { setupTimeHr: 2, batchSize: 100, machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled' },
      machiningToolingCost: 3000,
      machiningProgrammingNRE: 2000,
      amortizationVolume: 5000,
    };
    const tail = { packagingPerPart: 1, logisticsPerPart: 1.5, overheadPct: 0.12, marginPct: 0.08 };

    const plain = computeCastAndMachineDrivers(common);
    const withNDT = computeCastAndMachineDrivers({ ...common, hipCostPerKg: 9.0, ndtCostPerPart: 32 });

    const cPlain = computeUniversalStack({ partName: 'turbine bracket', ...plain, ...tail }, DEFAULT_RATE_LIBRARY);
    const cNDT = computeUniversalStack({ partName: 'turbine bracket', ...withNDT, ...tail }, DEFAULT_RATE_LIBRARY);

    assertPartCostInvariants(cPlain);
    assertPartCostInvariants(cNDT);
    expect(cNDT.total).toBeGreaterThan(cPlain.total);
  });
});
