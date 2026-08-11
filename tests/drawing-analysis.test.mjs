// The pure half of the 2D-drawing pipeline: normalization, unit conversion,
// rule-input mapping and the deterministic reconciliation against a 3D model.
// No LLM anywhere in this file — the extraction step is a fake in the route
// test, and everything downstream of it must be provable arithmetic.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeExtraction, drawingToRuleInputs, crossCheckDrawing, geoFromDrawing,
  mergeDrawingIntoGeo, DRAWING_SCHEMA,
} from '../drawing-analysis.mjs';

const raw = (over = {}) => ({
  units: 'mm', readability: 'good',
  dimensions: [], gdt: [], roughness: [], notes: [],
  ...over,
});

test('normalization: inch drawings convert once, and the conversion is recorded', () => {
  const d = normalizeExtraction(raw({
    units: 'inch',
    dimensions: [{ nominal: 0.5, plus: 0.005, minus: 0.005, type: 'diameter', toleranced: true, sourceText: 'Ø.500 ±.005' }],
    overall: { width: 4, height: 2, thickness: 0.25 },
  }));
  assert.equal(d.dimensions[0].nominalMm, 12.7);
  assert.equal(d.dimensions[0].bandMm, 0.254);
  assert.equal(d.overall.widthMm, 101.6);
  assert.ok(d.conversions.some((c) => /inches to millimetres/.test(c)));
  // Unknown units are taken as mm WITH a stated caveat, never silently.
  const u = normalizeExtraction(raw({ units: 'unknown' }));
  assert.ok(u.conversions.some((c) => /does not state its units/.test(c)));
});

test('normalization: the band is plus+minus, else the printed total — and absent stays ABSENT', () => {
  const d = normalizeExtraction(raw({
    dimensions: [
      { nominal: 50, plus: 0.1, minus: 0.2, type: 'linear', toleranced: true, sourceText: '50 +0.1/-0.2' },
      { nominal: 30, totalBand: 0.5, type: 'linear', toleranced: true, sourceText: '30 ±0.25' },
      { nominal: 20, type: 'linear', toleranced: false, sourceText: '20' },
    ],
  }));
  assert.equal(d.dimensions[0].bandMm, 0.3);
  assert.equal(d.dimensions[1].bandMm, 0.5);
  assert.equal(d.dimensions[2].bandMm, undefined, 'no printed band must stay undefined, never 0');
  // toleranced=true claimed without any band is demoted — a tolerance claim
  // with no band is not evidence.
  const t = normalizeExtraction(raw({
    dimensions: [{ nominal: 10, type: 'linear', toleranced: true, sourceText: '10' }],
  }));
  assert.equal(t.dimensions[0].toleranced, false);
});

test('normalization: clamps, garbage rejection, and string hygiene', () => {
  assert.equal(normalizeExtraction(null).ok, false);
  assert.equal(normalizeExtraction('x').ok, false);
  const d = normalizeExtraction(raw({
    dimensions: [
      { nominal: -5, type: 'linear', toleranced: true, sourceText: 'bad' },      // dropped
      { nominal: 'NaN', type: 'linear', toleranced: true, sourceText: 'bad' },   // dropped
      { nominal: 8, totalBand: 0.1, type: 'nope', toleranced: true, sourceText: 'Ø8' }, // type coerced
    ],
    titleBlock: { material: 'PA66 <script>alert(1)</script>', revision: 'C' },
  }));
  assert.equal(d.dimensions.length, 1);
  assert.equal(d.dimensions[0].type, 'linear');
  assert.ok(!d.titleBlock.material.includes('<'), 'angle brackets are stripped');
});

test('rule inputs: tightest band, flatness frame, Ra conversion, general-note recognition', () => {
  const d = normalizeExtraction(raw({
    dimensions: [
      { nominal: 50, totalBand: 0.6, type: 'linear', toleranced: true, sourceText: '50 ±0.3' },
      { nominal: 8, totalBand: 0.1, type: 'diameter', toleranced: true, sourceText: 'Ø8 ±0.05' },
      { nominal: 45, totalBand: 1, type: 'angle', toleranced: true, sourceText: '45° ±0.5°' },
      { nominal: 120, type: 'linear', toleranced: false, sourceText: '120' },
    ],
    gdt: [
      { symbol: 'flatness', tolerance: 0.4, sourceText: '⏥ 0.4' },
      { symbol: 'flatness', tolerance: 0.2, sourceText: '⏥ 0.2' },
      { symbol: 'position', tolerance: 0.5, datums: ['A', 'B'], sourceText: '⌖ 0.5 A B' },
    ],
    roughness: [{ raUm: 1.6, scope: 'all machined', sourceText: 'Ra 1.6' }],
    titleBlock: { generalToleranceNote: 'DIN 16742 - TG6' },
  }));
  const inputs = drawingToRuleInputs(d);
  // Angles and untoleranced dims never become tolerance evidence.
  assert.equal(inputs.pmiDimensions.length, 2);
  assert.equal(inputs.tightestToleranceMm, 0.1);
  assert.equal(inputs.flatnessMm, 0.2, 'the tightest flatness frame governs');
  assert.equal(inputs.surfaceRoughnessUin, 63, 'Ra 1.6 µm is 63 µin');
  assert.deepEqual([inputs.generalTolerance.standard, inputs.generalTolerance.cls], ['DIN 16742', 'TG6']);
  // ISO 2768 is recognized too, and stays informational (no synthesized bands).
  const iso = drawingToRuleInputs(normalizeExtraction(raw({ titleBlock: { generalToleranceNote: 'ISO 2768-mK' } })));
  assert.equal(iso.generalTolerance.standard, 'ISO 2768');
  assert.equal(iso.pmiDimensions.length, 0);
});

// A minimal measured part for the reconciliation tests.
const GEO = {
  boundingBox: { xMm: 120, yMm: 60, zMm: 20 },
  featureTable: [{ kind: 'hole', diaMm: 8.0, depthMm: 12, through: true }],
  dfm: { wallThickness: { p5Mm: 2.4, p50Mm: 2.5, p95Mm: 2.7 } },
};

test('cross-check: confirmed inside its own band, conflict outside it, not-found is not a conflict', () => {
  const d = normalizeExtraction(raw({
    dimensions: [
      { nominal: 8, totalBand: 0.2, type: 'diameter', toleranced: true, sourceText: 'Ø8 ±0.1' },   // matches the hole
      { nominal: 8.5, totalBand: 0.2, type: 'diameter', toleranced: true, sourceText: 'Ø8.5 ±0.1' }, // conflicts with it
      { nominal: 47.3, totalBand: 0.2, type: 'linear', toleranced: true, sourceText: '47.3 ±0.1' },  // nothing near it
    ],
  }));
  const check = crossCheckDrawing(d, GEO);
  const by = (t) => check.rows.find((r) => r.sourceText === t);
  assert.equal(by('Ø8 ±0.1').status, 'confirmed');
  assert.match(by('Ø8 ±0.1').note, /hole diameter/);
  assert.equal(by('Ø8.5 ±0.1').status, 'conflict');
  assert.match(by('Ø8.5 ±0.1').note, /cannot say which/);
  assert.equal(by('47.3 ±0.1').status, 'not-found');
  assert.match(by('47.3 ±0.1').note, /not a conflict/);
  assert.deepEqual(check.counts, { confirmed: 1, conflict: 1, notFound: 1 });
});

test('cross-check: untoleranced dimensions use a stated default window', () => {
  const d = normalizeExtraction(raw({
    dimensions: [{ nominal: 120.3, type: 'linear', toleranced: false, sourceText: '120.3' }],
  }));
  // 120.3 vs the 120 mm extent: inside the max(0.5, 0.6) window → confirmed.
  const check = crossCheckDrawing(d, GEO);
  assert.equal(check.rows[0].status, 'confirmed');
  assert.match(check.rows[0].note, /untoleranced/);
  assert.match(check.basis, /default window/);
});

test('cross-check: an inch drawing read as millimetres is flagged against the model scale', () => {
  const d = normalizeExtraction(raw({
    overall: { width: 4.7, height: 2.4, thickness: 0.8 },
    dimensions: [{ nominal: 4.7, type: 'linear', toleranced: false, sourceText: '4.70' }],
  }));
  const check = crossCheckDrawing(d, GEO);   // model largest 120 ≈ 4.7 × 25.5
  assert.equal(check.unitsSuspect, true);
});

test('drawing-only geometry: bounding box only from explicit overall dims, pmi block shaped for the engine', () => {
  const withOverall = geoFromDrawing(normalizeExtraction(raw({
    dimensions: [{ nominal: 50, totalBand: 0.6, type: 'linear', toleranced: true, sourceText: '50 ±0.3' }],
    overall: { width: 120, height: 60, thickness: 20 },
    titleBlock: { drawingNumber: 'DWG-042' },
  })));
  assert.equal(withOverall.boundingBox.xMm, 120);
  assert.equal(withOverall.partName, 'DWG-042');
  assert.equal(withOverall.dfm.pmi.source, 'drawing');
  assert.equal(withOverall.dfm.pmi.present, true);
  assert.deepEqual(withOverall.dfm.pmi.dimensions, [{ value: 50, span: 0.6 }]);
  assert.equal(withOverall.dfm.pmi.tightestToleranceMm, 0.6);
  // No explicit overall dims → NO bounding box. Deriving one from the
  // largest callouts would be invention.
  const bare = geoFromDrawing(normalizeExtraction(raw({
    dimensions: [{ nominal: 200, totalBand: 1, type: 'linear', toleranced: true, sourceText: '200 ±0.5' }],
  })));
  assert.equal(bare.boundingBox, undefined);
  assert.equal(bare.volume, undefined, 'volume must stay undefined, never 0');
});

test('merge: the drawing replaces the pmi block, the original survives, nothing is mutated', () => {
  const d = normalizeExtraction(raw({
    dimensions: [{ nominal: 30, totalBand: 0.2, type: 'linear', toleranced: true, sourceText: '30 ±0.1' }],
    gdt: [{ symbol: 'flatness', tolerance: 0.3, sourceText: '⏥ 0.3' }],
    roughness: [{ raUm: 3.2, sourceText: 'Ra 3.2' }],
  }));
  const original = { ...GEO, dfm: { ...GEO.dfm, pmi: { present: true, tightestToleranceMm: 0.05, dimensions: [{ value: 10, span: 0.05 }] } } };
  const { geo, previousPmi, applied } = mergeDrawingIntoGeo(original, d, { sourceNote: 'test note' });
  assert.equal(geo.dfm.pmi.source, 'drawing');
  assert.equal(geo.dfm.pmi.sourceNote, 'test note');
  assert.equal(previousPmi.tightestToleranceMm, 0.05, 'the displaced AP242 block is returned, not discarded');
  assert.equal(original.dfm.pmi.tightestToleranceMm, 0.05, 'the input object is never mutated');
  // ONLY the dimensions: flatness and roughness are the caller's to record
  // (typed values win there). Recording them here too printed each twice on
  // the live payload — the fault the E2E run caught.
  assert.deepEqual(applied, ['1 toleranced dimensions'],
    'merge must not claim inputs the route applies, or the payload lists them twice');
});

test('the schema never requires a number the model might have to invent', () => {
  const dim = DRAWING_SCHEMA.properties.dimensions.items;
  assert.ok(!dim.required.includes('plus') && !dim.required.includes('minus') && !dim.required.includes('totalBand'),
    'tolerance fields must be optional so an unreadable value can be omitted');
  assert.ok(DRAWING_SCHEMA.properties.overall.description.includes('Never derive'));
});
