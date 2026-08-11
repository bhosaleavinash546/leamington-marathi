// ISO 8062-4:2017 — general tolerances for castings, PINNED.
//
// The document the register named as the blocker on every NON-FERROUS
// casting tolerance rule. Its text layer extracts per character, so every
// table was reconstructed by word position; these tests pin the printed
// spot values so a misread cell can never drift back in, and exercise the
// three engine paths the standard now owns: permanent-mould tolerance
// (gravity die / LPDC), sand and investment tolerance for the metal groups
// SFSA's steel tables do not cover, and the Table 4-8 draft sharpening.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isoMetalGroupFor, sToleranceMm, sTightestPromiseMm, pToleranceMm,
  isoRmaMm, isoGradeFor, isoRmaGradeFor, isoDraftDeg,
} from '../iso-8062-4.mjs';
import { runDfmRules, extractMeasures } from '../dfm-rules.mjs';

const AL = 'Aluminium A356 (cast)';
const STEEL = 'Steel (mild)';

test('metal grouping: every picker family lands in its printed column, or refuses', () => {
  assert.equal(isoMetalGroupFor('Zamak 3').group, 'zinc');
  assert.equal(isoMetalGroupFor('Silafont-36').group, 'lightMetal');
  assert.equal(isoMetalGroupFor('Magnesium AZ91D').group, 'lightMetal');
  assert.equal(isoMetalGroupFor('Stainless Steel 316').group, 'steel');
  assert.equal(isoMetalGroupFor('Cast Iron (Grey)').group, 'greyIron');
  assert.equal(isoMetalGroupFor('Ductile Iron GJS-400').group, 'sgIron');
  assert.equal(isoMetalGroupFor('Brass CuZn39Pb3').group, 'copper');
  // Titanium is genuinely absent from the standard's tables — refuse, never map.
  assert.equal(isoMetalGroupFor('Titanium Ti-6Al-4V').ok, false);
  assert.equal(isoMetalGroupFor(undefined).ok, false);
});

test('Table 2 (dimensional tolerances S) reproduces its printed spot values', () => {
  assert.equal(sToleranceMm(8, 8).totalBandMm, 0.5);     // <=10, S8
  assert.equal(sToleranceMm(50, 10).totalBandMm, 1.5);   // 30-100, S10
  assert.equal(sToleranceMm(200, 12).totalBandMm, 4);    // 100-300, S12
  assert.equal(sToleranceMm(25, 13).totalBandMm, 3);     // 10-30, S13 (first S13 cell)
  // '-' cells refuse rather than extrapolate: S13-15 print nothing below 10 mm.
  assert.equal(sToleranceMm(8, 13).ok, false);
  // Beyond 300 mm the standard governs by Table 1 profile, and the reason says so.
  const big = sToleranceMm(400, 8);
  assert.equal(big.ok, false);
  assert.match(big.reason, /profile/i);
  assert.equal(sToleranceMm(50, 16).ok, false, 'S16 is not a grade');
});

test('a declared band with no dimension is judged at the tightest value the grade ever tabulates', () => {
  const p13 = sTightestPromiseMm(13);
  assert.equal(p13.totalBandMm, 3);      // S13 first exists at 10-30 mm -> 3 mm
  assert.equal(p13.bandUpToMm, 30);
  assert.equal(sTightestPromiseMm(8).totalBandMm, 0.5);  // S8 from the first band
  assert.equal(sTightestPromiseMm(12).totalBandMm, 2);   // S12 from the first band
});

test('Table 1 (profile tolerances P) reproduces its printed spot values, including the null wings', () => {
  assert.equal(pToleranceMm(5, 1).toleranceMm, 0.09);      // <=10, P1
  assert.equal(pToleranceMm(500, 8).toleranceMm, 2.7);     // 300-1000, P8
  assert.equal(pToleranceMm(9000, 10).toleranceMm, 11);    // 6300-10000, P10
  assert.equal(pToleranceMm(5000, 5).ok, false, 'P5 prints nothing past 1 m');
  assert.equal(pToleranceMm(20000, 10).ok, false, 'the table stops at 10 m');
});

test('Table 3 (RMA) reproduces its spot values, and agrees with SFSA where the two overlap', () => {
  // Cross-standard check: SFSA Supplement 3 Table 2.2 prints the SAME ISO 8062
  // RMA table — grade F at a 120 mm dimension is 1.5 mm in both modules.
  assert.equal(isoRmaMm(120, 'F').rmaMm, 1.5);
  assert.equal(isoRmaMm(500, 'K').rmaMm, 12);
  assert.equal(isoRmaMm(50, 'A').rmaMm, 0.1);
  assert.equal(isoRmaMm(120, 'Z').ok, false);
  // The 6300-10000 row was not fully legible in the supplied copy — refuse,
  // and say why, rather than guess.
  const far = isoRmaMm(7000, 'F');
  assert.equal(far.ok, false);
  assert.match(far.reason, /legible/i);
});

test('Annex B grade selection: loosest of the printed band, short vs long, refusals kept', () => {
  // Light metal sand, short series: Table B.2 S11-13, judged at S13.
  const short = isoGradeFor('sand', AL, 'short');
  assert.equal(short.grade, 13);
  assert.equal(short.band, 'S11-S13');
  assert.equal(short.series, 'short');
  // Long series: Table B.1 hand moulding S9-12, judged at S12; the basis owns
  // up to judging at the HAND band because the moulding method is not an input.
  const long = isoGradeFor('sand', AL, 'long');
  assert.equal(long.grade, 12);
  assert.match(long.basis, /HAND-moulding/);
  // Permanent mould, light metal: S6-8 — no short-series column exists.
  assert.equal(isoGradeFor('permanentMould', AL, 'long').grade, 8);
  // Steel by permanent mould and pressure die prints '-': refuse, never borrow.
  assert.equal(isoGradeFor('permanentMould', STEEL, 'long').ok, false);
  assert.match(isoGradeFor('pressureDie', STEEL, 'long').reason, /'-'/);
  // Zinc: B.2 has no short-series sand column, B.1 long gives S10-13.
  assert.equal(isoGradeFor('sand', 'Zamak 3', 'short').ok, false);
  assert.equal(isoGradeFor('sand', 'Zamak 3', 'long').grade, 13);
  // Investment: S4-9 for every group, judged at S9.
  assert.equal(isoGradeFor('investment', 'Zamak 3').grade, 9);
  assert.equal(isoGradeFor('investment', AL).grade, 9);
});

test('Annex C RMA selection: judged at the band MINIMUM, refusals kept', () => {
  assert.equal(isoRmaGradeFor('sand', STEEL).grade, 'G');       // steel hand G-K
  assert.equal(isoRmaGradeFor('pressureDie', 'Zamak 3').grade, 'A');
  assert.equal(isoRmaGradeFor('investment', AL).grade, 'E');
  assert.equal(isoRmaGradeFor('permanentMould', STEEL).ok, false);
  assert.equal(isoRmaGradeFor('investment', 'Zamak 3').ok, false, "zinc investment prints '-'");
});

test('Tables 4-8 draft: fine-external spot values, held table-faithful', () => {
  assert.equal(isoDraftDeg('hand', 5).deg, 6.5);            // Table 4, 4-6.3
  assert.equal(isoDraftDeg('hand', 80).deg, 1.4);           // Table 4, 63-100
  assert.equal(isoDraftDeg('machine', 8).deg, 3.9);         // Table 5, 6.3-10
  assert.equal(isoDraftDeg('investment', 90).deg, 0.3);     // Table 8, 63-100
  // Table 6 prints 8.5 at <=4 mm and then 3.3 at 4-6.3 — non-monotonic as
  // printed, held table-faithful like the CT-table anomaly.
  assert.equal(isoDraftDeg('permanentMould', 3).deg, 8.5);
  assert.equal(isoDraftDeg('permanentMould', 5).deg, 3.3);
  assert.equal(isoDraftDeg('permanentMould', 12).deg, 3.1);
  // The permanent-mould and die tables stop at 630 mm — refuse beyond.
  assert.equal(isoDraftDeg('permanentMould', 1200).ok, false);
  assert.equal(isoDraftDeg('hand', 2000).ok, false);
  assert.equal(isoDraftDeg('nope', 5).ok, false);
});

// ── Through the rule engine ─────────────────────────────────────────────────

function casting(material, { zMm = 80, hist = { 3: 1000 }, curve, pmi = [] } = {}) {
  return {
    boundingBox: { xMm: 300, yMm: 200, zMm },
    geometry: { boundingBox: { xMm: 300, yMm: 200, zMm }, featureTable: [] },
    dfm: {
      wallThickness: { p5Mm: 8, p50Mm: 9, p95Mm: 10, spreadRatio: 0.2 },
      draft: {
        drawDirectionXYZ: [0, 0, 1], undercutFaceCount: 0,
        draftHistogramDegToAreaMm2: hist,
        wallAreaBelowDraftPct: curve,
      },
      pmi: pmi.length ? { present: true, dimensionCount: pmi.length, dimensions: pmi } : { present: false, dimensions: [] },
      features: { ribs: [], minInternalCornerRadiusMm: 14, prismatic: [] },
      setups: {},
    },
    material,
  };
}

test('LPDC aluminium: the declared band is judged against S8, both evidence paths', () => {
  // Declared 0.3 mm vs S8's tightest promise (0.5 mm) -> margin 0.6, fail.
  const m = extractMeasures(casting(AL), { material: AL, declaredToleranceMm: 0.3 });
  assert.equal(m.iso8062PmToleranceMargin, 0.6);
  assert.equal(m._iso8062PmTolerance.grade, 'S8');
  assert.equal(m._iso8062PmTolerance.from, 'declared');
  assert.match(m._iso8062PmTolerance.basis, /DECLARED/);
  assert.match(m._iso8062PmTolerance.basis, /Table B.1/);
  // PMI wins over nothing-declared: a 0.6 mm span on a 50 mm dimension is
  // judged at S8's own 0.8 mm cell for that band, not the tightest promise.
  const pmi = extractMeasures(casting(AL, { pmi: [{ value: 50, span: 0.6 }] }), { material: AL });
  assert.equal(pmi._iso8062PmTolerance.from, 'PMI');
  assert.equal(pmi._iso8062PmTolerance.dimensionMm, 50);
  assert.equal(pmi._iso8062PmTolerance.capabilityBandMm, 0.8);
  assert.equal(pmi.iso8062PmToleranceMargin, 0.75);
  // End to end: the rule fires with the standard's name on it.
  const r = runDfmRules(casting(AL), 'lpdc', { material: AL, declaredToleranceMm: 0.3 });
  const f = r.findings.find((x) => x.id === 'lpdc-tolerance-capability');
  assert.ok(f, 'a 0.3 mm band on an LPDC casting must fail');
  assert.equal(f.sourceStatus, 'standard-named');
  assert.match(f.source, /ISO 8062-4/);
  assert.match(f.measuredBasis, /DECLARED/);
});

test("steel by permanent mould prints '-': the rule abstains rather than borrowing a column", () => {
  const m = extractMeasures(casting(STEEL), { material: STEEL, declaredToleranceMm: 0.3 });
  assert.equal(m.iso8062PmToleranceMargin, undefined);
  const r = runDfmRules(casting(STEEL), 'gravity-die', { material: STEEL, declaredToleranceMm: 0.3 });
  assert.ok(r.notEvaluated.some((x) => x.id === 'gdc-tolerance-capability'),
    'no measure means NOT EVALUATED, never a borrowed light-metal verdict');
});

test('sand aluminium: the production series flips the grade, and the verdict with it', () => {
  // 2.5 mm declared: short series S13 promises 3 mm -> fail; long series S12
  // promises 2 mm -> pass. The same band, two honest answers.
  const short = extractMeasures(casting(AL), { material: AL, declaredToleranceMm: 2.5 });
  assert.equal(short._sfsaSandTolerance.grade, 'S13');
  assert.ok(short.sfsaSandToleranceMargin < 1, `2.5 vs 3 must fail, got ${short.sfsaSandToleranceMargin}`);
  const long = extractMeasures(casting(AL), { material: AL, declaredToleranceMm: 2.5, productionSeries: 'long' });
  assert.equal(long._sfsaSandTolerance.grade, 'S12');
  assert.ok(long.sfsaSandToleranceMargin > 1, `2.5 vs 2 must pass, got ${long.sfsaSandToleranceMargin}`);
  // The finding carries the family's standard-named source.
  const r = runDfmRules(casting(AL), 'sand-casting', { material: AL, declaredToleranceMm: 2.5 });
  const f = r.findings.find((x) => x.id === 'sand-tolerance-capability');
  assert.ok(f);
  assert.equal(f.sourceStatus, 'standard-named');
  assert.match(f.source, /Annexes B.1\/B.2/);
});

test('investment aluminium: S9 capability, standard-named through the family table', () => {
  // S9's tightest promise is 0.7 mm: a 0.5 band fails.
  const m = extractMeasures(casting(AL), { material: AL, declaredToleranceMm: 0.5 });
  assert.equal(m._sfsaInvTolerance.grade, 'S9');
  assert.ok(m.sfsaInvToleranceMargin < 1);
  const r = runDfmRules(casting(AL), 'investment-casting', { material: AL, declaredToleranceMm: 0.5 });
  const f = r.findings.find((x) => x.id === 'inv-tolerance-capability');
  assert.ok(f);
  assert.equal(f.sourceStatus, 'standard-named');
  assert.match(f.source, /ISO 8062-4/);
});

test('ISO draft SHARPENS the sand cutoff on a shallow part, and never softens a deep one', () => {
  // 12 mm along the draw: Table 4 asks 3.2 deg — stricter than the published
  // 1.5, so it takes over. All the wall sits at 2-3 deg: 100% below 3.2.
  const shallow = runDfmRules(casting(AL, { zMm: 12, hist: { 2: 1000 } }), 'sand-casting', { material: AL });
  const f = shallow.findings.find((x) => x.id === 'sand-draft-minimum');
  assert.ok(f, 'wall at 2 deg on a 12 mm part must fail the 3.2 deg table angle');
  assert.equal(f.measuredAtDeg, 3.2);
  assert.match(f.measuredBasis, /Table 4/);
  assert.match(f.unit, /3\.2/);
  // 80 mm along the draw: the table asks only 1.4 deg — LESS than the
  // published 1.5, so the published floor holds. Sharpen-only, like NADCA.
  const deep = runDfmRules(casting(AL, { zMm: 80, hist: { 2: 1000 }, curve: { 1.5: 0 } }), 'sand-casting', { material: AL });
  const d = [...deep.findings, ...deep.passed].find((x) => x.id === 'sand-draft-minimum');
  assert.ok(d);
  assert.equal(d.measuredAtDeg, 1.5, 'the published cutoff must not be softened to 1.4');
  assert.equal(d.status, 'pass');
});

test('ISO draft sharpening reaches investment casting too', () => {
  // 12 mm along the draw: Table 8 asks 0.9 deg vs the published 0.5. Wall at
  // 0.6-1.6 deg: 30% below 0.9 -> fail against the 10% allowance.
  const shallow = runDfmRules(casting(AL, { zMm: 12, hist: { 0.6: 1000 } }), 'investment-casting', { material: AL });
  const f = shallow.findings.find((x) => x.id === 'inv-draft-minimum');
  assert.ok(f, '30% of wall under the 0.9 deg table angle must fail');
  assert.equal(f.measuredAtDeg, 0.9);
  assert.match(f.measuredBasis, /Table 8/);
  // 80 mm: the table asks 0.3 — the published 0.5 holds and the same wall passes.
  const deep = runDfmRules(casting(AL, { zMm: 80, hist: { 0.6: 1000 }, curve: { 0.5: 0 } }), 'investment-casting', { material: AL });
  const d = [...deep.findings, ...deep.passed].find((x) => x.id === 'inv-draft-minimum');
  assert.ok(d);
  assert.equal(d.measuredAtDeg, 0.5);
  assert.equal(d.status, 'pass');
});

test('the report figures travel: the PM tolerance verdict and the per-family draft map', () => {
  const m = extractMeasures(casting(AL), { material: AL, declaredToleranceMm: 0.3 });
  assert.ok(m._iso8062PmTolerance);
  assert.ok(m._iso8062Draft);
  // The map covers every casting family the tables speak for, at the part's
  // own 80 mm draw extent.
  for (const fam of ['sand-casting', 'shell-mould', 'gravity-die', 'lpdc', 'investment-casting']) {
    assert.ok(m._iso8062Draft[fam], `${fam} must carry its table angle`);
    assert.equal(m._iso8062Draft[fam].drawDepthMm, 80);
  }
  assert.equal(m._iso8062Draft['sand-casting'].requiredDeg, 1.4);
  assert.equal(m._iso8062Draft['lpdc'].requiredDeg, 1.8);   // Table 6, 63-100
  assert.match(m._iso8062Draft['sand-casting'].basis, /upper bound/);
});
