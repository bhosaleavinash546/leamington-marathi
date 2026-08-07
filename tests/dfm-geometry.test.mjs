// DFM geometry gate, run as a test so `npm test` catches a regression without
// anyone remembering to run the benchmark separately.
//
// The heavy geometry lives in Python (OpenCascade), so this shells out to
// benchmark/dfm-run.mjs. Where cadquery-ocp is absent the benchmark SKIPS and so
// does this — but it skips loudly. A silent pass on an unrun gate is the failure
// mode worth guarding against.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function ocpAvailable() {
  try {
    execFileSync('python3', ['-c', 'import OCP'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('DFM geometry matches analytic fixture truth', { timeout: 300_000 }, (t) => {
  if (!ocpAvailable()) {
    t.skip('cadquery-ocp not installed — geometry gate not run');
    return;
  }
  const out = execFileSync('node', ['benchmark/dfm-run.mjs', '--json'], {
    encoding: 'utf-8', maxBuffer: 32 << 20,
  });
  const r = JSON.parse(out);
  const failed = r.checks.filter(c => !c.ok);
  assert.equal(
    failed.length, 0,
    `DFM geometry regressions:\n${failed.map(c => `  ${c.fixture} ${c.name}: ${c.detail}`).join('\n')}`,
  );
  // Guard the guard: an empty check list would "pass" vacuously.
  assert.ok(r.total >= 20, `expected the full fixture sweep, got ${r.total} checks`);
});
