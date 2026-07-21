/**
 * CAD feature-detection accuracy scorer.
 *
 * The CAD→Cost pipeline's defensibility depends on the geometry engine
 * detecting the RIGHT features (holes, bosses, pockets) from a B-rep model —
 * the over/under-counting bug class that was previously only caught by hand on
 * a stub axle. This turns that into a measured number: given a prediction (the
 * geometry engine's output) and a hand-verified truth, it scores per-kind and
 * overall feature precision / recall / F1, plus optional classification and
 * volume accuracy.
 *
 * Counts are scored as multisets: over-counting lowers precision, missing a
 * feature lowers recall. Mirrors server/utils/pcb-vision-accuracy.ts.
 */

export type FeatureKind = 'hole' | 'boss' | 'pocket';
export const FEATURE_KINDS: FeatureKind[] = ['hole', 'boss', 'pocket'];

export type FeatureCounts = Record<FeatureKind, number>;

export interface CADTruth {
  part?: string;
  /** Ground-truth feature counts by kind. */
  features: Partial<FeatureCounts>;
  /** Optional classification truth (e.g. 'aluminum', 'steel', 'plastic'). */
  materialFamily?: string;
  /** Optional geometry truth. */
  volumeCm3?: number;
  volumeTolPct?: number; // default 5
}

/** A prediction is the geometry engine's raw output (or the slice we score). */
export interface CADPrediction {
  featureTable?: Array<{ kind?: string; count?: number }>;
  features?: { estimatedHoleCount?: number; bossShaftCount?: number };
  volume?: { cm3?: number };
  /** Optional AI classification the pipeline attached. */
  materialFamily?: string;
}

export interface CADFeatureScore {
  part: string;
  byKind: Record<FeatureKind, { predicted: number; truth: number; matched: number }>;
  featurePrecision: number;
  featureRecall: number;
  featureF1: number;
  /** 1 = correct, 0 = wrong, null = not gradable (missing truth or prediction). */
  materialMatch: number | null;
  /** |pred − truth| / truth × 100, or null if not gradable. */
  volumeErrorPct: number | null;
}

/** Canonicalize a material-family label so spelling/synonym variants compare
 *  equal — the pipeline and the geometry engine disagree on aluminium/aluminum,
 *  so an exact-string eval would spuriously fail. */
function normMat(s: unknown): string {
  const base = String(s ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
  const synonyms: Record<string, string> = {
    aluminium: 'aluminum', al: 'aluminum', alu: 'aluminum',
    mildsteel: 'steel', carbonsteel: 'steel', stainlesssteel: 'stainless',
    ci: 'castiron', greycastiron: 'castiron', graycastiron: 'castiron',
    ti: 'titanium', cu: 'copper',
  };
  return synonyms[base] ?? base;
}

/** Extract normalized feature counts from a geometry-engine prediction. */
export function featureCountsFromPrediction(p: CADPrediction): FeatureCounts {
  const counts: FeatureCounts = { hole: 0, boss: 0, pocket: 0 };
  const table = Array.isArray(p.featureTable) ? p.featureTable : [];
  if (table.length) {
    for (const row of table) {
      const kind = String(row?.kind ?? '') as FeatureKind;
      if (kind === 'hole' || kind === 'boss' || kind === 'pocket') {
        counts[kind] += Math.max(0, Number(row?.count) || 0);
      }
    }
  }
  // Fall back to the summary counts when the table is absent/empty.
  if (counts.hole === 0 && typeof p.features?.estimatedHoleCount === 'number') counts.hole = p.features.estimatedHoleCount;
  if (counts.boss === 0 && typeof p.features?.bossShaftCount === 'number') counts.boss = p.features.bossShaftCount;
  return counts;
}

function f1(precision: number, recall: number): number {
  return precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
}

export function scoreCADFeatures(pred: CADPrediction, truth: CADTruth, part = truth.part ?? ''): CADFeatureScore {
  const predicted = featureCountsFromPrediction(pred);
  const byKind = {} as CADFeatureScore['byKind'];
  let totalPred = 0, totalTruth = 0, totalMatched = 0;
  for (const kind of FEATURE_KINDS) {
    const p = Math.max(0, predicted[kind] || 0);
    const t = Math.max(0, Number(truth.features[kind]) || 0);
    const matched = Math.min(p, t);
    byKind[kind] = { predicted: p, truth: t, matched };
    totalPred += p; totalTruth += t; totalMatched += matched;
  }
  const precision = totalPred > 0 ? totalMatched / totalPred : (totalTruth === 0 ? 1 : 0);
  const recall = totalTruth > 0 ? totalMatched / totalTruth : (totalPred === 0 ? 1 : 0);

  let materialMatch: number | null = null;
  if (truth.materialFamily && pred.materialFamily) {
    materialMatch = normMat(truth.materialFamily) === normMat(pred.materialFamily) ? 1 : 0;
  }

  let volumeErrorPct: number | null = null;
  if (typeof truth.volumeCm3 === 'number' && truth.volumeCm3 > 0 && typeof pred.volume?.cm3 === 'number') {
    volumeErrorPct = Math.abs(pred.volume.cm3 - truth.volumeCm3) / truth.volumeCm3 * 100;
  }

  return { part, byKind, featurePrecision: precision, featureRecall: recall, featureF1: f1(precision, recall), materialMatch, volumeErrorPct };
}

/** Aggregate per-part scores into one summary (micro-averaged over all features). */
export function aggregateCADScores(scores: CADFeatureScore[]): CADFeatureScore {
  const byKind = { hole: { predicted: 0, truth: 0, matched: 0 }, boss: { predicted: 0, truth: 0, matched: 0 }, pocket: { predicted: 0, truth: 0, matched: 0 } };
  let matGood = 0, matN = 0, volSum = 0, volN = 0;
  for (const s of scores) {
    for (const kind of FEATURE_KINDS) {
      byKind[kind].predicted += s.byKind[kind].predicted;
      byKind[kind].truth += s.byKind[kind].truth;
      byKind[kind].matched += s.byKind[kind].matched;
    }
    if (s.materialMatch !== null) { matN++; matGood += s.materialMatch; }
    if (s.volumeErrorPct !== null) { volN++; volSum += s.volumeErrorPct; }
  }
  const totalPred = FEATURE_KINDS.reduce((a, k) => a + byKind[k].predicted, 0);
  const totalTruth = FEATURE_KINDS.reduce((a, k) => a + byKind[k].truth, 0);
  const totalMatched = FEATURE_KINDS.reduce((a, k) => a + byKind[k].matched, 0);
  const precision = totalPred > 0 ? totalMatched / totalPred : (totalTruth === 0 ? 1 : 0);
  const recall = totalTruth > 0 ? totalMatched / totalTruth : (totalPred === 0 ? 1 : 0);
  return {
    part: `AGGREGATE(${scores.length})`,
    byKind,
    featurePrecision: precision,
    featureRecall: recall,
    featureF1: f1(precision, recall),
    materialMatch: matN > 0 ? matGood / matN : null,
    volumeErrorPct: volN > 0 ? volSum / volN : null,
  };
}
