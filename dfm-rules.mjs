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
import { DFM_RULES, PROCESS_FAMILIES, SEVERITIES, resolveThreshold } from './dfm-rule-catalogue.mjs';
import { MATERIALS } from './costing-engine.mjs';

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
  // The analytic cylinder pass, which reports diameter and depth exactly from
  // the kernel. Worst case across the part, so one bad hole is not averaged away
  // by twenty good ones.
  const table = Array.isArray(geo.featureTable) ? geo.featureTable : [];
  // WHICH feature, not just the worst number. A finding that says "max hole
  // depth/diameter is 8.2" sends a supplier hunting through the model; a finding
  // that says "Ø6 x 49, four of them, first at (12, -30, 4)" is a review
  // document. The rows already carry diameter, depth, count and per-instance
  // positions, so the offenders are collected here alongside the ratio rather
  // than being thrown away and re-derived nowhere.
  const instancesOf = (kind, overKey, byKey) => table
    .filter(f => f.kind === kind)
    .map(f => ({
      ratio: Math.round((Number(f[overKey]) / Number(f[byKey])) * 100) / 100,
      diaMm: f.diaMm, depthMm: f.depthMm, through: f.through, count: f.count,
      atXYZ: f.axisPointXYZ ?? null,
      instancesXYZ: Array.isArray(f.instancesXYZ) ? f.instancesXYZ.slice(0, 8) : null,
    }))
    .filter(r => Number.isFinite(r.ratio) && r.ratio > 0)
    .sort((a, b) => b.ratio - a.ratio);

  const ratioOverTable = (kind, overKey, byKey) => {
    const vals = instancesOf(kind, overKey, byKey).map(r => r.ratio);
    return vals.length ? Math.max(...vals) : undefined;
  };

  const ribs = Array.isArray(features.ribs) ? features.ribs : [];
  const nominalWall = num(wall.p50Mm);
  const ribInstances = (key, ascending = false) => {
    if (!ribs.length || !(nominalWall > 0)) return [];
    return ribs
      .map(r => ({
        ratio: Math.round((Number(r[key]) / nominalWall) * 1000) / 1000,
        thicknessMm: r.thicknessMm, heightMm: r.heightMm, lengthMm: r.lengthMm,
        atXYZ: r.centroidXYZ ?? null,
      }))
      .filter(r => Number.isFinite(r.ratio) && r.ratio > 0)
      .sort((a, b) => (ascending ? a.ratio - b.ratio : b.ratio - a.ratio));
  };

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

    // ── Slenderness, from the analytic cylinder pass ──
    // A hole is a drill on a machined part and a CORE PIN on a cast one, so the
    // same measured depth/diameter answers two different questions and each
    // family sets its own limit against it.
    maxHoleDepthToDia: ratioOverTable('hole', 'depthMm', 'diaMm'),
    maxBossHeightToDia: ratioOverTable('boss', 'depthMm', 'diaMm'),

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

    // The offenders behind the ratio measures, in worst-first order. Consumed by
    // runDfmRules to attach `instances` to a finding; stripped from the measure
    // map itself so a rule can never accidentally be written against a list.
    // Absent, not empty, when there is nothing to list — the same discipline
    // every measure above follows. An empty object here would still read as
    // "measured, and the answer was nothing".
    _instances: nonEmpty({
      maxHoleDepthToDia: instancesOf('hole', 'depthMm', 'diaMm'),
      maxBossHeightToDia: instancesOf('boss', 'depthMm', 'diaMm'),
      maxRibThicknessToWall: ribInstances('thicknessMm'),
      minRibThicknessToWall: ribInstances('thicknessMm', true),
      maxRibHeightToWall: ribInstances('heightMm'),
    }),

    // THE DRAFT CURVE, not one point on it. `wallAreaBelowMinDraftPct` above is
    // measured against a hardcoded 1 degree, which is the right question for
    // aluminium die casting and the wrong one for zinc (0.5), sand (1.5-3) and
    // hot forging (5-7). Each rule names the angle it actually means in
    // `draftCutoffDeg` and the evaluator reads that point off this curve.
    _draftCurve: draft.wallAreaBelowDraftPct || undefined,

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
export function runDfmRules(geo, process, { material } = {}) {
  if (!PROCESS_FAMILIES[process]) {
    throw new Error(`Unknown process family: ${process}`);
  }
  const measures = extractMeasures(geo);
  const rules = DFM_RULES.filter(r => r.process === process);
  // The alloy decides the threshold on the rules where it matters. When it is
  // not known the process-generic band is used and every finding says so —
  // "1.0-3.5 mm for die casting generally" is a different claim from
  // "1.5-4.0 mm for this aluminium", and presenting them identically is how a
  // generic report passes itself off as a specific one.
  const materialFamily = material ? MATERIALS[material]?.family : undefined;

  const findings = [];
  const passed = [];
  const notEvaluated = [];

  for (const rule of rules) {
    // A draft rule names the angle it means; everything else reads a flat measure.
    // A draft rule names the angle it means and reads that point off the curve.
    // When the curve is absent — an analysis stored before it existed — the
    // legacy `wallAreaBelowMinDraftPct` IS the 1-degree point and nothing else,
    // so it substitutes for exactly that angle and for no other. Using it for a
    // rule that asked about 5 degrees would be the original bug wearing a
    // fallback, so the rule abstains instead.
    let value;
    if (rule.measure === 'wallAreaBelowDraftPct') {
      value = numberOr(measures._draftCurve?.[String(rule.draftCutoffDeg)]);
      if (value === undefined && rule.draftCutoffDeg === 1.0) {
        value = measures.wallAreaBelowMinDraftPct;
      }
    } else {
      value = measures[rule.measure];
    }
    const picked = resolveThreshold(rule, material, materialFamily);
    const effective = { ...rule, threshold: picked.threshold };
    const { status, reason } = evaluate(effective, value);
    const row = {
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      measure: rule.measure,
      measured: value,
      unit: rule.unit,
      threshold: picked.threshold,
      thresholdText: thresholdText(effective),
      rationale: rule.rationale,
      fix: rule.fix,
      source: picked.source,
      sourceStatus: rule.sourceStatus,
      // WHICH material this threshold was tuned to, or that it was not tuned at
      // all. The report prints this beside the finding.
      thresholdBasis: picked.basis,
      thresholdMatchedOn: picked.matchedOn,
      status,
    };
    // The specific features that break this rule, worst first. Only the ones
    // that actually fail — listing every hole under a "hole too deep" finding
    // would bury the two that are wrong among the twenty that are fine.
    const all = measures._instances?.[rule.measure];
    if (Array.isArray(all) && all.length) {
      const offenders = all.filter(inst => evaluate(effective, inst.ratio).status === 'fail');
      if (offenders.length) row.instances = offenders.slice(0, 12);
      row.instanceCount = offenders.length;
      row.instanceTotal = all.length;
    }
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
export function runAllDfmRules(geo, opts) {
  return Object.keys(PROCESS_FAMILIES).map(p => runDfmRules(geo, p, opts));
}

const numberOr = v => (Number.isFinite(Number(v)) ? Number(v) : undefined);

/** The object, or undefined when every list in it is empty. */
function nonEmpty(obj) {
  const kept = Object.fromEntries(Object.entries(obj).filter(([, v]) => v?.length));
  return Object.keys(kept).length ? kept : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// What the GEOMETRY says the process is.
//
// This exists because a live report got it exactly backwards. A 1.6 mm seat
// cross member was measured as folded sheet — 38 recognised bends, wall p50
// 1.60 mm, uniform — and the report still opened with "no manufacturing process
// was specified, so EVERY rule family was run speculatively" and then listed
// machining findings against it. The tool knew better than the report it wrote.
//
// This is an INFERENCE from measurements, not a substitute for the user telling
// us. It never overrides an explicit or cost-derived family; it corroborates one
// and it CONTRADICTS one, loudly, when the geometry disagrees. Where the
// evidence is thin it says `null` rather than picking the likeliest — the same
// three-state discipline the rules themselves follow.
// ─────────────────────────────────────────────────────────────────────────────

/** Uniform wall at or below this reads as sheet, not as a cast section. */
const SHEET_MAX_WALL_MM = 6.0;
/** Wall spread (p95/p50 - 1) below this is a constant-section part. */
const UNIFORM_SPREAD_MAX = 0.35;
/**
 * Tapered wall area that says the part was designed to leave a tool. Draft costs
 * a designer nothing but tool release, so a quarter of the wall being tapered is
 * a deliberate act; a machined block has no reason for any. Both this and the
 * undercut ceiling are judgement, not a standard — which is why the measured
 * percentages are published in `evidence` for the reader to weigh.
 */
const TOOLED_RELEASING_MIN_PCT = 25;
const TOOLED_UNDERCUT_MAX_PCT = 15;

/**
 * @returns {{family: string|null, confidence: 'measured'|'indicative'|null,
 *            evidence: string[], notes: string[]}}
 */
export function inferProcessFamily(geo = {}) {
  const dfm = geo.dfm || {};
  const wall = dfm.wallThickness || geo.wallThickness || {};
  const sm = dfm.sheetMetal || {};
  const draft = dfm.draft || geo.draftAnalysis || {};
  const evidence = [], notes = [];
  const p50 = Number(wall.p50Mm);
  const p95 = Number(wall.p95Mm);
  const spread = Number.isFinite(p50) && p50 > 0 && Number.isFinite(p95)
    ? p95 / p50 - 1 : undefined;

  // 1. Folded sheet. Bend recognition pairs coaxial cylinders and derives the
  //    thickness as (outer radius - inner radius); it is only trusted when that
  //    derived thickness AGREES with the independently ray-cast wall, so
  //    isSheetMetal is already a two-measurement result.
  if (sm.isSheetMetal && sm.bendCount > 0) {
    evidence.push(`${sm.bendCount} bends recognised, sheet thickness ${sm.thicknessMm} mm`);
    if (Number.isFinite(p50)) evidence.push(`wall p50 ${p50} mm, ${wall.uniformity ?? 'uniformity unknown'}`);
    return { family: 'sheet-metal', confidence: 'measured', evidence, notes };
  }
  if (sm.reason) notes.push(sm.reason);

  // 2. Cast or moulded. The discriminator is DRAFT: a part built to leave a
  //    tool has it and a machined part does not. Which of casting and moulding
  //    is not a geometric question — aluminium and polypropylene make the same
  //    shape — so this stops at "tooled" and says so.
  const releasing = Number(draft.areaPct?.releasing);
  const undercut = Number(draft.areaPct?.undercut);
  const drafted = Number.isFinite(releasing) && releasing >= TOOLED_RELEASING_MIN_PCT
    && Number.isFinite(undercut) && undercut <= TOOLED_UNDERCUT_MAX_PCT;
  const thickSection = Number.isFinite(p50) && p50 > SHEET_MAX_WALL_MM;
  if (drafted && thickSection) {
    evidence.push(`${releasing}% of wall area is tapered and releases along the best draw direction; ${undercut}% is undercut`);
    evidence.push(`wall p50 ${p50} mm`);
    notes.push('Draft says the part leaves a tool, but geometry cannot tell a die casting from an injection moulding — the material does. Pick the family.');
    return { family: null, confidence: 'indicative', evidence, notes };
  }

  // 3. Machined. Asserted only from POSITIVE evidence — a constant section with
  //    prismatic features and no draft — never as the leftover bucket. "Nothing
  //    else matched" is not a measurement.
  const feats = dfm.features?.counts || {};
  const prismatic = (feats.pocket || 0) + (feats.slot || 0) + (feats.step || 0);
  const bores = (feats['through-hole'] || 0) + (feats['blind-hole'] || 0)
    + (feats['counterbored-hole'] || 0) + (feats['countersunk-hole'] || 0);
  if (Number.isFinite(spread) && spread <= UNIFORM_SPREAD_MAX
      && !drafted && (prismatic + bores) > 0) {
    evidence.push(`wall spread p95/p50 = ${(spread + 1).toFixed(2)}, no releasing draft`);
    evidence.push(`${prismatic} prismatic feature${prismatic === 1 ? '' : 's'}, ${bores} bore${bores === 1 ? '' : 's'}`);
    return { family: 'machining', confidence: 'indicative', evidence, notes };
  }

  notes.push('The measured geometry does not point clearly at one process family.');
  return { family: null, confidence: null, evidence, notes };
}

/**
 * Compare what the user (or the costing process) said against what the geometry
 * measures. Returns null when they agree or when there is nothing to compare.
 */
export function processFamilyConflict(chosen, inferred) {
  if (!chosen || !inferred?.family || chosen === inferred.family) return null;
  if (inferred.confidence !== 'measured') return null;   // only contradict on measurement
  return {
    chosen,
    measured: inferred.family,
    chosenName: PROCESS_FAMILIES[chosen] || chosen,
    measuredName: PROCESS_FAMILIES[inferred.family] || inferred.family,
    evidence: inferred.evidence,
  };
}
