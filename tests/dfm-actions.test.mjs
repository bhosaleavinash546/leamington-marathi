// The action list. The tests worth having are about what it REFUSES to do:
// invent an owner's name, invent a due date, or turn "the engines cannot price
// this" into a confident instruction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildActions } from '../src/services/dfm-actions.mjs';

const f = (o = {}) => ({
  id: 'r1', title: 'A rule that failed', severity: 'high', measure: 'wallP50Mm',
  measured: 30, unit: 'mm', thresholdText: '1-3.5 mm', status: 'fail',
  fix: 'Hold a uniform nominal wall in the 2.0-3.5 mm band. Where local stiffness is needed, add ribs at 40-60% of the nominal wall rather than thickening the wall itself.',
  cost: { priced: true, changeDescription: 'wall 30 mm -> 3.5 mm', annualDeltaEur: 76_800 },
  ...o,
});

const an = (findings, extra = {}) => ({ results: [{ findings, ...extra }] });

test('the action is the ENGINE\'s fix text, cut at the instruction', () => {
  const { rows } = buildActions(an([f()]));
  assert.equal(rows[0].action, 'Hold a uniform nominal wall in the 2.0-3.5 mm band.');
  assert.equal(rows[0].change, 'wall 30 mm -> 3.5 mm');
});

test('a decimal threshold is not cut in half by the sentence split', () => {
  // "2.0-3.5 mm" contains two full stops. A naive split produced "Hold a
  // uniform nominal wall in the 2." as the action.
  const { rows } = buildActions(an([f({ fix: 'Open the corner to R1.5 min. Then re-run.' })]));
  assert.equal(rows[0].action, 'Open the corner to R1.5 min.');
});

test('the owner is a ROLE, and it follows what has to change', () => {
  const owner = (measure) => buildActions(an([f({ measure })])).rows[0].owner;
  assert.equal(owner('undercutFaceCount'), 'Tooling / diemaker');
  assert.equal(owner('wallP5Mm'), 'Design engineering');
  assert.equal(owner('unreachableAreaPct'), 'Manufacturing engineering');
  assert.equal(owner('tightestToleranceMm'), 'Design + Quality');
  assert.equal(owner('minBendRadiusToThickness'), 'Design + Press shop');
  // A hole rule of any family inherits the design owner rather than defaulting.
  assert.equal(owner('maxBlindHoleDepthToDia'), 'Design engineering');
});

test('an unclassified measure goes somewhere TRUE, not to "unknown"', () => {
  assert.equal(buildActions(an([f({ measure: 'somethingNew' })])).rows[0].owner, 'Cost engineering');
});

test('the due date is left blank for a human — never invented', () => {
  assert.equal(buildActions(an([f()])).rows[0].due, '');
});

test('the decision follows what the engines could price', () => {
  const dec = (cost) => buildActions(an([f({ cost })])).rows[0].decision;
  assert.match(dec({ priced: true }), /Approve the change/);
  assert.match(dec({ priced: true, upperBound: true }), /most aggressive/);
  assert.match(dec({ priced: false, externalGuideline: 'literature says $500-5,000' }), /Get a quote/);
  assert.match(dec({ priced: false, reason: 'die life is a tooling input' }), /die life is a tooling input/);
});

test('passes and abstentions never become actions', () => {
  const { rows } = buildActions(an([
    f({ id: 'p', status: 'pass' }),
    f({ id: 'n', status: 'not-evaluated' }),
    f({ id: 'real' }),
  ]));
  assert.deepEqual(rows.map(r => r.ruleId), ['real']);
});

test('worst first, and what is left out is COUNTED', () => {
  const many = Array.from({ length: 15 }, (_, i) => f({
    id: `r${i}`, severity: i < 3 ? 'high' : 'low',
    cost: { priced: true, annualDeltaEur: i },
  }));
  const { rows, omitted } = buildActions(an(many), { max: 4 });
  assert.equal(rows.length, 4);
  assert.equal(omitted, 11);
  assert.deepEqual(rows.slice(0, 3).map(r => r.severity), ['high', 'high', 'high']);
});

test('the owner roll-up sorts by who has the most high-severity work', () => {
  const { byOwner } = buildActions(an([
    f({ id: 'a', measure: 'wallP5Mm', severity: 'low', cost: { annualDeltaEur: 90_000 } }),
    f({ id: 'b', measure: 'undercutFaceCount', severity: 'high', cost: { annualDeltaEur: 10 } }),
    f({ id: 'c', measure: 'undercutFaceCount', severity: 'high', cost: { annualDeltaEur: 20 } }),
  ]));
  assert.equal(byOwner[0].owner, 'Tooling / diemaker');
  assert.equal(byOwner[0].actions, 2);
  assert.equal(byOwner[0].high, 2);
});

test('a rule with no fix text says so instead of leaving an empty instruction', () => {
  assert.match(buildActions(an([f({ fix: '' })])).rows[0].action, /No change text/);
});

test('an empty analysis produces an empty list rather than throwing', () => {
  for (const bad of [undefined, null, {}, { results: null }, { results: [{}] }]) {
    assert.deepEqual(buildActions(bad).rows, []);
  }
});
