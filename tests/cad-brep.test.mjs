import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import occtimportjs from 'occt-import-js';
import { eigenSym3, classifyFace, analyzeBrep, aggregateOcctMeshes } from '../src/services/cad-brep.mjs';

const TF = 'node_modules/occt-import-js/test/testfiles';
let occt;
async function parse(path) {
  if (!occt) occt = await occtimportjs();
  const r = occt.ReadStepFile(new Uint8Array(readFileSync(path)), null);
  assert.ok(r.success, `parse failed: ${path}`);
  return r.meshes;
}

test('eigenSym3: identical normals → one unit eigenvalue, two ~0', () => {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const ns = [[0, 0, 1], [0, 0, 1], [0, 0, 1]];
  for (const n of ns) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (n[i] * n[j]) / 3;
  const e = eigenSym3(C);
  assert.ok(Math.abs(e.values[0] - 1) < 1e-6);
  assert.ok(e.values[1] < 1e-6 && e.values[2] < 1e-6);
});

test('classifyFace: coplanar normals → planar', () => {
  const c = classifyFace([[0, 0, 1], [0, 0, 1], [0, 0, 1]], [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
  assert.equal(c.type, 'planar');
});

test('STEP cube → 6 planar faces, 0 holes, volume ≈ 1 cm³', async () => {
  const meshes = await parse(`${TF}/cube-10x10mm/Cube 10x10.stp`);
  const b = analyzeBrep(meshes);
  assert.equal(b.totalFaces, 6);
  assert.equal(b.planarFaces, 6);
  assert.equal(b.holes, 0);
  const agg = aggregateOcctMeshes(meshes);
  assert.ok(Math.abs(agg.volumeCm3 - 1) < 0.02, `volume ${agg.volumeCm3}`);
  assert.deepEqual(agg.bbox, { x: 10, y: 10, z: 10 });
});

test('STEP rounded-cube → fillet is a boss, NOT a hole', async () => {
  const meshes = await parse(`${TF}/rounded-cube/rounded-cube.step`);
  const b = analyzeBrep(meshes);
  assert.ok(b.cylindricalFaces >= 1, 'should detect the fillet as cylindrical');
  assert.equal(b.holes, 0, 'a convex fillet must not be counted as a hole');
});

test('aggregateOcctMeshes returns null for empty input', () => {
  assert.equal(aggregateOcctMeshes([]), null);
});
