// TRIZ core: the 40 principles and 39 parameters are complete and correct,
// curated pairs are deterministic, and the affinity model covers every pair.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PRINCIPLES, PARAMETERS, recommendPrinciples, trizCatalogue } from '../triz.mjs';

describe('triz core', () => {
  it('has exactly the 40 classical principles, ids 1..40, all fields present', () => {
    assert.equal(PRINCIPLES.length, 40);
    assert.deepEqual(PRINCIPLES.map(p => p.id), Array.from({ length: 40 }, (_, i) => i + 1));
    for (const p of PRINCIPLES) {
      assert.ok(p.name && p.hint && p.auto, `principle ${p.id} missing a field`);
      assert.ok(p.auto.length > 20, `principle ${p.id} needs a real automotive example`);
    }
  });

  it('has exactly the 39 classical engineering parameters, ids 1..39', () => {
    assert.equal(PARAMETERS.length, 39);
    assert.deepEqual(PARAMETERS.map(p => p.id), Array.from({ length: 39 }, (_, i) => i + 1));
  });

  it('recommends from the curated set for a classic cost pair (lighter vs strength)', () => {
    const r = recommendPrinciples(1, 14, 4);
    assert.equal(r.basis, 'curated classical pair');
    assert.equal(r.principles.length, 4);
    // Principle 40 (composite materials) and 1 (segmentation) are canonical here.
    const ids = r.principles.map(p => p.id);
    assert.ok(ids.includes(40) || ids.includes(1));
    assert.equal(r.improving.id, 1);
    assert.equal(r.worsening.id, 14);
  });

  it('falls back to the affinity model for an uncurated pair, still valid', () => {
    const r = recommendPrinciples(9, 22, 4);   // speed vs energy loss — not curated
    assert.equal(r.basis, 'affinity model (pair not in curated set)');
    assert.equal(r.principles.length, 4);
    for (const p of r.principles) assert.ok(p.id >= 1 && p.id <= 40 && p.name);
  });

  it('covers EVERY (improving × worsening) pair without error and returns distinct valid principles', () => {
    let checked = 0;
    for (let i = 1; i <= 39; i++) {
      for (let w = 1; w <= 39; w++) {
        if (i === w) continue;
        const r = recommendPrinciples(i, w, 4);
        assert.ok(r.principles.length >= 3, `pair ${i}|${w} returned too few`);
        const ids = r.principles.map(p => p.id);
        assert.equal(new Set(ids).size, ids.length, `pair ${i}|${w} has duplicate principles`);
        for (const id of ids) assert.ok(id >= 1 && id <= 40);
        checked++;
      }
    }
    assert.equal(checked, 39 * 38);
  });

  it('is deterministic — same pair yields the same principles every call', () => {
    const a = recommendPrinciples(2, 32).principles.map(p => p.id);
    const b = recommendPrinciples(2, 32).principles.map(p => p.id);
    assert.deepEqual(a, b);
  });

  it('rejects out-of-range parameter ids', () => {
    assert.throws(() => recommendPrinciples(0, 14));
    assert.throws(() => recommendPrinciples(1, 40));
    assert.throws(() => recommendPrinciples(99, 1));
  });

  it('exposes a compact catalogue for prompts/UI', () => {
    const c = trizCatalogue();
    assert.equal(c.principles.length, 40);
    assert.equal(c.parameters.length, 39);
  });
});
