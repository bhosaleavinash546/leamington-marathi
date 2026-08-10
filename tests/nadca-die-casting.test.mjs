// THE NADCA DIE-CASTING BOOK, PINNED.
//
// Every constant here was read out of *Product Design for Die Casting*, NADCA
// 7th edition (2015), which the user supplied directly. The formula tests check
// against the book's OWN worked example rather than against my arithmetic —
// that is the only way to catch a misread of the table, and a misread is the
// realistic failure mode when a formula arrives through OCR.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DRAFT_CONSTANT, draftGroupFor, requiredDraftDeg, requiredCoredHoleDraftPerSideDeg,
  generalNoteDraft, areaBelowDraftPct, outsideCornerRadiusMm, junctionRadiiMm,
  SKIN, minWallForAlloyMm, asCastRoughnessUin, BOSS_DIA_TO_HOLE_DIA,
} from '../nadca-die-casting.mjs';
import { runDfmRules, extractMeasures } from '../dfm-rules.mjs';
import { DFM_RULES } from '../dfm-rule-catalogue.mjs';

const IN = 25.4;

test("the draft formula reproduces the book's own worked example", () => {
  // §3.1 p.46, aluminium INSIDE surface, C = 30. The book prints these three.
  for (const [depthIn, bookDeg] of [[0.1, 6.0], [1.0, 1.9], [5.0, 0.85]]) {
    const r = requiredDraftDeg('Aluminium A380 / ADC12 (die-cast)', depthIn * IN, 'inside');
    assert.ok(r.ok, `should compute at ${depthIn} in`);
    assert.ok(Math.abs(r.deg - bookDeg) < 0.06,
      `at ${depthIn} in the book says ${bookDeg}°, we say ${r.deg}°`);
  }
});

test('the general note reproduces the sentence the book draws from it', () => {
  // "an aluminium die casting with most features at least 1.0 inch deep can be
  // covered with a general note indicating 2° minimum draft on inside surfaces
  // and a 1° minimum on outside" — §3.1 p.46.
  const n = generalNoteDraft('Aluminium A380 / ADC12 (die-cast)', 1.0 * IN);
  assert.ok(n.ok);
  assert.ok(Math.abs(n.outsideDeg - 1.0) < 0.06, `outside should read ~1°, got ${n.outsideDeg}`);
  assert.ok(Math.abs(n.insideDeg - 2.0) < 0.11, `inside should read ~2°, got ${n.insideDeg}`);
  assert.ok(n.insideDeg > n.outsideDeg * 1.99, 'inside must be twice outside — the alloy shrinks ONTO ejector features');
});

test('the alloy constants are the four rows the book tabulates', () => {
  assert.deepEqual(DRAFT_CONSTANT.zinc, { inside: 50, outside: 100, holeTotal: 34 });
  assert.deepEqual(DRAFT_CONSTANT.magnesium, { inside: 35, outside: 70, holeTotal: 24 });
  assert.deepEqual(DRAFT_CONSTANT.aluminium, { inside: 30, outside: 60, holeTotal: 20 });
  assert.deepEqual(DRAFT_CONSTANT.copper, { inside: 25, outside: 50, holeTotal: 17 });
  // A larger C means LESS draft, so zinc needs the least of the four.
  const at = (m) => requiredDraftDeg(m, 25, 'outside').deg;
  assert.ok(at('Zinc (ZAMAK 3)') < at('Magnesium AZ91D (die-cast)'));
  assert.ok(at('Magnesium AZ91D (die-cast)') < at('Aluminium A380 / ADC12 (die-cast)'));
});

test('a cored hole takes HALF the tabulated angle, because the column is the total', () => {
  const perSide = requiredCoredHoleDraftPerSideDeg('Aluminium A380 / ADC12 (die-cast)', 25);
  const total = requiredDraftDeg('Aluminium A380 / ADC12 (die-cast)', 25, 'holeTotal');
  assert.ok(Math.abs(perSide.deg * 2 - total.deg) < 0.001, 'per side must be half the total');
  // Our old flat 2°/side was right at about 13 mm of bore depth and nowhere else.
  assert.ok(requiredCoredHoleDraftPerSideDeg('Aluminium A380 / ADC12 (die-cast)', 3).deg > 4,
    'a shallow bore needs far more than the old flat 2°');
  assert.ok(requiredCoredHoleDraftPerSideDeg('Aluminium A380 / ADC12 (die-cast)', 50).deg < 1.1,
    'a deep bore needs far less');
});

test('an alloy outside the four groups abstains rather than borrowing a neighbour', () => {
  for (const m of ['Steel (mild)', 'PA6 (Nylon)', 'CFRP (Carbon Fibre)', '', null]) {
    const g = draftGroupFor(m);
    assert.equal(g.ok, false, `${m} must not be given a die-casting draft constant`);
    assert.equal(requiredDraftDeg(m, 25, 'outside').ok, false);
  }
  // And a depth that could not be measured abstains too — never a default.
  assert.equal(requiredDraftDeg('Aluminium A380 / ADC12 (die-cast)', 0, 'outside').ok, false);
  assert.equal(requiredDraftDeg('Aluminium A380 / ADC12 (die-cast)', undefined, 'outside').ok, false);
});

test('area below a computed angle is interpolated inside the degree bucket', () => {
  // 100 mm² at 0-1°, 100 at 1-2°, 200 at 2-3°. Total 400.
  const h = { 0: 100, 1: 100, 2: 200 };
  assert.equal(areaBelowDraftPct(h, 1), 25);          // the first bucket entire
  assert.equal(areaBelowDraftPct(h, 2), 50);          // two buckets
  assert.equal(areaBelowDraftPct(h, 1.5), 37.5);      // half way through the second
  assert.equal(areaBelowDraftPct(h, 3), 100);
  assert.equal(areaBelowDraftPct(null, 1), undefined);
  assert.equal(areaBelowDraftPct(h, 0), undefined);
});

test('the fillet rules are ratios to wall, not a flat millimetre figure', () => {
  const rule = DFM_RULES.find((r) => r.id === 'hpdc-internal-radius');
  assert.equal(rule.measure, 'nadcaFilletToWall');
  assert.equal(rule.threshold, 1);
  assert.equal(rule.sourceStatus, 'standard-named');
  assert.match(rule.source, /Figure 3\.2/);

  // Figure 3.2: R2 = R1 + T at a uniform wall junction.
  assert.equal(outsideCornerRadiusMm(2, 3), 5);
  // R1 = sinΘ·T, R2 = (1/sinΘ)·T at an X or Y junction. At 90° both are T.
  const j90 = junctionRadiiMm(90, 3);
  assert.equal(j90.insideMm, 3);
  assert.equal(j90.outsideMm, 3);
  const j30 = junctionRadiiMm(30, 3);
  assert.equal(j30.insideMm, 1.5);       // sin30 = 0.5
  assert.equal(j30.outsideMm, 6);
});

test('the chilled skin caps machining stock at half a millimetre', () => {
  assert.equal(SKIN.minMm, 0.38);
  assert.equal(SKIN.maxMm, 0.50);
  const rule = DFM_RULES.find((r) => r.id === 'hpdc-machining-stock-skin');
  assert.equal(rule.threshold, 0.5);
  assert.match(rule.source, /Borland and Tsumagari/);
});

test('a boss must be twice the fastener it carries', () => {
  assert.equal(BOSS_DIA_TO_HOLE_DIA.min, 2);
  for (const id of ['hpdc-boss-wall', 'hpdc-zinc-boss-wall']) {
    const rule = DFM_RULES.find((r) => r.id === id);
    assert.ok(rule, `${id} must exist`);
    assert.equal(rule.measure, 'nadcaBossDiaToHoleDia');
    assert.equal(rule.threshold, 2);
    assert.equal(rule.severity, 'high');
  }
});

test('minimum wall moves with the alloy, and A380 is the anchor', () => {
  // A380 rates 2 on die-filling capacity, which is the alloy the old flat
  // number was written for — so it must come back unchanged.
  const a380 = minWallForAlloyMm('Aluminium A380 / ADC12 (die-cast)', 1.0);
  assert.ok(a380.ok);
  assert.equal(a380.minMm, 1.0);
  // A413 rates 1 (best) so it fills thinner; A360 rates 3 so it needs more.
  assert.ok(minWallForAlloyMm('Aluminium A413 (die-cast)', 1.0).minMm < 1.0);
  assert.ok(minWallForAlloyMm('Aluminium A360 (die-cast)', 1.0).minMm > 1.0);
  assert.equal(minWallForAlloyMm('Steel (mild)', 1.0).ok, false);
});

test('as-cast roughness is the over-die-life figure, not the new-die one', () => {
  const zinc = asCastRoughnessUin('Zinc (ZAMAK 3)');
  assert.equal(zinc.newDie, 32);
  assert.equal(zinc.overDieLife, 63, 'a die loses its finish as it heat-checks');
  assert.equal(asCastRoughnessUin('Aluminium A380 / ADC12 (die-cast)').overDieLife, 125);
  assert.equal(asCastRoughnessUin('Steel (mild)').ok, false);
});

// ── The rule engine, end to end ─────────────────────────────────────────────

/**
 * A SHALLOW aluminium casting — 10 mm along the draw — whose walls are barely
 * drafted. Shallow on purpose: the required angle FALLS as depth rises, so only
 * a shallow part produces a NADCA figure stricter than the published constant,
 * and only then does the computed cutoff take over.
 */
const SHALLOW_DRAFT = {
  boundingBox: { xMm: 10, yMm: 90, zMm: 90 },
  dfm: {
    wallThickness: { p5Mm: 2.4, p50Mm: 2.5, p95Mm: 2.6, spreadRatio: 0.08 },
    draft: {
      drawDirectionXYZ: [1, 0, 0],
      wallAreaBelowMinDraftPct: 60,
      wallAreaBelowDraftPct: { 0.5: 55, 1: 60, 1.5: 64, 2: 68, 3: 72, 5: 80, 7: 85 },
      // 60% of the area sits in the first degree, which is where a computed
      // requirement of ~0.76° lands.
      draftHistogramDegToAreaMm2: { 0: 6000, 1: 400, 2: 400, 3: 400, 5: 2800 },
      undercutFaceCount: 0,
    },
    features: { prismatic: [], minInternalCornerRadiusMm: 1.8 },
    setups: {},
  },
};

test('the draft cutoff is computed from the alloy and the part depth', () => {
  const withAlloy = extractMeasures(SHALLOW_DRAFT, { material: 'Aluminium A380 / ADC12 (die-cast)' });
  assert.ok(withAlloy._nadcaDraft?.ok, 'a die-casting alloy and a draw depth must produce a general note');
  // 10 mm along the draw, aluminium outside: 57.2738 / (60 · √(10/25.4)) ≈ 1.52°
  assert.ok(Math.abs(withAlloy._nadcaDraft.outsideDeg - 1.52) < 0.02,
    `expected ~1.52°, got ${withAlloy._nadcaDraft.outsideDeg}`);
  assert.ok(withAlloy._nadcaDraft.insideDeg > 3, 'an inside surface needs twice as much');

  const r = runDfmRules(SHALLOW_DRAFT, 'hpdc', { material: 'Aluminium A380 / ADC12 (die-cast)' });
  const draft = [...r.findings, ...r.passed].find((f) => f.id === 'hpdc-draft-minimum');
  assert.ok(draft, 'the draft rule must still be evaluated');
  assert.match(draft.unit, /under 1\.52°/, 'the angle must travel in the unit');
  assert.ok(draft.computedThreshold, 'the report must say the limit was computed, not published');
  assert.match(draft.computedThreshold, /57\.2738/);
});

test('NADCA may sharpen the draft rule but never soften it', () => {
  // The formula takes the depth of the FEATURE, and the deepest thing the
  // engine can measure is the part's own extent along the draw — an upper
  // bound, which returns the LEAST draft the part could need. On a deep part
  // that came out at 0.42° against the 1° we publish, which would have made the
  // rule quietly more permissive in the name of being more accurate.
  const deep = JSON.parse(JSON.stringify(SHALLOW_DRAFT));
  deep.boundingBox.xMm = 133;
  const m = extractMeasures(deep, { material: 'Aluminium A380 / ADC12 (die-cast)' });
  assert.ok(m._nadcaDraft.outsideDeg < 1, 'the formula does return less than 1° on a deep part');

  const r = runDfmRules(deep, 'hpdc', { material: 'Aluminium A380 / ADC12 (die-cast)' });
  const draft = [...r.findings, ...r.passed].find((f) => f.id === 'hpdc-draft-minimum');
  assert.match(draft.unit, /under 1°/, 'the published 1° must hold the line');
  assert.equal(draft.computedThreshold, undefined, 'and nothing may claim to have been computed');
});

test('without an alloy the rule falls back to its published constant, not to silence', () => {
  // The regression this guards: an earlier version moved the rule onto a
  // NADCA-only measure and every part analysed without a material lost its
  // draft finding altogether — trading a slightly wrong answer for no answer.
  const r = runDfmRules(SHALLOW_DRAFT, 'hpdc');
  const draft = [...r.findings, ...r.passed, ...r.notEvaluated].find((f) => f.id === 'hpdc-draft-minimum');
  assert.ok(draft, 'the rule must exist in one of the three states');
  assert.notEqual(draft.status, 'not-evaluated', 'it must still be judged on the published 1°');
  assert.match(draft.unit, /under 1°/);
  assert.equal(draft.computedThreshold, undefined, 'nothing was computed, so nothing may claim to be');
});

test('a cored hole is judged at its own depth, and the threshold says so', () => {
  const part = {
    boundingBox: { xMm: 40, yMm: 90, zMm: 90 },
    dfm: {
      wallThickness: { p5Mm: 2.4, p50Mm: 2.5, p95Mm: 2.6, spreadRatio: 0.08 },
      draft: {
        drawDirectionXYZ: [1, 0, 0],
        wallAreaBelowDraftPct: { 1: 0 },
        draftHistogramDegToAreaMm2: { 5: 1000 },
        undercutFaceCount: 0,
        coredHoles: {
          count: 1,
          minDraftPerSideDeg: 1.5,
          // r = 5 mm, area = 2·pi·5·6 → a 6 mm deep bore. NADCA wants
          // 57.2738 / (20·√(6/25.4)) / 2 ≈ 2.95° per side, so 1.5 must fail.
          bores: [{ faceId: 1, draftPerSideDeg: 1.5, radiusMm: 5, areaMm2: 2 * Math.PI * 5 * 6 }],
        },
      },
      features: { prismatic: [], minInternalCornerRadiusMm: 3 },
      setups: {},
    },
  };
  const r = runDfmRules(part, 'hpdc', { material: 'Aluminium A380 / ADC12 (die-cast)' });
  const hole = r.findings.find((f) => f.id === 'hpdc-cored-hole-draft');
  assert.ok(hole, `a 1.5° bore 6 mm deep must fail; got ${r.findings.map((f) => f.id).join(', ')}`);
  assert.ok(Math.abs(hole.threshold - 2.95) < 0.05,
    `threshold should be the ~2.95° NADCA computes at 6 mm, got ${hole.threshold}`);
  assert.match(hole.computedThreshold, /Hole, Total|holeTotal|total included angle/i);

  // A DEEP bore: NADCA asks only ~0.93° per side at 60 mm, which is looser than
  // the 2° we publish — so the published figure holds and the computed one is
  // discarded. The bore still fails, and the threshold is the published 2°.
  const deep = JSON.parse(JSON.stringify(part));
  deep.dfm.draft.coredHoles.bores[0].areaMm2 = 2 * Math.PI * 5 * 60;   // 60 mm deep
  const r2 = runDfmRules(deep, 'hpdc', { material: 'Aluminium A380 / ADC12 (die-cast)' });
  const deepHole = r2.findings.find((f) => f.id === 'hpdc-cored-hole-draft');
  assert.ok(deepHole, 'a 1.5° bore still fails the published 2°');
  assert.equal(deepHole.threshold, 2, 'the published figure holds where the formula is looser');
  assert.equal(deepHole.computedThreshold, undefined);
});

test('the declared inputs stay absent until they are declared', () => {
  const bare = extractMeasures(SHALLOW_DRAFT, { material: 'Aluminium A380 / ADC12 (die-cast)' });
  assert.equal(bare.nadcaMachiningStockToSkinMm, undefined);
  assert.equal(bare.nadcaRoughnessMargin, undefined);
  const r = runDfmRules(SHALLOW_DRAFT, 'hpdc', { material: 'Aluminium A380 / ADC12 (die-cast)' });
  const skin = r.notEvaluated.find((f) => f.id === 'hpdc-machining-stock-skin');
  assert.ok(skin, 'undeclared machining stock must be NOT EVALUATED, never a pass');

  const declared = extractMeasures(SHALLOW_DRAFT, {
    material: 'Aluminium A380 / ADC12 (die-cast)', machiningStockMm: 1.2, surfaceRoughnessUin: 40,
  });
  assert.equal(declared.nadcaMachiningStockToSkinMm, 1.2);
  const r2 = runDfmRules(SHALLOW_DRAFT, 'hpdc', {
    material: 'Aluminium A380 / ADC12 (die-cast)', machiningStockMm: 1.2, surfaceRoughnessUin: 40,
  });
  assert.ok(r2.findings.some((f) => f.id === 'hpdc-machining-stock-skin'),
    '1.2 mm of stock cuts well through a 0.5 mm skin and must fail');
});
