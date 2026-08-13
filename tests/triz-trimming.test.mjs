// TRIZ trimming: the rules fire where they should, do NOT fire where they
// should not, and no cost figure is ever invented.
//
// The tool's output is "delete this component". A trimming list that scores a
// malformed model, or that orders candidates by a guessed cost, is worse than
// no list at all — so most of what is pinned here is refusal, not calculation.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  trimmingCandidates, validateFunctionModel, functionModelFromFast,
  trimmingUpside, TRIMMING_RULES, FUNCTION_RANKS,
} from '../triz-trimming.mjs';
import { functionCostMatrix } from '../innovation.mjs';

// A deliberately small, hand-checkable model: a bracket bolted to a housing,
// with a separate clip whose only job is holding a harness the housing could
// hold itself, and a shim that does nothing useful.
const MODEL = [
  { carrier: 'bracket', function: 'support', object: 'sensor', rank: 'useful' },
  { carrier: 'clip', function: 'hold', object: 'harness', rank: 'useful' },
  { carrier: 'shim', function: 'fill gap', object: 'housing', rank: 'excessive' },
];
const COSTS = [
  { name: 'bracket', cost: 4.20 }, { name: 'clip', cost: 0.35 },
  { name: 'shim', cost: 0.10 }, { name: 'sensor', cost: 11.0 },
  { name: 'harness', cost: 6.0 }, { name: 'housing', cost: 9.0 },
];

describe('triz trimming — the function model', () => {
  it('rejects a model that is not a non-empty array', () => {
    assert.throws(() => validateFunctionModel(null), /non-empty array/);
    assert.throws(() => validateFunctionModel([]), /non-empty array/);
  });

  it('rejects a function missing a carrier, a function or an object', () => {
    assert.throws(() => validateFunctionModel([{ function: 'hold', object: 'x' }]), /carrier is required/);
    assert.throws(() => validateFunctionModel([{ carrier: 'a', object: 'x' }]), /function is required/);
    assert.throws(() => validateFunctionModel([{ carrier: 'a', function: 'hold' }]), /object is required/);
  });

  it('rejects a component acting on itself — that is not a function, it is a typo', () => {
    assert.throws(() => validateFunctionModel([{ carrier: 'clip', function: 'hold', object: 'clip' }]),
      /cannot be both the carrier and the object/);
  });

  it('defaults an unrecognised rank to useful — the conservative choice', () => {
    // Useful is conservative because it is the ONLY rank that demands the
    // function be redistributed before the part can go.
    const m = validateFunctionModel([{ carrier: 'a', function: 'hold', object: 'b', rank: 'nonsense' }]);
    assert.equal(m[0].rank, 'useful');
    assert.ok(FUNCTION_RANKS.includes(m[0].rank));
  });
});

describe('triz trimming — the three rules', () => {
  it('offers rules A and B on every useful function', () => {
    const { candidates } = trimmingCandidates(MODEL, COSTS);
    const clip = candidates.find(c => c.carrier === 'clip');
    const ids = clip.functions[0].rules.map(r => r.id);
    assert.ok(ids.includes('A'), 'Rule A must always be askable');
    assert.ok(ids.includes('B'), 'Rule B must always be askable');
  });

  it('phrases each rule as the classical question, naming the real parts', () => {
    const { candidates } = trimmingCandidates(MODEL, COSTS);
    const clip = candidates.find(c => c.carrier === 'clip');
    const byId = Object.fromEntries(clip.functions[0].rules.map(r => [r.id, r.question]));
    assert.match(byId.A, /Can "harness" be removed/);       // remove the OBJECT
    assert.match(byId.B, /Can "harness" hold by itself/);   // object self-serves
    assert.match(byId.C, /instead of "clip"/);              // someone else carries it
  });

  it('offers Rule C only when another component could actually take the job', () => {
    // Two components, one function: there IS nobody else, so "let something
    // else do it" is noise dressed as method.
    const tiny = [{ carrier: 'clip', function: 'hold', object: 'harness', rank: 'useful' }];
    const { candidates } = trimmingCandidates(tiny);
    const ids = candidates[0].functions[0].rules.map(r => r.id);
    assert.deepEqual(ids, ['A', 'B'], 'Rule C must not be offered with no third component');

    // Add a third component and C appears, naming who could take over.
    const { candidates: bigger } = trimmingCandidates(MODEL);
    const clip = bigger.find(c => c.carrier === 'clip');
    const ruleC = clip.functions[0].rules.find(r => r.id === 'C');
    assert.ok(ruleC, 'Rule C must appear once a third component exists');
    assert.ok(ruleC.alternativeCarriers.length > 0);
    assert.ok(!ruleC.alternativeCarriers.includes('clip'), 'a carrier cannot replace itself');
    assert.ok(!ruleC.alternativeCarriers.includes('harness'), 'the object cannot be its own alternative carrier');
  });

  it('asks NO redistribution question for a non-useful function — losing it is the gain', () => {
    const { candidates } = trimmingCandidates(MODEL, COSTS);
    const shim = candidates.find(c => c.carrier === 'shim');
    assert.equal(shim.functions[0].redistributionNeeded, false);
    assert.deepEqual(shim.functions[0].rules, []);
    assert.equal(shim.questionsToAnswer, 0);
    assert.match(shim.note, /pure gain/);
  });

  it('counts one question per useful function — every one must be answered before the part goes', () => {
    const twoJobs = [
      { carrier: 'bracket', function: 'support', object: 'sensor', rank: 'useful' },
      { carrier: 'bracket', function: 'earth', object: 'sensor', rank: 'useful' },
      { carrier: 'bracket', function: 'rattle', object: 'housing', rank: 'harmful' },
      { carrier: 'clip', function: 'hold', object: 'harness', rank: 'useful' },
    ];
    const { candidates } = trimmingCandidates(twoJobs);
    const bracket = candidates.find(c => c.carrier === 'bracket');
    assert.equal(bracket.functionCount, 3);
    assert.equal(bracket.usefulFunctionCount, 2);
    assert.equal(bracket.nonUsefulFunctionCount, 1);
    assert.equal(bracket.questionsToAnswer, 2);
    assert.equal(bracket.note, null, 'a part with useful functions is not pure gain');
  });
});

describe('triz trimming — money, and refusing to invent it', () => {
  it('orders candidates by the cost released, worst first', () => {
    const { candidates, costed, totalCost } = trimmingCandidates(MODEL, COSTS);
    assert.equal(costed, true);
    assert.deepEqual(candidates.map(c => c.carrier), ['bracket', 'clip', 'shim']);
    assert.equal(candidates[0].costReleased, 4.20);
    assert.equal(totalCost, 30.65);
  });

  it('reports NO cost rather than a guessed one when costs are absent', () => {
    const { candidates, costed, totalCost } = trimmingCandidates(MODEL);
    assert.equal(costed, false);
    assert.equal(totalCost, null);
    for (const c of candidates) assert.equal(c.costReleased, null, `${c.carrier} invented a cost`);
    // With nothing to rank by, order is stable and alphabetical rather than
    // pretending to be a priority.
    assert.deepEqual(candidates.map(c => c.carrier), ['bracket', 'clip', 'shim']);
  });

  it('sorts an uncosted component LAST, not as zero — absent is not cheap', () => {
    const partial = [{ name: 'bracket', cost: 4.20 }, { name: 'shim', cost: 0.10 }];
    const { candidates, componentsWithoutCost } = trimmingCandidates(MODEL, partial);
    assert.equal(candidates[candidates.length - 1].carrier, 'clip');
    assert.equal(candidates[candidates.length - 1].costReleased, null);
    assert.ok(componentsWithoutCost.includes('clip'));
  });

  it('names every component it has no cost for', () => {
    const { componentsWithoutCost } = trimmingCandidates(MODEL, [{ name: 'bracket', cost: 4.2 }]);
    for (const n of ['clip', 'shim', 'sensor', 'harness', 'housing']) {
      assert.ok(componentsWithoutCost.includes(n), `${n} should be listed as uncosted`);
    }
  });

  it('sums upside over CONFIRMED candidates only, never over open questions', () => {
    const r = trimmingCandidates(MODEL, COSTS);
    const none = trimmingUpside(r, []);
    assert.equal(none.confirmedCount, 0);
    assert.equal(none.costReleased, null, 'nothing confirmed must not produce a saving');

    const some = trimmingUpside(r, ['clip', 'shim']);
    assert.equal(some.confirmedCount, 2);
    assert.equal(some.costReleased, 0.45);
    assert.equal(some.ofTotalPct, 1.5);
  });

  it('counts confirmed-but-uncosted candidates separately from costed ones', () => {
    const r = trimmingCandidates(MODEL, [{ name: 'clip', cost: 0.35 }]);
    const u = trimmingUpside(r, ['clip', 'bracket']);
    assert.equal(u.confirmedCount, 2);
    assert.equal(u.costedCount, 1);
    assert.equal(u.uncostedCount, 1, 'a confirmed part with no cost must not vanish from the count');
    assert.equal(u.costReleased, 0.35);
  });
});

describe('triz trimming — the FAST adaptor', () => {
  // The reason trimming is cheap to add: FAST already produces components ×
  // functions with a validated cost allocation.
  const FAST = functionCostMatrix(
    [{ name: 'housing', cost: 12 }, { name: 'bracket', cost: 4 }, { name: 'seal', cost: 1 }],
    [{ name: 'locate motor', worthPct: 60 }, { name: 'exclude water', worthPct: 40 }],
    [[80, 20], [100, 0], [0, 100]],
  );

  it('converts a FAST matrix into a function model without losing any cost', () => {
    const { functions, costs } = functionModelFromFast(FAST);
    const modelTotal = costs.reduce((s, c) => s + c.cost, 0);
    assert.equal(Number(modelTotal.toFixed(2)), FAST.totalCost,
      'component costs must survive the conversion exactly');
    const carriers = new Set(functions.map(f => f.carrier));
    assert.deepEqual([...carriers].sort(), ['bracket', 'housing', 'seal']);
  });

  it('drops allocations below the threshold so real carriers are not buried', () => {
    // seal→locate motor is 0% and bracket→exclude water is 0%: neither is a
    // carrier of that function and neither should appear.
    const { functions } = functionModelFromFast(FAST);
    assert.equal(functions.length, 4);
    assert.ok(!functions.some(f => f.carrier === 'seal' && f.function === 'locate motor'));
    assert.ok(!functions.some(f => f.carrier === 'bracket' && f.function === 'exclude water'));
  });

  it('MARKS the inferred objects — FAST does not record what a function acts on', () => {
    const { functions, objectsInferred } = functionModelFromFast(FAST);
    assert.equal(objectsInferred, true);
    for (const f of functions) {
      assert.equal(f.objectInferred, true, 'every converted row must admit its object is a placeholder');
    }
  });

  it('refuses rather than returning an empty model when nothing clears the threshold', () => {
    assert.throws(() => functionModelFromFast(FAST, 101), /no component carries any function/);
  });

  it('rejects a malformed FAST result instead of half-converting it', () => {
    assert.throws(() => functionModelFromFast({}), /no components/);
    assert.throws(() => functionModelFromFast({ components: [{ name: 'a', cost: 1 }] }), /no functions/);
    assert.throws(() => functionModelFromFast({
      components: [{ name: 'a', cost: 1, allocations: [100] }],
      functions: [{ name: 'f1' }, { name: 'f2' }],
    }), /1 allocations for 2 functions/);
  });

  it('feeds straight into trimmingCandidates and ranks by real FAST cost', () => {
    const { functions, costs } = functionModelFromFast(FAST);
    const { candidates, totalCost } = trimmingCandidates(functions, costs);
    assert.equal(totalCost, 17);
    assert.equal(candidates[0].carrier, 'housing');   // £12, the biggest release
    assert.equal(candidates[0].costReleased, 12);
  });
});

describe('triz trimming — determinism', () => {
  it('same model, same candidates, every call', () => {
    const a = trimmingCandidates(MODEL, COSTS);
    const b = trimmingCandidates(MODEL, COSTS);
    assert.deepEqual(a, b);
  });

  it('exposes the three classical rules with their rationales', () => {
    assert.deepEqual(Object.keys(TRIMMING_RULES), ['A', 'B', 'C']);
    for (const r of Object.values(TRIMMING_RULES)) {
      assert.ok(r.name && r.rationale && typeof r.question === 'function');
    }
  });
});
