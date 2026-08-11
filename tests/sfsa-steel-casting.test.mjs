// SFSA Steel Castings Handbook Supplement 1, PINNED — steel casting design
// rules as code. The printed numbers (6 mm floor, the Fig. 8 neutrality
// triple, the 13-25 mm fillet clamp, the 2.0 T boss cap) are exact and
// rule-grade; the digitized curves (Fig. 1, Fig. 30) carry a stated
// uncertainty and are tested for shape and bounds, never for false precision.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  castSteelGroupFor, minSectionMm, MIN_SECTION, junctionFilletMm,
  ribNeutralHeightLimit, RIB_SPACING_MIN_T1, BOSS, SECTION_CHANGE,
  EXTERNAL_CORNER, X_JUNCTION, recommendedTaper, minCoreDiaMm, JOBBING_DRAFT,
} from '../sfsa-steel-casting.mjs';
import { runDfmRules, extractMeasures } from '../dfm-rules.mjs';
import { DFM_RULES } from '../dfm-rule-catalogue.mjs';

const STEEL = 'Steel (mild)';

test('the material gate: steel yes, cast iron and everything else no', () => {
  assert.equal(castSteelGroupFor('Steel (mild)').ok, true);
  assert.equal(castSteelGroupFor('Stainless Steel 316L').group, 'high-alloy steel');
  // Cast iron gets its own refusal that says WHY, not a borrowed column.
  const iron = castSteelGroupFor('Cast Iron (Grey)');
  assert.equal(iron.ok, false);
  assert.match(iron.reason, /[Gg]raphite/);
  assert.equal(castSteelGroupFor('Aluminium A356 (cast)').ok, false);
  assert.equal(castSteelGroupFor(null).ok, false);
});

test('minimum section: the printed 6 mm floor holds to a 305 mm run, then the curve climbs', () => {
  assert.equal(MIN_SECTION.sandMm, 6);
  assert.equal(minSectionMm(100).requiredMm, 6);
  assert.equal(minSectionMm(305).requiredMm, 6);
  assert.equal(minSectionMm(305).digitized, false, 'inside the printed floor nothing is curve-derived');
  // Beyond the floor the requirement is monotonic and says it came from a curve.
  const at1270 = minSectionMm(1270);
  assert.equal(at1270.requiredMm, 12);
  assert.equal(at1270.digitized, true);
  assert.match(at1270.basis, /digitized/i);
  assert.ok(minSectionMm(2540).requiredMm > at1270.requiredMm);
  assert.equal(minSectionMm(99999).requiredMm, 28, 'the curve flattens; no extrapolation past the last printed point');
  // Investment is its own printed pair.
  assert.equal(MIN_SECTION.investmentCommonMm, 1.5);
  assert.equal(MIN_SECTION.investmentMinMm, 0.76);
});

test('junction fillet: r equals the thinner wall, clamped to the printed 13-25 mm band', () => {
  assert.equal(junctionFilletMm(8).requiredMm, 12.7, 'below the band the floor holds');
  assert.equal(junctionFilletMm(18).requiredMm, 18, 'inside the band the wall itself is the answer');
  assert.equal(junctionFilletMm(40).requiredMm, 25.4, 'the cap is real: a bigger fillet grows the (D/d)^2 hot spot');
});

test('rib neutrality reproduces the printed triple and refuses past 3/4', () => {
  assert.equal(ribNeutralHeightLimit(0.25).maxHeightToWall, 4);
  assert.equal(ribNeutralHeightLimit(0.5).maxHeightToWall, 1.5);
  assert.equal(ribNeutralHeightLimit(0.75).maxHeightToWall, 0.5);
  // Interpolated between printed points, monotonically decreasing.
  const mid = ribNeutralHeightLimit(0.375).maxHeightToWall;
  assert.ok(mid < 4 && mid > 1.5, `0.375 must land between the printed neighbours, got ${mid}`);
  // Past 3/4 the figure prints nothing — refuse, never extrapolate.
  assert.equal(ribNeutralHeightLimit(0.9).ok, false);
  assert.equal(RIB_SPACING_MIN_T1, 7);
});

test('the constants the figures print, verbatim', () => {
  assert.equal(BOSS.maxDiaToWall, 2.0);
  assert.equal(BOSS.spacingMinWalls, 3);
  assert.deepEqual(BOSS.minHeightByCastingLength.map((b) => b.heightMm), [6, 19, 25]);
  assert.equal(SECTION_CHANGE.taperDeg, 15);
  assert.equal(SECTION_CHANGE.minJoinRadiusMm, 25.4);
  assert.equal(SECTION_CHANGE.cylindricalFilletMaxRatio, 2.0);
  assert.deepEqual([EXTERNAL_CORNER.minRatio, EXTERNAL_CORNER.maxRatio], [0.1, 0.2]);
  assert.equal(X_JUNCTION.coredOpeningMinMm, 38.1);
  assert.equal(JOBBING_DRAFT.avgDeg, 0.5);
});

test('the taper equation, including the plate substitution W = 2T', () => {
  // Taper = -0.0164 W + 0.0648 T. For a plate (W = 2T): 0.032 T per unit length.
  const plate = recommendedTaper(2 * 20, 20);
  assert.ok(Math.abs(plate.taperPerUnit - 0.032 * 20 / 20 * 20) < 1e-6 || Math.abs(plate.taperPerUnit - (-0.0164 * 40 + 0.0648 * 20)) < 1e-6);
  // A wide thin member computes negative — meaning no taper is asked for.
  assert.ok(recommendedTaper(500, 10).taperPerUnit < 0);
});

test('core diameter curves: banded by length, monotonic in thickness, vertical -25%', () => {
  const thin = minCoreDiaMm(50, 100);
  const thick = minCoreDiaMm(200, 100);
  assert.ok(thick.minDiaMm > thin.minDiaMm, 'more surrounding metal needs a fatter core');
  const short = minCoreDiaMm(100, 100);
  const long = minCoreDiaMm(100, 800);
  assert.ok(long.minDiaMm > short.minDiaMm, 'a longer core needs a fatter core');
  const vert = minCoreDiaMm(100, 100, { vertical: true });
  assert.ok(Math.abs(vert.minDiaMm - 0.75 * short.minDiaMm) <= 1, 'vertical cores may be 25% smaller');
  assert.match(short.basis, /DIGITIZED/i);
  assert.equal(minCoreDiaMm(100, 2000).ok, false, 'past 914 mm the figure prints nothing');
});

// ── Through the rule engine ─────────────────────────────────────────────────

/** A steel sand casting: 8 mm walls, one rib, one boss, a long envelope. */
function steelCasting({ ribs = [], bossDiaMm = null, xMm = 200 } = {}) {
  const featureTable = bossDiaMm
    ? [{ kind: 'boss', diaMm: bossDiaMm, axisXYZ: [0, 0, 1], axisPointXYZ: [0, 0, 0] }] : [];
  return {
    boundingBox: { xMm, yMm: 120, zMm: 60 },
    geometry: { boundingBox: { xMm, yMm: 120, zMm: 60 }, featureTable },
    dfm: {
      wallThickness: { p5Mm: 7.5, p50Mm: 8, p95Mm: 8.5, spreadRatio: 0.12 },
      draft: { drawDirectionXYZ: [0, 0, 1], undercutFaceCount: 0, draftHistogramDegToAreaMm2: { 3: 1000 } },
      features: { ribs, minInternalCornerRadiusMm: 14, prismatic: [] },
      setups: {},
    },
  };
}

test('rib neutrality through the engine: worst rib named, coupled limit enforced', () => {
  // A 4 mm rib on an 8 mm wall (ratio 0.5) is neutral to 1.5 walls = 12 mm.
  // 30 mm tall is far past that; 10 mm is inside it.
  const tall = extractMeasures(steelCasting({ ribs: [{ thicknessMm: 4, heightMm: 30 }] }), { material: STEEL });
  assert.ok(tall.sfsaRibNeutralityMargin < 1, `30 mm on a 12 mm limit must fail, got ${tall.sfsaRibNeutralityMargin}`);
  assert.equal(tall._sfsaRibNeutrality.neutralHeightMm, 12);
  const ok = extractMeasures(steelCasting({ ribs: [{ thicknessMm: 4, heightMm: 10 }] }), { material: STEEL });
  assert.ok(ok.sfsaRibNeutralityMargin > 1);
  // The WORST rib governs when several are present.
  const both = extractMeasures(steelCasting({ ribs: [{ thicknessMm: 4, heightMm: 10 }, { thicknessMm: 4, heightMm: 30 }] }), { material: STEEL });
  assert.equal(both._sfsaRibNeutrality.heightMm, 30);
});

test('junction fillet and boss through the engine, and the sand rules fire', () => {
  // 14 mm measured corner vs a 13 mm requirement (wall 8 → clamped up) passes…
  const m = extractMeasures(steelCasting({}), { material: STEEL });
  assert.ok(m.sfsaJunctionFilletMargin > 1);
  // …and a 30 mm boss on an 8 mm wall is 3.75x — past the printed 2.0 cap.
  const r = runDfmRules(steelCasting({ bossDiaMm: 30, ribs: [{ thicknessMm: 4, heightMm: 30 }] }), 'sand-casting', { material: STEEL });
  const boss = r.findings.find((f) => f.id === 'sand-boss-dia');
  assert.ok(boss, 'the boss rule must fail at 3.75x');
  assert.equal(boss.sourceStatus, 'standard-named');
  const rib = r.findings.find((f) => f.id === 'sand-rib-thermal-neutrality');
  assert.ok(rib, 'the coupled rib rule must fail');
  assert.match(rib.source, /Fig\. 8/);
});

test('on aluminium the steel measures are absent and the steel rules abstain', () => {
  const m = extractMeasures(steelCasting({ ribs: [{ thicknessMm: 4, heightMm: 30 }] }), { material: 'Aluminium A356 (cast)' });
  assert.equal(m.sfsaRibNeutralityMargin, undefined);
  assert.equal(m.sfsaJunctionFilletMargin, undefined);
  assert.match(m._sfsaBasis, /steel/i);
  const r = runDfmRules(steelCasting({}), 'sand-casting', { material: 'Aluminium A356 (cast)' });
  assert.ok(r.notEvaluated.some((f) => f.id === 'sand-junction-fillet'));
});

test('cast iron keeps its own thresholds: the 6 mm steel floor must not leak', () => {
  const r = runDfmRules(steelCasting({}), 'sand-casting', { material: 'Cast Iron (Grey)' });
  const minSec = [...r.findings, ...r.passed].find((f) => f.id === 'sand-min-section');
  assert.ok(minSec, 'iron still gets judged');
  assert.equal(minSec.threshold, 4.0, 'the castiron family band, not the SFSA steel one');
});

test('the Fig. 1 curve SHARPENS the minimum-section threshold on a long steel part', () => {
  // 7.5 mm thinnest wall: passes the 6 mm floor on a 200 mm part, fails when
  // the run stretches to 1.27 m and the curve asks 12 mm.
  const short = runDfmRules(steelCasting({ xMm: 200 }), 'sand-casting', { material: STEEL });
  const shortRow = [...short.findings, ...short.passed].find((f) => f.id === 'sand-min-section');
  assert.equal(shortRow.status, 'pass');
  assert.equal(shortRow.threshold, 6);
  assert.equal(shortRow.sourceStatus, 'standard-named', 'the SFSA band carries its own grade');
  const long = runDfmRules(steelCasting({ xMm: 1270 }), 'sand-casting', { material: STEEL });
  const longRow = [...long.findings, ...long.passed].find((f) => f.id === 'sand-min-section');
  assert.equal(longRow.status, 'fail', '7.5 mm walls cannot run 1.27 m in steel');
  assert.equal(longRow.threshold, 12, 'the curve replaced the floor — sharpen-only');
});

test('every new rule id exists exactly once and is steel-scoped in its source', () => {
  for (const id of ['sand-rib-thermal-neutrality', 'sand-junction-fillet', 'sand-boss-dia']) {
    const matches = DFM_RULES.filter((r) => r.id === id);
    assert.equal(matches.length, 1, id);
    assert.match(matches[0].source, /SFSA/);
  }
});
