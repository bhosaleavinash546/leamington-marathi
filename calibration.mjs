/**
 * CostVision — Learned calibration from proprietary quotes
 * ------------------------------------------------------------------
 * Fits per-process correction multipliers from a user's REAL supplier quotes so
 * the deterministic engine progressively matches their actual price history —
 * accuracy a competitor without those quotes cannot reproduce (a data moat).
 *
 * Deterministic and transparent (robust ratio fit in log space with shrinkage),
 * NOT a black box: every correction is an auditable multiplier.
 *
 *   fitCalibration(records)              -> { global, process:{...}, n }
 *   calibrationFactor(cal, process)      -> multiplier to apply to a should-cost
 *   crossValidateCalibration(records)    -> { n, mapeBefore, mapeAfter }  (LOO proof)
 *
 * records: [{ modelled:number, actual:number, process:string }] in one currency.
 */

// Shrinkage prior: a process with few quotes is pulled toward the global
// correction (and the global toward 1.0), so sparse data can't wildly swing it.
const PRIOR_STRENGTH = 3;

// Hard bound on any learned correction. Shrinkage limits how far a FEW quotes
// move the factor, but not its magnitude — a single quote entered in the wrong
// units/currency (e.g. cents, or ₹ under a EUR label) can otherwise fit a factor
// of 10^n and, via the global fallback, corrupt EVERY other estimate. A real
// systematic model error is well within ±4×; anything beyond is a data error.
const FACTOR_MIN = 0.25;
const FACTOR_MAX = 4;
const clampFactor = (f) => Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, f));

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const clean = (records) => (Array.isArray(records) ? records : []).filter(
  r => r && Number(r.modelled) > 0 && Number(r.actual) > 0 && typeof r.process === 'string',
);

/**
 * Fit correction multipliers. Uses the median log-ratio (robust to outliers) per
 * process, shrunk toward the global median, itself shrunk toward 1.0.
 */
export function fitCalibration(records) {
  const valid = clean(records);
  if (!valid.length) return { global: 1, process: {}, n: 0 };

  const globalLogs = valid.map(r => Math.log(r.actual / r.modelled));
  const gMed = median(globalLogs);
  // Shrink the global itself toward 0 (=1.0×) by the same prior, so a handful of
  // quotes don't over-correct the whole engine.
  const globalShrunk = (valid.length * gMed) / (valid.length + PRIOR_STRENGTH);

  // null-proto so a process literally named "constructor"/"toString" can't defeat
  // the ??= (inherited members are truthy) and crash the fit.
  const groups = Object.create(null);
  for (const r of valid) (groups[r.process] ??= []).push(Math.log(r.actual / r.modelled));
  const process = Object.create(null);
  for (const [proc, logs] of Object.entries(groups)) {
    const n = logs.length;
    const shrunk = (n * median(logs) + PRIOR_STRENGTH * globalShrunk) / (n + PRIOR_STRENGTH);
    process[proc] = round(clampFactor(Math.exp(shrunk)));
  }
  return { global: round(clampFactor(Math.exp(globalShrunk))), process, n: valid.length };
}

export function calibrationFactor(cal, process) {
  if (!cal) return 1;
  const p = cal.process && Object.hasOwn(cal.process, process) ? cal.process[process] : undefined;
  if (Number.isFinite(p) && p > 0) return p;
  return Number.isFinite(cal.global) && cal.global > 0 ? cal.global : 1;
}

// Where the applied factor came from: 'process' (direct quotes for this process),
// 'global' (cross-process fallback — the user has quotes, but none for THIS
// process), or 'none'. Lets the UI flag a cross-process correction honestly.
export function calibrationSource(cal, process) {
  if (!cal) return 'none';
  const p = cal.process && Object.hasOwn(cal.process, process) ? cal.process[process] : undefined;
  if (Number.isFinite(p) && p > 0) return 'process';
  if (Number.isFinite(cal.global) && cal.global > 0 && cal.global !== 1) return 'global';
  return 'none';
}

/**
 * Leave-one-out cross-validation — the honesty check. Fits on every quote but
 * the held-out one, then measures error on the held-out one. If mapeAfter <
 * mapeBefore the calibration GENERALISES (learns), rather than memorising.
 */
export function crossValidateCalibration(records) {
  const valid = clean(records);
  if (valid.length < 3) return { n: valid.length, mapeBefore: null, mapeAfter: null };
  let before = 0, after = 0;
  for (let i = 0; i < valid.length; i++) {
    const cal = fitCalibration(valid.filter((_, j) => j !== i));
    const t = valid[i];
    const f = calibrationFactor(cal, t.process);
    before += Math.abs(t.modelled - t.actual) / t.actual;
    after  += Math.abs(t.modelled * f - t.actual) / t.actual;
  }
  return { n: valid.length, mapeBefore: before / valid.length, mapeAfter: after / valid.length };
}

function round(n) { return Math.round((n + Number.EPSILON) * 1e4) / 1e4; }
