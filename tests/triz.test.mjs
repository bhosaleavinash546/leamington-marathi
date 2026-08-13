// TRIZ core: the 40 principles and 39 parameters are complete and correct,
// curated pairs are deterministic, and the affinity model covers every pair.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRINCIPLES, PARAMETERS, SEPARATIONS, recommendPrinciples, trizCatalogue, separationStrategies,
} from '../triz.mjs';

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
    assert.equal(c.separations.length, 4);
  });
});

// ── Physical contradictions ─────────────────────────────────────────────────
//
// The route that does NOT map onto the 39 parameters. Everything pinned here is
// about it staying that way, and about the principle lists admitting how firmly
// they are sourced.
describe('triz physical contradictions', () => {
  it('has the four classical separation strategies, each with real principles', () => {
    assert.deepEqual(SEPARATIONS.map(s => s.id), ['space', 'time', 'condition', 'system']);
    for (const s of SEPARATIONS) {
      assert.ok(s.principles.length >= 8, `${s.id} has too few principles to be the classical set`);
      for (const id of s.principles) assert.ok(id >= 1 && id <= 40, `${s.id} references principle ${id}`);
      assert.equal(new Set(s.principles).size, s.principles.length, `${s.id} repeats a principle`);
      assert.ok(s.cost && s.cost.length > 40, `${s.id} needs a real cost rationale`);
      assert.ok(Array.isArray(s.examples) && s.examples.length >= 3, `${s.id} needs worked examples`);
    }
  });

  it('GRADES every principle list — published lists differ and the tool must say so', () => {
    // The four strategies are settled; which principles belong to each is not.
    // Asserting one author's list as fact would be a stronger claim than the
    // literature supports, so each carries the same source vocabulary the DFM
    // catalogue uses.
    const GRADES = ['standard-named', 'industry-consensus', 'engine-derived', 'customer-standard'];
    for (const s of SEPARATIONS) {
      assert.ok(GRADES.includes(s.sourceStatus), `${s.id} has an unrecognised sourceStatus`);
      assert.ok(s.source && s.source.length > 20, `${s.id} must name where its list came from`);
    }
  });

  it('resolves a physical contradiction WITHOUT touching the 39 parameters', () => {
    const r = separationStrategies('wall thickness', 'carries the bolt load', 'mass and material cost');
    assert.equal(r.strategies.length, 4);
    assert.match(r.basis, /no mapping onto the 39 parameters/);
    assert.equal(r.contradiction.property, 'wall thickness');
    assert.match(r.contradiction.statement, /must be HIGH \(carries the bolt load\) and LOW \(mass and material cost\)/);
  });

  it('names the property back in every strategy question', () => {
    const r = separationStrategies('clamp load');
    for (const s of r.strategies) {
      assert.match(s.question, /"clamp load"/, `${s.id} did not name the property`);
      assert.ok(!s.question.includes('{property}'), `${s.id} left the placeholder unsubstituted`);
    }
  });

  it('every strategy carries the placeholder — the substitution cannot fail quietly', () => {
    // This was a real bug: the substitution was a plain replace of the phrase
    // "the property", and the one strategy whose wording did not contain that
    // phrase silently produced a question naming nothing at all.
    for (const s of SEPARATIONS) {
      assert.ok(s.ask.includes('{property}'), `${s.id} has no {property} placeholder to substitute`);
    }
  });

  it('expands principle ids into the full principle objects', () => {
    const r = separationStrategies('stiffness');
    const space = r.strategies.find(s => s.id === 'space');
    assert.ok(space.principles.every(p => p && p.id && p.name && p.hint));
    // Separation in space is where tailored blanks come from — principle 3,
    // Local quality, must be in that set or the mapping is wrong.
    assert.ok(space.principles.some(p => p.id === 3), 'Local quality belongs to separation in space');
  });

  it('returns all four strategies unranked — which one applies is an engineering call', () => {
    const a = separationStrategies('thickness').strategies.map(s => s.id);
    const b = separationStrategies('a completely different property').strategies.map(s => s.id);
    assert.deepEqual(a, b, 'strategy order must not vary with the input — that would imply a ranking');
  });

  it('refuses an empty or one-character property rather than returning generic advice', () => {
    assert.throws(() => separationStrategies(''), /name the property/);
    assert.throws(() => separationStrategies('x'), /name the property/);
  });

  it('is deterministic', () => {
    const a = separationStrategies('wall thickness', 'load', 'cost');
    const b = separationStrategies('wall thickness', 'load', 'cost');
    assert.deepEqual(a, b);
  });
});
