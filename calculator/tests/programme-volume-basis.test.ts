/**
 * Annual build rate vs programme lifetime volume.
 *
 * A multi-year award has TWO volumes and they drive different things:
 *   - piece price is negotiated against the ANNUAL buy rate (it is what
 *     reserves capacity and wafer starts — no supplier quotes year one at the
 *     five-year price);
 *   - NRE amortises over the PROGRAMME lifetime.
 *
 * Before this, `amortizationVolume` did both jobs. Entering a 5-year, 350k/yr
 * programme the way the field name invites — 1,750,000 — pushed every component
 * past PRICE_SATURATION_QTY and understated a BOM-dominated board, while the
 * self-audit simultaneously called the correct lifetime amortisation a 5x error.
 * Both directions are pinned here.
 */
import { describe, it, expect } from 'vitest';
import { computePCBADrivers, bomVolumePriceFactor, PRICE_SATURATION_QTY } from '../src/engine/modules/pcba.js';
import type { PCBAInputs, BOMLine } from '../src/engine/modules/pcba.js';
import { runShouldCostAudit } from '../src/engine/should-cost-audit.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const ANNUAL = 350_000;
const YEARS = 5;
const LIFETIME = ANNUAL * YEARS;   // 1,750,000

const line = (over: Partial<BOMLine> = {}): BOMLine => ({
  refDes: 'U1', componentType: 'ic_soic', description: 'part',
  qty: 1, unitPriceGBP: 10.00, priceRefQty: 1_000, moq: 1, ...over,
});

const BASE: PCBAInputs = {
  pcbCostPerBoard: 20, bom: [line()], smtMachineId: 'smt-high-speed-line',
  smtLabourId: 'lab-uk-semiskilled', smtLines: 1, smtLineRatePerHr: 0, smtOee: 0.82,
  throughHoleCount: 0, manualSolderCount: 0, thLabourId: 'lab-uk-semiskilled',
  thLabourTimeSecPerJoint: 12, manualLabourTimeSecPerJoint: 20,
  assemblyYield: 1, reworkCostPerFailure: 0, amortizationVolume: ANNUAL,
};
const material = (i: PCBAInputs) => computePCBADrivers(i).rawMaterial.directCost! - i.pcbCostPerBoard;

describe('component price follows the annual rate, not the programme total', () => {
  it('prices at the annual rate when the two are stated separately', () => {
    const cost = material({ ...BASE, amortizationVolume: LIFETIME, annualBuildVolume: ANNUAL });
    expect(cost).toBeCloseTo(10 * bomVolumePriceFactor(1_000, ANNUAL), 6);
  });

  it('the conflation is expensive in the silent direction', () => {
    // What the old field name invited: put the programme total in and the whole
    // BOM prices past saturation. That is cheaper than the truth, so nothing
    // looks wrong on the report.
    const conflated = material({ ...BASE, amortizationVolume: LIFETIME });
    const correct = material({ ...BASE, amortizationVolume: LIFETIME, annualBuildVolume: ANNUAL });
    expect(conflated).toBeLessThan(correct);
    // 1.75m is past saturation, so the conflated figure is pinned to the cap.
    expect(conflated).toBeCloseTo(10 * bomVolumePriceFactor(1_000, PRICE_SATURATION_QTY), 6);
    expect((correct - conflated) / correct).toBeGreaterThan(0.03);
  });

  it('350k/yr sits on the live part of the curve, not against the cap', () => {
    // If it did not, the annual/lifetime distinction would be academic here.
    expect(ANNUAL).toBeLessThan(PRICE_SATURATION_QTY);
    expect(bomVolumePriceFactor(1_000, ANNUAL))
      .toBeGreaterThan(bomVolumePriceFactor(1_000, PRICE_SATURATION_QTY));
  });

  it('defaults to amortizationVolume, so single-year callers are untouched', () => {
    expect(material({ ...BASE, amortizationVolume: ANNUAL }))
      .toBeCloseTo(material({ ...BASE, amortizationVolume: ANNUAL, annualBuildVolume: ANNUAL }), 10);
  });

  it('NRE still amortises over the programme, not the annual rate', () => {
    const d = computePCBADrivers({
      ...BASE, amortizationVolume: ANNUAL, annualBuildVolume: ANNUAL,
      nreCost: 46_000, nreAmortizationVolume: LIFETIME,
    });
    expect(d.tooling.amortizationVolume).toBe(LIFETIME);
    expect(d.tooling.totalToolingCost).toBe(46_000);
  });
});

describe('the self-audit understands a multi-year award', () => {
  const stack = (amort: number, programmeYears?: number): UniversalStackInput => ({
    partName: 'ECU',
    rawMaterial: { materialId: 'mat-virtual', netWeightKg: 0.2, materialUtilization: 1, directCost: 77 },
    operations: [],
    tooling: { totalToolingCost: 46_000, amortizationVolume: amort, mode: 'amortized' },
    packagingPerPart: 0.73, logisticsPerPart: 0.57, overheadPct: 0.09, marginPct: 0.08,
    annualVolume: ANNUAL, ...(programmeYears ? { programmeYears } : {}),
  });
  const amortFinding = (input: UniversalStackInput) =>
    runShouldCostAudit({ commodity: 'pcba', input, annualVolume: ANNUAL, library: DEFAULT_RATE_LIBRARY })
      .find(f => f.id === 'amort-not-annual');

  it('accepts lifetime amortisation once the programme life is stated', () => {
    expect(amortFinding(stack(LIFETIME, YEARS))).toBeUndefined();
  });

  it('still accepts a single-year basis on the same programme', () => {
    // Amortising over year one is conservative, not wrong.
    expect(amortFinding(stack(ANNUAL, YEARS))).toBeUndefined();
  });

  it('flags lifetime amortisation when no programme life is claimed', () => {
    // This is the guard that matters: "we will build it for years" is an
    // assumption, and amortising on an unstated assumption under-recovers NRE.
    const f = amortFinding(stack(LIFETIME));
    expect(f?.severity).toBe('high');
    expect(f?.message).toMatch(/multi-year award/);
  });

  it('flags a volume matching neither base, and names both', () => {
    const f = amortFinding(stack(600_000, YEARS));
    expect(f).toBeDefined();
    expect(f!.message).toContain('1,750,000');
    expect(f!.message).toContain('350,000');
    expect(f!.correction).toEqual({ kind: 'amortVolume', value: LIFETIME });
  });

  it('the original stale-default lesson still fires', () => {
    // The £0.05-vs-£0.25 progressive-die error that created this check.
    const f = amortFinding(stack(5_000));
    expect(f?.severity).toBe('high');
  });
});
