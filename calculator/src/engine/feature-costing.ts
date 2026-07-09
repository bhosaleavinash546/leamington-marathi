import type { DFMSeverity } from './dfm-dfa.js';

/**
 * Feature-based costing (FBC) — the aPriori-style differentiator.
 *
 * OCCT already recognises geometric features (holes + radii, threads, planar vs
 * free-form faces, undercuts, setups). This turns that into a PER-FEATURE cost
 * breakdown + DFM: "each hole ≈ £x, tapping ≈ £y, free-form surfacing dominates",
 * so a designer sees exactly which features drive cost and can design them out.
 *
 * Machining-oriented (FBC is inherently a subtractive concept). Deterministic;
 * time heuristics are representative shop values — tune per machine/material.
 */

export interface RecognizedFeatures {
  holeCount: number;
  holeRadiiMm: number[];
  threadCount: number;
  planarFaceCount: number;
  freeFormFaceCount: number;
  undercutFaceCount: number;
  setupCount: number;
}

export interface FeatureCostLine {
  feature: string;
  count: number;
  minutesEach: number;
  totalMinutes: number;
  costGBP: number;
  pctOfCost: number;
}

export interface FeatureDFMIssue { severity: DFMSeverity; title: string; recommendation: string; }

export interface FeatureCostResult {
  lines: FeatureCostLine[];
  totalCycleMin: number;
  machiningCostGBP: number;
  dfm: FeatureDFMIssue[];
  costliestFeature: string;
}

export interface FeatureCostOptions {
  machineRateGBPPerHr?: number;   // loaded CNC cell rate
  setupMinutesEach?: number;
  materialFactor?: number;        // 1.0 aluminium; >1 for harder alloys (Ti ~2.5, steel ~1.5)
}

// Representative cut-time per feature (minutes) at a nominal aluminium baseline.
const T = { drillBase: 0.30, drillSmallPenalty: 0.35, tap: 0.60, planarFace: 0.85, freeForm: 2.6 };

/** Standard metric drill sizes (mm dia) — non-standard holes need special tooling. */
const STD_DRILL_DIA = [1, 1.5, 2, 2.5, 3, 3.3, 4, 4.2, 5, 5.5, 6, 6.8, 8, 8.5, 10, 10.5, 12, 14, 16, 18, 20];

export function computeFeatureCosting(f: RecognizedFeatures, opts: FeatureCostOptions = {}): FeatureCostResult {
  const rate = opts.machineRateGBPPerHr ?? 75;
  const setupMin = opts.setupMinutesEach ?? 30;
  const mf = Math.max(0.5, opts.materialFactor ?? 1.0);

  // Drilling: small holes (< 2 mm dia) carry a slow/fragile penalty.
  const smallHoles = f.holeRadiiMm.filter(r => r * 2 < 2).length;
  const drillEach = (T.drillBase + (f.holeCount > 0 ? (smallHoles / Math.max(1, f.holeCount)) * T.drillSmallPenalty : 0)) * mf;
  const raw: Array<Omit<FeatureCostLine, 'costGBP' | 'pctOfCost'>> = [
    { feature: 'Drilled holes',        count: f.holeCount,        minutesEach: drillEach,       totalMinutes: f.holeCount * drillEach },
    { feature: 'Tapped threads',       count: f.threadCount,      minutesEach: T.tap * mf,      totalMinutes: f.threadCount * T.tap * mf },
    { feature: 'Milled faces/pockets', count: f.planarFaceCount,  minutesEach: T.planarFace * mf, totalMinutes: f.planarFaceCount * T.planarFace * mf },
    { feature: 'Free-form surfacing',  count: f.freeFormFaceCount, minutesEach: T.freeForm * mf, totalMinutes: f.freeFormFaceCount * T.freeForm * mf },
    { feature: 'Setups',               count: f.setupCount,       minutesEach: setupMin,        totalMinutes: f.setupCount * setupMin },
  ].filter(l => l.count > 0);

  const totalCycleMin = raw.reduce((s, l) => s + l.totalMinutes, 0);
  const machiningCostGBP = round2((totalCycleMin / 60) * rate);
  const lines: FeatureCostLine[] = raw.map(l => {
    const costGBP = round2((l.totalMinutes / 60) * rate);
    return { ...l, minutesEach: round2(l.minutesEach), totalMinutes: round1(l.totalMinutes), costGBP, pctOfCost: machiningCostGBP > 0 ? Math.round((costGBP / machiningCostGBP) * 100) : 0 };
  }).sort((a, b) => b.costGBP - a.costGBP);

  // ── Per-feature DFM ──
  const dfm: FeatureDFMIssue[] = [];
  if (f.undercutFaceCount > 0) dfm.push({ severity: 'major', title: `${f.undercutFaceCount} undercut face(s) — need 5-axis / EDM or a redesign`, recommendation: 'Reorient or split the feature so it is reachable in ≤3 axes; undercuts multiply setup and cycle cost.' });
  if (smallHoles > 0) dfm.push({ severity: 'minor', title: `${smallHoles} hole(s) below Ø2 mm — slow, fragile tooling`, recommendation: 'Enlarge to ≥ Ø2 mm where function allows; small drills break and run slow.' });
  const nonStd = f.holeRadiiMm.filter(r => !STD_DRILL_DIA.some(d => Math.abs(d - r * 2) < 0.2)).length;
  if (nonStd > 0) dfm.push({ severity: 'minor', title: `${nonStd} non-standard hole diameter(s) — special/reamed tooling`, recommendation: 'Snap hole diameters to standard drill sizes to use stock tooling and cut cost.' });
  if (f.freeFormFaceCount >= 6) dfm.push({ severity: 'major', title: `${f.freeFormFaceCount} free-form faces — 5-axis surfacing dominates cost`, recommendation: 'Flatten non-functional free-form surfaces; each adds slow finishing passes.' });
  if (f.setupCount >= 4) dfm.push({ severity: 'minor', title: `${f.setupCount} setups — consider fixturing/consolidation`, recommendation: 'Combine features onto fewer faces to reduce re-fixturing and datum error.' });

  return {
    lines, totalCycleMin: round1(totalCycleMin), machiningCostGBP, dfm,
    costliestFeature: lines[0]?.feature ?? '—',
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
