// DIN 16742:2013-10 — plastics moulded part tolerances, PINNED.
//
// The last catalogue purchase the register named: the tolerance tables the
// plastics industry actually quotes against, replacing DIN 16901. These
// tests pin the printed spot values, reproduce the standard's own Annex G
// worked example (TG4 at DP 84,13 mm → ±0,32 mm), and exercise the engine
// paths: the injection-moulding capability computed per resin and dimension,
// the rotomoulding TG9 rule the family never had, and the honest refusals.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tgToleranceMm, tgTightestPromiseMm, dinProfileToleranceMm, dinTgFor,
  dinMaterials, ROTOMOULDING_TG, DIN_SIZE_BANDS_MM,
} from '../din-16742.mjs';
import { runDfmRules, extractMeasures } from '../dfm-rules.mjs';

const PC = 'Polycarbonate (PC)';

test('Table 2 reproduces the printed worked example and spot values', () => {
  // Annex G, printed in the standard itself: "When indicating DIN 16742 -
  // TG4 the dimension 12,45 mm receives the tolerance ± 0,32 mm" with
  // DP = 84,13 mm as the nominal size (80-120 band, NW column).
  const g = tgToleranceMm(84.13, 4);
  assert.equal(g.plusMinusMm, 0.32);
  assert.equal(g.totalBandMm, 0.64);
  // The same cell in the tool-specific column is one band tighter.
  assert.equal(tgToleranceMm(84.13, 4, { toolSpecific: true }).plusMinusMm, 0.23);
  // Spot cells across the table.
  assert.equal(tgToleranceMm(50, 6).plusMinusMm, 0.37);    // TG6 NW, 30-50
  assert.equal(tgToleranceMm(50, 6, { toolSpecific: true }).plusMinusMm, 0.31);
  assert.equal(tgToleranceMm(18, 9).plusMinusMm, 0.90);    // TG9, 10-18
  assert.equal(tgToleranceMm(1000, 9).plusMinusMm, 11.50); // TG9, last band
  assert.equal(tgToleranceMm(2, 1, { toolSpecific: true }).plusMinusMm, 0.007);
  // '-' cells refuse: TG1 prints nothing past 120 mm.
  assert.equal(tgToleranceMm(200, 1).ok, false);
  // Under 1 mm and over 1000 mm are "subject to mandatory agreement".
  assert.match(tgToleranceMm(0.5, 5).reason, /mandatory agreement/);
  assert.match(tgToleranceMm(1500, 5).reason, /mandatory agreement/);
  assert.equal(tgToleranceMm(50, 10).ok, false, 'TG10 is not a group');
});

test('the NW column IS the W column shifted one size band — the printed structure holds', () => {
  // Table 2's construction: a non-tool-specific dimension is allowed the
  // tool-specific value of the NEXT band up. If a transcription error crept
  // into either column this structural check breaks.
  for (let tg = 1; tg <= 8; tg++) {
    for (let i = 0; i < DIN_SIZE_BANDS_MM.length - 1; i++) {
      const nw = tgToleranceMm(DIN_SIZE_BANDS_MM[i], tg);
      const wNext = tgToleranceMm(DIN_SIZE_BANDS_MM[i + 1], tg, { toolSpecific: true });
      if (nw.ok && wNext.ok) {
        assert.equal(nw.plusMinusMm, wNext.plusMinusMm,
          `TG${tg}: NW at band ${DIN_SIZE_BANDS_MM[i]} must equal W at band ${DIN_SIZE_BANDS_MM[i + 1]}`);
      }
    }
  }
});

test('a declared band with no dimension is judged at the tightest value the group ever tabulates', () => {
  assert.equal(tgTightestPromiseMm(5).totalBandMm, 0.16);   // TG5 NW 1-3: ±0.08
  assert.equal(tgTightestPromiseMm(9).totalBandMm, 0.6);    // TG9 1-3: ±0.30
  assert.equal(tgTightestPromiseMm(1).totalBandMm, 0.024);  // TG1 NW 1-3: ±0.012
  assert.equal(tgTightestPromiseMm(12).ok, false);
});

test('Table 10 profile-form general tolerances reproduce, and refuse beyond 1 m', () => {
  assert.equal(dinProfileToleranceMm(25).toleranceMm, 0.5);
  assert.equal(dinProfileToleranceMm(136).toleranceMm, 2);
  assert.equal(dinProfileToleranceMm(300).toleranceMm, 4);
  assert.equal(dinProfileToleranceMm(900).toleranceMm, 6);
  assert.equal(dinProfileToleranceMm(1500).ok, false);
});

test('Annex C assignment: every picker resin lands in a printed class, loosest branch', () => {
  // Amorphous (C.2): the looser of the printed A/B pair.
  assert.deepEqual([dinTgFor(PC).letter, dinTgFor(PC).tg], ['B', 5]);
  assert.equal(dinTgFor('ABS').tg, 5);
  assert.equal(dinTgFor('PC/ABS blend').tg, 5);
  // Semi-crystalline (C.3) by the standard's own shrinkage classes.
  assert.deepEqual([dinTgFor('PBT').letter, dinTgFor('PBT').tg], ['C', 6]);
  assert.equal(dinTgFor('PEEK').tg, 6);
  assert.equal(dinTgFor('PPS').tg, 5);
  assert.equal(dinTgFor('Polypropylene (PP)').tg, 7);
  assert.equal(dinTgFor('POM (Acetal)').tg, 7);
  // Filled: the printed anisotropy-not-considered branch.
  assert.deepEqual([dinTgFor('PA66-GF30 (glass-filled)').letter, dinTgFor('PA66-GF30 (glass-filled)').tg], ['C', 6]);
  // Low-stiffness branch: HDPE's modulus sits below the 1200 N/mm² boundary.
  assert.deepEqual([dinTgFor('HDPE').letter, dinTgFor('HDPE').tg], ['E', 8]);
  // TPE via Table C.2.
  assert.deepEqual([dinTgFor('TPU (thermoplastic PU)').letter, dinTgFor('TPU (thermoplastic PU)').tg], ['D', 7]);
  // 'precision' → series 2 (accurate production): one group tighter.
  assert.equal(dinTgFor(PC, { series: 2 }).tg, 4);
  // Series 3/4 are printed as "always subject to mandatory agreement".
  assert.match(dinTgFor(PC, { series: 3 }).reason, /mandatory agreement/);
  // Refusals, never guesses.
  assert.equal(dinTgFor('Steel (mild)').ok, false);
  assert.equal(dinTgFor(undefined).ok, false);
  // Every plastic the picker offers is assigned — the gate has no gaps.
  assert.equal(dinMaterials().length, 14);
  assert.equal(ROTOMOULDING_TG, 9);
});

// ── Through the rule engine ─────────────────────────────────────────────────

function moulding(material, { pmi = [] } = {}) {
  return {
    boundingBox: { xMm: 120, yMm: 60, zMm: 20 },
    geometry: { boundingBox: { xMm: 120, yMm: 60, zMm: 20 }, featureTable: [] },
    dfm: {
      wallThickness: { p5Mm: 2, p50Mm: 2.5, p95Mm: 3, spreadRatio: 0.2 },
      draft: { drawDirectionXYZ: [0, 0, 1], undercutFaceCount: 0, draftHistogramDegToAreaMm2: { 3: 1000 } },
      pmi: pmi.length ? { present: true, dimensionCount: pmi.length, dimensions: pmi } : { present: false, dimensions: [] },
      features: { ribs: [], minInternalCornerRadiusMm: 2, prismatic: [] },
      setups: {},
    },
    material,
  };
}

test('injection moulding: the declared band is judged against the resin\'s own TG, both evidence paths', () => {
  // PC → TG5, tightest promise 0.16 mm: a 0.1 band fails, a 0.2 passes.
  const m = extractMeasures(moulding(PC), { material: PC, declaredToleranceMm: 0.1 });
  assert.equal(m.din16742ToleranceMargin, 0.625);
  assert.equal(m._din16742Tolerance.tg, 'TG5');
  assert.equal(m._din16742Tolerance.from, 'declared');
  assert.match(m._din16742Tolerance.basis, /DECLARED/);
  assert.match(m._din16742Tolerance.basis, /Annex C.2/);
  // PMI rows are judged each at their OWN dimension: TG5 NW allows 1.0 mm at
  // a 100 mm dimension — a 0.5 span fails there, a 1.2 span passes.
  const tight = extractMeasures(moulding(PC, { pmi: [{ value: 100, span: 0.5 }] }), { material: PC });
  assert.equal(tight._din16742Tolerance.from, 'PMI');
  assert.equal(tight._din16742Tolerance.capabilityBandMm, 1.0);
  assert.equal(tight.din16742ToleranceMargin, 0.5);
  const loose = extractMeasures(moulding(PC, { pmi: [{ value: 100, span: 1.2 }] }), { material: PC });
  assert.ok(loose.din16742ToleranceMargin > 1);
  // End to end, with the standard's name on the finding.
  const r = runDfmRules(moulding(PC), 'injection-moulding', { material: PC, declaredToleranceMm: 0.1 });
  const f = r.findings.find((x) => x.id === 'im-tolerance-capability');
  assert.ok(f, 'a 0.1 mm band on a PC moulding must fail');
  assert.equal(f.sourceStatus, 'standard-named');
  assert.match(f.source, /DIN 16742/);
  assert.match(f.measuredBasis, /DECLARED/);
});

test('the resin moves the verdict: the same band passes in PC and fails in HDPE', () => {
  // 0.35 mm declared: PC (TG5, promise 0.16) passes at 2.19x; HDPE (TG8,
  // promise 0.62 = ±0.31 at 1-3) fails at 0.56x. One band, two resins, two
  // honest answers — the whole point of the Annex C assignment.
  const pc = extractMeasures(moulding(PC), { material: PC, declaredToleranceMm: 0.35 });
  assert.ok(pc.din16742ToleranceMargin > 1, `PC must pass, got ${pc.din16742ToleranceMargin}`);
  const pe = extractMeasures(moulding('HDPE'), { material: 'HDPE', declaredToleranceMm: 0.35 });
  assert.equal(pe._din16742Tolerance.tg, 'TG8');
  assert.ok(pe.din16742ToleranceMargin < 1, `HDPE must fail, got ${pe.din16742ToleranceMargin}`);
});

test('the precision input moves the judgment one series tighter, exactly as Table C.1 prints', () => {
  // 0.12 mm declared on PC: series 1 (TG5, promise 0.16) fails at 0.75;
  // 'precision' → series 2 (TG4, promise 0.10) passes at 1.2.
  const std = extractMeasures(moulding(PC), { material: PC, declaredToleranceMm: 0.12 });
  assert.ok(std.din16742ToleranceMargin < 1);
  const prec = extractMeasures(moulding(PC), { material: PC, declaredToleranceMm: 0.12, toleranceGrade: 'precision' });
  assert.equal(prec._din16742Tolerance.tg, 'TG4');
  assert.ok(prec.din16742ToleranceMargin > 1, `precision series must pass, got ${prec.din16742ToleranceMargin}`);
});

test('rotational moulding gains its first tolerance rule, at the standard\'s own TG9', () => {
  // TG9 tightest promise 0.6 mm: 0.4 fails, 1.0 passes — whatever the resin.
  const r = runDfmRules(moulding('HDPE'), 'rotational-moulding', { material: 'HDPE', declaredToleranceMm: 0.4 });
  const f = r.findings.find((x) => x.id === 'rm-tolerance-capability');
  assert.ok(f, 'a 0.4 mm band on a rotomoulding must fail TG9');
  assert.equal(f.sourceStatus, 'standard-named');
  assert.match(f.measuredBasis, /tolerance group 9/);
  const m = extractMeasures(moulding(PC), { material: PC, declaredToleranceMm: 0.4 });
  assert.equal(m._din16742RmTolerance.tg, 'TG9', 'TG9 applies whatever the compound');
  const ok = runDfmRules(moulding('HDPE'), 'rotational-moulding', { material: 'HDPE', declaredToleranceMm: 1.0 });
  assert.ok([...ok.passed].some((x) => x.id === 'rm-tolerance-capability'));
});

test('a material the annex cannot assign abstains — no borrowed group, no silent screen', () => {
  const m = extractMeasures(moulding('Steel (mild)'), { material: 'Steel (mild)', declaredToleranceMm: 0.1 });
  assert.equal(m.din16742ToleranceMargin, undefined);
  const r = runDfmRules(moulding('Steel (mild)'), 'injection-moulding', { material: 'Steel (mild)', declaredToleranceMm: 0.1 });
  assert.ok(r.notEvaluated.some((x) => x.id === 'im-tolerance-capability'),
    'no assignment means NOT EVALUATED, never a defaulted tolerance group');
});

test('the report figure prints what the standard promises at this part\'s own size', () => {
  const m = extractMeasures(moulding(PC), { material: PC });
  const s = m._din16742Summary;
  assert.ok(s, 'the summary needs only geometry and material');
  assert.equal(s.tg, 'TG5');
  assert.equal(s.letter, 'B');
  assert.equal(s.largestDimensionMm, 120);
  assert.equal(s.totalBandMm, 1.0);          // TG5 NW at 80-120: ±0.50
  assert.equal(s.profileToleranceMm, 2);     // Table 10 at the 136 mm diagonal
});
