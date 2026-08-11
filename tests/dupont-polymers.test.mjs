// DuPont Module I (2000 ed.), PINNED — the injection-moulding design book
// as code. Table 3.01 and the printed §3 numbers are exact; Fig 4.07 was
// read from the page image and CONFIRMS the tool's existing 0.4/0.6 rib
// band, which is an audit hit worth its own assertion.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resinGroupFor, requiredDraftDeg, SHALLOW_DRAW_MAX_MM, filletRequirementMm,
  FILLET, BOSS_OD_TO_HOLE, BLIND_CORE, STRIP_UNDERCUT_PCT, RIB, THREADS, INSERTS,
} from '../dupont-polymers.mjs';
import { runDfmRules, extractMeasures } from '../dfm-rules.mjs';
import { DFM_RULES } from '../dfm-rule-catalogue.mjs';

const PA = 'PA6 (Nylon)';

test('the resin gate: Table 3.01 families in, everything else refused by name', () => {
  assert.equal(resinGroupFor('PA6 (Nylon)').group, 'nylon');
  assert.equal(resinGroupFor('PA66-GF30 (glass-filled)').group, 'reinforced nylon');
  assert.equal(resinGroupFor('POM (Acetal)').group, 'acetal');
  assert.equal(resinGroupFor('PET').group, 'pet');
  for (const m of ['ABS', 'Polycarbonate (PC)', 'Polypropylene (PP)', 'PBT', 'TPU (thermoplastic PU)']) {
    assert.equal(resinGroupFor(m).ok, false, `${m} is not in Table 3.01`);
  }
  assert.equal(resinGroupFor('Steel (mild)').ok, false);
  assert.match(resinGroupFor('Steel (mild)').reason, /metal/);
});

test('Table 3.01 draft, judged at the top of each printed range', () => {
  // Zytel: 0-1/8 shallow, 1/4-1/2 deep.
  assert.equal(requiredDraftDeg(PA, 20).deg, 0.13);
  assert.equal(requiredDraftDeg(PA, 100).deg, 0.5);
  // The printed boundary is exactly 1 in.
  assert.equal(requiredDraftDeg(PA, SHALLOW_DRAW_MAX_MM).band, 'shallow');
  assert.equal(requiredDraftDeg(PA, SHALLOW_DRAW_MAX_MM + 0.1).band, 'deep');
  // Delrin 0-1/4 / 1/2; reinforced nylon and Rynite 1/2 / 1.
  assert.equal(requiredDraftDeg('POM (Acetal)', 20).deg, 0.25);
  assert.equal(requiredDraftDeg('POM (Acetal)', 100).deg, 0.5);
  assert.equal(requiredDraftDeg('PA66-GF30 (glass-filled)', 100).deg, 1.0);
  assert.equal(requiredDraftDeg('PET', 20).deg, 0.5);
  // Texture adds the printed 1 deg per 0.001 in of depth.
  const textured = requiredDraftDeg(PA, 20, { textureDepthMm: 0.0508 });
  assert.ok(Math.abs(textured.deg - (0.125 + 2)) < 0.01, `got ${textured.deg}`);
  assert.match(textured.basis, /texture/i);
  // Non-DuPont resins refuse.
  assert.equal(requiredDraftDeg('ABS', 20).ok, false);
});

test('the fillet knee and the printed 0.508 mm floor', () => {
  assert.equal(filletRequirementMm(3).requiredMm, 1.5, 'half the wall at the R/T = 0.5 knee');
  assert.equal(filletRequirementMm(0.8).requiredMm, 0.51, 'the floor holds on thin walls');
  assert.equal(FILLET.minMm, 0.508);
});

test('the printed constants, verbatim', () => {
  assert.deepEqual([BOSS_OD_TO_HOLE.min, BOSS_OD_TO_HOLE.max], [2.0, 2.5]);
  assert.equal(BLIND_CORE.maxDepthToDia, 2);
  assert.ok(Math.abs(BLIND_CORE.bottomMinDiaRatio - 1 / 6) < 1e-9);
  assert.equal(STRIP_UNDERCUT_PCT.acetal.maxPct, 5);
  assert.equal(STRIP_UNDERCUT_PCT.nylon.maxPct, 10);
  assert.deepEqual([STRIP_UNDERCUT_PCT.reinforced.coldMoldPct, STRIP_UNDERCUT_PCT.reinforced.hotMoldPct], [1, 2]);
  assert.deepEqual([RIB.thicknessToWallAppearance, RIB.thicknessToWallStructure, RIB.thicknessToWallFoam], [0.4, 0.6, 1.0]);
  assert.equal(RIB.baseFilletToRibThickness, 0.5);
  assert.equal(THREADS.endClearanceMm, 0.8);
  assert.equal(THREADS.avoidFinerThanPitch, 32);
  assert.equal(INSERTS.protrusionMinMm, 0.41);
});

test('Fig 4.07 CONFIRMS the existing rib band — thresholds unchanged, grade upgraded', () => {
  const max = DFM_RULES.find((r) => r.id === 'im-rib-thickness-max');
  const min = DFM_RULES.find((r) => r.id === 'im-rib-thickness-min');
  assert.equal(max.threshold, 0.6, 'the structural figure, exactly as before the book arrived');
  assert.equal(min.threshold, 0.4, 'the appearance figure');
  assert.equal(max.sourceStatus, 'standard-named');
  assert.match(max.source, /Fig 4\.07/);
  // The stricter resin-specific bands stand, on their OWN grade.
  assert.equal(max.byMaterial['PA6 (Nylon)'].threshold, 0.5);
  assert.equal(max.byMaterial['PA6 (Nylon)'].sourceStatus, 'industry-consensus');
});

// ── Through the rule engine ─────────────────────────────────────────────────

function moulding(material, { histogram = { 0.5: 200, 2: 800 }, featureTable = [], blindLD = null } = {}) {
  if (blindLD) featureTable.push({ kind: 'hole', diaMm: 5, depthMm: 5 * blindLD, through: false });
  return {
    boundingBox: { xMm: 80, yMm: 60, zMm: 20 },
    featureTable,
    geometry: { boundingBox: { xMm: 80, yMm: 60, zMm: 20 }, featureTable },
    dfm: {
      wallThickness: { p5Mm: 1.8, p50Mm: 2, p95Mm: 2.2, spreadRatio: 0.2 },
      draft: { drawDirectionXYZ: [0, 0, 1], undercutFaceCount: 0, draftHistogramDegToAreaMm2: histogram,
        wallAreaBelowMinDraftPct: 20, wallAreaBelowDraftPct: { 1: 20, 2: 100 } },
      features: { ribs: [], minInternalCornerRadiusMm: 0.4, prismatic: [] },
      setups: {},
    },
  };
}

test('draft is judged at the Table 3.01 angle for a named resin, and says so', () => {
  // 20 mm draw on nylon → shallow band, 0.13 deg. The histogram has 20% of
  // area below 0.5 deg — at a 0.13 deg cutoff little of it counts, so the
  // rule reads a DIFFERENT number than the generic 1 deg would.
  const geo = moulding(PA, { histogram: { 0.05: 30, 0.5: 170, 2: 800 } });
  const r = runDfmRules(geo, 'injection-moulding', { material: PA });
  const f = [...r.findings, ...r.passed].find((x) => x.id === 'im-draft-minimum');
  assert.ok(f, 'the draft rule must evaluate');
  assert.match(f.unit, /0\.13°/);
  assert.match(f.measuredBasis, /Table 3\.01/);
  assert.equal(f.sourceStatus, 'standard-named', 'the byMaterial entry carries the grade');
  // ABS keeps the generic 1 degree path and the generic grade.
  const abs = runDfmRules(moulding('ABS'), 'injection-moulding', { material: 'ABS' });
  const fAbs = [...abs.findings, ...abs.passed].find((x) => x.id === 'im-draft-minimum');
  assert.ok(fAbs);
  assert.match(fAbs.unit, /1°/);
  assert.equal(fAbs.measuredBasis, undefined);
});

test('the fillet rule fires on a sharp-cornered nylon part and abstains on ABS', () => {
  // 0.4 mm corner vs required max(0.5*2, 0.508) = 1 mm → margin 0.4, FAIL.
  const m = extractMeasures(moulding(PA), { material: PA });
  assert.ok(m.dupontFilletMargin < 1, `0.4 vs 1.0 must fail, got ${m.dupontFilletMargin}`);
  assert.equal(m._dupontFillet.requiredMm, 1);
  const r = runDfmRules(moulding(PA), 'injection-moulding', { material: PA });
  const f = r.findings.find((x) => x.id === 'im-internal-radius');
  assert.ok(f);
  assert.match(f.source, /0\.508/);
  const abs = extractMeasures(moulding('ABS'), { material: 'ABS' });
  assert.equal(abs.dupontFilletMargin, undefined);
  assert.match(abs._dupontBasis, /Table 3\.01/);
});

test('boss OD: the two-sided 2-2.5x band on the worst coaxial pair', () => {
  const boss = { kind: 'boss', diaMm: 30, axisXYZ: [0, 0, 1], axisPointXYZ: [10, 10, 0] };
  const hole = { kind: 'hole', diaMm: 10, axisXYZ: [0, 0, 1], axisPointXYZ: [10, 10, 0] };
  const fat = runDfmRules(moulding(PA, { featureTable: [boss, hole] }), 'injection-moulding', { material: PA });
  const f = fat.findings.find((x) => x.id === 'im-boss-od');
  assert.ok(f, '3x is past the 2.5 ceiling');
  const good = runDfmRules(moulding(PA, { featureTable: [{ ...boss, diaMm: 22 }, hole] }), 'injection-moulding', { material: PA });
  assert.ok(good.passed.some((x) => x.id === 'im-boss-od'), '2.2x sits inside the band');
  // No pair recognised → abstain, never guess.
  const bare = runDfmRules(moulding(PA), 'injection-moulding', { material: PA });
  assert.ok(bare.notEvaluated.some((x) => x.id === 'im-boss-od'));
});

test('blind holes past twice their diameter fail; the measure is resin-independent', () => {
  const deep = runDfmRules(moulding('ABS', { blindLD: 3 }), 'injection-moulding', { material: 'ABS' });
  const f = deep.findings.find((x) => x.id === 'im-blind-core-depth');
  assert.ok(f, 'L/D 3 fails the printed 2 even on a resin Table 3.01 does not name');
  const ok = runDfmRules(moulding('ABS', { blindLD: 1.5 }), 'injection-moulding', { material: 'ABS' });
  assert.ok(ok.passed.some((x) => x.id === 'im-blind-core-depth'));
});

test('metals get nothing from the DuPont measures, and the NADCA boss rule still fires', () => {
  const m = extractMeasures(moulding('Steel (mild)'), { material: 'Steel (mild)' });
  assert.equal(m.dupontFilletMargin, undefined);
  assert.equal(m.dupontWallAreaBelowDraftPct, undefined);
  // The shared coaxial-pair helper must not have changed the NADCA side: an
  // aluminium die casting with a 30 mm boss on a 10 mm hole still measures 3.
  const alu = {
    boundingBox: { xMm: 100, yMm: 80, zMm: 30 },
    geometry: { boundingBox: { xMm: 100, yMm: 80, zMm: 30 },
      featureTable: [
        { kind: 'boss', diaMm: 30, axisXYZ: [0, 0, 1], axisPointXYZ: [5, 5, 0] },
        { kind: 'hole', diaMm: 10, axisXYZ: [0, 0, 1], axisPointXYZ: [5, 5, 0] },
      ] },
    dfm: {
      wallThickness: { p5Mm: 2.4, p50Mm: 2.5, p95Mm: 2.6 },
      draft: { drawDirectionXYZ: [0, 0, 1], draftHistogramDegToAreaMm2: { 5: 1000 }, undercutFaceCount: 0 },
      features: { prismatic: [] }, setups: {},
    },
  };
  const am = extractMeasures(alu, { material: 'Aluminium A380 / ADC12 (die-cast)' });
  assert.equal(am.nadcaBossDiaToHoleDia, 3, 'the NADCA measure is unchanged by the refactor');
  assert.equal(am.dupontBossOdToHole, undefined, 'and the DuPont one stays off metals');
});
