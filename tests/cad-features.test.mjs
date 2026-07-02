import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeOrientations, deriveFeatureMap, inferProcess, runDfmaRules, analyzeFeatures,
} from '../src/services/cad-features.mjs';

test('summarizeOrientations: flat box (6 dominant faces) reads as highly planar', () => {
  // a cube: 6 faces each 1/6 of area
  const buckets = [1, 1, 1, 1, 1, 1];
  const s = summarizeOrientations(buckets, 6);
  assert.ok(s.flatAreaFraction > 0.95);
  assert.equal(s.dominantOrientations, 6);
});

test('summarizeOrientations: a sphere (spread normals) reads as curved', () => {
  const buckets = new Array(200).fill(1); // many tiny buckets, none >2%
  const s = summarizeOrientations(buckets, 200);
  assert.ok(s.curvedAreaFraction > 0.9);
  assert.equal(s.dominantOrientations, 0);
});

test('thin flat plate → sheet metal / stamping', () => {
  // 200 x 200 x 2 mm plate: V = 80,000 mm³ = 80 cm³; A ≈ 2*40000 + 4*400 = 81,600 mm² = 816 cm²
  const fm = deriveFeatureMap({
    volumeCm3: 80, surfaceAreaCm2: 816, bbox: { x: 200, y: 200, z: 2 },
    orientation: { flatAreaFraction: 0.96, curvedAreaFraction: 0.04, dominantOrientations: 2 },
  });
  assert.ok(fm.charThicknessMm < 2.5, `charThickness ${fm.charThicknessMm}`);
  assert.ok(fm.thinWalled);
  assert.ok(fm.prismatic);
  const p = inferProcess(fm);
  assert.equal(p[0].process, 'Sheet metal / stamping');
});

test('chunky curved solid → casting', () => {
  const fm = deriveFeatureMap({
    volumeCm3: 700, surfaceAreaCm2: 520, bbox: { x: 120, y: 100, z: 90 },
    orientation: { flatAreaFraction: 0.3, curvedAreaFraction: 0.7, dominantOrientations: 3 },
  });
  assert.ok(fm.chunky);
  assert.ok(fm.highCurvature);
  assert.equal(inferProcess(fm)[0].process, 'Die casting / investment casting');
});

test('hollow prismatic body → machined-from-billet + material-utilisation DFMA flag', () => {
  const fm = deriveFeatureMap({
    volumeCm3: 120, surfaceAreaCm2: 600, bbox: { x: 100, y: 80, z: 60 }, // bboxVol 480cm³ → solidity 0.25
    orientation: { flatAreaFraction: 0.8, curvedAreaFraction: 0.2, dominantOrientations: 6 },
  });
  assert.ok(fm.hollow, `solidity ${fm.solidity}`);
  assert.equal(inferProcess(fm)[0].process, 'Machined from billet');
  const dfma = runDfmaRules(fm);
  assert.ok(dfma.some(f => f.id === 'material-utilisation' && f.severity === 'high'));
});

test('DFMA: tight tolerance text is detected', () => {
  const fm = deriveFeatureMap({ volumeCm3: 100, surfaceAreaCm2: 200, bbox: { x: 50, y: 50, z: 50 } });
  const dfma = runDfmaRules(fm, { toleranceText: 'bore Ø20 H7, flatness 0.02' });
  assert.ok(dfma.some(f => f.id === 'tight-tolerance'));
});

test('analyzeFeatures one-call returns featureMap + processes + dfma', () => {
  const r = analyzeFeatures({
    volumeCm3: 80, surfaceAreaCm2: 816, bbox: { x: 200, y: 200, z: 2 },
    bucketAreas: [40000, 40000, 800, 800], totalArea: 81600,
  });
  assert.ok(r.featureMap && Array.isArray(r.processes) && Array.isArray(r.dfma));
  assert.ok(r.processes.length >= 1);
});

test('degenerate input does not throw', () => {
  const fm = deriveFeatureMap({});
  assert.equal(fm.solidity, 0);
  assert.doesNotThrow(() => inferProcess(fm));
  assert.doesNotThrow(() => runDfmaRules(fm));
});
