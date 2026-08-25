// Prism memory core — signatures that refuse defaults, similarity that
// explains itself, fleet and teardown ranking that stay quiet on weak matches.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  geoSignature, geoSimilarity, rankSimilarRuns, rankTeardowns,
  teardownRelevance, FLEET_MIN_SIMILARITY,
} from '../prism-memory.mjs';

const GEO = {
  boundingBox: { xMm: 40, yMm: 40, zMm: 20 },
  volume: { cm3: 14.647 },
  fillRatio: 0.4577,
  faces: { total: 9 },
  wallThickness: { characteristicMm: 8 },
};

describe('geoSignature', () => {
  it('is orientation-independent and compact', () => {
    const a = geoSignature(GEO);
    const b = geoSignature({ ...GEO, boundingBox: { xMm: 20, yMm: 40, zMm: 40 } });
    assert.deepEqual(a.bboxMm, b.bboxMm);
    assert.equal(a.volCm3, 14.647);
  });
  it('refuses to sign insufficient geometry — absent is not a default', () => {
    assert.equal(geoSignature(null), null);
    assert.equal(geoSignature({ boundingBox: { xMm: 40, yMm: 40 } }), null);
    assert.equal(geoSignature({ boundingBox: { xMm: 40, yMm: 40, zMm: 20 }, volume: {} }), null);
  });
});

describe('geoSimilarity', () => {
  it('identical parts score 1 with a full component basis', () => {
    const s = geoSimilarity(geoSignature(GEO), geoSignature(GEO));
    assert.equal(s.score, 1);
    for (const k of ['shape', 'size', 'wall', 'solidity', 'complexity']) {
      assert.ok(k in s.components, `missing component ${k}`);
      assert.match(s.basis, new RegExp(k));
    }
  });
  it('a scaled twin stays similar; an unrelated shape does not', () => {
    const twin2x = geoSignature({ ...GEO, boundingBox: { xMm: 50, yMm: 50, zMm: 25 }, volume: { cm3: 28.6 }, wallThickness: { characteristicMm: 10 } });
    const s = geoSimilarity(geoSignature(GEO), twin2x);
    assert.ok(s.score >= FLEET_MIN_SIMILARITY, `scaled twin scored ${s.score}`);
    const rod = geoSignature({ boundingBox: { xMm: 300, yMm: 12, zMm: 12 }, volume: { cm3: 30 }, fillRatio: 0.95, faces: { total: 120 }, wallThickness: { characteristicMm: 12 } });
    const u = geoSimilarity(geoSignature(GEO), rod);
    assert.ok(u.score < FLEET_MIN_SIMILARITY, `unrelated rod scored ${u.score}`);
  });
  it('an absent component is excluded, never treated as a match', () => {
    const noWall = geoSignature({ ...GEO, wallThickness: {} });
    const s = geoSimilarity(geoSignature(GEO), noWall);
    assert.ok(!('wall' in s.components));
    assert.ok(s.score <= 1);
  });
});

describe('rankSimilarRuns', () => {
  const sig = geoSignature(GEO);
  it('gates on the threshold and ranks best-first', () => {
    const near = { signature: geoSignature({ ...GEO, volume: { cm3: 16 } }), partName: 'near' };
    const far = { signature: geoSignature({ boundingBox: { xMm: 300, yMm: 12, zMm: 12 }, volume: { cm3: 30 }, fillRatio: 0.95, faces: { total: 120 }, wallThickness: { characteristicMm: 12 } }), partName: 'far' };
    const exact = { signature: sig, partName: 'exact' };
    const ranked = rankSimilarRuns(sig, [near, far, exact]);
    assert.deepEqual(ranked.map(r => r.run.partName), ['exact', 'near']);
    assert.ok(ranked.every(r => r.similarity.score >= FLEET_MIN_SIMILARITY));
  });
  it('is silent with no signature or no history', () => {
    assert.deepEqual(rankSimilarRuns(null, [{ signature: sig }]), []);
    assert.deepEqual(rankSimilarRuns(sig, []), []);
  });
});

describe('teardown ranking', () => {
  const ctx = { materialKey: 'Steel (mild)', materialFamily: 'steel', processKey: 'Stamping / Deep Drawing', processFamily: 'sheet-metal', partName: 'Hood Bracket' };
  it('scores key > family > name-token, and gates out the irrelevant', () => {
    assert.equal(teardownRelevance({ materialKey: 'Steel (mild)', processKey: 'Stamping / Deep Drawing' }, ctx), 4);
    assert.equal(teardownRelevance({ materialFamily: 'steel', processFamily: 'sheet-metal' }, ctx), 2);
    assert.equal(teardownRelevance({ partName: 'bracket, hood hinge' }, ctx), 1);
    assert.equal(teardownRelevance({ materialKey: 'Aluminium 6061', partName: 'rotor shaft' }, ctx), 0);
  });
  it('ranks and caps', () => {
    const entries = [
      { id: 1, materialKey: 'Steel (mild)', processKey: 'Stamping / Deep Drawing', createdAt: '2026-01-01' },
      { id: 2, partName: 'hood reinforcement', createdAt: '2026-02-01' },
      { id: 3, materialKey: 'Aluminium 6061', createdAt: '2026-03-01' },
    ];
    const ranked = rankTeardowns(entries, ctx);
    assert.deepEqual(ranked.map(r => r.entry.id), [1, 2]);
  });
});
