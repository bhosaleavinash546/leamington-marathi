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
export function extractMeasures(geo = {}, opts = {}) {
  const dfm = geo.dfm || {};
  const wall = dfm.wallThickness || geo.wallThickness || {};
  const draft = dfm.draft || geo.draftAnalysis || {};
  const features = dfm.features || {};
  const setups = dfm.setups || geo.setupAnalysis || {};
  // Sheet-metal measures come from real bend recognition (paired coaxial
  // cylinders) — and, when there is no bend to recognise, from the ray-cast wall.
  //
  // THE GATE USED TO BE `isSheetMetal`, AND IT BLACKED OUT THE COMMONEST
  // AUTOMOTIVE COMMODITY. Measured over ten stamped brackets: the engine read
  // the wall at 1.60 mm and the holes at Ø8 — everything four of the nine sheet
  // rules need — and abstained on all nine, scoring `null`, because it could not
  // find a bend radius. A concept model drawn with sharp corners, or a STEP
  // export that dropped them, produced a completely blank sheet-metal report.
  //
  // The recogniser now returns the thickness-derived subset with its PROVENANCE,
  // and the bend-dependent keys are simply absent from that object — so those
  // rules still abstain without a special case here. `isSheetMetal` is untouched
  // and still means "a bend was measured"; it is not a licence to run rules.
  const smRaw = dfm.sheetMetal || {};
  const sm = (smRaw.isSheetMetal || smRaw.thicknessMm > 0) ? smRaw : {};
  // NULL IS NOT ZERO. `Number(null)` is 0 and passes `Number.isFinite`, so a
  // measurement the recogniser explicitly reported as absent arrived at the rule
  // engine as a hard zero — and a zero fails every "must be at least" rule. A
  // bracket with ONE hole failed "holes too close together" at a measured gap of
  // 0 mm, and the same trap sat under minFlangeToThickness and every other
  // measure the recogniser returns as null when it has nothing to report. An
  // absent measurement must reach the rules as undefined so the rule ABSTAINS,
  // which is the whole three-state discipline this file is built on.
  const num = (v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

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

  // ── AS-CAST FEATURE SIZE, in millimetres rather than as a ratio ────────────
  //
  // Every casting family had a core SLENDERNESS rule (how deep a pin can go) and
  // not one had a core DIAMETER rule (how thin a pin can be at all). They are
  // different failure modes: a slender pin deflects and the hole goes off
  // position; a pin below the family's floor snaps or cannot be made. A Ø2 hole
  // in a permanent-mould part is not cast at all — it is drilled afterwards, and
  // the report should say so before the tool is cut.
  //
  // The value carried is the DIAMETER, not a ratio. The `ratio` key is the
  // evaluator's generic value slot; the finding's own `unit` says what it means,
  // and the report prints that unit rather than assuming every instance is
  // dimensionless.
  const sizeInstances = (kind, key, ascending = true) => table
    .filter(f => f.kind === kind)
    .map(f => ({
      ratio: Number(f[key]),
      diaMm: f.diaMm, depthMm: f.depthMm, through: f.through, count: f.count,
      atXYZ: f.axisPointXYZ ?? null,
      instancesXYZ: Array.isArray(f.instancesXYZ) ? f.instancesXYZ.slice(0, 8) : null,
    }))
    .filter(r => Number.isFinite(r.ratio) && r.ratio > 0)
    .sort((a, b) => (ascending ? a.ratio - b.ratio : b.ratio - a.ratio));

  const smallestOf = (kind, key) => {
    const vals = sizeInstances(kind, key).map(r => r.ratio);
    return vals.length ? Math.round(Math.min(...vals) * 100) / 100 : undefined;
  };

  // A BLIND hole and a THROUGH hole of the same slenderness are not the same
  // risk — a through core pin can be supported at both ends, a blind one is a
  // cantilever. Investment casting writes the two limits separately (blind < 2,
  // through < 5) and a single combined figure cannot express either. The kernel
  // already classifies through vs blind with a solid classifier, so the split is
  // free; what it is not is optional, because the combined measure silently
  // judged a supported through core by the cantilever limit.
  const depthRatioWhere = (pred) => {
    const vals = table
      .filter(f => f.kind === 'hole' && pred(f))
      .map(f => Number(f.depthMm) / Number(f.diaMm))
      .filter(v => Number.isFinite(v) && v > 0);
    return vals.length ? Math.round(Math.max(...vals) * 100) / 100 : undefined;
  };

  const wall5 = () => wall.p5Mm;
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
    // Tool reach, from the shank-clearance sweep. Absent when the time budget
    // spent before it ran, which is a "not evaluated", not a clean sheet.
    unreachableAreaPct: num((dfm.toolAccess || {}).unreachableAreaPct),
    // The tightest TOTAL tolerance band called out on the part, from the STEP's
    // own semantic PMI. Absent on any file without AP242 PMI — which is most of
    // them — so every tolerance rule abstains rather than passing a part whose
    // tolerances are on a drawing this tool has never seen.
    // ── THE TIGHTEST BAND ON THE PART ────────────────────────────────────
    //
    // Read from the STEP's own AP242 semantic PMI when it is there. It almost
    // never is: over a 93-part sweep this measure abstained 93 TIMES — every
    // tolerance-capability rule in the catalogue, one per family, had never
    // fired on a single part. Fourteen rules that cannot ever speak are not a
    // conservative tool, they are a hole in it.
    //
    // So the engineer may DECLARE it. They know the number; it is on the
    // drawing in front of them. What must never happen is the two being
    // confused, so the basis travels with the value and the report prints it:
    // a figure read from the model and a figure typed by a person are not the
    // same kind of evidence, and PMI always wins when both exist.
    tightestToleranceMm: num((dfm.pmi || {}).tightestToleranceMm) ?? num(opts.declaredToleranceMm),
    _toleranceBasis: num((dfm.pmi || {}).tightestToleranceMm) != null
      ? 'read from the model\'s AP242 semantic PMI'
      : num(opts.declaredToleranceMm) != null
        ? 'DECLARED by the engineer — not read from the model, and not verified against it'
        : undefined,
    // APERTURES, read from the topology rather than the wall geometry. The
    // cylinder pass finds round holes exactly and is blind to everything else,
    // and on a stamped bracket that blindness reported zero holes on a part
    // with twenty-six cut-outs. As a ratio of the sheet, because that is how
    // the punch-strength guideline is written.
    minApertureToThickness: (() => {
      const a = dfm.apertures || {};
      const t = num(sm.thicknessMm);
      const min = num(a.smallestApertureMm);
      return t > 0 && min > 0 ? Math.round((min / t) * 100) / 100 : undefined;
    })(),
    apertureCount: num((dfm.apertures || {}).count),
    // SHAPE, not size. Centrifugal casting spins the mould, so the part must be
    // a body of revolution before any dimension matters. Absent when the kernel
    // could not measure it — never defaulted, because 0 would fail every part
    // and 100 would pass every part.
    axisymmetricAreaPct: num((dfm.revolution || {}).axisymmetricAreaPct),
    // How much of the surface faces DOWN at all, against the build direction.
    // The curve below is what the rules actually read; this is the headline.
    downFacingAreaPct: num((dfm.overhang || {}).downFacingAreaPct),
    shallowestOverhangDeg: num((dfm.overhang || {}).shallowestOverhangDeg),

    // ── HOW DEEP THE DRAW IS, as a proxy for the draw ratio ──────────────────
    //
    // The real deep-drawing limit is the LIMITING DRAW RATIO — blank diameter
    // over punch diameter — and neither of those exists in a finished solid: the
    // blank is not in the model and the punch is not either. What IS in the
    // model is how deep the cup is against how wide it is, which is the ratio
    // every design guide quotes alongside the LDR (0.5-0.75 in one operation,
    // approaching 1.0 in a very ductile alloy).
    //
    // It is a PROXY and the rule says so. It is also only honest when the draw
    // direction is an axis of the bounding box: measured along a skewed axis the
    // box extents stop describing the cup, so the measure ABSTAINS rather than
    // returning a number computed against the wrong span.
    drawDepthToWidth: (() => {
      const bb = geo.boundingBox || {};
      const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
      if (ext.some(v => !(v > 0))) return undefined;
      const dir = draft.drawDirectionXYZ;
      if (!Array.isArray(dir) || dir.length !== 3) return undefined;
      const mag = Math.hypot(...dir.map(Number));
      if (!(mag > 0)) return undefined;
      const unit = dir.map(v => Number(v) / mag);
      let axis = -1;
      for (let i = 0; i < 3; i++) if (Math.abs(unit[i]) > 0.999) axis = i;
      if (axis < 0) return undefined;             // skewed draw — the box no longer describes the cup
      const depth = ext[axis];
      const width = Math.min(...ext.filter((_, i) => i !== axis));
      return width > 0 ? Math.round((depth / width) * 100) / 100 : undefined;
    })(),
    internalCutLengthMm: num((dfm.apertures || {}).totalCutLengthMm),
    pmiDimensionCount: num((dfm.pmi || {}).dimensionCount),
    pmiGeomToleranceCount: num((dfm.pmi || {}).geometricToleranceCount),
    reachableAreaPct: num((dfm.toolAccess || {}).reachableAreaPct),
    minWallDraftDeg: num(draft.minWallDraftDeg),
    undercutFaceCount: num(draft.undercutFaceCount),
    setupCount: num(setups.estimatedSetupCount),

    // ── Slenderness, from the analytic cylinder pass ──
    // A hole is a drill on a machined part and a CORE PIN on a cast one, so the
    // same measured depth/diameter answers two different questions and each
    // family sets its own limit against it.
    maxHoleDepthToDia: ratioOverTable('hole', 'depthMm', 'diaMm'),
    maxBossHeightToDia: ratioOverTable('boss', 'depthMm', 'diaMm'),
    // Blind and through split out, because a cantilevered core pin and a
    // double-supported one fail at different slendernesses.
    maxBlindHoleDepthToDia: depthRatioWhere(f => f.through === false),
    maxThroughHoleDepthToDia: depthRatioWhere(f => f.through === true),

    // ── As-cast feature SIZE, in mm ──
    // The smallest bore and the smallest boss on the part. Every casting family
    // has a floor below which the feature is not cast at all, and until now the
    // catalogue could not ask about it.
    minHoleDiaMm: smallestOf('hole', 'diaMm'),
    minBossDiaMm: smallestOf('boss', 'diaMm'),
    // The LARGEST bore too, because some processes have a ceiling as well as a
    // floor: broaching runs 10-100 mm and a gun drill 1-30, above which the job
    // moves to BTA. A rule that can only warn about small features cannot route
    // a large one.
    maxHoleDiaMm: (() => {
      const vals = sizeInstances('hole', 'diaMm').map(r => r.ratio);
      return vals.length ? Math.round(Math.max(...vals) * 100) / 100 : undefined;
    })(),
    // HOW MANY blind features there are, not how deep the worst one is. Wire
    // EDM threads a wire through the part and broaching pulls a tool straight
    // through it: neither can make a blind feature AT ALL, and "the worst blind
    // hole is 2.5 L/D" cannot express "there is one".
    blindHoleCount: (() => {
      const n = table.filter(f => f.kind === 'hole' && f.through === false)
        .reduce((a, f) => a + (Number(f.count) || 1), 0);
      // Absent, not zero, when the through/blind flag was never resolved — a
      // hard 0 would clear the wire-EDM and broaching rules on a part whose
      // holes were never classified.
      return table.some(f => f.kind === 'hole' && typeof f.through === 'boolean') ? n : undefined;
    })(),

    // ── CIRCUMSCRIBING CIRCLE, the number that sizes an extrusion press ──
    //
    // The smallest circle that encloses the PROFILE — the section perpendicular
    // to the extrusion axis, which on a profile is the longest box extent. It
    // decides which press the job can run on and therefore whether it can be
    // quoted at all, and no measure in the engine expressed it.
    circumscribingCircleMm: (() => {
      const bb = geo.boundingBox || {};
      const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
      if (ext.some(v => !(v > 0))) return undefined;
      const sorted = [...ext].sort((a, b) => a - b);      // section = the two smaller
      return Math.round(Math.hypot(sorted[0], sorted[1]) * 10) / 10;
    })(),

    // ── PRESS DEPTH over wall, the density-gradient number for powder metal ──
    //
    // Powder does not flow. It is compacted along ONE axis and the density falls
    // away from the punch, so what matters is how DEEP the powder column is
    // against the wall it has to fill — not how long the part is. Taking the
    // largest box extent instead would false-alarm on every flat part, which is
    // most of them: a 200 mm long, 5 mm thick plate is pressed through 5 mm of
    // powder, not 200.
    //
    // The press axis is the direction the part's own features are approached
    // from — the same measurement the setup count is built on. With no features
    // there is no press axis to infer and the measure ABSTAINS.
    pressDepthToWallRatio: (() => {
      const dir = (setups.accessDirections || [])[0]?.directionXYZ;
      const bb = geo.boundingBox || {};
      const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
      const wall = num(wall5());
      if (!Array.isArray(dir) || ext.some(v => !(v > 0)) || !(wall > 0)) return undefined;
      let k = -1;
      for (let i = 0; i < 3; i++) if (Math.abs(Number(dir[i])) > 0.999) k = i;
      if (k < 0) return undefined;
      return Math.round((ext[k] / wall) * 100) / 100;
    })(),

    // ── SLENDERNESS of a turned part, along its own axis of revolution ──
    // A shaft is held in a chuck at one end. Past about three diameters
    // unsupported it whips; a tailstock takes it further and a steady rest
    // further still. The axis comes from the revolution measure written for
    // centrifugal casting, so this abstains on a part with no clear axis rather
    // than measuring the longest box side of a bracket and calling it a shaft.
    slendernessLtoD: (() => {
      const rev = dfm.revolution || {};
      const axis = rev.axisXYZ;
      const bb = geo.boundingBox || {};
      const ext = [num(bb.xMm), num(bb.yMm), num(bb.zMm)];
      if (!Array.isArray(axis) || ext.some(v => !(v > 0))) return undefined;
      // Only meaningful on a part that IS a body of revolution, and the bar is
      // the SAME 90% the catalogue's two body-of-revolution rules use. A first
      // draft gated at 60% and the benchmark caught it immediately: a flat
      // 60x40x10 plate scores 69.7% axisymmetric — its two large faces are
      // perpendicular to Z and count toward the figure — so the measure took the
      // 10 mm thickness over the 60 mm width and reported a 0.17 L/D shaft.
      // Three uses of the same geometric judgement must share one threshold.
      if (!(num(rev.axisymmetricAreaPct) >= 90)) return undefined;
      let k = -1;
      for (let i = 0; i < 3; i++) if (Math.abs(Number(axis[i])) > 0.999) k = i;
      if (k < 0) return undefined;
      const dia = Math.max(...ext.filter((_, i) => i !== k));
      return dia > 0 ? Math.round((ext[k] / dia) * 100) / 100 : undefined;
    })(),

    // ── Ribs, as proportions of the nominal wall ──
    maxRibThicknessToWall: ribRatio(Math.max, 'thicknessMm'),
    minRibThicknessToWall: ribRatio(Math.min, 'thicknessMm'),
    maxRibHeightToWall: ribRatio(Math.max, 'heightMm'),

    // ── Sheet metal, measured from recognised bends ──
    sheetThicknessMm: num(sm.thicknessMm),
    // Whether that thickness was measured between two bend radii or derived
    // from the wall. The report prints it beside every sheet finding — a
    // derived thickness is exact on a uniform sheet and wrong on anything else.
    _sheetThicknessBasis: smRaw.thicknessBasis ?? (smRaw.isSheetMetal ? 'measured between the inner and outer bend radius' : undefined),
    bendCount: num(sm.bendCount),
    minBendRadiusToThickness: num(sm.minBendRadiusToThickness),
    minHoleDiaToThickness: num(sm.minHoleDiaToThickness),
    minFlangeToThickness: num(sm.minFlangeToThickness),
    // Reported as CLEARANCE against the 2t+r guideline so the rule is
    // arithmetic. A raw distance would need a per-part formula the evaluator
    // cannot express, and the rule would abstain forever.
    holeToBendClearanceMm: num(sm.holeToBendClearanceMm),
    // As RATIOS of the measured sheet thickness, because that is how every
    // sheet-metal guideline is written and it makes the rule a flat number
    // instead of a per-part formula the evaluator cannot express.
    minHoleToHoleToThickness: num(sm.minHoleToHoleToThickness),
    minHoleToEdgeToThickness: num(sm.minHoleToEdgeToThickness),
    minBendToBendToThickness: num(sm.minBendToBendToThickness),

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
      // Smallest first: the offenders under a minimum-size rule are the SMALL
      // features, so the same worst-first promise needs the opposite sort.
      minHoleDiaMm: sizeInstances('hole', 'diaMm'),
      minBossDiaMm: sizeInstances('boss', 'diaMm'),
    }),

    // THE DRAFT CURVE, not one point on it. `wallAreaBelowMinDraftPct` above is
    // measured against a hardcoded 1 degree, which is the right question for
    // aluminium die casting and the wrong one for zinc (0.5), sand (1.5-3) and
    // hot forging (5-7). Each rule names the angle it actually means in
    // `draftCutoffDeg` and the evaluator reads that point off this curve.
    _draftCurve: draft.wallAreaBelowDraftPct || undefined,
    // THE SMALLEST CORED-HOLE DRAFT, in degrees per side, read from the cone
    // surface itself rather than from the tessellation. An area percentage
    // derived from facets spread either side of the true angle and reported 12%
    // of a clean 3-degree bore as "below 2 degrees" — a false finding produced
    // by the measurement, not by the part. Absent, not zero, when the part has
    // no recognised bore: a part with no cored holes has not passed a
    // cored-hole rule.
    coredHoleDraftPerSideDeg: num((draft.coredHoles || {}).minDraftPerSideDeg),
    coredHoleCount: num((draft.coredHoles || {}).count),

    // THE OVERHANG CURVE, same shape and same discipline as the draft curve.
    // 45 degrees is a rule of thumb, not a constant: some alloys and parameter
    // sets self-support to 30, and lattice struts want better than 25. Each
    // rule names the angle it means in `overhangCutoffDeg` and the evaluator
    // reads that point off this curve — so a family cannot silently be judged
    // at an angle its source never quoted.
    _overhangCurve: (dfm.overhang || {}).overhangAreaBelowDeg || undefined,

    // ── The two measures that were absent for the whole life of the rules ──
    //
    // `mach-pocket-depth-ratio` and `mach-internal-corner-radius` were written
    // against measurements nothing produced, so both reported NOT EVALUATED on
    // every part ever analysed — on the filleted-pocket fixture the entire
    // machining family evaluated 0 of 7 rules. The recogniser had the data and
    // was discarding it: a fillet's radius came off the kernel and was dropped,
    // and a pocket carried an area and a centroid but no extents.
    //
    // Both stay UNDEFINED when the recogniser has nothing, which is the whole
    // three-state discipline: a part with no concave fillet has not been
    // measured as having a small corner, it has been measured as having none.
    minInternalCornerRadiusMm: num(features.minInternalCornerRadiusMm),
    maxPocketDepthToWidth: num(features.maxPocketDepthToWidth),
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
export function runDfmRules(geo, process, { material, overrides, declaredToleranceMm } = {}) {
  if (!PROCESS_FAMILIES[process]) {
    throw new Error(`Unknown process family: ${process}`);
  }
  const measures = extractMeasures(geo, { declaredToleranceMm });
  // A workspace can DISABLE a rule as well as retune it. A disabled rule is
  // removed from the denominator too — leaving it in as "not evaluated" would
  // drag the coverage figure down for a check the plant deliberately does not
  // run, and coverage is supposed to mean "what could not be measured".
  const rules = DFM_RULES.filter(
    r => r.process === process && overrides?.[r.id]?.enabled !== false);
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
    if (rule.measure === 'overhangAreaBelowDeg') {
      value = numberOr(measures._overhangCurve?.[String(rule.overhangCutoffDeg)]);
    } else if (rule.measure === 'wallAreaBelowDraftPct') {
      value = numberOr(measures._draftCurve?.[String(rule.draftCutoffDeg)]);
      if (value === undefined && rule.draftCutoffDeg === 1.0) {
        value = measures.wallAreaBelowMinDraftPct;
      }
    } else {
      value = measures[rule.measure];
    }
    const picked = resolveThreshold(rule, material, materialFamily, overrides?.[rule.id]);
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
      sourceStatus: picked.sourceStatus ?? rule.sourceStatus,
      // WHICH material this threshold was tuned to, or that it was not tuned at
      // all. The report prints this beside the finding.
      thresholdBasis: picked.basis,
      thresholdMatchedOn: picked.matchedOn,
      // A FEASIBILITY GATE, not a quality finding. Most rules answer "how good
      // is this part for the process"; a few answer "can the process make this
      // part at all". Centrifugal casting spins the mould, so a part that is not
      // a body of revolution is not a low score — it is not a route. Without
      // this flag the impossible option sat in a cheapest-first table at EUR
      // 7.77, below the route the user had actually chosen.
      blocking: rule.blocking === true,
      // The alloy that WAS in play, independently of whether this rule had a
      // band for it. Without it the report cannot tell "no material was given"
      // apart from "this rule is alloy-independent", and it used to assert the
      // first on reports whose cover named the second.
      thresholdMaterial: material ?? null,
      // Where the MEASURED side of a tolerance comparison came from. Only set on
      // the rules that read it, so no other finding carries a stray claim.
      measuredBasis: rule.measure === 'tightestToleranceMm' ? measures._toleranceBasis : undefined,
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

  // A blocked route must not be presented as a route. It keeps its findings and
  // its score — hiding them would leave the reader wondering what was wrong —
  // but everything downstream can now say NOT VIABLE instead of a number that
  // invites a comparison the geometry has already settled.
  const blockers = findings.filter(f => f.blocking);

  const evaluated = findings.length + passed.length;
  const coveragePct = rules.length ? Math.round((evaluated / rules.length) * 1000) / 10 : 0;

  return {
    process,
    processName: PROCESS_FAMILIES[process],
    findings,
    passed,
    notEvaluated,
    ruleCount: rules.length,
    // Named, because a report that silently runs 60 of 69 rules looks identical
    // to one that ran them all and found nothing.
    disabledRuleIds: DFM_RULES
      .filter(r => r.process === process && overrides?.[r.id]?.enabled === false)
      .map(r => r.id),
    evaluatedCount: evaluated,
    coveragePct,
    blockers,
    blockedReason: blockers.length
      ? `${blockers[0].title} — ${blockers[0].fix}`
      : null,
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
// The same bar the centrifugal and metal-spinning rules use for "is this a body
// of revolution". Three uses of one geometric judgement, one number.
const BODY_OF_REVOLUTION_MIN_PCT = 90;
// Which tooled family a material implies, once the DRAFT has already said the
// part leaves a tool. Wall thickness separates the die from the sand where the
// material alone cannot: aluminium at 2 mm is a die casting and at 12 mm is a
// gravity or sand one. Entirely derived from the cost model's own family tags —
// nothing here re-declares a material.
const TOOLED_BY_MATERIAL = {
  plastic: 'injection-moulding',
  elastomer: 'rubber-moulding',
  zinc: 'hpdc-zinc',
  magnesium: 'hpdc',
  composite: 'composite-rtm',
  aluminium: p50 => (p50 <= 4 ? 'hpdc' : p50 <= 8 ? 'gravity-die' : 'sand-casting'),
  // Iron and steel are not die cast. The wall separates a permanent-mould-class
  // route from a sand one, and below the sand minimum it is investment.
  castiron: p50 => (p50 >= 5 ? 'sand-casting' : 'investment-casting'),
  ferrous: p50 => (p50 >= 5 ? 'sand-casting' : 'investment-casting'),
  copper: p50 => (p50 <= 8 ? 'gravity-die' : 'sand-casting'),
  titanium: 'investment-casting',
};
const TOOLED_UNDERCUT_MAX_PCT = 15;

/**
 * @returns {{family: string|null, confidence: 'measured'|'indicative'|null,
 *            evidence: string[], notes: string[]}}
 */
export function inferProcessFamily(geo = {}, { material } = {}) {
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

  // 2. A BODY OF REVOLUTION is turned. Measured, not guessed: the axisymmetry
  //    pass scores the share of surface compatible with revolution about the
  //    best available axis, and the bar is the same 90% the centrifugal and
  //    spinning rules use. This alone took the inference from 0 of 10 to 10 of
  //    10 on turned shafts, which it had previously been silent on.
  const axi = Number((dfm.revolution || {}).axisymmetricAreaPct);
  if (Number.isFinite(axi) && axi >= BODY_OF_REVOLUTION_MIN_PCT) {
    evidence.push(`${axi}% of the surface is a body of revolution about [${((dfm.revolution || {}).axisXYZ || []).join(', ')}]`);
    notes.push('A round part can also be spun, centrifugally cast or cold-formed; turning is the most common route and the one assumed here.');
    return { family: 'turning', confidence: 'measured', evidence, notes };
  }

  // 3. Cast or moulded. The discriminator is DRAFT: a part built to leave a
  //    tool has it and a machined part does not. Which of casting and moulding
  //    is not a geometric question — aluminium and polypropylene make the same
  //    shape — so this stops at "tooled" and says so.
  const releasing = Number(draft.areaPct?.releasing);
  const undercut = Number(draft.areaPct?.undercut);
  const drafted = Number.isFinite(releasing) && releasing >= TOOLED_RELEASING_MIN_PCT
    && Number.isFinite(undercut) && undercut <= TOOLED_UNDERCUT_MAX_PCT;
  // THE WALL TEST USED TO BE PART OF THIS, AND IT EXCLUDED THE THIN-WALL
  // CASTINGS AND MOULDINGS ENTIRELY. Requiring p50 > 6 mm to call a part
  // "tooled" meant a 2.5 mm die casting — which is what most die castings are —
  // could never be inferred, and that is a large share of why this scored 0 of
  // 10 on every casting and moulding in the commodity sweep. The wall was doing
  // a job the sheet-metal branch above already does: a folded sheet returns
  // before reaching here, so anything still in play with releasing draft and no
  // undercut is tooled whatever its wall. The wall now only chooses WHICH
  // tooled family, which is the question it can actually answer.
  if (drafted) {
    evidence.push(`${releasing}% of wall area is tapered and releases along the best draw direction; ${undercut}% is undercut`);
    evidence.push(`wall p50 ${p50} mm`);
    // GEOMETRY SAYS TOOLED; THE MATERIAL SAYS WHICH TOOL. This used to stop at
    // "tooled" and return null, which is why the inference scored 0 of 10 on
    // every casting and moulding in the commodity sweep — it had the harder
    // half of the answer and threw it away for want of the easy half. The
    // caller knows the material; aluminium and polypropylene do not make the
    // same part by the same route, and the wall then separates the die from the
    // sand.
    const fam = material ? MATERIALS[material]?.family : undefined;
    const tooled = TOOLED_BY_MATERIAL[fam];
    if (tooled) {
      const family = typeof tooled === 'function' ? tooled(p50) : tooled;
      evidence.push(`${material} is ${fam}, and at a ${p50} mm wall that is ${PROCESS_FAMILIES[family] ?? family}`);
      return { family, confidence: 'indicative', evidence, notes };
    }
    notes.push(material
      ? `Draft says the part leaves a tool, but ${material} does not map to one tooled family on wall thickness alone. Pick the family.`
      : 'Draft says the part leaves a tool, but geometry cannot tell a die casting from an injection moulding — the material does. Choose a material, or pick the family.');
    return { family: null, confidence: 'indicative', evidence, notes };
  }

  // 4. Machined. Asserted only from POSITIVE evidence — a constant section with
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
