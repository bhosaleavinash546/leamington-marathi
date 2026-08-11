// Covestro "Part and Mold Design", PINNED. The digit font in the user's copy
// does not extract, so every number here was read from the rendered page
// images — Table 2-1 and Fig 2-10 (p.25), pp.28, 31, 32, 34 — and these
// tests pin what the pages print.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  covestroResinFor, RIB_TABLE, RIB_GEOMETRY, FILLET, requiredDraftDeg,
  filletRequirementMm, BOSS, STRIP_UNDERCUT_PCT,
} from '../covestro-polymers.mjs';
import { runDfmRules, extractMeasures } from '../dfm-rules.mjs';
import { DFM_RULES } from '../dfm-rule-catalogue.mjs';

const PC = 'Polycarbonate (PC)';

test('the resin gate: PC families and TPU in, everything else refused', () => {
  assert.equal(covestroResinFor(PC).group, 'pc');
  assert.equal(covestroResinFor('PC/ABS blend').group, 'pc-abs');
  assert.equal(covestroResinFor('TPU (thermoplastic PU)').group, 'tpu');
  for (const m of ['PA6 (Nylon)', 'ABS', 'Polypropylene (PP)', 'PET', 'POM (Acetal)']) {
    assert.equal(covestroResinFor(m).ok, false, `${m} is not a Covestro family`);
  }
  assert.equal(covestroResinFor('Steel (mild)').ok, false);
});

test('the two resin gates are DISJOINT — no material is claimed by both books', async () => {
  const { resinGroupFor } = await import('../dupont-polymers.mjs');
  const materials = ['PA6 (Nylon)', 'PA66-GF30 (glass-filled)', 'POM (Acetal)', 'PET',
    'Polycarbonate (PC)', 'PC/ABS blend', 'TPU (thermoplastic PU)', 'ABS', 'Polypropylene (PP)', 'PBT'];
  for (const m of materials) {
    const both = resinGroupFor(m).ok && covestroResinFor(m).ok;
    assert.equal(both, false, `${m} must be claimed by at most one book`);
  }
});

test('Table 2-1 and the printed figures, verbatim', () => {
  assert.equal(RIB_TABLE.pc.minimalSink, 0.5);
  assert.equal(RIB_TABLE.pc.highGloss, 0.4);
  assert.equal(RIB_TABLE.pc.slightSink, 0.66);
  assert.equal(RIB_TABLE['pc-abs'].minimalSink, 0.5);
  assert.equal(RIB_TABLE.tpu.minimalSink, 0.5);
  assert.equal(RIB_GEOMETRY.baseRadiusToThickness, 0.125);
  assert.equal(RIB_GEOMETRY.minDraftPerSideDeg, 0.5);
  assert.equal(RIB_GEOMETRY.thinWallEqualMm, 1.0);
  assert.equal(FILLET.ratioToWall, 0.15);
  assert.equal(BOSS.maxHeightToOd, 5);
  assert.equal(BOSS.baseBlendMinMm, 0.38);
  assert.equal(STRIP_UNDERCUT_PCT.stiffMaxPct, 2);
  assert.deepEqual([STRIP_UNDERCUT_PCT.tpuTypicalPct, STRIP_UNDERCUT_PCT.tpuIdealPct], [5, 10]);
  assert.deepEqual(STRIP_UNDERCUT_PCT.leadAngleDeg, [30, 45]);
});

test('draft: 0.5 deg for PC-based, 3 deg for TPU — the printed minimum and preference', () => {
  assert.equal(requiredDraftDeg(PC).deg, 0.5);
  assert.equal(requiredDraftDeg('PC/ABS blend').deg, 0.5);
  assert.equal(requiredDraftDeg('TPU (thermoplastic PU)').deg, 3.0);
  assert.match(requiredDraftDeg('TPU (thermoplastic PU)').basis, /3 to 5/);
  assert.equal(requiredDraftDeg('ABS').ok, false);
});

test('the fillet compromise: 0.15x the wall', () => {
  assert.equal(filletRequirementMm(2).requiredMm, 0.3);
  assert.equal(filletRequirementMm(3).requiredMm, 0.45);
});

// ── Through the rule engine ─────────────────────────────────────────────────

function moulding(material, { histogram = { 0.3: 100, 2: 900 }, cornerMm = 0.2, ribs = [] } = {}) {
  return {
    boundingBox: { xMm: 80, yMm: 60, zMm: 20 },
    featureTable: [],
    geometry: { boundingBox: { xMm: 80, yMm: 60, zMm: 20 }, featureTable: [] },
    dfm: {
      wallThickness: { p5Mm: 1.8, p50Mm: 2, p95Mm: 2.2, spreadRatio: 0.2 },
      draft: { drawDirectionXYZ: [0, 0, 1], undercutFaceCount: 0, draftHistogramDegToAreaMm2: histogram,
        wallAreaBelowMinDraftPct: 20, wallAreaBelowDraftPct: { 1: 20, 2: 100 } },
      features: { ribs, minInternalCornerRadiusMm: cornerMm, prismatic: [] },
      setups: {},
    },
  };
}

test('PC draft is judged at the printed 0.5 deg, TPU at 3 — and the finding says so', () => {
  const pc = runDfmRules(moulding(PC), 'injection-moulding', { material: PC });
  const f = [...pc.findings, ...pc.passed].find((x) => x.id === 'im-draft-minimum');
  assert.ok(f);
  assert.match(f.unit, /0\.5°/);
  assert.match(f.measuredBasis, /one-half degree/);
  assert.equal(f.sourceStatus, 'standard-named');
  // TPU: the 3 deg ask makes the same histogram (10% below 0.3, all below 2)
  // read 100% — a fail the PC judgement does not produce.
  const tpu = runDfmRules(moulding('TPU (thermoplastic PU)'), 'injection-moulding', { material: 'TPU (thermoplastic PU)' });
  const ft = tpu.findings.find((x) => x.id === 'im-draft-minimum');
  assert.ok(ft, 'everything under 2 deg fails a 3 deg ask');
  assert.match(ft.unit, /3°/);
});

test('the PC fillet requirement is 0.15x wall — a 0.2 mm corner on a 2 mm wall fails', () => {
  const m = extractMeasures(moulding(PC), { material: PC });
  assert.equal(m._resinFillet.requiredMm, 0.3);
  assert.ok(m.resinFilletMargin < 1, `0.2 vs 0.3 must fail, got ${m.resinFilletMargin}`);
  assert.match(m._resinFillet.basis, /0\.15/);
  const r = runDfmRules(moulding(PC), 'injection-moulding', { material: PC });
  const f = r.findings.find((x) => x.id === 'im-internal-radius');
  assert.ok(f);
  assert.match(f.source, /Covestro/);
  // A 0.35 mm corner passes the Covestro ask (would FAIL DuPont's half-wall).
  const ok = extractMeasures(moulding(PC, { cornerMm: 0.35 }), { material: PC });
  assert.ok(ok.resinFilletMargin > 1);
});

test('Table 2-1 tightens the PC rib ceiling to 0.5 and it carries the maker grade', () => {
  const r = runDfmRules(moulding(PC, { ribs: [{ thicknessMm: 1.1, heightMm: 5 }] }), 'injection-moulding', { material: PC });
  const f = r.findings.find((x) => x.id === 'im-rib-thickness-max');
  assert.ok(f, 'a 0.55-ratio rib fails the printed 0.5 where the old 0.6 consensus passed it');
  assert.equal(f.threshold, 0.5);
  assert.equal(f.sourceStatus, 'standard-named');
  assert.match(f.source, /Table 2-1/);
});

test('boss height: two competing claims resolved sharpen-only, both named', () => {
  const rule = DFM_RULES.find((r) => r.id === 'im-boss-height');
  assert.equal(rule.threshold, 3, 'the generic screen stands for unnamed resins');
  // PC keeps the STRICTER notch-sensitivity 3x, with the maker's printed 5x
  // filling limit named in the source rather than silently overruled.
  assert.equal(rule.byMaterial[PC].threshold, 3);
  assert.match(rule.byMaterial[PC].source, /Covestro/);
  assert.match(rule.byMaterial[PC].source, /5x OD/);
  // PC/ABS and TPU have no notch screen, so the printed 5x governs them.
  assert.equal(rule.byMaterial['PC/ABS blend'].threshold, 5.0);
  assert.equal(rule.byMaterial['TPU (thermoplastic PU)'].sourceStatus, 'standard-named');
});
