import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOverall } from '../benchmark/run.mjs';

// Regression guard: the measured CAD-pipeline accuracy must not drop below 90%.
// (Run `npm run benchmark` for the full scored report.)
test('CAD pipeline benchmark stays ≥ 90%', async () => {
  const { overall, pass, total } = await computeOverall();
  assert.ok(total >= 20, `expected a meaningful number of checks, got ${total}`);
  assert.ok(overall >= 0.9, `benchmark accuracy regressed: ${(overall * 100).toFixed(1)}% (${pass}/${total})`);
});
