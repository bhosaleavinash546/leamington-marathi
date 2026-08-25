// ─────────────────────────────────────────────────────────────────────────────
// PRISM MEMORY — the part-intelligence loop's deterministic core.
//
// Every Prism run leaves a compact GEOMETRY SIGNATURE; a new part is compared
// against the organisation's own prior runs so the dossier can say "your
// fleet has seen this shape before, and here is what came of it". Two rules:
//
//   1. SIMILARITY IS EXPLAINED, NOT ASSERTED. The score decomposes into named
//      components (shape / size / wall / solidity / complexity) and the basis
//      string carries them, so "87% match" is auditable, never vibes.
//   2. FLEET LINES ARE OUTCOMES, NOT BENCHMARKS. They cite the org's own
//      measured runs and tracker stages — the dossier labels them as such.
//
// Pure module (no DB, no Express) — the route composes rows into lines.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Compact signature from a measured geometry (the DFM engine's shape).
 * Returns null when the geometry lacks the minimum to compare honestly —
 * a signature must never be built from defaults.
 */
export function geoSignature(geometry) {
  if (!geometry || typeof geometry !== 'object') return null;
  const bb = geometry.boundingBox || {};
  const dims = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
  const volCm3 = num(geometry.volume?.cm3);
  if (dims.some(d => d == null || d <= 0) || volCm3 == null || volCm3 <= 0) return null;
  dims.sort((a, b) => b - a);   // orientation-independent
  return {
    v: 1,
    bboxMm: dims.map(d => Number(d.toFixed(2))),
    volCm3: Number(volCm3.toFixed(3)),
    fillRatio: num(geometry.fillRatio),
    faces: num(geometry.faces?.total),
    wallMm: num(geometry.wallThickness?.characteristicMm),
  };
}

const ratio = (a, b) => {
  if (a == null || b == null || a <= 0 || b <= 0) return null;
  return Math.min(a, b) / Math.max(a, b);
};

/**
 * Similarity of two signatures in [0,1], with a component breakdown.
 *
 * Components (each in [0,1]; a component whose inputs are absent on either
 * side is EXCLUDED and its weight redistributed — absent is not a match):
 *   shape       sorted-bbox aspect ratios (scale-free)
 *   size        cube-root volume ratio (2× the volume ≈ 0.79, not a cliff)
 *   wall        sqrt of characteristic-wall ratio
 *   solidity    1 − |fillRatio difference|
 *   complexity  quarter-power face-count ratio (very soft)
 */
export function geoSimilarity(a, b) {
  if (!a || !b) return null;
  const comps = [];
  const aAsp = [a.bboxMm[1] / a.bboxMm[0], a.bboxMm[2] / a.bboxMm[0]];
  const bAsp = [b.bboxMm[1] / b.bboxMm[0], b.bboxMm[2] / b.bboxMm[0]];
  const shapeD = (Math.abs(aAsp[0] - bAsp[0]) + Math.abs(aAsp[1] - bAsp[1])) / 2;
  comps.push(['shape', Math.max(0, 1 - shapeD), 0.30]);
  const rv = ratio(a.volCm3, b.volCm3);
  if (rv != null) comps.push(['size', Math.cbrt(rv), 0.25]);
  const rw = ratio(a.wallMm, b.wallMm);
  if (rw != null) comps.push(['wall', Math.sqrt(rw), 0.20]);
  if (a.fillRatio != null && b.fillRatio != null) {
    comps.push(['solidity', Math.max(0, 1 - Math.abs(a.fillRatio - b.fillRatio)), 0.15]);
  }
  const rf = ratio(a.faces, b.faces);
  if (rf != null) comps.push(['complexity', Math.pow(rf, 0.25), 0.10]);

  const wSum = comps.reduce((s, [, , w]) => s + w, 0);
  const score = comps.reduce((s, [, v, w]) => s + v * w, 0) / wSum;
  return {
    score: Number(score.toFixed(3)),
    basis: comps.map(([n, v]) => `${n} ${v.toFixed(2)}`).join(' · '),
    components: Object.fromEntries(comps.map(([n, v]) => [n, Number(v.toFixed(3))])),
  };
}

/** Below this the fleet stays quiet — a weak match cited as memory misleads. */
export const FLEET_MIN_SIMILARITY = 0.75;

/**
 * Rank prior runs against the current signature. Rows carry {signature, ...};
 * returns [{run, similarity}] best-first, capped, threshold-gated.
 */
export function rankSimilarRuns(currentSig, priorRuns, { limit = 3, minScore = FLEET_MIN_SIMILARITY } = {}) {
  if (!currentSig || !Array.isArray(priorRuns)) return [];
  return priorRuns
    .map(run => ({ run, similarity: geoSimilarity(currentSig, run.signature) }))
    .filter(x => x.similarity && x.similarity.score >= minScore)
    .sort((x, y) => y.similarity.score - x.similarity.score)
    .slice(0, limit);
}

// ── Teardown relevance (the private evidence base) ───────────────────────────

/**
 * Score a user-recorded teardown observation against the current part.
 * Resolution to catalogue keys happens in the ROUTE (it owns the library);
 * this scores on the resolved keys plus name-token overlap. 0 = irrelevant.
 */
export function teardownRelevance(entry, ctx) {
  let s = 0;
  if (entry.materialKey && ctx.materialKey && entry.materialKey === ctx.materialKey) s += 2;
  else if (entry.materialFamily && ctx.materialFamily && entry.materialFamily === ctx.materialFamily) s += 1;
  if (entry.processKey && ctx.processKey && entry.processKey === ctx.processKey) s += 2;
  else if (entry.processFamily && ctx.processFamily && entry.processFamily === ctx.processFamily) s += 1;
  const tokens = (t) => new Set(String(t || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2));
  const a = tokens(entry.partName), b = tokens(ctx.partName);
  if ([...a].some(w => b.has(w))) s += 1;
  return s;
}

export function rankTeardowns(entries, ctx, { limit = 5, minScore = 1 } = {}) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map(e => ({ entry: e, score: teardownRelevance(e, ctx) }))
    .filter(x => x.score >= minScore)
    .sort((x, y) => y.score - x.score || String(y.entry.createdAt || '').localeCompare(String(x.entry.createdAt || '')))
    .slice(0, limit);
}
