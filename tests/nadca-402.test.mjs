// NADCA #402 (2021, 11th ed.), PINNED — the tolerance standard as code.
//
// Every formula is checked against the standard's OWN printed worked examples,
// because that is the only test that catches a misread table. It already paid
// for itself before this file existed: a bare Math.ceil turned 177.8/25.4 into
// 8 additional inches and the flatness example computed 0.84 against the
// printed 0.76.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  linearToleranceMm, partingLineToleranceMm, totalCrossPartingLineToleranceMm,
  movingDieToleranceMm, flatnessToleranceMm, MACHINING_STOCK,
} from '../nadca-402.mjs';
import { runDfmRules, extractMeasures } from '../dfm-rules.mjs';
import { DFM_RULES } from '../dfm-rule-catalogue.mjs';

const AL = 'Aluminium A380 / ADC12 (die-cast)';

test("linear tolerance reproduces the standard's own worked example", () => {
  // S-4A-1 p.4A-7: aluminium E1 = 5.00 in (127 mm) → ±0.35 mm Standard.
  const std = linearToleranceMm(AL, 127, 'standard');
  assert.equal(std.plusMinusMm, 0.35);
  assert.equal(std.totalBandMm, 0.7);
  // P-4A-1 p.4A-8: same dimension → ±0.15 mm Precision.
  assert.equal(linearToleranceMm(AL, 127, 'precision').plusMinusMm, 0.15);
  // The first inch carries the base alone.
  assert.equal(linearToleranceMm(AL, 25.4, 'standard').plusMinusMm, 0.25);
  assert.equal(linearToleranceMm('Zinc (ZAMAK 3)', 25.4, 'precision').plusMinusMm, 0.05);
  // Copper has its own, wider column.
  assert.equal(linearToleranceMm('Brass (CuZn39)', 25.4, 'standard').plusMinusMm, 0.36);
});

test("the cross-parting-line composition reproduces the printed example", () => {
  // p.4A-9: Al, 75 in² (483.9 cm²), 5.00 in thick → +0.65/−0.35 mm Standard.
  const std = totalCrossPartingLineToleranceMm(AL, 127, 483.9, 'standard');
  assert.equal(std.plusMm, 0.65);
  assert.equal(std.minusMm, 0.35);
  // p.4A-10 Precision: table value +0.203 composes to +0.353; the standard's
  // own metric example rounds it to +0.35. The table is the truth held here.
  const prec = totalCrossPartingLineToleranceMm(AL, 127, 483.9, 'precision');
  assert.ok(Math.abs(prec.plusMm - 0.353) < 0.001);
  assert.equal(prec.minusMm, 0.15);
});

test('parting-line and MDC adders are plus-only, banded, and refuse beyond the table', () => {
  assert.equal(partingLineToleranceMm(AL, 483.9, 'standard').plusMm, 0.30);
  assert.equal(movingDieToleranceMm(AL, 483.9).plusMm, 0.61);   // S-4A-3 example
  // Copper stops at 322.6 cm² — "consult with your die caster", never extrapolated.
  assert.equal(partingLineToleranceMm('Brass (CuZn39)', 500).ok, false);
  // Beyond 1935.5 cm² everything is consult.
  assert.equal(partingLineToleranceMm(AL, 2500).ok, false);
  // Precision MDC was not legible in the supplied copy and must say so.
  assert.equal(movingDieToleranceMm(AL, 100, 'precision').ok, false);
});

test("flatness reproduces both printed examples, floating point included", () => {
  // 10 in (254 mm) diagonal → 0.029 in (0.76 mm) Standard, 0.019 in (0.48) Precision.
  // 254−76.2 = 177.8, and 177.8/25.4 is 7.000000000000001 in IEEE 754 — the
  // epsilon in ceilInches is what keeps this 7 additional inches, not 8.
  assert.ok(Math.abs(flatnessToleranceMm(254, 'standard').toleranceMm - 0.76) < 0.005);
  assert.ok(Math.abs(flatnessToleranceMm(254, 'precision').toleranceMm - 0.48) < 0.005);
  assert.equal(flatnessToleranceMm(76.2, 'standard').toleranceMm, 0.20);
});

test('non-die-cast alloys abstain rather than borrowing a column', () => {
  for (const m of ['Steel (mild)', 'PA6 (Nylon)', 'Cast Iron (Grey)', null]) {
    assert.equal(linearToleranceMm(m, 50).ok, false, `${m} must abstain`);
    assert.equal(partingLineToleranceMm(m, 100).ok, false);
  }
});

test('machining stock: the standard bounds it below, the skin bounds it above', () => {
  assert.equal(MACHINING_STOCK.minMm, 0.25);
  const skin = DFM_RULES.find((r) => r.id === 'hpdc-machining-stock-skin');
  assert.equal(skin.threshold, 0.5, 'the 0.25-0.50 band only exists if both ends hold');
});

// ── Through the rule engine ─────────────────────────────────────────────────

/** An aluminium casting whose PMI carries dimension rows. */
function partWithPmi(dimensions) {
  return {
    boundingBox: { xMm: 120, yMm: 90, zMm: 40 },
    dfm: {
      wallThickness: { p5Mm: 2.4, p50Mm: 2.5, p95Mm: 2.6, spreadRatio: 0.08 },
      draft: {
        drawDirectionXYZ: [0, 0, 1],
        wallAreaBelowDraftPct: { 1: 0 },
        draftHistogramDegToAreaMm2: { 5: 1000 },
        undercutFaceCount: 0,
      },
      pmi: { present: true, dimensionCount: dimensions.length, dimensions },
      features: { prismatic: [], minInternalCornerRadiusMm: 3 },
      setups: {},
    },
  };
}

test('the margin is dimension-dependent: the same band passes large and fails small', () => {
  // A ±0.2 total band (span 0.4): capability at 100 mm is ±0.325 (band 0.65) →
  // margin 0.62, FAIL. The same 0.4 band at 10 mm judged against ±0.25 (band
  // 0.5) → margin 0.8, still FAIL — but a 0.6 band at 100 mm passes while the
  // identical 0.6 at 10 mm fails. That asymmetry IS the standard.
  const bigOk = extractMeasures(partWithPmi([{ value: 100, span: 0.7 }]), { material: AL });
  assert.ok(bigOk.nadca402ToleranceMargin > 1, `0.7 band on 100 mm should pass, got ${bigOk.nadca402ToleranceMargin}`);
  const smallBad = extractMeasures(partWithPmi([{ value: 10, span: 0.4 }]), { material: AL });
  assert.ok(smallBad.nadca402ToleranceMargin < 1, `0.4 band on 10 mm must fail against the 0.5 base band`);
  // The WORST row governs when several are present.
  const mixed = extractMeasures(partWithPmi([{ value: 100, span: 0.7 }, { value: 10, span: 0.4 }]), { material: AL });
  assert.equal(mixed._nadca402Tolerance.dimensionMm, 10, 'the worst row must be the one named');
});

test('precision grade tightens the requirement through the declared input', () => {
  const std = extractMeasures(partWithPmi([{ value: 25, span: 0.3 }]), { material: AL });
  const prec = extractMeasures(partWithPmi([{ value: 25, span: 0.3 }]), { material: AL, toleranceGrade: 'precision' });
  assert.ok(std.nadca402ToleranceMargin < 1, 'a 0.3 band fails Standard (0.5 capability)');
  assert.ok(prec.nadca402ToleranceMargin > 1, 'and passes Precision (0.1 capability band → margin 3)');
});

test('a declared band without a dimension is judged against the first-inch base, and says so', () => {
  const part = partWithPmi([]);
  part.dfm.pmi = { present: false, dimensions: [] };
  const m = extractMeasures(part, { material: AL, declaredToleranceMm: 0.3 });
  assert.ok(m.nadca402ToleranceMargin < 1, '0.3 declared vs the 0.5 base band must fail');
  assert.equal(m._nadca402Tolerance.from, 'declared');
  assert.match(m._nadca402Tolerance.basis, /first-25\.4 mm base/);
});

test('the tolerance rule fires end to end, and abstains with nothing declared', () => {
  const r = runDfmRules(partWithPmi([{ value: 10, span: 0.4 }]), 'hpdc', { material: AL });
  const f = r.findings.find((x) => x.id === 'hpdc-tolerance-capability');
  assert.ok(f, 'the 0.4 band on a 10 mm feature must fail');
  assert.equal(f.sourceStatus, 'standard-named');
  assert.match(f.source, /S-4A-1-21/);

  const bare = partWithPmi([]);
  bare.dfm.pmi = { present: false, dimensions: [] };
  const r2 = runDfmRules(bare, 'hpdc', { material: AL });
  assert.ok(r2.notEvaluated.some((x) => x.id === 'hpdc-tolerance-capability'),
    'no PMI and no declared band means NOT EVALUATED, never a pass');
});

test('flatness: declared callout against the S-4A-8 capability at the bounding diagonal', () => {
  // Diagonal of 120×90 = 150 mm → Standard capability 0.20 + 3×0.08 = 0.44 mm.
  const tight = extractMeasures(partWithPmi([]), { material: AL, flatnessMm: 0.2 });
  assert.ok(tight.nadca402FlatnessMargin < 1, `0.2 declared vs 0.44 capability must fail, got ${tight.nadca402FlatnessMargin}`);
  const loose = extractMeasures(partWithPmi([]), { material: AL, flatnessMm: 0.8 });
  assert.ok(loose.nadca402FlatnessMargin > 1);
  const r = runDfmRules(partWithPmi([]), 'hpdc', { material: AL, flatnessMm: 0.2 });
  assert.ok(r.findings.some((x) => x.id === 'hpdc-flatness-capability'));
  const bare = runDfmRules(partWithPmi([]), 'hpdc', { material: AL });
  assert.ok(bare.notEvaluated.some((x) => x.id === 'hpdc-flatness-capability'),
    'undeclared flatness abstains');
});
