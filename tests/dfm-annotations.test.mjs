// The join between a RULE RESULT and a PLACE on the model.
//
// Every test here would have passed vacuously before this module existed,
// because the callout list was built from the geometry block and never read a
// finding at all. The first test is the one that matters: a rib that breaks no
// rule must not appear on the picture, however confidently the recogniser found
// it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectFindingAnnotations, chooseSecondView, sectionCandidate, ANNOTATION_CAP,
  locateFinding,
} from '../src/services/dfm-annotations.mjs';

const finding = (o = {}) => ({
  id: 'r1', title: 'A rule that failed', severity: 'high', measure: 'undercutFaceCount',
  measured: 3, unit: 'faces', thresholdText: '0 faces', status: 'fail', ...o,
});

/** A geometry block with located regions of every kind the fallbacks read. */
const GEO = {
  wallThickness: {
    thinnestRegions: [
      { faceId: 9, thicknessMm: 3.4, atXYZ: [1, 1, 1] },
      { faceId: 4, thicknessMm: 1.2, atXYZ: [7, 7, 7] },
    ],
  },
  draft: {
    undercutRegions: [
      { faceId: 11, areaMm2: 40, centroidXYZ: [0, 0, 1] },
      { faceId: 12, areaMm2: 900, centroidXYZ: [5, 5, 5] },
    ],
    zeroDraftRegions: [
      { faceId: 20, draftDeg: 0.9, centroidXYZ: [2, 0, 0] },
      { faceId: 21, draftDeg: 0.1, centroidXYZ: [3, 0, 0] },
    ],
  },
  features: {
    ribs: [
      { faceIds: [30], thicknessMm: 2.0, heightMm: 12, centroidXYZ: [4, 0, 0] },
      { faceIds: [31], thicknessMm: 6.5, heightMm: 30, centroidXYZ: [6, 0, 0] },
    ],
    prismatic: [
      { kind: 'pocket', faceIds: [40, 41], areaMm2: 100, centroidXYZ: [8, 0, 0] },
      { kind: 'pocket', faceIds: [42], areaMm2: 3000, centroidXYZ: [9, 0, 0] },
    ],
  },
};

test('geometry observations never become markers — only failed rules do', () => {
  // Four ribs, two pockets and two undercut regions in the geometry, and ONE
  // failing rule. The old callout builder produced eight markers here; the
  // correct answer is one.
  const out = selectFindingAnnotations({ dfm: GEO, results: [{ findings: [finding()] }] });
  assert.equal(out.annotations.length, 1);
  assert.equal(out.annotations[0].ruleId, 'r1');
  assert.equal(out.totalFailing, 1);
});

test('passes and not-evaluated rules are excluded even if a caller passes them in', () => {
  const out = selectFindingAnnotations({
    dfm: GEO,
    results: [{
      findings: [
        finding({ id: 'ok', status: 'pass' }),
        finding({ id: 'abstained', status: 'not-evaluated' }),
        finding({ id: 'real' }),
      ],
    }],
  });
  assert.deepEqual(out.annotations.map(a => a.ruleId), ['real']);
});

test('a finding is placed on ITS OWN instance in preference to the region list', () => {
  // Same measure as the undercut fallback, but the finding carries the hole it
  // actually failed on. Marking the biggest undercut instead would be the right
  // kind of feature in the wrong place — authoritative and wrong.
  const out = selectFindingAnnotations({
    dfm: GEO,
    results: [{ findings: [finding({ instances: [{ atXYZ: [99, 98, 97] }], instanceTotal: 4 })] }],
  });
  assert.deepEqual(out.annotations[0].anchorXYZ, [99, 98, 97]);
  assert.equal(out.annotations[0].note, 'worst of 4');
});

test('one marker per finding, on the WORST region — not one per region', () => {
  const out = selectFindingAnnotations({ dfm: GEO, results: [{ findings: [finding()] }] });
  assert.equal(out.annotations.length, 1);
  // The 900 mm2 undercut, not the 40 mm2 one that happens to be listed first.
  assert.deepEqual(out.annotations[0].anchorXYZ, [5, 5, 5]);
  assert.deepEqual(out.annotations[0].faceIds, [12]);
  assert.match(out.annotations[0].note, /largest of 2/);
});

test('each region rule picks worst by its OWN definition of worst', () => {
  const run = (measure) => selectFindingAnnotations({
    dfm: GEO, results: [{ findings: [finding({ measure })] }],
  }).annotations[0];
  // Flattest wall, not the first listed.
  assert.deepEqual(run('wallAreaBelowDraftPct').anchorXYZ, [3, 0, 0]);
  // Thinnest section.
  assert.deepEqual(run('wallP5Mm').anchorXYZ, [7, 7, 7]);
  // Thickest rib for a MAX rule, thinnest for a MIN rule — same table.
  assert.deepEqual(run('maxRibThicknessToWall').anchorXYZ, [6, 0, 0]);
  assert.deepEqual(run('minRibThicknessToWall').anchorXYZ, [4, 0, 0]);
  // Largest pocket.
  assert.deepEqual(run('maxPocketDepthToWidth').anchorXYZ, [9, 0, 0]);
});

test('worst-first, and the cap drops from the BOTTOM', () => {
  const findings = [
    finding({ id: 'low-1', severity: 'low' }),
    finding({ id: 'high-1', severity: 'high' }),
    finding({ id: 'med-1', severity: 'medium' }),
    finding({ id: 'high-2', severity: 'high', cost: { annualDeltaEur: 50_000 } }),
  ];
  const all = selectFindingAnnotations({ dfm: GEO, results: [{ findings }] });
  assert.deepEqual(all.annotations.map(a => a.ruleId), ['high-2', 'high-1', 'med-1', 'low-1']);
  assert.equal(all.droppedByCap, 0);

  const capped = selectFindingAnnotations({ dfm: GEO, results: [{ findings }] }, { max: 2 });
  assert.deepEqual(capped.annotations.map(a => a.ruleId), ['high-2', 'high-1']);
  assert.equal(capped.droppedByCap, 2);
});

test('low-severity failures are marked when there is room — the cap declutters, not a severity cut', () => {
  // If a severity floor did the decluttering, the picture would silently omit a
  // row the findings table shows, and the two would contradict each other.
  const out = selectFindingAnnotations({
    dfm: GEO, results: [{ findings: [finding({ id: 'only', severity: 'low' })] }],
  });
  assert.deepEqual(out.annotations.map(a => a.ruleId), ['only']);
});

test('a whole-part measure is NAMED as unlocatable with its reason, never pinned', () => {
  const out = selectFindingAnnotations({
    dfm: GEO,
    results: [{ findings: [finding({ id: 'tol', measure: 'tightestToleranceMm' })] }],
  });
  assert.equal(out.annotations.length, 0);
  assert.equal(out.notLocated.length, 1);
  assert.match(out.notLocated[0].reason, /whole part/);
});

test('a locatable measure with no coordinates says the ENGINE returned none', () => {
  const out = selectFindingAnnotations({
    dfm: { draft: { undercutRegions: [{ faceId: 1, areaMm2: 5 }] } },  // no centroidXYZ
    results: [{ findings: [finding()] }],
  });
  assert.equal(out.annotations.length, 0);
  assert.match(out.notLocated[0].reason, /no coordinates/);
});

test('the marker carries the measurement against its own limit', () => {
  const out = selectFindingAnnotations({
    dfm: GEO,
    results: [{ findings: [finding({ measured: 41.2, unit: '% of wall area', thresholdText: '<= 5 % of wall area' })] }],
  });
  // The unit is said ONCE. Repeating it pushed the legend past its column and
  // truncated away the limit itself — the half of the line a reader needs.
  assert.equal(out.annotations[0].value, '41.2 % of wall area  ·  limit <= 5');
});

test('a limit that does not end in the unit is left exactly as written', () => {
  const out = selectFindingAnnotations({
    dfm: GEO,
    results: [{ findings: [finding({ measured: 30, unit: 'mm', thresholdText: '1-3.5 mm range' })] }],
  });
  assert.equal(out.annotations[0].value, '30 mm  ·  limit 1-3.5 mm range');
});

test('findings from every process family are collected, not just the first', () => {
  const out = selectFindingAnnotations({
    dfm: GEO,
    results: [
      { findings: [finding({ id: 'a', severity: 'medium' })] },
      { findings: [finding({ id: 'b', severity: 'high' })] },
    ],
  });
  assert.deepEqual(out.annotations.map(a => a.ruleId), ['b', 'a']);
});

test('an empty or malformed analysis produces nothing rather than throwing', () => {
  for (const bad of [undefined, null, {}, { results: null }, { results: [{}] }]) {
    const out = selectFindingAnnotations(bad);
    assert.deepEqual(out.annotations, []);
    assert.deepEqual(out.notLocated, []);
  }
});

test('the default cap is a readable number of markers', () => {
  assert.ok(ANNOTATION_CAP >= 5 && ANNOTATION_CAP <= 12, 'a view with 30 rings is not evidence');
});

// ── The second view ────────────────────────────────────────────────────────
test('no second view when the ISO shows everything', () => {
  assert.equal(chooseSecondView([], { front: ['a'], top: ['b'] }), null);
});

test('the second view is the one that reveals the MOST missing anchors', () => {
  const best = chooseSecondView(['a', 'b', 'c'], {
    front: ['a'],
    top: ['a', 'b'],
    bottom: ['z'],
  });
  assert.equal(best.view, 'top');
  assert.deepEqual(best.reveals, ['a', 'b']);
});

test('no second view when no candidate reveals anything missing', () => {
  assert.equal(chooseSecondView(['a'], { front: ['x'], top: ['y'] }), null);
});

test('ties break deterministically, so two runs render the same report', () => {
  const a = chooseSecondView(['m'], { top: ['m'], front: ['m'] });
  const b = chooseSecondView(['m'], { front: ['m'], top: ['m'] });
  assert.equal(a.view, 'front');
  assert.equal(b.view, 'front');
});

// ── The five that used to have nowhere to point ────────────────────────────
//
// Each of these measures HAPPENS AT A PLACE. They were filed as "whole part"
// because the kernel took a minimum and threw the face away, which made the
// classification true by construction rather than by physics. The kernel now
// keeps the face; these prove the report uses it.

const SHEET = {
  geometry: {
    featureTable: [
      { kind: 'hole', diaMm: 12, axisPointXYZ: [50, 0, 0] },
      { kind: 'hole', diaMm: 3.2, axisPointXYZ: [11, 22, 33] },
      { kind: 'boss', diaMm: 1, axisPointXYZ: [0, 0, 0] },
    ],
  },
  dfm: {
    features: {
      internalCorners: [
        { faceId: 70, radiusMm: 4.0, centroidXYZ: [1, 0, 0] },
        { faceId: 71, radiusMm: 0.8, centroidXYZ: [2, 3, 4] },
      ],
    },
    sheetMetal: {
      minHoleToHoleAtXYZ: [5, 6, 7],
      minHoleToEdgeAtXYZ: [8, 9, 10],
    },
    apertures: {
      apertures: [
        { equivalentDiaMm: 14.2, centroidXYZ: [40, 0, 0] },
        { equivalentDiaMm: 2.6, centroidXYZ: [60, 70, 80] },
      ],
    },
  },
};

test('the tightest internal corner is marked, not declared unlocatable', () => {
  const out = selectFindingAnnotations({
    ...SHEET,
    results: [{ findings: [finding({ measure: 'minInternalCornerRadiusMm' })] }],
  });
  assert.equal(out.notLocated.length, 0);
  assert.deepEqual(out.annotations[0].anchorXYZ, [2, 3, 4]);   // R0.8, not R4.0
  assert.deepEqual(out.annotations[0].faceIds, [71]);
  assert.match(out.annotations[0].note, /tightest of 2 corners, R0\.8/);
});

test('the narrowest web and the closest edge are single measured points', () => {
  const web = selectFindingAnnotations({
    ...SHEET, results: [{ findings: [finding({ measure: 'minHoleToHoleToThickness' })] }],
  });
  assert.deepEqual(web.annotations[0].anchorXYZ, [5, 6, 7]);
  assert.match(web.annotations[0].note, /narrowest web/);

  const edge = selectFindingAnnotations({
    ...SHEET, results: [{ findings: [finding({ measure: 'minHoleToEdgeToThickness' })] }],
  });
  assert.deepEqual(edge.annotations[0].anchorXYZ, [8, 9, 10]);
});

test('the smallest aperture and the smallest hole are found by size, not by list order', () => {
  const ap = selectFindingAnnotations({
    ...SHEET, results: [{ findings: [finding({ measure: 'minApertureToThickness' })] }],
  });
  assert.deepEqual(ap.annotations[0].anchorXYZ, [60, 70, 80]);   // 2.6, listed second

  const hole = selectFindingAnnotations({
    ...SHEET, results: [{ findings: [finding({ measure: 'minHoleDiaToThickness' })] }],
  });
  // The 3.2 hole. The 1 mm BOSS is smaller and must not be chosen — a punch
  // rule is about openings.
  assert.deepEqual(hole.annotations[0].anchorXYZ, [11, 22, 33]);
});

test('bend, flange and reach findings land on the feature the kernel measured', () => {
  const G = {
    dfm: {
      sheetMetal: {
        minBendRadiusAtXYZ: [1, 0, 0], minBendToBendAtXYZ: [2, 0, 0],
        minFlangeAtXYZ: [3, 0, 0], holeToBendAtXYZ: [4, 0, 0],
      },
      toolAccess: {
        unreachableRegions: [
          { areaMm2: 12, atXYZ: [9, 9, 9] },
          { areaMm2: 480, atXYZ: [5, 5, 5] },
        ],
      },
    },
  };
  const at = (measure) => selectFindingAnnotations({
    ...G, results: [{ findings: [finding({ measure })] }],
  }).annotations[0]?.anchorXYZ;
  assert.deepEqual(at('minBendRadiusToThickness'), [1, 0, 0]);
  assert.deepEqual(at('minBendToBendToThickness'), [2, 0, 0]);
  assert.deepEqual(at('minFlangeToThickness'), [3, 0, 0]);
  assert.deepEqual(at('holeToBendClearanceMm'), [4, 0, 0]);
  // Largest unreachable patch, not the first listed.
  assert.deepEqual(at('unreachableAreaPct'), [5, 5, 5]);
});

test('what is genuinely whole-part STAYS whole-part', () => {
  // Not everything moved. There is no face on the model where "three setups" is
  // true, and claiming one would be exactly the fault this module prevents.
  for (const measure of ['setupCount', 'tightestToleranceMm', 'wallP50Mm', 'slendernessLtoD']) {
    const out = selectFindingAnnotations({ ...SHEET, results: [{ findings: [finding({ measure })] }] });
    assert.equal(out.annotations.length, 0, measure);
    assert.match(out.notLocated[0].reason, /whole part/, measure);
  }
});

test('a sheet anchor the kernel did not produce is NOT invented', () => {
  const out = selectFindingAnnotations({
    dfm: { sheetMetal: {} },
    results: [{ findings: [finding({ measure: 'minHoleToHoleToThickness' })] }],
  });
  assert.equal(out.annotations.length, 0);
  assert.match(out.notLocated[0].reason, /no coordinates/);
});

// ── Which finding earns a section view ─────────────────────────────────────
test('a thin wall earns a cut; a draft angle does not', () => {
  const { annotations } = selectFindingAnnotations({
    dfm: GEO,
    results: [{
      findings: [
        finding({ id: 'draft', measure: 'wallAreaBelowDraftPct', severity: 'high' }),
        finding({ id: 'thin', measure: 'wallP5Mm', severity: 'medium' }),
      ],
    }],
  });
  // The draft finding is FIRST — higher severity — and must not be the one cut
  // for, because the whole point is which evidence is invisible from outside.
  assert.equal(annotations[0].ruleId, 'draft');
  assert.equal(sectionCandidate(annotations).ruleId, 'thin');
});

// ── HIGHLIGHTING: a finding must point at its own faces ────────────────────
//
// The regression these guard is one line. `locate()`'s instance branch returned
// `faceIds: []` unconditionally, so every finding anchored on an instance — all
// three rib measures, hole and boss slenderness, minimum feature size — arrived
// with a coordinate and nothing paintable. On screen that is a callout floating
// beside a part with nine ribs and no way to tell which one is 1.4x the wall.

test('a rib finding paints THE RIB — the instance carries its own faces', () => {
  const out = selectFindingAnnotations({
    dfm: GEO,
    results: [{
      findings: [finding({
        measure: 'maxRibThicknessToWall',
        instances: [
          { ratio: 1.6, thicknessMm: 6.5, atXYZ: [6, 0, 0], faceIds: [31, 32] },
          { ratio: 0.5, thicknessMm: 2.0, atXYZ: [4, 0, 0], faceIds: [30] },
        ],
        instanceTotal: 2,
      })],
    }],
  });
  // The WORST rib's faces, and not an empty list — which is what shipped.
  assert.deepEqual(out.annotations[0].faceIds, [31, 32]);
  assert.deepEqual(out.annotations[0].anchorXYZ, [6, 0, 0]);
});

test('hole and boss instances carry their bore walls too', () => {
  const at = (measure, faceIds) => selectFindingAnnotations({
    dfm: GEO,
    results: [{ findings: [finding({ measure, instances: [{ atXYZ: [1, 2, 3], faceIds }] })] }],
  }).annotations[0].faceIds;
  assert.deepEqual(at('maxHoleDepthToDia', [8]), [8]);
  assert.deepEqual(at('maxBossHeightToDia', [7]), [7]);
  // An instance the kernel gave no faces for stays empty rather than borrowing
  // somebody else's — the marker is still placed, on its coordinate.
  assert.deepEqual(at('maxHoleDepthToDia', undefined), []);
});

test('locateFinding resolves one finding and is NOT subject to the figure cap', () => {
  // Nine findings; the printed figure holds ANNOTATION_CAP of them. A reader who
  // clicks the ninth is asking about the ninth, and "the figure only had room
  // for eight" is not an answer to that question.
  const findings = Array.from({ length: 9 }, (_, i) => finding({ id: `f${i}` }));
  const analysis = { dfm: GEO, results: [{ findings }] };
  const picture = selectFindingAnnotations(analysis);
  assert.equal(picture.annotations.length, ANNOTATION_CAP);
  assert.ok(picture.droppedByCap > 0);

  const ninth = locateFinding(analysis, findings[8]);
  assert.equal(ninth.located, true);
  assert.deepEqual(ninth.faceIds, [12]);          // the 900 mm2 undercut
  assert.deepEqual(ninth.xyz, [5, 5, 5]);
});

test('locateFinding says WHY when it cannot place a finding — never an empty answer', () => {
  const whole = locateFinding({ dfm: GEO }, finding({ measure: 'setupCount' }));
  assert.equal(whole.located, false);
  assert.match(whole.reason, /whole part/);

  // A measure with no geometry source at all is a MAPPING gap, and says so —
  // distinct from "the engine measured it and returned no coordinates".
  const unmapped = locateFinding({ dfm: GEO }, finding({ measure: 'someMeasureNobodyMapped' }));
  assert.equal(unmapped.located, false);
  assert.match(unmapped.reason, /no geometry source/);

  const noCoords = locateFinding(
    { dfm: { draft: { undercutRegions: [{ faceId: 1, areaMm2: 5 }] } } }, finding());
  assert.equal(noCoords.located, false);
  assert.match(noCoords.reason, /no coordinates/);

  assert.equal(locateFinding({}, null).located, false);
});

test('an overhang finding paints the faces of the angle IT was measured at', () => {
  const G = {
    dfm: {
      overhang: {
        overhangFaceIdsByDeg: { 20: [], 30: [], 40: [1], 45: [1], 60: [1, 2] },
        overhangWorstAtXYZByDeg: { 20: null, 30: null, 40: [3, 3, 3], 45: [3, 3, 3], 60: [3, 3, 3] },
      },
    },
  };
  const run = (deg) => locateFinding(G, finding({ measure: 'overhangAreaBelowDeg', measuredAtDeg: deg }));
  // The analytic wedge case: 34% of the surface is below 40 degrees and NOTHING
  // is below 20. One shared face set would have painted the same faces for both
  // and contradicted the percentage the finding quotes.
  assert.deepEqual(run(45).faceIds, [1]);
  assert.deepEqual(run(60).faceIds, [1, 2]);
  assert.equal(run(20).located, false);
  // No cutoff on the finding means no guess about which one it meant.
  assert.equal(locateFinding(G, finding({ measure: 'overhangAreaBelowDeg' })).located, false);
});

test('unreachable surface paints the faces the sweep failed on', () => {
  const G = {
    dfm: {
      toolAccess: {
        unreachableRegions: [{ areaMm2: 480, atXYZ: [5, 5, 5] }],
        unreachableFaceIds: [15, 11, 14],
      },
    },
  };
  const out = locateFinding(G, finding({ measure: 'unreachableAreaPct' }));
  assert.equal(out.located, true);
  // Area-ranked as the kernel emitted them, not re-sorted into a tidy order —
  // worst first is the ranking the highlight and the callout both rely on.
  assert.deepEqual(out.faceIds, [15, 11, 14]);
});

test('a TRUNCATED highlight reports the true total, never just what it painted', () => {
  // The kernel caps these id lists at 40. Measured on a real part (PRCR012):
  // 67 faces the cutter cannot reach, 40 ids sent. A highlight that paints 40
  // and says "40 faces" has told the reader it showed them everything.
  const G = {
    dfm: {
      toolAccess: {
        unreachableRegions: [{ areaMm2: 480, atXYZ: [5, 5, 5] }],
        unreachableFaceIds: Array.from({ length: 40 }, (_, i) => i + 1),
        unreachableFaceCount: 67,
      },
    },
  };
  const out = locateFinding(G, finding({ measure: 'unreachableAreaPct' }));
  assert.equal(out.located, true);
  assert.equal(out.faceIds.length, 40);
  assert.equal(out.faceTotal, 67);

  // Nothing dropped => no total, so a caller cannot print a misleading "40 of
  // 40" and cannot be tempted to invent one.
  const whole = locateFinding({
    dfm: {
      toolAccess: {
        unreachableRegions: [{ areaMm2: 480, atXYZ: [5, 5, 5] }],
        unreachableFaceIds: [3, 4], unreachableFaceCount: 2,
      },
    },
  }, finding({ measure: 'unreachableAreaPct' }));
  assert.equal(whole.faceTotal, null);
});

test('a truncated overhang highlight reports the total for ITS cutoff', () => {
  const G = {
    dfm: {
      overhang: {
        overhangFaceIdsByDeg: { 45: [1, 2, 3] },
        overhangFaceCountByDeg: { 45: 9 },
        overhangWorstAtXYZByDeg: { 45: [1, 1, 1] },
      },
    },
  };
  const out = locateFinding(G, finding({ measure: 'overhangAreaBelowDeg', measuredAtDeg: 45 }));
  assert.deepEqual(out.faceIds, [1, 2, 3]);
  assert.equal(out.faceTotal, 9);
});

test('a circular aperture is joined to its bore wall; a slot is not given one', () => {
  const G = {
    geometry: { featureTable: [{ kind: 'hole', diaMm: 6, faceIds: [8] }] },
    dfm: {
      apertures: {
        apertures: [
          { equivalentDiaMm: 6, circleDiaMm: 6, circular: true, centroidXYZ: [1, 1, 1] },
        ],
      },
    },
  };
  assert.deepEqual(locateFinding(G, finding({ measure: 'minApertureToThickness' })).faceIds, [8]);

  // A slot's opening is a wire on a planar face. Painting that face would light
  // up the whole top of the plate to show a 3 mm slot, so it gets no faces —
  // the marker still lands on the opening.
  const slot = {
    ...G,
    dfm: { apertures: { apertures: [{ equivalentDiaMm: 3, circular: false, centroidXYZ: [2, 2, 2] }] } },
  };
  const out = locateFinding(slot, finding({ measure: 'minApertureToThickness' }));
  assert.equal(out.located, true);
  assert.deepEqual(out.faceIds, []);
  assert.deepEqual(out.xyz, [2, 2, 2]);
});

test('a fillet-margin finding points at the corner the margin was measured at', () => {
  for (const measure of ['resinFilletMargin', 'sfsaJunctionFilletMargin', 'nadcaFilletToWall']) {
    const out = locateFinding(SHEET, finding({ measure }));
    assert.equal(out.located, true, measure);
    assert.deepEqual(out.faceIds, [71], measure);        // R0.8, the tightest
    assert.deepEqual(out.xyz, [2, 3, 4], measure);
  }
});

test('no section when nothing marked is internal', () => {
  const { annotations } = selectFindingAnnotations({
    dfm: GEO, results: [{ findings: [finding({ measure: 'undercutFaceCount' })] }],
  });
  assert.equal(sectionCandidate(annotations), null);
  assert.equal(sectionCandidate([]), null);
});
