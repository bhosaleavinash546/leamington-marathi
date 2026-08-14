// The uncertainty band must be an interval, not a decoration.
//
// simulateShouldCost applies a systematic model-dispersion term on top of the
// input noise. It used to be a hardcoded 0.13 — which the audit traced to the
// residual half-spread of the CALIBRATED fixture set (13.4%). In other words
// the uncertainty model had been fitted to the same fixtures the cost model was
// tuned on, so the published P10–P90 band measured 87.5% coverage there and
// collapsed to 35.7% on held-out parts.
//
// A user's part is an unseen part. These tests pin the term to the held-out
// residuals and pin the band to behaving like its label.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODEL_DISPERSION, simulateShouldCost, computeShouldCost } from '../costing-engine.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const halfSpread = (rows) => {
  const s = rows.map(r => r.errPct / 100).sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
  return (q(0.90) - q(0.10)) / 2;
};

describe('model dispersion is measured, not chosen', () => {
  it('is sized from HELD-OUT residuals, not the calibrated set', () => {
    const held = halfSpread(read('../benchmark/cost-results-holdout.json').rows);
    const cal = halfSpread(read('../benchmark/cost-results.json').rows);
    // The two differ materially — that difference IS the over-fitting signal,
    // and the term must follow the held-out figure.
    assert.ok(held > cal * 1.8, `held-out spread ${(held * 100).toFixed(1)}% should be far wider than calibrated ${(cal * 100).toFixed(1)}%`);
    assert.ok(
      MODEL_DISPERSION >= held * 0.85,
      `MODEL_DISPERSION ${MODEL_DISPERSION} is below the held-out residual spread ${(held).toFixed(3)} — the band would understate real uncertainty`,
    );
    // Guard the other way too: a hugely inflated band is useless, not honest.
    assert.ok(MODEL_DISPERSION <= held * 1.6, 'dispersion is far wider than the residuals justify');
  });

  it('has NOT drifted back to the calibrated-set value', () => {
    assert.notEqual(MODEL_DISPERSION, 0.13, 'this is the over-fitted value the audit removed');
  });

  it('produces a band that is ordered and actually spans the estimate', () => {
    const input = {
      partName: 'Front Knuckle', process: 'Die Casting (Aluminium)',
      material: 'Aluminium A356 (cast)', weightKg: 2.4, annualVolume: 150000, region: 'Germany',
    };
    const point = computeShouldCost(input).totalShouldCost;
    const s = simulateShouldCost(input);
    assert.ok(s.p10 < s.p50 && s.p50 < s.p90, 'percentiles must be ordered');
    assert.ok(s.p10 < point && point < s.p90, 'the band must contain the point estimate');
    // A band that is right about a third of the time was the defect; a token
    // band is the same defect in a different costume.
    const relWidth = (s.p90 - s.p10) / point;
    assert.ok(relWidth > 0.3, `band is only ${(relWidth * 100).toFixed(0)}% wide — too narrow to be an 80% interval`);
  });

  it('is deterministic for a fixed seed', () => {
    const input = { partName: 'x', process: 'Die Casting (Aluminium)', material: 'Aluminium A356 (cast)', weightKg: 1, annualVolume: 50000, region: 'UK' };
    assert.deepEqual(simulateShouldCost(input), simulateShouldCost(input));
  });
});
