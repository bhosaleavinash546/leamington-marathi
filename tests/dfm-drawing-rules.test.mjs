// Drawing evidence through the RULE ENGINE: the synthesized pmi block must
// fire every tolerance-capability judge with `from: 'drawing'` and a basis
// that says so — and must leave every declared-path string byte-identical,
// because six provenance sites were touched and the existing suites assert
// on their exact wording.
import test from 'node:test';
import assert from 'node:assert/strict';

import { runDfmRules, extractMeasures } from '../dfm-rules.mjs';
import { normalizeExtraction, geoFromDrawing } from '../drawing-analysis.mjs';

const DRAWING = normalizeExtraction({
  units: 'mm', readability: 'good',
  dimensions: [
    { nominal: 50, totalBand: 0.6, type: 'linear', toleranced: true, sourceText: '50 ±0.3' },
    { nominal: 8, totalBand: 0.1, type: 'diameter', toleranced: true, sourceText: 'Ø8 ±0.05' },
  ],
  gdt: [{ symbol: 'flatness', tolerance: 0.4, sourceText: '⏥ 0.4' }],
  overall: { width: 120, height: 60, thickness: 20 },
  titleBlock: { drawingNumber: 'DWG-100' },
});

// A full 3D-style fixture whose pmi block came from the drawing — the
// combined-analysis case, geometry measured, tolerances drawing-read.
function combined(material) {
  return {
    boundingBox: { xMm: 120, yMm: 60, zMm: 20 },
    geometry: { boundingBox: { xMm: 120, yMm: 60, zMm: 20 }, featureTable: [] },
    dfm: {
      wallThickness: { p5Mm: 8, p50Mm: 9, p95Mm: 10, spreadRatio: 0.2 },
      draft: { drawDirectionXYZ: [0, 0, 1], undercutFaceCount: 0, draftHistogramDegToAreaMm2: { 3: 1000 } },
      pmi: {
        present: true, source: 'drawing',
        sourceNote: 'read from the uploaded 2D drawing by AI vision; 1 of 2 dimensions confirmed against the 3D model within their own bands',
        dimensionCount: 2, dimensions: [{ value: 50, span: 0.6 }, { value: 8, span: 0.1 }],
        tightestToleranceMm: 0.1,
      },
      features: { ribs: [], minInternalCornerRadiusMm: 14, prismatic: [] },
      setups: {},
    },
    material,
  };
}

test('all five capability judges fire on drawing rows with from: drawing and a drawing basis', () => {
  // One fixture, five standards — the same rows judged by whichever document
  // owns the family. The worst row (Ø8 span 0.1) drives every margin.
  const al = extractMeasures(combined('Aluminium A380 / ADC12 (die-cast)'), { material: 'Aluminium A380 / ADC12 (die-cast)' });
  assert.equal(al._nadca402Tolerance.from, 'drawing');
  assert.match(al._nadca402Tolerance.basis, /2D drawing/);

  const alCast = extractMeasures(combined('Aluminium A356 (cast)'), { material: 'Aluminium A356 (cast)' });
  assert.equal(alCast._sfsaSandTolerance.from, 'drawing');
  assert.match(alCast._sfsaSandTolerance.basis, /2D drawing/);
  assert.equal(alCast._sfsaInvTolerance.from, 'drawing');
  assert.equal(alCast._iso8062PmTolerance.from, 'drawing');
  assert.match(alCast._iso8062PmTolerance.basis, /confirmed against the 3D model/);

  const steel = extractMeasures(combined('Steel (mild)'), { material: 'Steel (mild)' });
  assert.equal(steel._sfsaSandTolerance.from, 'drawing', 'the SFSA CT path carries the label too');

  const pc = extractMeasures(combined('Polycarbonate (PC)'), { material: 'Polycarbonate (PC)' });
  assert.equal(pc._din16742Tolerance.from, 'drawing');
  assert.match(pc._din16742Tolerance.basis, /2D drawing/);

  // The screening path (a material neither casting standard tabulates).
  const ti = extractMeasures(combined('Titanium Ti-6Al-4V'), { material: 'Titanium Ti-6Al-4V' });
  assert.equal(ti._sfsaSandTolerance.from, 'drawing');
  assert.match(ti._sfsaSandTolerance.basis, /2D drawing.*screening/s);
});

test('tightestToleranceMm carries the drawing basis — the third evidence state', () => {
  const m = extractMeasures(combined('Aluminium A356 (cast)'), { material: 'Aluminium A356 (cast)' });
  assert.equal(m.tightestToleranceMm, 0.1);
  assert.match(m._toleranceBasis, /confirmed against the 3D model/);
  // Real AP242 PMI keeps its exact original wording.
  const ap242 = combined('Steel (mild)');
  delete ap242.dfm.pmi.source;
  delete ap242.dfm.pmi.sourceNote;
  const m2 = extractMeasures(ap242, { material: 'Steel (mild)' });
  assert.equal(m2._toleranceBasis, 'read from the model\'s AP242 semantic PMI');
  // And the DECLARED wording is untouched.
  const bare = { dfm: { wallThickness: { p50Mm: 3 }, draft: {}, features: {}, setups: {} } };
  const m3 = extractMeasures(bare, { declaredToleranceMm: 0.2 });
  assert.equal(m3._toleranceBasis, 'DECLARED by the engineer — not read from the model, and not verified against it');
});

test('declared-path strings stay byte-identical at every touched site', () => {
  // No pmi at all, declared band only — the strings the existing suites
  // assert on must survive the provenance edits unchanged.
  const geo = {
    boundingBox: { xMm: 120, yMm: 60, zMm: 20 },
    geometry: { boundingBox: { xMm: 120, yMm: 60, zMm: 20 }, featureTable: [] },
    dfm: {
      wallThickness: { p5Mm: 8, p50Mm: 9, p95Mm: 10, spreadRatio: 0.2 },
      draft: { drawDirectionXYZ: [0, 0, 1], undercutFaceCount: 0, draftHistogramDegToAreaMm2: { 3: 1000 } },
      pmi: { present: false, dimensions: [] },
      features: { ribs: [], minInternalCornerRadiusMm: 14, prismatic: [] },
      setups: {},
    },
  };
  const nadca = extractMeasures(geo, { material: 'Aluminium A380 / ADC12 (die-cast)', declaredToleranceMm: 0.3 });
  assert.equal(nadca._nadca402Tolerance.from, 'declared');
  assert.match(nadca._nadca402Tolerance.basis, /first-25\.4 mm base/);
  const sfsa = extractMeasures(geo, { material: 'Steel (mild)', declaredToleranceMm: 2 });
  assert.equal(sfsa._sfsaSandTolerance.from, 'declared');
  assert.match(sfsa._sfsaSandTolerance.basis, /^The band was DECLARED by the engineer, without its dimension\./);
  const din = extractMeasures(geo, { material: 'Polycarbonate (PC)', declaredToleranceMm: 0.1 });
  assert.equal(din._din16742Tolerance.from, 'declared');
  assert.match(din._din16742Tolerance.basis, /^The band was DECLARED by the engineer, without its dimension\./);
});

test('drawing-only analysis: tolerance rules evaluate, geometry rules abstain', () => {
  const geo = geoFromDrawing(DRAWING);
  // Injection moulding on PC: the DIN judge fires from the drawing rows...
  const im = runDfmRules(geo, 'injection-moulding', { material: 'Polycarbonate (PC)' });
  const tol = [...im.findings, ...im.passed].find((f) => f.id === 'im-tolerance-capability');
  assert.ok(tol, 'the tolerance rule must be judged from the drawing alone');
  assert.match(tol.measuredBasis, /2D drawing/);
  // ...while every wall/draft rule abstains: no 3D measurements exist.
  assert.ok(im.notEvaluated.some((f) => f.measure === 'wallAreaBelowDraftPct'));
  assert.ok(im.notEvaluated.some((f) => /wall/i.test(f.measure)));
  // Die casting too — the NADCA judge reads the same rows.
  const dc = runDfmRules(geo, 'hpdc', { material: 'Aluminium A380 / ADC12 (die-cast)' });
  const dcTol = [...dc.findings, ...dc.passed].find((f) => f.measure === 'nadca402ToleranceMargin');
  assert.ok(dcTol, 'the #402 judge needs only an alloy and the drawing rows');
  assert.equal(dcTol.measuredBasis && /2D drawing/.test(dcTol.measuredBasis), true);
});

test('drawing-only without explicit overall dims: flatness abstains for want of a diagonal', () => {
  const noOverall = normalizeExtraction({
    units: 'mm', readability: 'good',
    dimensions: [{ nominal: 50, totalBand: 0.6, type: 'linear', toleranced: true, sourceText: '50 ±0.3' }],
    gdt: [{ symbol: 'flatness', tolerance: 0.4, sourceText: '⏥ 0.4' }],
  });
  const geo = geoFromDrawing(noOverall);
  const m = extractMeasures(geo, { material: 'Steel (mild)', flatnessMm: 0.4 });
  assert.equal(m.sfsaSandFlatnessMargin, undefined,
    'no bounding box means no diagonal, and the flatness judge must abstain rather than invent one');
  assert.ok(m.sfsaSandToleranceMargin !== undefined, 'the dimensional judge still runs');
});
