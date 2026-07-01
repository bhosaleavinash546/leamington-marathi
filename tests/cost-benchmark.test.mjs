import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCost } from '../benchmark/cost-run.mjs';
import { COST_FIXTURES } from '../benchmark/cost-fixtures.mjs';

test('every calibration fixture is costable (compatible material/process)', () => {
  const r = scoreCost();
  assert.equal(r.errored, 0, 'some fixture threw — check material/process family compatibility');
  assert.equal(r.total, COST_FIXTURES.length);
});

test('should-cost accuracy stays within the committed gate', () => {
  const r = scoreCost();
  // Gate tightened after finishing/commercial calibration (was 0.70 / 0.25).
  // Tighten further as real supplier quotes replace the illustrative references.
  assert.ok(r.hitRate >= 0.85, `hit-rate regressed to ${(r.hitRate * 100).toFixed(1)}%`);
  assert.ok(r.mape <= 0.16, `MAPE regressed to ${(r.mape * 100).toFixed(1)}%`);
});

test('scoreCost reports signed bias (systematic over/under)', () => {
  const r = scoreCost();
  assert.equal(typeof r.bias, 'number');
  assert.ok(Number.isFinite(r.bias));
});
