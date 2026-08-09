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
      notSheetMetal: true,
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
      // A FACE ID MUST RESOLVE TO THE RIGHT SURFACE. The undercut on this part
      // is the cylindrical bore, so the id the analysis reports must land on a
      // CYLINDER in the viewer's own face metadata. Four producers in this
      // pipeline used to number faces differently and the viewer highlighted
      // face 6 — a PLANE — while the bore was face 5. Every count-based check
      // passed throughout, because an off-by-one changes no count.
      faceIdResolves: { undercutAtZ: 'cylinder' },
      // MESH QUALITY IS A GATED NUMBER NOW. The viewer meshed at 0.5 radians of
      // angular deflection — 28.6 degrees, about thirteen segments around a full
      // circle — so a Ø12 bore rendered as a visible polygon and the whole
      // viewer read as "basic" next to CATIA. Nothing in this gate could see
      // that, because every DFM measurement is taken on a SEPARATE, coarser
      // tessellation and none of them cares how the part looks.
      //
      // The bore here is Ø12 and runs the full 60 mm through the box. At 0.15
      // radians it must come back with at least 32 segments around it; at the
      // old setting it would have had 13.
      viewerMesh: { minSegmentsPerCircle: 32 },
      // WHERE the finding is, arithmetic from the construction: the Ø12 bore
      // runs through X at y=20, z=15 of a 60x40x30 box, so its area-weighted
      // centroid is the mid-span of the axis. This is the anchor a leader line
      // is drawn to in the viewer and the PDF — if it drifts, every callout
      // points at empty space while the counts stay green.
      undercutRegionAtZ: { centroidXYZ: [30.0, 20.0, 15.0], draftDeg: 0.0 },
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
      // ONE through hole, so ONE aperture — not two. A through hole leaves an
      // inner wire on the face it enters AND the face it exits, and counting
      // both doubles every aperture on the part. Perimeter is pi * 6 = 18.85 mm
      // and the equivalent diameter is therefore exactly the 6.0 it started as.
      apertures: { count: 1, circularCount: 1, totalCutLengthMm: 18.85, smallestApertureMm: 6.0 },
      notSheetMetal: true,
      // The boss is a cylinder and the through hole is a cylinder, so every
      // recognised cylindrical feature id must land on one.
      faceIdResolves: { featureTableCylinders: 'cylinder' },
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
      // A counterbore IS two coaxial cylinders of different radius — the exact
      // signature bend pairing looks for. Real parts proved this the hard way:
      // an aluminium casting reported eleven "bends" and was handed to the
      // sheet-metal rule family, which then produced a negative hole-to-bend
      // clearance from geometry that is not a bend. A bore sweeps a full turn;
      // a fold does not.
      notSheetMetal: true,
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
    truth: {
      featureCounts: { pocket: 1, slot: 1 },
      // APERTURES, from the topology rather than the wall geometry. The block's
      // pocket is blind and its slot runs out of both ends, so NEITHER creates
      // an inner wire — there is no hole through this part and the aperture
      // count must be zero. A recogniser that counted pockets as apertures
      // would fail here, which is the point: an aperture is a hole THROUGH a
      // face, not a recess in one.
      apertures: { count: 0 },
      // The counterpart to the plate: this block HAS pockets narrower than the
      // Ø10 default cutter, so some of its surface must be unreachable. A pair
      // of one-sided assertions (convex = exactly 100, featured < 100) is what
      // catches the measure failing open or failing closed.
      toolAccessUnreachablePctMin: 5,
    },
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
      // A CONVEX SOLID IS REACHABLE FROM EVERY SIDE, by definition: there is no
      // material anywhere between a face and infinity along its own outward
      // normal. Anything less than 100% here means the shank-clearance probes
      // are striking the part they are supposed to clear, which would put a
      // "cutter cannot reach this" finding on a flat plate.
      toolAccess: { reachableAreaPct: 100, unreachableAreaPct: 0 },
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
        // Hole edge to the part edge, arithmetic from the construction: the
        // Ø4 hole sits at x = 42 on a leg running x = 0 to 50 plus the bend's
        // outer radius, so the nearest edge is 13.03 mm away and the hole's own
        // radius takes 2 off it. 11.03 / 2 mm sheet = 5.52 t.
        minHoleToEdgeMm: 11.03,
        minHoleToEdgeToThickness: 5.52,
      },
      // Five of seven. ONE hole cannot be too close to another hole and ONE bend
      // cannot be too close to another bend, so those two rules must ABSTAIN.
      // Before `num()` stopped coercing null to zero they both FAILED here, at a
      // measured gap of 0 mm, on a bracket that has nothing to measure — the
      // exact "an absent measurement became a confident finding" failure the
      // three-state discipline exists to prevent.
      // SIX of nine. The Ø4 hole is now measurable as an APERTURE as well as a
      // cylinder — perimeter pi*4 = 12.566 mm, so equivalent diameter 4.00 and
      // 4.00 / 2.00 mm sheet = 2.0 size/t, which clears the 1.0 punch-strength
      // floor. Before apertures existed the same hole could only be seen by the
      // cylinder pass, and every spacing rule keyed off it stayed silent on any
      // part whose openings were not round.
      sheetMetalRulesEvaluated: 6,
      sheetMetalRulesAbstaining: ['sm-hole-to-hole', 'sm-bend-to-bend'],
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
      // Anchors as well as dimensions. The ribs are built at x = 80, 10 and 45,
      // each spanning y = 20..60, so the area-weighted centre of each sits at
      // its own mid-thickness and at y = 40. A callout that drifts off these
      // points at bare plate while every count stays green.
      ribs: [
        { thicknessMm: 5.0, heightMm: 24.0, lengthMm: 40.0, centroidXY: [82.5, 40.0] },
        { thicknessMm: 3.0, heightMm: 12.0, lengthMm: 40.0, centroidXY: [11.5, 40.0] },
        { thicknessMm: 2.4, heightMm: 15.0, lengthMm: 40.0, centroidXY: [46.2, 40.0] },
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
  {
    file: 'curved-wall-plate.step',
    what: '80x40x10 plate with a semicircular R20 end and one Ø6 through hole',
    truth: {
      // Volume is arithmetic from the construction: box + half-cylinder - bore
      // = 80*40*10 + pi*20^2/2*10 - pi*3^2*10 = 32000 + 6283.19 - 282.74.
      volumeMm3: 38000.45,
      // THE POINT OF THIS FIXTURE. The rounded end is a cylindrical face of
      // radius 20 sweeping exactly 180 degrees. It is a wall. Until the engine
      // was taught that a hole or a boss must close a FULL revolution, it
      // accepted any cylindrical face, and on a real aluminium casting it
      // reported the part's own 63-degree outer wall as "boss Ø100 x 25.8" and
      // thirteen more like it. Zero bosses here, and exactly one hole.
      bosses: 0,
      holes: [{ diaMm: 6.0, through: true }],
      // No pocket, slot or step: the plate is solid apart from the bore, and the
      // bore is reported by the cylinder pass, not the graph.
      featureCounts: { 'through-hole': 1 },
    },
  },
  {
    file: 'sheet-hole-through.step',
    what: '1.5 mm L-bracket, 40 mm upstand, Ø5 hole through the base',
    truth: {
      // THE POINT OF THIS FIXTURE. The bore is 1.5 mm deep and the part spans
      // 40 mm along the bore axis, so a through/blind test that compares depth
      // against the bounding box calls it blind. That is exactly what put
      // "hole Ø6 depth 1.6 through: false" into a report on a 1.6 mm seat cross
      // member — every hole in the pressing was called blind.
      holes: [{ diaMm: 5.0, depthMm: 1.5, through: true }],
      bosses: 0,
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
export const PMI_FIXTURES = [
  {
    file: 'pmi-toleranced-block.step',
    what: '50x30x20 block carrying semantic AP242 PMI: 50 +/- 0.010 and 0.05 flatness',
    truth: {
      // THE ONLY TRUTH HERE THAT IS NOT GEOMETRY. Every other fixture would read
      // identically with its PMI stripped, so without this one the reader could
      // return nothing on every part and the gate would stay green.
      present: true,
      // 0.010 + 0.010 = 0.020 total band, and it is tighter than the 0.05
      // flatness, so it is the tightest callout on the part.
      tightestToleranceMm: 0.02,
      dimensionCount: 1,
      geometricToleranceCount: 1,
      // Read from OCCT's own enum rather than a hand-typed map — the first
      // hand-written map returned "symmetry" for a flatness callout.
      geomToleranceTypeName: 'flatness',
      geomToleranceValueMm: 0.05,
    },
  },
  {
    file: 'thin-plate.step',
    what: 'A plain plate with NO PMI — the answer that matters most',
    truth: {
      present: false,
      // A part with no PMI in the file is not a part with no tolerances: they
      // are on a drawing this tool has never seen. Every tolerance rule must
      // ABSTAIN, and "no tolerance problems found" would be the single most
      // dangerous sentence the report could print.
      reasonMatches: 'not that the part has none',
      toleranceRulesAbstain: ['machining', 'sand-casting', 'hpdc'],
    },
  },
];

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
  {
    file: 'seat-bracket-assembly.step',
    what: 'Ten solids, six types: stamped plate + cast housing + 4 bolts + 2 washers + dowel + cover',
    truth: {
      // STILL SYNTHETIC, and that is stated in the generator too. Every customer
      // file supplied so far has been a single solid, so the DFA path has never
      // met a real multi-part STEP. This is the closest available substitute.
      solidCount: 10,
      distinctPartTypes: 6,
      largestInstanceGroup: 4,
      symmetry: {
        // The base plate carries an OFFSET notch, so it must come back fully
        // asymmetric. A 180 here would mean the rotation test is measuring the
        // bounding box rather than the shape.
        0: { continuous: false, totalDeg: 720 },
        // A bolt is a body of revolution that does NOT flip end for end — the
        // head is on one end — so alpha 360, beta 0.
        2: { continuous: true, totalDeg: 360 },
        // A washer is a body of revolution that DOES flip: alpha 180, beta 0.
        // The hardest case in Boothroyd's scheme, and the one that decides
        // whether handling is 1.5 s or 4 s.
        6: { continuous: true, totalDeg: 180 },
      },
      // Bolts pass through clearance holes and touch only their washers; the
      // cover sits proud and touches nothing at all.
      contacts: 4,
      // THE BASE PART IS ALWAYS NECESSARY — assembly has to start somewhere, and
      // Boothroyd's three questions are asked of a part relative to those
      // ALREADY assembled. With the housing marked a different material and the
      // base answered no to all three, the minimum is 2, not 1. A
      // `Math.max(1, necessaryCount)` floor gave 1 and halved the design
      // efficiency; the three-solid fixture could not show it, because there the
      // one necessary part WAS the base.
      dfaMinParts: { housingNecessary: 2, nothingNecessary: 1 },
    },
  },
];

/**
 * CASTING FIXTURES — the two shapes the casting rule tranche needs and no
 * existing fixture provides.
 *
 * `bushing-tube` is the only part in the whole set that is a TRUE body of
 * revolution, and without it the centrifugal rule could only ever be seen
 * saying NO. A rule that has never been observed passing is not a tested rule.
 *
 * `fine-cored-holes` separates three numbers that used to be one: the smallest
 * bore on the part, the worst BLIND slenderness, and the worst THROUGH
 * slenderness. The combined figure (3.33) and the blind figure (1.60) disagree
 * by more than a factor of two, so a blind-hole limit judged on the combined
 * measure would pass a part it should have failed — and vice versa.
 *
 * Every number here comes from the construction in generate.py, not from an
 * engine run.
 */
export const CASTING_FIXTURES = [
  {
    file: 'bushing-tube.step',
    what: 'OD 60 / ID 40 / L 50 bushing — a perfect body of revolution',
    truth: {
      // Faces: OD cylinder about +Z, ID cylinder about +Z, two planes with +/-Z
      // normals. Every one is compatible with revolution about Z, so the share
      // is exactly 100% — no sampling, no tolerance, arithmetic.
      axisymmetricAreaPct: 100.0,
      axisXYZ: [0, 0, 1],
      // The bore is a Ø40 through hole 50 deep: L/D = 50/40 = 1.25.
      minHoleDiaMm: 40.0,
      maxThroughHoleDepthToDia: 1.25,
      // Nothing is blind, so the blind measure must be ABSENT rather than 0.
      blindMeasureAbsent: true,
      // Wall = (60-40)/2 = 10.00 mm everywhere.
      wallP50Mm: 10.0,
      // And the rule that exists for this shape must PASS on it.
      centrifugalBodyOfRevolutionPasses: true,
    },
  },
  {
    file: 'fine-cored-holes.step',
    what: '80x50x20 block: Ø2 through, Ø10x16 blind, Ø6 through',
    truth: {
      // Smallest bore on the part, exactly as drawn. Ø2.0 is the one diameter
      // that splits all four distinct as-cast floors in the catalogue: it fails
      // HPDC (2.5) and both permanent-mould families (6.0) while passing zinc
      // and investment (1.5). The first draft of this fixture used Ø3, which
      // passes HPDC too and left that threshold untested — the gate caught it.
      minHoleDiaMm: 2.0,
      // Ø10 blind 16 deep -> 1.60.
      maxBlindHoleDepthToDia: 1.6,
      // Ø2 through 20 deep -> 10.00. The Ø6 through is 3.33 and is NOT the worst.
      maxThroughHoleDepthToDia: 10.0,
      // What the two used to share, and why the split was needed: a blind limit
      // of 2 tested against 10.00 fails a hole that is actually at 1.60.
      maxHoleDepthToDia: 10.0,
      minHoleFailsIn: ['hpdc', 'gravity-die', 'lpdc'],
      minHolePassesIn: ['hpdc-zinc', 'investment-casting'],
    },
  },
];
