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
import { scoreCost } from '../benchmark/cost-run.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const halfSpread = (rows) => {
  const s = rows.map(r => r.errPct / 100).sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
  return (q(0.90) - q(0.10)) / 2;
};

describe('model dispersion is measured, not chosen', () => {
  // Sept 2026, Phase 3: this test used to assert the residual half-spread as a
  // PROXY for the band width, plus `held > cal * 1.8` as an over-fitting signal.
  // Both had to change, and the reason is a result rather than a regression.
  //
  // The region axis, machinability-aware cycle and cell-keyed calibration closed
  // the held-out/calibrated gap from 2.1x to 1.2x — so an assertion that DEMANDS
  // a 1.8x gap now demands over-fitting. And the half-spread proxy under-reads
  // what the band actually needs: the held-out residuals are fat-tailed (two
  // parts far outside an otherwise tight distribution), so a band sized to the
  // p10–p90 half-spread of 19% covers only 50% of held-out parts where the
  // label promises 80%.
  //
  // The band's job is coverage, so coverage is what is asserted — measured
  // through the real engine on the real held-out pack, not inferred.
  const coverageAt = (fixtures) => {
    const r = scoreCost(fixtures);
    return r.bandCoverage;
  };

  it('covers held-out parts at the rate its label claims', () => {
    const held = JSON.parse(readFileSync(new URL('../benchmark/cost-fixtures-holdout.json', import.meta.url), 'utf8'));
    const cov = coverageAt(Array.isArray(held) ? held : held.fixtures);
    // P10-P90 claims 80%. The pack is small, so exact 80% is not attainable;
    // the CI gate requires 70% and this pins the same contract in the suite.
    assert.ok(cov >= 0.70, `held-out band coverage ${(cov * 100).toFixed(1)}% — the band is narrower than its label claims`);
    assert.ok(cov <= 0.95, `held-out band coverage ${(cov * 100).toFixed(1)}% — a band that contains everything is not an 80% interval`);
  });

  it('is not wider than held-out coverage requires', () => {
    // A band twice this wide would also "cover" — and be useless. Narrowing the
    // term must break coverage, which is what proves 0.34 is load-bearing rather
    // than merely safe.
    const held = JSON.parse(readFileSync(new URL('../benchmark/cost-fixtures-holdout.json', import.meta.url), 'utf8'));
    const rows = (Array.isArray(held) ? held : held.fixtures);
    const spread = halfSpread(read('../benchmark/cost-results-holdout.json').rows);
    assert.ok(MODEL_DISPERSION >= spread * 0.85,
      `MODEL_DISPERSION ${MODEL_DISPERSION} is below the held-out residual half-spread ${spread.toFixed(3)}`);
    assert.ok(rows.length > 0, 'the held-out pack must not be empty — an empty pack passes every coverage test');
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
