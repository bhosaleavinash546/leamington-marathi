// Ground truth for the DFM geometry fixtures.
//
// Every number here is ARITHMETIC from the construction in
// benchmark/dfm-fixtures/generate.py — a truncated pyramid built with a 3.000
// degree taper must measure 3.000 degrees, a shell built with a 2.50 mm wall must
// measure 2.50 mm. None of it was copied back from engine output, which is the
// only thing that makes this a gate rather than a change detector.
//
// If a check here fails, fix the physics. Do NOT relax the tolerance to match
// what the engine currently says — that is the repo's standing rule for
// benchmarks and it is the whole reason these fixtures are analytic.

export const DFM_FIXTURES = [
  {
    file: 'plate-two-holes.step',
    what: '60x40x10 plate, Ø10 through hole, Ø8 blind hole 6 deep',
    truth: {
      // 60*40*10 - pi*5^2*10 - pi*4^2*6
      volumeMm3: 22913.0,
      // The plate is 10 mm everywhere except under the blind hole (10-6 = 4).
      // p50 catches the bulk, p5 catches the thin floor.
      wallP50Mm: 10.0,
      wallP5Mm: 4.0,
      // Both holes are drilled from +Z, so one fixturing direction.
      setupCount: 1,
      // Vertical walls have zero draft but drag out fine — NOT undercuts.
      undercutFaceCountAtZ: 0,
      holes: [
        { diaMm: 8.0, depthMm: 6.0, through: false },
        { diaMm: 10.0, depthMm: 10.0, through: true },
      ],
    },
  },
  {
    file: 'frustum-draft3.step',
    what: 'Truncated pyramid, EXACTLY 3.000 deg draft on all four walls',
    truth: {
      // The headline regression guard: the old planar-only analyser found ZERO
      // drafted faces here and invented two undercuts, because ThruSections
      // produces B-spline walls.
      minWallDraftDeg: 3.0,
      maxWallDraftDeg: 3.0,
      undercutFaceCountAtZ: 0,
      // Four tapered walls out of a closed solid; the rest is top and bottom.
      releasingAreaPctMin: 40.0,
      // Honest degradation, gated. Those four walls are B-spline, so the
      // recogniser can name nothing here and must SAY so rather than return an
      // empty list that reads as "this part has no features". The percentage is
      // their share of surface area, and it matches the releasing area above.
      featureCounts: {},
      unclassifiedAreaPctMin: 40.0,
    },
  },
  {
    file: 'box-side-hole.step',
    what: '60x40x30 box with a Ø12 hole through along X',
    truth: {
      // Drawn along +Z the bore is a genuine undercut needing a side action.
      undercutFaceCountAtZ: 1,
      // Drawn along its own axis it is just a cored hole — the sweep must find
      // that and prefer it.
      bestDrawAxis: 'x',
      bestUndercutAreaPct: 0.0,
      // The four vertical box walls are zero-draft DRAG faces. Counting them as
      // undercuts is the classification error this fixture exists to catch: an
      // early probe scored a clean box 62.6% undercut by doing exactly that.
      zeroDraftFaceCountAtZ: 4,
    },
  },
  {
    file: 'shell-wall25.step',
    what: 'Open box, outer 50x50x30, wall EXACTLY 2.50 mm',
    truth: {
      wallP50Mm: 2.5,
      wallP5Mm: 2.5,
      // Constant by construction, so the uniformity verdict must say so. stdDev
      // called this "non-uniform" because a few rim rays measure down the wall;
      // the robust spread ratio is what fixed it.
      uniformity: 'uniform',
      undercutFaceCountAtZ: 0,
    },
  },
  {
    file: 'boss-plate.step',
    what: '40x40x8 plate, Ø16x12 boss, Ø6 through hole',
    truth: {
      wallP50Mm: 8.0,
      // A vertical boss wall drags straight out of a +Z tool. Reporting it as an
      // undercut is what a too-small ray offset caused: the tessellation chord
      // sits inside the true cylinder, so the ray started buried in the solid.
      undercutFaceCountAtZ: 0,
      bosses: 1,
      holes: [{ diaMm: 6.0, through: true }],
      featureCounts: { 'through-hole': 1, boss: 1 },
      // Slenderness ratios, arithmetic from the construction: the boss is
      // Ø16 x 12 high, and the hole runs Ø6 through the full 8 + 12 = 20 mm.
      // These drive the boss-height, drill-depth and core-pin rules.
      measures: {
        maxBossHeightToDia: 0.75,   // 12 / 16
        maxHoleDepthToDia: 3.33,    // 20 / 6
      },
    },
  },
  {
    file: 'counterbore-plate.step',
    what: '60x60x20 plate, Ø8 through hole with a Ø16 counterbore 6 deep',
    truth: {
      featureCounts: { 'counterbored-hole': 1 },
      compoundHole: { kind: 'counterbored-hole', boreDiaMm: 8.0, featureDiaMm: 16.0, featureDepthMm: 6.0, through: true },
    },
  },
  {
    file: 'countersink-plate.step',
    what: '60x60x20 plate, Ø8 through hole with a 90 deg countersink to Ø16',
    truth: {
      // A cone at the mouth is what makes this a countersink rather than a
      // counterbore. Confusing the two puts the wrong tool on the process sheet,
      // so the included angle is checked, not just the diameter.
      featureCounts: { 'countersunk-hole': 1 },
      compoundHole: { kind: 'countersunk-hole', boreDiaMm: 8.0, featureDiaMm: 16.0, includedAngleDeg: 90.0, through: true },
    },
  },
  {
    file: 'slot-and-pocket.step',
    what: '80x60x25 block with one closed pocket and one open-ended slot',
    truth: { featureCounts: { pocket: 1, slot: 1 } },
  },
  {
    file: 'through-hole-and-pocket.step',
    what: '50x40x30 block, Ø8 through hole AND a closed pocket',
    truth: {
      // The guard on the hybrid recogniser. A through hole has no concave edges,
      // so AAG decomposition alone finds only the pocket — this fixture fails if
      // the analytic cylinder pass is ever dropped in favour of "pure" AAG.
      featureCounts: { pocket: 1, 'through-hole': 1 },
    },
  },

  // ── Blend geometry — the fixtures that were missing, and their absence is
  // why a 100% gate coexisted with a recogniser that collapsed on real parts.
  // Every casting and moulding has filleted internal corners.
  {
    file: 'filleted-pocket.step',
    what: '80x60x30 block, closed pocket, R3 fillet on EVERY edge',
    truth: {
      // Before the blend-collapse fix: 100 arcs all tangent, zero concave, the
      // pocket GONE, 11 non-existent chamfers invented, and unclassifiedAreaPct
      // reporting 0.0 — full confidence with nothing real found.
      featureCountsIgnoring: ['fillet'],
      featureCounts: { pocket: 1 },
    },
  },
  {
    file: 'filleted-slot.step',
    what: '80x60x30 block, through slot, R2 fillet on every edge',
    truth: {
      // Counting only PLANAR faces as walls called this a "step": after the
      // collapse a wall can legitimately be a surviving cylindrical fillet.
      featureCountsIgnoring: ['fillet'],
      featureCounts: { slot: 1 },
    },
  },
  {
    file: 'chamfered-box.step',
    what: '80x60x30 box, 3 mm chamfer on all 12 edges',
    truth: {
      // A chamfer meets its neighbours at CONVEX edges, so the original
      // tangency test scored every real chamfer zero. And rejoining collapsed
      // chamfers as concave made the whole box read as one giant pocket.
      featureCounts: { chamfer: 12 },
    },
  },
  {
    file: 'thin-plate.step',
    what: 'Plain 40x40x8 plate — no features at all',
    truth: {
      // Its four side walls are narrow (aspect 0.2) and small against their
      // neighbours, so a narrowness-only chamfer test claimed all four. A
      // chamfer is OBLIQUE to what it joins; a plate wall is perpendicular.
      featureCounts: {},
    },
  },
  {
    file: 'folded-bracket.step',
    what: '2 mm sheet, 90 deg bend, inside radius 3 mm, 40 mm flange, Ø4 hole',
    truth: {
      // Sheet THICKNESS is derived, not assumed: outer radius minus inner
      // radius, 5 - 3 = 2.00. Before bend recognition existed, all four
      // sheet-metal rules abstained on every part ever uploaded.
      sheetMetal: {
        thicknessMm: 2.0,
        bendCount: 1,
        minInsideRadiusMm: 3.0,
        minBendRadiusToThickness: 1.5,
        minFlangeToThickness: 20.0,
      },
      sheetMetalRulesEvaluated: 4,
    },
  },
  {
    file: 'ribbed-plate.step',
    what: '120x80x6 plate with three ribs — 3.0x12, 2.4x15 and a deliberately over-thick 5.0x24',
    truth: {
      // The nominal wall the rib ratios are taken against. The plate's two large
      // faces dominate the area-weighted percentile, so p50 is the plate.
      wallP50Mm: 6.0,
      // Three ribs and NOTHING else. Before rib recognition, each rib met the
      // plate concavely on all four sides, so the part decomposed into a single
      // 13-face "pocket" — three protrusions reported as one depression.
      featureCounts: { rib: 3 },
      // Exact construction dimensions, emitted thickest-first.
      ribs: [
        { thicknessMm: 5.0, heightMm: 24.0, lengthMm: 40.0 },
        { thicknessMm: 3.0, heightMm: 12.0, lengthMm: 40.0 },
        { thicknessMm: 2.4, heightMm: 15.0, lengthMm: 40.0 },
      ],
      // Arithmetic against the 6.00 mm wall: 5.0/6, 2.4/6, 24/6.
      ribMeasures: {
        maxRibThicknessToWall: 0.833,
        minRibThicknessToWall: 0.4,
        maxRibHeightToWall: 4.0,
      },
      // Rib C is out of band on purpose. Recognition is gated on "taller than it
      // is thick", never on the rule threshold, so the rib a rule would fail is
      // still found — a recogniser that dropped it would turn a finding into
      // silence, which is the exact failure this feature exists to prevent.
      ruleOutcomes: {
        'injection-moulding': {
          'im-rib-thickness-max': 'fail',
          'im-rib-thickness-min': 'pass',
          'im-rib-height': 'fail',
        },
        hpdc: {
          // Die casting demands a FULLER rib than moulding — 0.6 minimum against
          // 0.4 — so the 2.4 mm rib that passes as a moulding fails as a
          // casting. The same geometry, judged differently by process, is the
          // point of running the families separately.
          'hpdc-rib-thickness-max': 'fail',
          'hpdc-rib-thickness-min': 'fail',
          'hpdc-rib-height': 'fail',
        },
      },
    },
  },
];

/**
 * DEGENERATE inputs — the fixtures whose absence let a 100% gate coexist with
 * four live bugs. Every part above is a well-formed, sharp-edged, millimetre
 * solid, so nothing here was ever exercised: a surface model crashed with a
 * KeyError, a metre-scale part returned a confident 0.05 mm wall, and an
 * unreadable file showed the user OCCT's own ANSI-coloured parser output.
 *
 * The truth for these is not a measurement. It is that the tool degrades
 * HONESTLY — a clean typed error, or a result that states what it could not do —
 * and never a stack-trace fragment, kernel internals, or a number computed at a
 * scale nobody checked.
 */
export const DEGENERATE_FIXTURES = [
  {
    file: 'degenerate-surface-only.step',
    what: 'A single trimmed face — no solid anywhere in the file',
    // It must NOT crash. Either the engine reports success while saying it could
    // not measure a wall, or it fails with a readable message; both are honest,
    // a Python KeyError reaching the user is not.
    mustNotContain: ['meanMm', 'KeyError', 'Traceback'],
    // Whatever else happens, it may never publish a wall thickness for a shape
    // that has no thickness.
    noWallThickness: true,
  },
  {
    file: 'degenerate-metres.step',
    what: 'plate-two-holes drawn in metres — 0.06 x 0.04 x 0.01',
    // The warning must exist AND be actionable. Producing it internally while
    // the report shows three confident sub-millimetre findings is the exact
    // failure this fixture guards.
    unitWarning: true,
    // Rules run through the route's suppression path must evaluate NOTHING.
    suppressedEvaluatedCount: 0,
  },
  {
    file: 'degenerate-empty.step',
    what: 'A zero-byte file with a .step extension',
    errorExpected: true,
    mustNotContain: ['****', 'ERR StepFile', 'Traceback', 'undefined'],
  },
  {
    file: 'degenerate-garbage.step',
    what: '4 KB of bytes that are not STEP at all',
    errorExpected: true,
    mustNotContain: ['****', 'ERR StepFile', 'Traceback', 'undefined'],
  },
];

/** Assembly fixture — used by the DFA benchmark, not the DFM geometry one. */
export const DFA_FIXTURES = [
  {
    file: 'bolted-assembly.step',
    what: '80x50x10 plate + two identical Ø8x25 pins',
    truth: {
      solidCount: 3,
      distinctPartTypes: 2,
      // The two pins are geometrically identical, so their shape signatures must
      // collide — that is what makes instance grouping possible at all.
      largestInstanceGroup: 2,
      // Boothroyd's alpha/beta, MEASURED by rotating each solid rather than
      // inferred from inertia. A cylinder is a body of revolution: beta = 0, and
      // it flips end-for-end, so alpha = 180. The rectangular plate has 2-fold
      // symmetry about its normal: alpha = beta = 180.
      symmetry: {
        0: { continuous: false, totalDeg: 360 },
        1: { continuous: true, totalDeg: 180 },
        2: { continuous: true, totalDeg: 180 },
      },
      // Both pins touch the plate; the pins do not touch each other.
      contacts: 2,
    },
  },
];
