import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitCalibration, calibrationFactor, crossValidateCalibration } from '../calibration.mjs';
import { computeShouldCost } from '../costing-engine.mjs';
import { mergeLibrary } from '../cost-library.mjs';
import { COST_FIXTURES } from '../benchmark/cost-fixtures.mjs';

test('fitCalibration returns a neutral factor with no data', () => {
  const cal = fitCalibration([]);
  assert.equal(calibrationFactor(cal, 'Machining (CNC)'), 1);
});

test('a process that quotes consistently high gets a >1 correction', () => {
  const records = [
    { process: 'Sand Casting', modelled: 10, actual: 13 },
    { process: 'Sand Casting', modelled: 20, actual: 26 },
    { process: 'Sand Casting', modelled: 5, actual: 6.5 },
  ];
  const cal = fitCalibration(records);
  const f = calibrationFactor(cal, 'Sand Casting');
  assert.ok(f > 1.15 && f < 1.35, `expected ~1.3, got ${f}`);
});

test('applying the fitted factor moves the estimate toward the quote', () => {
  const input = { material: 'Aluminium 6061', process: 'Machining (CNC)', weightKg: 0.4, annualVolume: 40000, region: 'Germany' };
  const base = computeShouldCost(input).totalShouldCost;
  const cal = fitCalibration([
    { process: 'Machining (CNC)', modelled: base, actual: base * 1.2 },
    { process: 'Machining (CNC)', modelled: base * 2, actual: base * 2 * 1.2 },
  ]);
  const calibrated = computeShouldCost(input, {}, cal);
  assert.ok(calibrated.totalShouldCost > base, 'calibrated should rise toward the higher quotes');
  assert.equal(calibrated.calibration.applied, true);
  // composition (pct) must be unchanged — only the level moves
  const uncal = computeShouldCost(input);
  assert.equal(calibrated.breakdown.material.pct, uncal.breakdown.material.pct);
});

test('calibration refits against the CURRENT library, not a frozen baseline', () => {
  // The baseline modelled cost must be recomputed from the quote's inputs against
  // the active library. When a rate-library change raises the baseline, the fitted
  // correction factor for a fixed actual price must DROP — otherwise a stale
  // baseline would over-correct after any library edit.
  const input = { material: 'Aluminium 6061', process: 'Machining (CNC)', weightKg: 0.4, annualVolume: 40000, region: 'Germany' };
  const cheap = mergeLibrary({});
  const dear = mergeLibrary({ processes: { 'Machining (CNC)': { machineRate: 130 } } });
  const actual = 30;
  const fCheap = calibrationFactor(fitCalibration([{ process: 'Machining (CNC)', modelled: computeShouldCost(input, {}, null, cheap).totalShouldCost, actual }]), 'Machining (CNC)');
  const fDear = calibrationFactor(fitCalibration([{ process: 'Machining (CNC)', modelled: computeShouldCost(input, {}, null, dear).totalShouldCost, actual }]), 'Machining (CNC)');
  assert.ok(fDear < fCheap, `factor should drop when the baseline rises: ${fDear} vs ${fCheap}`);
});

test('leave-one-out: calibration GENERALISES to held-out quotes (learns, not memorises)', () => {
  // Real product scenario: a user's plant/supplier carries systematic per-process
  // offsets the generic engine can't know (e.g. their machining runs 25% dearer,
  // their sand casting 12% cheaper). Build a quote corpus with those offsets +
  // small deterministic noise, then check out-of-sample error drops.
  const USER = { 'Machining (CNC)': 1.25, 'Sand Casting': 0.88, 'Die Casting (Aluminium)': 1.12 };
  const base = [
    { material: 'Aluminium 6061', process: 'Machining (CNC)', weightKg: 0.4, annualVolume: 40000, region: 'Germany' },
    { material: 'Steel (mild)', process: 'Machining (CNC)', weightKg: 0.9, annualVolume: 25000, region: 'Germany' },
    { material: 'Aluminium 6061', process: 'Machining (CNC)', weightKg: 1.5, annualVolume: 15000, region: 'USA' },
    { material: 'Cast Iron (Ductile/GJS)', process: 'Sand Casting', weightKg: 6.7, annualVolume: 200000, region: 'China' },
    { material: 'Cast Iron (Grey)', process: 'Sand Casting', weightKg: 3.0, annualVolume: 120000, region: 'Germany' },
    { material: 'Aluminium A356 (cast)', process: 'Sand Casting', weightKg: 1.1, annualVolume: 80000, region: 'Spain' },
    { material: 'Aluminium A356 (cast)', process: 'Die Casting (Aluminium)', weightKg: 1.2, annualVolume: 150000, region: 'Germany' },
    { material: 'Aluminium A356 (cast)', process: 'Die Casting (Aluminium)', weightKg: 0.6, annualVolume: 200000, region: 'China' },
    { material: 'Magnesium AZ31', process: 'Die Casting (Aluminium)', weightKg: 0.9, annualVolume: 100000, region: 'Germany' },
  ];
  // Deterministic ±3% noise so the fit can't just memorise exact ratios.
  const noise = i => 1 + ((i * 37) % 7 - 3) / 100;
  const records = base.map((input, i) => {
    const modelled = computeShouldCost(input).totalShouldCost;
    return { process: input.process, modelled, actual: modelled * USER[input.process] * noise(i) };
  });
  const cv = crossValidateCalibration(records);
  // Before: ~mean offset from 1 (12–25%). After: should collapse toward the 3% noise floor.
  assert.ok(cv.mapeAfter < cv.mapeBefore * 0.6,
    `expected clear out-of-sample gain, before ${(cv.mapeBefore * 100).toFixed(1)}% after ${(cv.mapeAfter * 100).toFixed(1)}%`);
});
