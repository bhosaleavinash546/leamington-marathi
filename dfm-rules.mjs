// ─────────────────────────────────────────────────────────────────────────────
// DFM rule evaluator — pure, deterministic, no LLM, no network.
//
// Takes the measured geometry produced by cad-engine (draft, wall-thickness
// percentiles, feature recognition, setups) and the catalogue in
// dfm-rule-catalogue.mjs, and returns findings.
//
// The design decision that matters here is that a rule has THREE outcomes, not
// two: pass, fail, and NOT EVALUATED. A rule whose measurement is missing from
// this part is reported as unevaluated with the reason. Treating it as a pass
// would let a report claim a clean bill of health it never checked — which is
// exactly the failure mode the whole feature exists to avoid. `coveragePct`
// makes the size of that gap impossible to miss.
// ─────────────────────────────────────────────────────────────────────────────
import { DFM_RULES, PROCESS_FAMILIES, SEVERITIES } from './dfm-rule-catalogue.mjs';

/**
 * Pull the values rules are written against out of a measured-geometry blob.
 * Every entry returns `undefined` when the underlying measurement is absent —
 * that `undefined` is what becomes "not evaluated" downstream, so no measure may
 * ever substitute a default. A guessed default here would be indistinguishable
 * from a real measurement in the report.
 */
export function extractMeasures(geo = {}) {
  const dfm = geo.dfm || {};
  const wall = dfm.wallThickness || geo.wallThickness || {};
  const draft = dfm.draft || geo.draftAnalysis || {};
  const features = dfm.features || {};
  const setups = dfm.setups || geo.setupAnalysis || {};
  // Sheet-metal measures now come from real bend recognition (paired coaxial
  // cylinders). `isSheetMetal: false` means the part is not folded sheet, so the
  // measures stay undefined and the rules abstain — which is the correct answer
  // for a casting, not a pass.
  const sm = dfm.sheetMetal && dfm.sheetMetal.isSheetMetal ? dfm.sheetMetal : {};
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : undefined);

  // Rib proportions are RATIOS against the nominal wall, and the wall is the
  // measured p50 — so the ratio is computed here, at the one place both numbers
  // exist, rather than in the recogniser which has never seen a wall thickness.
  // When either half is missing the ratio stays undefined and the rib rules
  // abstain, which is the correct answer for a part whose wall could not be
  // measured. A rib thickness divided by a guessed wall would look exactly like
  // a measurement in the report.
  const ribs = Array.isArray(features.ribs) ? features.ribs : [];
  const nominalWall = num(wall.p50Mm);
  const ribRatio = (pick, key) => {
    if (!ribs.length || !(nominalWall > 0)) return undefined;
    const vals = ribs.map(r => Number(r[key])).filter(v => Number.isFinite(v) && v > 0);
    if (!vals.length) return undefined;
    return Math.round((pick(...vals) / nominalWall) * 1000) / 1000;
  };

  // Only measures a RULE is written against belong here. `pocketCount` and
  // `slotCount` used to be computed for the reader's benefit and were read by
  // nothing — the UI and both reports take their counts from the recogniser
  // directly. A measure that no rule consumes is a value nobody validates.
  return {
    wallP5Mm: num(wall.p5Mm),
    wallP50Mm: num(wall.p50Mm),
    wallP95Mm: num(wall.p95Mm),
    wallSpreadRatio: num(wall.spreadRatio),
    wallAreaBelowMinDraftPct: num(draft.wallAreaBelowMinDraftPct),
    minWallDraftDeg: num(draft.minWallDraftDeg),
    undercutFaceCount: num(draft.undercutFaceCount),
    setupCount: num(setups.estimatedSetupCount),

    // ── Ribs, as proportions of the nominal wall ──
    maxRibThicknessToWall: ribRatio(Math.max, 'thicknessMm'),
    minRibThicknessToWall: ribRatio(Math.min, 'thicknessMm'),
    maxRibHeightToWall: ribRatio(Math.max, 'heightMm'),

    // ── Sheet metal, measured from recognised bends ──
    sheetThicknessMm: num(sm.thicknessMm),
    bendCount: num(sm.bendCount),
    minBendRadiusToThickness: num(sm.minBendRadiusToThickness),
    minHoleDiaToThickness: num(sm.minHoleDiaToThickness),
    minFlangeToThickness: num(sm.minFlangeToThickness),
    // Reported as CLEARANCE against the 2t+r guideline so the rule is
    // arithmetic. A raw distance would need a per-part formula the evaluator
    // cannot express, and the rule would abstain forever.
    holeToBendClearanceMm: num(sm.holeToBendClearanceMm),

    // Still deliberately absent, and it matters that they are absent rather
    // than defaulted — pocket depth/width needs bounded boxes the recogniser
    // does not yet produce, and internal corner radius needs tool-access
    // reasoning. Substituting any default would manufacture a pass on a part
    // nobody measured:
    //   maxPocketDepthToWidth, minInternalCornerRadiusMm
  };
}

function evaluate(rule, value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return { status: 'not-evaluated' };
  }
  const t = rule.threshold;
  if (typeof t === 'string') return { status: 'not-evaluated', reason: 'threshold is a formula' };
  switch (rule.compare) {
    case 'lte': return { status: value <= t ? 'pass' : 'fail' };
    case 'gte': return { status: value >= t ? 'pass' : 'fail' };
    case 'lt': return { status: value < t ? 'pass' : 'fail' };
    case 'gt': return { status: value > t ? 'pass' : 'fail' };
    case 'between':
      return { status: value >= t[0] && value <= t[1] ? 'pass' : 'fail' };
    default: return { status: 'not-evaluated', reason: `unknown comparator ${rule.compare}` };
  }
}

function thresholdText(rule) {
  const t = rule.threshold;
  if (Array.isArray(t)) return `${t[0]}–${t[1]} ${rule.unit}`;
  if (typeof t === 'string') return t.replace('formula:', '');
  const op = { lte: '≤', gte: '≥', lt: '<', gt: '>' }[rule.compare] || '';
  return `${op} ${t} ${rule.unit}`;
}

/**
 * Run the catalogue for one process family against measured geometry.
 *
 * @param {object} geo   measured geometry (the engine's analyze() output)
 * @param {string} process  key of PROCESS_FAMILIES
 * @returns {{process, processName, findings, passed, notEvaluated, coveragePct, score}}
 */
export function runDfmRules(geo, process) {
  if (!PROCESS_FAMILIES[process]) {
    throw new Error(`Unknown process family: ${process}`);
  }
  const measures = extractMeasures(geo);
  const rules = DFM_RULES.filter(r => r.process === process);

  const findings = [];
  const passed = [];
  const notEvaluated = [];

  for (const rule of rules) {
    const value = measures[rule.measure];
    const { status, reason } = evaluate(rule, value);
    const row = {
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      measure: rule.measure,
      measured: value,
      unit: rule.unit,
      threshold: rule.threshold,
      thresholdText: thresholdText(rule),
      rationale: rule.rationale,
      fix: rule.fix,
      source: rule.source,
      status,
    };
    if (status === 'fail') findings.push(row);
    else if (status === 'pass') passed.push(row);
    else {
      notEvaluated.push({
        ...row,
        reason: reason || `no measurement available for "${rule.measure}" on this geometry`,
      });
    }
  }

  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));

  const evaluated = findings.length + passed.length;
  const coveragePct = rules.length ? Math.round((evaluated / rules.length) * 1000) / 10 : 0;

  return {
    process,
    processName: PROCESS_FAMILIES[process],
    findings,
    passed,
    notEvaluated,
    ruleCount: rules.length,
    evaluatedCount: evaluated,
    coveragePct,
    // A score over rules nobody could evaluate would be meaningless, so it is
    // computed over the EVALUATED rules only and carries its own coverage.
    score: scoreOf(findings, evaluated),
  };
}

/**
 * Deterministic manufacturability score, 0-100, over evaluated rules only.
 *
 * This supersedes the LLM's 1-10 `dfmaScore` guess on the CAD → Cost page. It is
 * arithmetic: each failed rule costs weight by severity. `null` when nothing
 * could be evaluated — a score of 100 on zero checks would be a lie.
 */
export function scoreOf(findings, evaluatedCount) {
  if (!evaluatedCount) return null;
  const WEIGHT = { high: 25, medium: 12, low: 5 };
  const penalty = findings.reduce((s, f) => s + (WEIGHT[f.severity] || 5), 0);
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

/** Run every process family — used when the process is not yet decided. */
export function runAllDfmRules(geo) {
  return Object.keys(PROCESS_FAMILIES).map(p => runDfmRules(geo, p));
}
