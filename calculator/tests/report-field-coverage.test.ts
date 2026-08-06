/**
 * Fields that exist on the costing but never reached the report.
 *
 * Found by auditing every field of UniversalStackInput / PartCostResult against
 * what printPDF actually renders, after `annualVolume` turned out to be missing.
 * Three more were: engine warnings, the learning-curve adjustment, and
 * partsPerCycle.
 *
 * The PDF itself is jsPDF and awkward to assert against, so these tests pin the
 * ENGINE side — that the data exists on the result for the report to print.
 * The rendering is verified by driving the real app (scripts/ipb-ecu-tool-run.ts).
 */
import { describe, it, expect } from 'vitest';
import { computeUniversalStack, validateStackInput } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const BASE: UniversalStackInput = {
  partName: 'Coverage fixture',
  rawMaterial: { materialId: 'mat-al6061', netWeightKg: 1.2, materialUtilization: 0.62 },
  operations: [{
    operationName: 'CNC Milling', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled',
    cycleTimeHr: 0.35, partsPerCycle: 1, oee: 0.80, manning: 1,
    labourTimeHr: 0.35, labourEfficiency: 0.92,
  }],
  tooling: { totalToolingCost: 12_000, amortizationVolume: 100_000, mode: 'amortized' },
  packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08,
};

// ─── Engine warnings reach the result ────────────────────────────────────────

describe('result.warnings', () => {
  it('is populated from validation, not discarded at the door', () => {
    // Sub-30% utilisation raises a warning in validateStackInput.
    const wasteful = {
      ...BASE,
      rawMaterial: { ...BASE.rawMaterial, materialUtilization: 0.2 },
    };
    const validation = validateStackInput(wasteful, DEFAULT_RATE_LIBRARY);
    expect(validation.warnings.length, 'fixture must raise a warning').toBeGreaterThan(0);

    const result = computeUniversalStack(wasteful, DEFAULT_RATE_LIBRARY);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBe(validation.warnings.length);
    expect(result.warnings!.some(w => /utilisation/i.test(w))).toBe(true);
  });

  it('names the field, so a reader knows what to go and check', () => {
    const result = computeUniversalStack(
      { ...BASE, rawMaterial: { ...BASE.rawMaterial, materialUtilization: 0.2 } },
      DEFAULT_RATE_LIBRARY);
    expect(result.warnings!.some(w => w.startsWith('rawMaterial.materialUtilization:'))).toBe(true);
  });

  it('surfaces the fraction-vs-percentage slip, the costliest input error there is', () => {
    // 12 where 0.12 was meant is a 12x overhead — silent today.
    const slip = computeUniversalStack({ ...BASE, overheadPct: 12 }, DEFAULT_RATE_LIBRARY);
    expect(slip.warnings!.some(w => /overheadPct/.test(w) && /fraction/i.test(w))).toBe(true);
  });

  it('flags multi-cavity allocation, which is what partsPerCycle changes', () => {
    const multiCavity = computeUniversalStack({
      ...BASE,
      operations: [{ ...BASE.operations[0], partsPerCycle: 4 }],
    }, DEFAULT_RATE_LIBRARY);
    expect(multiCavity.warnings!.some(w => /multi-cavity/i.test(w))).toBe(true);
  });

  it('stays undefined on a clean costing — no noise', () => {
    // Aluminium 6061 is a High-confidence rate, utilisation is fine, no multi-cavity.
    const clean = computeUniversalStack(BASE, DEFAULT_RATE_LIBRARY);
    const validation = validateStackInput(BASE, DEFAULT_RATE_LIBRARY);
    if (validation.warnings.length === 0) {
      expect(clean.warnings).toBeUndefined();
    } else {
      // The library moved a confidence rating; the contract still holds.
      expect(clean.warnings!.length).toBe(validation.warnings.length);
    }
  });

  it('drives the saved-record confidence downgrade the UI keys off', () => {
    // main.ts: confidence = result.warnings?.length ? 'Medium' : 'High'.
    // Before this fix warnings were always undefined, so every costing ever
    // saved claimed High confidence.
    const warned = computeUniversalStack(
      { ...BASE, rawMaterial: { ...BASE.rawMaterial, materialUtilization: 0.2 } },
      DEFAULT_RATE_LIBRARY);
    const conf = (r: { warnings?: string[] }) => (r.warnings?.length ? 'Medium' : 'High');
    expect(conf(warned)).toBe('Medium');
  });
});

// ─── Learning curve is disclosed, not silent ─────────────────────────────────

describe('result.learningCurveApplied', () => {
  const lc = { enabled: true, curvePct: 85, referenceVolume: 1_000 };

  it('carries everything the report needs to explain the adjustment', () => {
    const r = computeUniversalStack(
      { ...BASE, learningCurve: lc, annualVolume: 150_000 }, DEFAULT_RATE_LIBRARY);
    expect(r.learningCurveApplied).toBeDefined();
    const a = r.learningCurveApplied!;
    expect(a.curvePct).toBe(85);
    expect(a.referenceVolume).toBe(1_000);
    expect(a.annualVolume).toBe(150_000);
    expect(a.adjustmentFactor).toBeGreaterThan(0);
    expect(a.adjustmentFactor).toBeLessThan(1);
    // `labourSaving` is SIGNED — core.ts documents "negative = saving". The
    // name reads like a magnitude; it is not, and the report has to take the
    // direction from the sign or it prints "reducing cost by £-6.84".
    expect(a.labourSaving).toBeLessThan(0);
  });

  it('the saving it reports matches the labour actually removed', () => {
    const off = computeUniversalStack(BASE, DEFAULT_RATE_LIBRARY);
    const on = computeUniversalStack(
      { ...BASE, learningCurve: lc, annualVolume: 150_000 }, DEFAULT_RATE_LIBRARY);
    const removed = off.breakdown.labour - on.breakdown.labour;
    expect(removed, 'the curve must actually remove labour').toBeGreaterThan(0);
    // Signed the other way: labourSaving === on - off === -removed.
    expect(on.learningCurveApplied!.labourSaving).toBeCloseTo(-removed, 6);
  });

  it('is absent when no curve was applied, so the report says nothing', () => {
    expect(computeUniversalStack(BASE, DEFAULT_RATE_LIBRARY).learningCurveApplied).toBeUndefined();
  });
});

// ─── partsPerCycle is a cost driver, so it must be reportable ────────────────

describe('partsPerCycle', () => {
  it('divides both machine AND labour time — the reason it must be printed', () => {
    const single = computeUniversalStack(BASE, DEFAULT_RATE_LIBRARY);
    const quad = computeUniversalStack({
      ...BASE, operations: [{ ...BASE.operations[0], partsPerCycle: 4 }],
    }, DEFAULT_RATE_LIBRARY);
    expect(quad.breakdown.process).toBeCloseTo(single.breakdown.process / 4, 6);
    expect(quad.breakdown.labour).toBeCloseTo(single.breakdown.labour / 4, 6);
  });

  it('rides on the operation result, so the report can render it', () => {
    const quad = computeUniversalStack({
      ...BASE, operations: [{ ...BASE.operations[0], partsPerCycle: 4 }],
    }, DEFAULT_RATE_LIBRARY);
    expect(quad.operationDetails[0].partsPerCycle).toBe(4);
    // Cycle time is unchanged — which is exactly why a report showing cycle
    // time without parts-per-cycle cannot be reconciled to the cost.
    expect(quad.operationDetails[0].cycleTimeHr).toBeCloseTo(BASE.operations[0].cycleTimeHr, 10);
  });
});
