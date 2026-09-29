// TRIZ Studio review, 29 Sept 2026 — pinned as behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recommendPrinciples, PRINCIPLES, CURATED_BASIS, AFFINITY_BASIS, PHYSICAL_BASIS } from '../triz.mjs';

test('one parameter against itself is a physical contradiction, not a pair', () => {
  const r = recommendPrinciples(14, 14);
  assert.equal(r.physical, true);
  assert.equal(r.basis, PHYSICAL_BASIS);
  assert.equal(r.property, 'Strength');
  assert.deepEqual(r.principles, []);
});

test('the worsening parameter can nominate principles, not only reorder them', () => {
  // 9 (speed) × 32 (ease of manufacture): principle 1 is on 32's list, not 9's.
  const r = recommendPrinciples(9, 32);
  assert.equal(r.basis, AFFINITY_BASIS);
  assert.ok(r.principles.some(p => p.id === 1), 'a worsening-side principle appears');
  // Across its 38 partners an improving parameter now gets a real spread of
  // answers — it was as few as 3 when the worsening side could only reorder.
  let minDistinct = Infinity;
  for (let i = 1; i <= 39; i++) {
    const seen = new Set();
    for (let w = 1; w <= 39; w++) {
      if (w === i) continue;
      const ids = recommendPrinciples(i, w, 4).principles.map(p => p.id);
      assert.equal(new Set(ids).size, 4, `${i}×${w} must give 4 distinct principles`);
      seen.add(ids.join(','));
    }
    minDistinct = Math.min(minDistinct, seen.size);
  }
  assert.ok(minDistinct >= 20, `min distinct answers ${minDistinct}`);
});

test('a principle on both lists outranks one on either', () => {
  // 1 (weight moving) × 27 is curated; pick an uncurated pair with overlap:
  // 3 × 4 share 1, 7, 14, 17, 35 — the first four shared ones lead.
  const ids = recommendPrinciples(3, 4).principles.map(p => p.id);
  for (const id of ids) assert.ok([1, 7, 14, 17, 35].includes(id), `${id} is on both lists`);
});

test('curated pairs are not called "classical" — no source is cited for them', () => {
  const r = recommendPrinciples(1, 14);
  assert.equal(r.basis, CURATED_BASIS);
  assert.doesNotMatch(r.basis, /classical/);
  assert.match(r.basis, /not verified/);
  assert.ok(PRINCIPLES.length === 40);
});

test('the routes stop on disconnect and no longer claim every £ figure is checked', () => {
  const route = readFileSync(new URL('../routes/triz.mjs', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /registerTrizRoutes\(app, \{[^}]*runAbort[^}]*\}\)/);
  assert.equal((route.match(/abortable\(res, 'TRIZ (resolve|trim|separate)'\)/g) || []).length, 3);
  // Only the explanatory comment may still quote the old claim.
  assert.equal((route.match(/every £ figure is engine-checked or labelled/g) || []).length, 0);
  const page = readFileSync(new URL('../src/pages/TrizStudioPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /every £ figure is engine-checked or labelled/);
});
