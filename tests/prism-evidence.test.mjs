// Prism review, 3 Oct 2026 — what the measurement found must reach the model,
// with its numbers. Each case comes from the live die-cast housing run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geometryEvidenceLines, dfmFindingLines, routeEvidenceLines, drawingEvidenceLines } from '../part360-evidence.mjs';
import { buildDossier, dossierToPromptBlock, LENSES } from '../part360.mjs';

const GEO = {
  boundingBox: { xMm: 110, yMm: 80, zMm: 50.5 }, volume: { cm3: 67.5 }, surfaceArea: { cm2: 580.2 }, fillRatio: 0.15,
  featureTable: [{ kind: 'boss', diaMm: 8, depthMm: 21.5, count: 2 }, { kind: 'hole', diaMm: 4, depthMm: 24, through: true, count: 2 }],
  dfm: {
    wallThickness: { samples: 472, p5Mm: 1.75, p50Mm: 2.41, p95Mm: 2.5, minMm: 1.75 },
    features: { counts: { rib: 2, 'through-hole': 2, boss: 2 }, ribs: [{ thicknessMm: 1.75, heightMm: 16.8 }] },
    draft: { areaPct: { releasing: 30.9, zeroDraft: 11, undercut: 28.41 }, undercutFaceCount: 9 },
    revolution: { axisymmetricAreaPct: 31.59 },
  },
};

test('the geometry evidence carries the measurement, not a summary of it', () => {
  const t = geometryEvidenceLines(GEO).join('\n');
  for (const want of [/472 rays/, /p5 1\.75 mm, median 2\.41 mm, p95 2\.5 mm/, /2 × rib/, /1\.75 mm thick × 16\.8 mm high/, /30\.9% of wall area releases/, /28\.41% is undercut \(9 undercut faces\)/, /⌀8 × 21\.5 deep/]) assert.match(t, want);
  assert.deepEqual(geometryEvidenceLines(null), []);
});

test('an unpriced finding is never shown as €0.00, and keeps its measurement and fix', () => {
  const [line] = dfmFindingLines([{ severity: 'medium', title: 'Rib taller than the wall will fill and eject', measured: 6.971, unit: 'rib h / wall t', thresholdText: '≤ 3 rib h / wall t', deltaEur: null, fix: 'Limit rib height to about 3x the wall.' }]);
  assert.match(line, /measured 6\.971 rib h \/ wall t vs limit ≤ 3 rib h \/ wall t/);
  assert.match(line, /not engine-priceable/);
  assert.doesNotMatch(line, /€0\.00/);
  assert.match(line, /Rule's fix: Limit rib height/);
  assert.match(dfmFindingLines([{ severity: 'high', title: 'x', deltaEur: 0.42 }])[0], /engine-priced \+€0\.42\/part/);
});

test('routes: the current one, the honest alternatives, and how many were held back', () => {
  const routes = [
    { process: 'Die Casting (Aluminium)', isChosen: true, piecePriceEur: 6.58, score: 57, evaluatedCount: 13, ruleCount: 17, toolingEur: 144000 },
    { process: 'Gravity Die Casting', piecePriceEur: 6.69, deltaPieceEur: 0.11, score: 39, evaluatedCount: 12, ruleCount: 13, toolingEur: 110500, shapeEstablished: true, shapeBasis: 'Forms by filling a closed tool cavity.' },
    { process: 'Cold Heading / Upsetting', piecePriceEur: 3.1, shapeEstablished: false },
  ];
  const t = routeEvidenceLines(routes, [routes[1]]).join('\n');
  assert.match(t, /Current route Die Casting \(Aluminium\): €6\.58\/part, DFM 57 over 13\/17 rules/);
  assert.match(t, /Gravity Die Casting: €6\.69\/part \(\+€0\.11 vs current\)/);
  assert.match(t, /1 other routes were NOT offered/);
  assert.doesNotMatch(t, /Cold Heading/);
});

test('the drawing contributes its title block, tightest callouts, GD&T, finish and notes', () => {
  const t = drawingEvidenceLines({
    titleBlock: { material: 'EN AC-46000', generalToleranceNote: 'ISO 8062-3 DCTG 6' },
    dimensions: [{ toleranced: true, plus: 0.05, minus: 0, sourceText: 'Ø8 +0.05/0' }, { toleranced: false, sourceText: '110' }],
    gdt: [{ symbol: 'flatness', tolerance: 0.05 }], roughness: [{ raUm: 0.8, scope: 'sealing face' }],
    notes: ['Impregnate to MIL-I-17563 class 1'], readability: 'partial',
  }).join('\n');
  for (const want of [/material callout "EN AC-46000"/, /2 dimensions read, 1 individually toleranced/, /Ø8 \+0\.05\/0/, /flatness 0\.05/, /Ra 0\.8 µm on sealing face/, /Impregnate to MIL-I-17563/, /legibility was "partial"/]) assert.match(t, want);
});

test('the dossier prefers measured lines, and the lenses that need them get them', () => {
  const d = buildDossier({
    part: { partName: 'Housing', material: 'Aluminium A380 / ADC12 (die-cast)', process: 'Die Casting (Aluminium)', weightKg: 0.9, annualVolume: 80000, region: 'Germany' },
    geometryLines: ['Wall thickness measured by 472 rays.'], dfmLines: ['[high] Undercuts — measured 9 regions'],
    routeLines: ['Current route Die Casting (Aluminium): €6.58/part.'], drawingLines: ['GD&T frames: flatness 0.05.'],
  });
  const byId = Object.fromEntries(d.sections.map(s => [s.id, s]));
  assert.equal(byId.routes.present, true, 'route section is no longer always empty');
  assert.equal(byId.drawing.present, true);
  assert.match(dossierToPromptBlock(d, 'process'), /472 rays[\s\S]*Current route Die Casting/);
  assert.match(dossierToPromptBlock(d, 'spec'), /flatness 0\.05/);
  for (const id of ['vave', 'material', 'spec']) assert.ok(LENSES.find(l => l.id === id).sections.includes('drawing'), id);
});
