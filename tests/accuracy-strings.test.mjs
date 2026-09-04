// A CAUTION MUST NOT OUTLIVE THE MEASUREMENT THAT JUSTIFIED IT.
//
// Three user-facing accuracy claims were hardcoded strings, and by Sept 2026
// (review P-6) all three had drifted. The worst was the entitlement waterfall,
// which told every Prism user the engine reads "~21% MAPE" while the recorded
// held-out figure was 15.2% — the caution had survived two engine improvements
// that made it wrong in the flattering direction is not the point; it was
// simply no longer true, and nothing could notice.
//
// tests/accuracy-claim.test.mjs already pinned the HOMEPAGE claim to the
// recorded benchmarks. The same discipline now covers the strings inside the
// product. A number in a user-facing sentence must be derivable from a results
// file, or the sentence must say it is unmeasured.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_ACCURACY, accuracyClause, featureAccuracyClause } from '../engine-accuracy.mjs';
import { entitlementWaterfall } from '../part360.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = (n) => JSON.parse(readFileSync(join(ROOT, 'benchmark', n), 'utf8'));

describe('the accuracy figures come from the recorded benchmarks', () => {
  it('reads the held-out results file, not a literal', () => {
    const h = results('cost-results-holdout.json');
    assert.equal(ENGINE_ACCURACY.heldOutMapePct, Number(h.mape.toFixed(1)));
    assert.equal(ENGINE_ACCURACY.heldOutBiasPct, Number(h.bias.toFixed(1)));
    assert.equal(ENGINE_ACCURACY.heldOutParts, h.total);
  });

  it('reads both feature-engine results files', () => {
    assert.equal(ENGINE_ACCURACY.featureMachiningMapePct, Number((results('machining-results.json').featureMape * 100).toFixed(1)));
    assert.equal(ENGINE_ACCURACY.featureStampingMapePct, Number((results('stamping-results.json').featureMape * 100).toFixed(1)));
  });

  it('states the direction of the bias, because "±15%" and "15% low" are different claims', () => {
    const c = accuracyClause();
    assert.match(c, new RegExp(`${ENGINE_ACCURACY.heldOutMapePct}% MAPE`));
    assert.match(c, /reading .* (low|high)/);
  });
});

describe('the Prism waterfall quotes the measured figure', () => {
  const w = entitlementWaterfall({
    material: 'Steel (mild)', process: 'Stamping / Deep Drawing',
    weightKg: 1.2, annualVolume: 200_000, region: 'Germany',
  });

  it('the caution carries the current held-out MAPE', () => {
    assert.ok(w && typeof w.caution === 'string', 'the waterfall must carry a caution');
    assert.match(w.caution, new RegExp(`${ENGINE_ACCURACY.heldOutMapePct}% MAPE`),
      `the waterfall caution does not quote the recorded ${ENGINE_ACCURACY.heldOutMapePct}% — it has drifted again`);
  });

  it('the caution quotes NO accuracy figure the results files do not contain', () => {
    // The specific regression: "~21% MAPE" outlived the 20.9% measurement that
    // produced it. Any percentage in the caution must be one of the measured
    // ones, so a stale literal cannot hide inside a plausible sentence.
    const known = new Set([
      ENGINE_ACCURACY.heldOutMapePct, Math.abs(ENGINE_ACCURACY.heldOutBiasPct),
      ENGINE_ACCURACY.heldOutHitPct, ENGINE_ACCURACY.featureMachiningMapePct,
      ENGINE_ACCURACY.featureStampingMapePct,
    ].map(Number));
    const quoted = [...w.caution.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map(m => Number(m[1]));
    const strays = quoted.filter(n => !known.has(n));
    assert.deepEqual(strays, [], `the caution quotes ${strays.join(', ')}% which no results file records`);
  });

  it('still says what it is, not just how accurate it is', () => {
    assert.match(w.caution, /DIRECTION INDICATOR/);
  });
});

describe('the feature-engine band says which engines and how thin the basis is', () => {
  it('names both engines and their measured figures', () => {
    const c = featureAccuracyClause();
    assert.match(c, new RegExp(`machining ${ENGINE_ACCURACY.featureMachiningMapePct}%`));
    assert.match(c, new RegExp(`stamping ${ENGINE_ACCURACY.featureStampingMapePct}%`));
    assert.match(c, /six fixtures/, 'the thinness of the basis is part of the claim');
  });

  it('the server composes its dispersion basis from that clause, not from literals', () => {
    const src = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
    assert.match(src, /featureAccuracyClause\(\)/, 'FEATURE_DISPERSION.basis must be composed, not retyped');
  });
});

describe('an unmeasured engine says so rather than quoting a number', () => {
  it('the clause degrades honestly when there are no results', async () => {
    // Absent is stated, not defaulted — the same rule the DFM engine follows.
    // Proven by reading the source contract rather than by deleting the files.
    const src = readFileSync(join(ROOT, 'engine-accuracy.mjs'), 'utf8');
    assert.match(src, /has not been measured in this build/);
    assert.match(src, /measured: !!holdout/);
  });
});
