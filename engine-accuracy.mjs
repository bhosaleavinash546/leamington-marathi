// ─────────────────────────────────────────────────────────────────────────────
// THE ENGINE'S ACCURACY, READ FROM THE MEASUREMENT RATHER THAN RETYPED.
//
// Three user-facing strings quoted the engine's accuracy as a hardcoded number,
// and by September 2026 all three had drifted from the benchmarks that produced
// them. The worst was the entitlement waterfall, which told every user the
// engine reads "~21% MAPE" while the recorded held-out figure was 15.2% — the
// caution outlived the measurement that justified it by two whole engine
// improvements.
//
// The repo already knew the answer to this: tests/accuracy-claim.test.mjs pins
// the homepage's accuracy claim to benchmark/{machining,stamping}-results.json
// so marketing copy cannot outlive its evidence. That discipline simply had not
// been applied inside the product. This module applies it — every accuracy
// sentence the user reads is composed from the recorded JSON, so improving the
// engine updates the caution and there is no second place to remember.
//
// Absent is stated, not defaulted: with no results file the figures are null
// and the sentence says the accuracy is unmeasured rather than quoting a number
// nobody can produce.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

function read(name) {
  try {
    const j = JSON.parse(readFileSync(join(ROOT, 'benchmark', name), 'utf8'));
    return j && typeof j === 'object' ? j : null;
  } catch { return null; }
}

const holdout = read('cost-results-holdout.json');
const machining = read('machining-results.json');
const stamping = read('stamping-results.json');

const pct = (n) => (Number.isFinite(Number(n)) ? Number(Number(n).toFixed(1)) : null);

/** Held-out accuracy of the parametric engine — the figure that bounds every waterfall step. */
export const ENGINE_ACCURACY = Object.freeze({
  heldOutMapePct: pct(holdout?.mape),
  heldOutBiasPct: pct(holdout?.bias),
  heldOutHitPct: pct(holdout?.hitRate),
  heldOutParts: Number(holdout?.total) || null,
  featureMachiningMapePct: pct(machining?.featureMape != null ? machining.featureMape * 100 : null),
  featureStampingMapePct: pct(stamping?.featureMape != null ? stamping.featureMape * 100 : null),
  measured: !!holdout,
});

/**
 * The half-sentence every estimate-bearing surface appends, composed from the
 * recorded numbers. Reads "held-out accuracy 15.2% MAPE on 14 reference parts,
 * reading 13.2% low" — or says plainly that it is unmeasured.
 */
export function accuracyClause() {
  const a = ENGINE_ACCURACY;
  if (!a.measured || a.heldOutMapePct == null) {
    return 'the engine’s held-out accuracy has not been measured in this build, so no error bound can be quoted';
  }
  const dir = a.heldOutBiasPct == null ? ''
    : a.heldOutBiasPct < 0 ? `, reading ${Math.abs(a.heldOutBiasPct)}% low` : `, reading ${a.heldOutBiasPct}% high`;
  const n = a.heldOutParts ? ` on ${a.heldOutParts} held-out reference parts` : '';
  return `the engine’s held-out accuracy (${a.heldOutMapePct}% MAPE${n}${dir}) bounds every figure`;
}

/** The feature engines' own band, for the waterfall step they price. */
export function featureAccuracyClause() {
  const a = ENGINE_ACCURACY;
  const parts = [
    a.featureMachiningMapePct != null ? `machining ${a.featureMachiningMapePct}%` : null,
    a.featureStampingMapePct != null ? `stamping ${a.featureStampingMapePct}%` : null,
  ].filter(Boolean);
  return parts.length
    ? `feature-based engines measure ${parts.join(' and ')} MAPE on six fixtures each — materially wider than the parametric engine, and too few fixtures to model against`
    : 'the feature engines’ accuracy has not been measured in this build';
}
