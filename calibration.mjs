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

// VOLUME BANDS. The held-out set names a systematic volume effect the
// process-only fit could not separate from a supplier effect: a CNC-machined
// aluminium fitting at 500k/yr read +46% while low-volume machining read low.
// Tooling amortisation and line balance genuinely differ by band, so the band
// is part of the key rather than blended away (Sept 2026 review, R-32).
export const VOLUME_BANDS = [
  { id: 'low',  max: 25_000 },
  { id: 'mid',  max: 250_000 },
  { id: 'high', max: Infinity },
];
export const volumeBand = (v) => (VOLUME_BANDS.find(b => Number(v) <= b.max) ?? VOLUME_BANDS.at(-1)).id;

/** Minimum quotes in a cell before it is fitted on its own rather than inherited. */
export const MIN_CELL_N = 4;

/** The cell key a quote falls in. Region and volume are optional on a record. */
export const cellKeyOf = (r) => {
  const region = typeof r.region === 'string' && r.region ? r.region : '*';
  const band = Number(r.annualVolume) > 0 ? volumeBand(r.annualVolume) : '*';
  return `${r.process}|${region}|${band}`;
};

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
  const processLog = Object.create(null);
  for (const [proc, logs] of Object.entries(groups)) {
    const n = logs.length;
    const shrunk = (n * median(logs) + PRIOR_STRENGTH * globalShrunk) / (n + PRIOR_STRENGTH);
    processLog[proc] = shrunk;
    process[proc] = round(clampFactor(Math.exp(shrunk)));
  }

  // Finer cells: process × region × volume band. Each shrinks toward its own
  // process factor rather than the global, so a thin cell inherits the closest
  // thing already learned instead of the whole corpus. A cell under MIN_CELL_N
  // is not published at all — it would be memorising one quote.
  const cellGroups = Object.create(null);
  for (const r of valid) (cellGroups[cellKeyOf(r)] ??= []).push(Math.log(r.actual / r.modelled));
  const cells = Object.create(null);
  for (const [key, logs] of Object.entries(cellGroups)) {
    if (logs.length < MIN_CELL_N) continue;
    const proc = key.split('|')[0];
    const parent = Number.isFinite(processLog[proc]) ? processLog[proc] : globalShrunk;
    const n = logs.length;
    const shrunk = (n * median(logs) + PRIOR_STRENGTH * parent) / (n + PRIOR_STRENGTH);
    cells[key] = { factor: round(clampFactor(Math.exp(shrunk))), n };
  }

  return { global: round(clampFactor(Math.exp(globalShrunk))), process, cells, n: valid.length };
}

export function calibrationFactor(cal, process, ctx = {}) {
  if (!cal) return 1;
  // Finest cell first: process × region × volume band, then process, then the
  // cross-process global.
  if (cal.cells && ctx && (ctx.region || ctx.annualVolume)) {
    const key = cellKeyOf({ process, region: ctx.region, annualVolume: ctx.annualVolume });
    const cell = Object.hasOwn(cal.cells, key) ? cal.cells[key] : undefined;
    if (cell && Number.isFinite(cell.factor) && cell.factor > 0) return cell.factor;
  }
  const p = cal.process && Object.hasOwn(cal.process, process) ? cal.process[process] : undefined;
  if (Number.isFinite(p) && p > 0) return p;
  return Number.isFinite(cal.global) && cal.global > 0 ? cal.global : 1;
}

/** True when the applied factor sits on a clamp bound — a data-error signal the user must see. */
export const isClamped = (factor) => factor === FACTOR_MIN || factor === FACTOR_MAX;

// Where the applied factor came from: 'process' (direct quotes for this process),
// 'global' (cross-process fallback — the user has quotes, but none for THIS
// process), or 'none'. Lets the UI flag a cross-process correction honestly.
export function calibrationSource(cal, process, ctx = {}) {
  if (!cal) return 'none';
  if (cal.cells && ctx && (ctx.region || ctx.annualVolume)) {
    const key = cellKeyOf({ process, region: ctx.region, annualVolume: ctx.annualVolume });
    if (Object.hasOwn(cal.cells, key)) return 'cell';
  }
  const p = cal.process && Object.hasOwn(cal.process, process) ? cal.process[process] : undefined;
  if (Number.isFinite(p) && p > 0) return 'process';
  // "Fitted, and it came out at 1.0" is NOT "no data" (review R-32): a
  // corpus that CONFIRMS the model is a result worth reporting.
  if (Number.isFinite(cal.global) && cal.global > 0) return cal.n > 0 ? 'global' : 'none';
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
