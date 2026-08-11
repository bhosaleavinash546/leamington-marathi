// SFSA Supplement 3 "Dimensional Capabilities of Steel Castings", PINNED.
//
// The document prints every table in BOTH mm and inches, and the mm values
// are verified here against the printed inch values — the same job the
// standard's own worked examples did for NADCA #402: the only test that
// catches a misread table is the document checking itself.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ctToleranceMm, ctTightestPromiseMm, ctGradeFor, rmaMm, RMA_GRADE_SELECTION,
  capabilityModelMm, investmentCapabilityMm, ctgFlatnessMm, CTG_SELECTION,
  PARTING_LINE_VARIABILITY_MM, WEIGHT_TOLERANCE,
} from '../sfsa-supplement-3.mjs';
import { runDfmRules, extractMeasures } from '../dfm-rules.mjs';

const STEEL = 'Steel (mild)';
const IN = 25.4;

test('the CT table reproduces its printed spot values, mm against inches', () => {
  // Table 3.1 spot cells.
  assert.equal(ctToleranceMm(30, 12).totalBandMm, 5);      // 25-40, CT12
  assert.equal(ctToleranceMm(120, 10).totalBandMm, 3.6);   // 100-160, CT10
  assert.equal(ctToleranceMm(80, 13).totalBandMm, 9);      // 63-100, CT13
  assert.equal(ctToleranceMm(8, 7).totalBandMm, 0.74);     // <=10, CT7
  // The printed anomaly is held table-faithful: CT9 = CT10 = 2 at <=10 mm.
  assert.equal(ctToleranceMm(8, 9).totalBandMm, 2);
  assert.equal(ctToleranceMm(8, 10).totalBandMm, 2);
  // mm vs the printed INCH table (Table 3.2): 2.5-4 in band CT10 = 0.13 in.
  assert.ok(Math.abs(ctToleranceMm(3 * IN, 10).totalBandMm - 0.13 * IN) < 0.35,
    'the mm and inch tables must describe the same standard');
  // '-' cells refuse rather than extrapolate.
  assert.equal(ctToleranceMm(8, 13).ok, false, 'CT13 is not defined below 16 mm');
  assert.equal(ctToleranceMm(200, 1).ok, false, 'CT1 stops at 160 mm');
  assert.equal(ctToleranceMm(20000, 10).ok, false, 'the table stops at 10 m');
});

test('a declared band with no dimension is judged at the tightest value the grade ever tabulates', () => {
  const p13 = ctTightestPromiseMm(13);
  assert.equal(p13.totalBandMm, 6);      // CT13 first exists at 16-25 mm -> 6 mm
  assert.equal(p13.bandUpToMm, 25);
  assert.equal(ctTightestPromiseMm(7).totalBandMm, 0.74);   // CT7 from the first band
});

test('grade selection: short CT13, long CT12, investment CT7 — the loosest of each printed band', () => {
  assert.equal(ctGradeFor('sand', 'short').grade, 13);
  assert.equal(ctGradeFor('sand', 'long').grade, 12);
  assert.match(ctGradeFor('sand', 'short').basis, /CT11-13/);
  const inv = ctGradeFor('investment');
  assert.equal(inv.grade, 7);
  assert.equal(inv.series, 'long', 'investment tooling is always iterated');
  assert.equal(ctGradeFor('hpdc').ok, false, 'SFSA 2000 does not speak for die casting');
});

test('RMA reproduces Table 2.2, and the grade selection note survives', () => {
  assert.equal(rmaMm(120, 'F').rmaMm, 1.5);    // 100-160, grade F
  assert.equal(rmaMm(120, 'G').rmaMm, 2.2);
  assert.equal(rmaMm(120, 'E').rmaMm, 1.1);    // investment grade
  assert.equal(rmaMm(500, 'K').rmaMm, 12);     // 400-630, K
  assert.equal(rmaMm(120, 'Z').ok, false);
  assert.equal(RMA_GRADE_SELECTION.copeSurfaceMinMm, 6);
});

test('the capability models: mm constants match the printed inch constants', () => {
  // Green sand short 90%: printed 5.200 mm constant = 0.2050 in x 25.4.
  assert.ok(Math.abs(5.200 - 0.2050 * IN) < 0.01);
  // And the evaluated model behaves physically: heavier and longer -> wider.
  const small = capabilityModelMm('greenSand', { lengthMm: 100, weightKg: 10 });
  const big = capabilityModelMm('greenSand', { lengthMm: 400, weightKg: 100 });
  assert.ok(big.p50Mm > small.p50Mm);
  assert.ok(small.p90Mm > small.p50Mm && small.p50Mm > small.p10Mm);
  // Long series is tighter than short at the same part.
  const long = capabilityModelMm('greenSand', { lengthMm: 100, weightKg: 10, series: 'long' });
  assert.ok(long.p50Mm < small.p50Mm);
  // The no-bake parting-line adder is the printed +1.230 mm (short series).
  const flat = capabilityModelMm('noBake', { lengthMm: 100, weightKg: 50 });
  const acrossPL = capabilityModelMm('noBake', { lengthMm: 100, weightKg: 50, crossesParting: true });
  assert.ok(Math.abs((acrossPL.p50Mm - flat.p50Mm) - 1.23) < 0.01);
  // Fitted weight domains refuse, never extrapolate.
  assert.equal(capabilityModelMm('greenSand', { lengthMm: 100, weightKg: 300 }).ok, false);
  assert.equal(capabilityModelMm('shell', { lengthMm: 100, weightKg: 60 }).ok, false);
  // Investment model reproduces its printed constants.
  const inv = investmentCapabilityMm({ lengthMm: 100, weightKg: 5 });
  assert.ok(Math.abs(inv.p50Mm - (0.212 + 0.005 * 100 + 0.012 * 5)) < 0.001);
});

test('flatness by CTG reproduces Table 4.2a, with the printed grade selection', () => {
  assert.equal(ctgFlatnessMm(500, 7).toleranceMm, 3.0);   // 300-1000, CTG7
  assert.equal(ctgFlatnessMm(500, 6).toleranceMm, 2.0);
  assert.equal(ctgFlatnessMm(50, 5).toleranceMm, 0.6);    // 30-100, CTG5
  assert.equal(ctgFlatnessMm(5000, 4).ok, false, 'CTG4 prints nothing past 3 m');
  assert.deepEqual(CTG_SELECTION.sandMachineMolded, [5, 7]);
  assert.deepEqual(CTG_SELECTION.investment, [4, 6]);
  assert.equal(PARTING_LINE_VARIABILITY_MM.noBake, 1.0);
  assert.equal(WEIGHT_TOLERANCE.machineMoldedPct, 5);
});

// ── Through the rule engine ─────────────────────────────────────────────────

function casting(material, { pmi = [], xMm = 300 } = {}) {
  return {
    boundingBox: { xMm, yMm: 200, zMm: 80 },
    geometry: { boundingBox: { xMm, yMm: 200, zMm: 80 }, featureTable: [] },
    dfm: {
      wallThickness: { p5Mm: 8, p50Mm: 9, p95Mm: 10, spreadRatio: 0.2 },
      draft: { drawDirectionXYZ: [0, 0, 1], undercutFaceCount: 0, draftHistogramDegToAreaMm2: { 3: 1000 } },
      pmi: pmi.length ? { present: true, dimensionCount: pmi.length, dimensions: pmi } : { present: false, dimensions: [] },
      features: { ribs: [], minInternalCornerRadiusMm: 14, prismatic: [] },
      setups: {},
    },
    material,
  };
}

test('steel: the declared band is judged against computed CT capability, and the series moves it', () => {
  // 1.0 mm declared band vs CT13's tightest promise (6 mm) -> margin 0.167.
  // The OLD flat screen (1.6 mm ferrous) would have FAILED this too — but a
  // 2 mm band exposes the real difference: the screen passed it, the CT
  // table says a first-article steel sand casting cannot promise it.
  const m = extractMeasures(casting(STEEL), { material: STEEL, declaredToleranceMm: 2 });
  assert.ok(m.sfsaSandToleranceMargin < 1, `2 mm vs CT13's 6 mm must fail, got ${m.sfsaSandToleranceMargin}`);
  assert.equal(m._sfsaSandTolerance.grade, 'CT13');
  assert.equal(m._sfsaSandTolerance.from, 'declared');
  assert.match(m._sfsaSandTolerance.basis, /DECLARED/);
  // Long series drops to CT12 (tightest promise 4.2 mm) — still fails at 2,
  // passes at 5.
  const long = extractMeasures(casting(STEEL), { material: STEEL, declaredToleranceMm: 5, productionSeries: 'long' });
  assert.equal(long._sfsaSandTolerance.grade, 'CT12');
  assert.ok(long.sfsaSandToleranceMargin > 1, `5 mm vs CT12's 4.2 mm must pass, got ${long.sfsaSandToleranceMargin}`);
});

test('steel PMI rows are judged each at their OWN dimension, worst row named', () => {
  // CT13: 200 mm dim -> 11 mm band; 20 mm dim -> 6 mm band. A 7 mm span
  // passes on the large feature and fails on the small one.
  const rows = [{ value: 200, span: 12 }, { value: 20, span: 5 }];
  const m = extractMeasures(casting(STEEL, { pmi: rows }), { material: STEEL });
  assert.ok(m.sfsaSandToleranceMargin < 1);
  assert.equal(m._sfsaSandTolerance.dimensionMm, 20, 'the worst row must be the one named');
  assert.equal(m._sfsaSandTolerance.from, 'PMI');
});

test('aluminium is now judged by ISO 8062-4, and materials neither standard tabulates keep the screen', () => {
  // Light metal, sand, short series: Table B.2 gives S11-13, judged at S13 —
  // whose tightest promise is 3 mm. The old 1.2 mm screen is gone for
  // every metal group Annex B tabulates.
  const m = extractMeasures(casting('Aluminium A356 (cast)'), { material: 'Aluminium A356 (cast)', declaredToleranceMm: 1.0 });
  assert.ok(m.sfsaSandToleranceMargin < 1, `1.0 vs S13's 3 mm promise fails, got ${m.sfsaSandToleranceMargin}`);
  assert.equal(m._sfsaSandTolerance.grade, 'S13');
  assert.equal(m._sfsaSandTolerance.capabilityBandMm, 3);
  assert.match(m._sfsaSandTolerance.basis, /ISO 8062-4/);
  // Cast iron: B.2 grey iron S13-15, judged at S15 — tightest promise 5 mm.
  const iron = extractMeasures(casting('Cast Iron (Grey)'), { material: 'Cast Iron (Grey)', declaredToleranceMm: 0.8 });
  assert.equal(iron._sfsaSandTolerance.grade, 'S15');
  assert.equal(iron._sfsaSandTolerance.capabilityBandMm, 5);
  // Titanium is in neither document's tables — the screen survives for it,
  // and the basis names both refusals.
  const ti = extractMeasures(casting('Titanium Ti-6Al-4V'), { material: 'Titanium Ti-6Al-4V', declaredToleranceMm: 1.0 });
  assert.equal(ti._sfsaSandTolerance.capabilityBandMm, 1.2);
  assert.match(ti._sfsaSandTolerance.basis, /screening/i);
  assert.match(ti._sfsaSandTolerance.basis, /ISO 8062-4/);
});

test('the sand tolerance rule fires end to end with the SFSA grade on steel', () => {
  const r = runDfmRules(casting(STEEL), 'sand-casting', { material: STEEL, declaredToleranceMm: 2 });
  const f = r.findings.find((x) => x.id === 'sand-tolerance-capability');
  assert.ok(f, 'a 2 mm band on a first-article steel sand casting must fail');
  assert.equal(f.sourceStatus, 'standard-named');
  assert.match(f.source, /SFSA Supplement 3/);
  assert.match(f.measuredBasis, /DECLARED/);
  // Aluminium now evaluates against ISO 8062-4 and carries the standard's
  // grade: a 2 mm band vs S13's 3 mm tightest promise FAILS — the screen
  // used to wave it through at 1.2 mm.
  const al = runDfmRules(casting('Aluminium A356 (cast)'), 'sand-casting',
    { material: 'Aluminium A356 (cast)', declaredToleranceMm: 2 });
  const alF = [...al.findings, ...al.passed].find((x) => x.id === 'sand-tolerance-capability');
  assert.ok(alF, 'aluminium must still be judged');
  assert.equal(alF.status, 'fail', '2 mm vs S13\'s 3 mm promise fails');
  assert.equal(alF.sourceStatus, 'standard-named');
  assert.match(alF.source, /ISO 8062-4/);
  // Nothing declared, no PMI -> NOT EVALUATED.
  const bare = runDfmRules(casting(STEEL), 'sand-casting', { material: STEEL });
  assert.ok(bare.notEvaluated.some((x) => x.id === 'sand-tolerance-capability'));
});

test('investment: CT7 capability for steel (non-steel is ISO 8062-4\'s, tested in its own file)', () => {
  // CT7 tightest promise 0.74 mm: a 0.5 band fails, a 1.0 passes.
  const tight = extractMeasures(casting(STEEL), { material: STEEL, declaredToleranceMm: 0.5 });
  assert.ok(tight.sfsaInvToleranceMargin < 1);
  assert.equal(tight._sfsaInvTolerance.grade, 'CT7');
  const ok = extractMeasures(casting(STEEL), { material: STEEL, declaredToleranceMm: 1.0 });
  assert.ok(ok.sfsaInvToleranceMargin > 1);
  const r = runDfmRules(casting(STEEL), 'investment-casting', { material: STEEL, declaredToleranceMm: 0.5 });
  assert.ok(r.findings.some((x) => x.id === 'inv-tolerance-capability'));
});

test('flatness: declared callout vs CTG at the bounding diagonal, steel only', () => {
  // Diagonal of 300x200 = 361 mm -> CTG7 band 300-1000 = 3.0 mm.
  const tight = extractMeasures(casting(STEEL), { material: STEEL, flatnessMm: 1.5 });
  assert.ok(tight.sfsaSandFlatnessMargin < 1, `1.5 vs 3.0 must fail, got ${tight.sfsaSandFlatnessMargin}`);
  assert.equal(tight._sfsaSandFlatness.capabilityMm, 3.0);
  assert.ok(tight.sfsaInvFlatnessMargin < 1, 'CTG6 gives 2.0 - 1.5 fails there too');
  const loose = extractMeasures(casting(STEEL), { material: STEEL, flatnessMm: 4 });
  assert.ok(loose.sfsaSandFlatnessMargin > 1);
  // Steel only.
  const al = extractMeasures(casting('Aluminium A356 (cast)'), { material: 'Aluminium A356 (cast)', flatnessMm: 1.5 });
  assert.equal(al.sfsaSandFlatnessMargin, undefined);
  const r = runDfmRules(casting(STEEL), 'sand-casting', { material: STEEL, flatnessMm: 1.5 });
  assert.ok(r.findings.some((x) => x.id === 'sand-flatness-capability'));
  const bare = runDfmRules(casting(STEEL), 'sand-casting', { material: STEEL });
  assert.ok(bare.notEvaluated.some((x) => x.id === 'sand-flatness-capability'), 'undeclared flatness abstains');
});

test('machining stock vs RMA: judged at grade F at the part size, abstains undeclared', () => {
  // 300 mm largest dimension -> 250-400 band, grade F = 2.5 mm.
  const short = extractMeasures(casting(STEEL), { material: STEEL, machiningStockMm: 1.5 });
  assert.ok(short.sfsaMachiningStockMargin < 1, `1.5 vs RMA 2.5 must fail, got ${short.sfsaMachiningStockMargin}`);
  assert.equal(short._sfsaRma.requiredMm, 2.5);
  const enough = extractMeasures(casting(STEEL), { material: STEEL, machiningStockMm: 3 });
  assert.ok(enough.sfsaMachiningStockMargin > 1);
  const r = runDfmRules(casting(STEEL), 'sand-casting', { material: STEEL, machiningStockMm: 1.5 });
  assert.ok(r.findings.some((x) => x.id === 'sand-machining-stock'));
  const bare = runDfmRules(casting(STEEL), 'sand-casting', { material: STEEL });
  assert.ok(bare.notEvaluated.some((x) => x.id === 'sand-machining-stock'));
});

test('the report figures: CT summary always, capability models when the weight is known', () => {
  const m = extractMeasures(casting(STEEL), { material: STEEL, weightKg: 60 });
  assert.equal(m._sfsaCtSummary.grade, 'CT13');
  assert.equal(m._sfsaCtSummary.largestDimensionMm, 300);
  assert.ok(m._sfsaCtSummary.totalBandMm > 0);
  assert.ok(m._sfsaCapabilityModel.greenSand.p50Mm > 0);
  assert.ok(m._sfsaCapabilityModel.shell.unavailable, '60 kg is outside the shell model\'s 50 kg fit');
  assert.equal(m._sfsaWeightTolerance.machineMoldedPct, 5);
  // Without weight the models are absent, never guessed.
  const noW = extractMeasures(casting(STEEL), { material: STEEL });
  assert.equal(noW._sfsaCapabilityModel, undefined);
  assert.ok(noW._sfsaCtSummary, 'the CT summary needs only the geometry');
});
