// Innovation Studio review, 29 Sept 2026 — each defect found by hand-computed
// cases, pinned as behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dfaScore, targetGap, teardownDelta, morphology } from '../innovation.mjs';
import { parseDfaLine, parseDfaLines } from '../src/services/innovation-input.mjs';

test('DFA: the candidate count and the theoretical minimum always add up to the part count', () => {
  for (const parts of [
    [{ name: 'bracket' }, { name: 'screw' }, { name: 'screw2' }],
    [{ name: 'housing', mustSeparate: true }, { name: 'clip' }],
    [{ name: 'a', moves: true }, { name: 'b', differentMaterial: true }],
  ]) {
    const r = dfaScore(parts);
    assert.equal(r.theoreticalMin + r.consolidationCandidates.length, r.totalParts);
  }
  assert.deepEqual(dfaScore([{ name: 'bracket' }, { name: 'screw' }]).consolidationCandidates, ['screw']);
  // The base is necessary even when other parts qualify on their own.
  const b = dfaScore([{ name: 'bracket' }, { name: 'clip' }, { name: 'hinge pin', moves: true }]);
  assert.deepEqual(b.consolidationCandidates, ['clip']);
  assert.equal(b.rows[0].necessaryBecause, 'base part');
});

test('design-to-cost never asks a bucket for more than it can give, and names the shortfall', () => {
  // Was: labour asked for €5 from a €4 bucket at 50% reducibility.
  const r = targetGap(10, 2, [{ name: 'material', cost: 6, reducibility: 0.2 }, { name: 'labour', cost: 4, reducibility: 0.5 }]);
  for (const a of r.allocations) assert.ok(a.target <= a.maxReducible + 1e-9, `${a.name} ${a.target} > ${a.maxReducible}`);
  assert.equal(r.reducibleTotal, 3.2);
  assert.equal(r.shortfall, 4.8);
  assert.equal(r.closableWithStatedReducibility, false);
  // Closable: the allocations sum to the gap exactly.
  const c = targetGap(12, 10, [{ name: 'material', cost: 6, reducibility: 0.2 }, { name: 'labour', cost: 4 }]);
  assert.equal(c.shortfall, 0);
  assert.ok(Math.abs(c.allocations.reduce((s, a) => s + a.target, 0) - c.gap) < 0.01);
  assert.equal(c.allocations[1].reducibilityStated, false, 'the 50% default is marked as assumed');
  // A reducibility that is not a number no longer yields a null target.
  const bad = targetGap(10, 8, [{ name: 'a', cost: 5, reducibility: 'x' }]);
  assert.ok(Number.isFinite(bad.allocations[0].target));
  // Split in proportion to what each bucket can give: 3 × 1/5.5 and 3 × 4.5/5.5.
  const o = targetGap(10, 7, [{ name: 'small', cost: 1, reducibility: 1 }, { name: 'big', cost: 9, reducibility: 0.5 }]);
  assert.equal(o.allocations[0].target, 0.545);
  assert.ok(Math.abs(o.allocations.reduce((s, a) => s + a.target, 0) - 3) < 0.01);
});

test('teardown: numbers with units are numbers, and a gap is a gap in either direction', () => {
  const r = teardownDelta(
    [{ name: 'Mass kg', value: '2.4 kg' }, { name: 'Fasteners', value: '4' }, { name: 'Stiffness N/mm', value: '800' }, { name: 'Parts', value: '1,200' }, { name: 'Width', value: '30 mm' }],
    [{ name: 'Mass kg', value: '2.0 kg' }, { name: 'Fasteners', value: '0' }, { name: 'Stiffness N/mm', value: '1200' }, { name: 'Parts', value: '1,000' }, { name: 'Width', value: '3 cm' }]);
  const by = Object.fromEntries(r.rows.map(x => [x.attribute, x]));
  assert.equal(by['Mass kg'].kind, 'numeric');
  assert.equal(by['Mass kg'].deltaPct, 20);
  assert.equal(by['Mass kg'].adverse, true);
  assert.equal(by.Parts.subjectValue, 1200);
  // 4 fasteners against 0: no percentage, still the finding.
  assert.equal(by.Fasteners.significant, true);
  assert.equal(by.Fasteners.deltaPct, null);
  assert.equal(by.Fasteners.adverse, true);
  // 33% LESS stiff: significant, merit unknown rather than assumed.
  assert.equal(by['Stiffness N/mm'].significant, true);
  assert.equal(by['Stiffness N/mm'].adverse, null);
  // Units that differ are not silently compared as numbers.
  assert.equal(by.Width.kind, 'categorical');
  assert.match(by.Width.note, /units differ/);
});

test('teardown: a stated polarity wins over the lexicon', () => {
  const r = teardownDelta([{ name: 'Torque density', value: '4.1', better: 'higher' }], [{ name: 'Torque density', value: '5.0' }]);
  assert.equal(r.rows[0].better, 'higher');
  assert.equal(r.rows[0].adverse, true);
});

test('morphology: every sampled concept is distinct, up to the size of the space', () => {
  for (const dims of [[2, 2], [3, 3], [3, 3, 3], [4, 2], [5, 4, 3, 2], [2]]) {
    const sf = dims.map((n, i) => ({ name: `f${i}`, options: Array.from({ length: n }, (_, k) => `o${k}`) }));
    const r = morphology(sf, 6);
    const keys = r.sampledConcepts.map(c => c.map(x => x.option).join('+'));
    assert.equal(keys.length, Math.min(6, r.totalCombinations), dims.join('x'));
    assert.equal(new Set(keys).size, keys.length, `${dims.join('x')} repeated a concept`);
  }
  // Spread: in a 3×3×3 space the first three picks share no option in any slot.
  const r = morphology([0, 1, 2].map(i => ({ name: `f${i}`, options: ['a', 'b', 'c'] })), 3);
  for (let d = 0; d < 3; d++) assert.equal(new Set(r.sampledConcepts.map(c => c[d].option)).size, 3);
});

test('DFA lines: negation says nothing, and y/n answers are positional', () => {
  assert.deepEqual(parseDfaLine('clip | same material as housing'), { name: 'clip', moves: false, differentMaterial: false, mustSeparate: false });
  assert.equal(parseDfaLine('bush | does not move').moves, false);
  assert.equal(parseDfaLine('gear | moves').moves, true);
  assert.equal(parseDfaLine('seal | elastomer — different material').differentMaterial, true);
  assert.equal(parseDfaLine('housing | service').mustSeparate, true);
  assert.deepEqual(parseDfaLine('spacer | n | y | n'), { name: 'spacer', moves: false, differentMaterial: true, mustSeparate: false });
  assert.equal(parseDfaLine('   '), null);
  assert.equal(parseDfaLines('a\n\nb | moves').length, 2);
});
