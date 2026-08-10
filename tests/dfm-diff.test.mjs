// Revision-to-revision comparison. The tests that matter here are the ones
// about NOT claiming a win: a rule that stopped being measurable has not been
// fixed, and a rule that became measurable has not regressed. Both read as good
// news and bad news respectively if you only count failures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffAnalyses, comparability } from '../src/services/dfm-diff.mjs';

const f = (id, o = {}) => ({
  id, title: `${id} title`, severity: 'high', measure: 'm', unit: 'mm',
  thresholdText: '<= 3 mm', status: 'fail', ...o,
});

const analysis = ({ findings = [], passed = [], notEvaluated = [], score = 50, annualEur = 0, process = 'hpdc' } = {}) => ({
  partName: 'Bracket', subject: { material: 'Aluminium A356 (cast)' },
  results: [{
    process, processName: process, ruleCount: 9, evaluatedCount: 9, coveragePct: 100,
    score, findings, passed, notEvaluated, impact: { annualEur },
  }],
});

test('a finding that now passes is CLOSED, with what it used to be worth', () => {
  const d = diffAnalyses(
    analysis({ findings: [f('wall', { measured: 9, cost: { annualDeltaEur: 40_000 } })] }),
    analysis({ passed: [f('wall', { measured: 3, status: 'pass' })] }),
  );
  assert.equal(d.counts.closed, 1);
  assert.equal(d.closed[0].how, 'now passes');
  assert.equal(d.closed[0].was, 9);
  assert.equal(d.closed[0].now, 3);
  assert.equal(d.money.closedAnnualEur, 40_000);
});

test('a finding that stopped being MEASURABLE is not counted as fixed', () => {
  // The most dangerous false positive in the whole feature: rev B loses its PMI
  // or its wall measurement, the rule abstains, and a naive diff reports the
  // problem solved.
  const d = diffAnalyses(
    analysis({ findings: [f('wall', { measured: 9, cost: { annualDeltaEur: 40_000 } })] }),
    analysis({ notEvaluated: [f('wall', { status: 'not-evaluated', reason: 'no wall measurement' })] }),
  );
  assert.equal(d.closed[0].how, 'no longer measurable');
  assert.equal(d.money.closedAnnualEur, 0, 'money is only freed by a rule that actually passes');
  assert.match(d.headline, /^0 findings closed/);
});

test('a rule that could not be judged before and fails now is NOW VISIBLE, not new', () => {
  const d = diffAnalyses(
    analysis({ notEvaluated: [f('tol', { status: 'not-evaluated', reason: 'no PMI in the file' })] }),
    analysis({ findings: [f('tol', { measured: 0.02 })] }),
  );
  assert.equal(d.counts.created, 0);
  assert.equal(d.counts.nowVisible, 1);
  assert.match(d.nowVisible[0].reason, /no PMI/);
});

test('a rule that was PASSING and now fails is a genuine regression', () => {
  const d = diffAnalyses(
    analysis({ passed: [f('draft', { status: 'pass', measured: 2 })] }),
    analysis({ findings: [f('draft', { measured: 41, cost: { annualDeltaEur: 12_000 } })] }),
  );
  assert.equal(d.counts.created, 1);
  assert.equal(d.created[0].wasPassing, true);
  assert.equal(d.money.createdAnnualEur, 12_000);
});

test('a finding failing on both sides reports the MOVEMENT, not just that it is still there', () => {
  const d = diffAnalyses(
    analysis({ findings: [f('wall', { measured: 30 })] }),
    analysis({ findings: [f('wall', { measured: 8, severity: 'medium' })] }),
  );
  assert.equal(d.counts.persisting, 1);
  assert.equal(d.persisting[0].was, 30);
  assert.equal(d.persisting[0].now, 8);
  assert.equal(d.persisting[0].delta, -22);
  assert.deepEqual(d.persisting[0].severityChanged, { from: 'high', to: 'medium' });
});

test('a delta is null rather than computed from a missing number', () => {
  const d = diffAnalyses(
    analysis({ findings: [f('wall', { measured: null })] }),
    analysis({ findings: [f('wall', { measured: 8 })] }),
  );
  assert.equal(d.persisting[0].delta, null);
});

test('a rule that failed before and did not run at all is named, not silently dropped', () => {
  const d = diffAnalyses(
    analysis({ findings: [f('gone', { measured: 5 })] }),
    analysis({ findings: [] }),
  );
  assert.equal(d.counts.closed, 1);
  assert.equal(d.closed[0].how, 'rule not run on this revision');
  assert.equal(d.money.closedAnnualEur, 0);
});

test('a rule that abstained on BOTH revisions is not reported — it has no news in it', () => {
  const d = diffAnalyses(
    analysis({ notEvaluated: [f('x', { status: 'not-evaluated' })] }),
    analysis({ notEvaluated: [f('x', { status: 'not-evaluated' })] }),
  );
  assert.deepEqual(d.counts, { closed: 0, created: 0, persisting: 0, nowVisible: 0, nowBlind: 0 });
});

test('a rule that WAS judged and can no longer be is flagged as lost visibility', () => {
  const d = diffAnalyses(
    analysis({ passed: [f('x', { status: 'pass' })] }),
    analysis({ notEvaluated: [f('x', { status: 'not-evaluated', reason: 'wall could not be measured' })] }),
  );
  assert.equal(d.counts.nowBlind, 1);
  assert.match(d.nowBlind[0].reason, /could not be measured/);
});

test('the headline reads like a person said it', () => {
  const d = diffAnalyses(
    analysis({
      findings: [f('a', { measured: 9, cost: { annualDeltaEur: 30_000 } }), f('b', { measured: 4 })],
      passed: [f('c', { status: 'pass' })],
    }),
    analysis({ passed: [f('a', { status: 'pass' })], findings: [f('b', { measured: 4 }), f('c', { measured: 1 })] }),
  );
  assert.match(d.headline, /1 finding closed/);
  assert.match(d.headline, /1 new/);
  assert.match(d.headline, /1 still open/);
  assert.match(d.headline, /freed EUR 30,000\/yr/);
});

test('scores from both revisions travel with the diff', () => {
  const d = diffAnalyses(analysis({ score: 25 }), analysis({ score: 78 }));
  assert.deepEqual(d.score, { before: 25, after: 78 });
});

test('an empty or malformed pair produces an empty verdict rather than throwing', () => {
  for (const [x, y] of [[null, null], [{}, {}], [{ results: null }, undefined]]) {
    const d = diffAnalyses(x, y);
    assert.equal(d.counts.closed + d.counts.created + d.counts.persisting, 0);
  }
});

// ── Comparability ─────────────────────────────────────────────────────────
test('comparing two different processes is WARNED about, not silently tabulated', () => {
  const w = comparability(analysis({ process: 'hpdc' }), analysis({ process: 'sheet-metal' }));
  assert.equal(w.length, 1);
  assert.match(w[0], /DIFFERENT rule families/);
});

test('a material change is named, because thresholds move with the alloy', () => {
  const a = analysis(); const b = analysis();
  b.subject = { material: 'ADC12' };
  const w = comparability(a, b);
  assert.ok(w.some(x => /material changed/.test(x)));
});

test('two revisions with different part names are queried, not assumed', () => {
  const a = analysis(); const b = analysis();
  b.partName = 'Something else';
  assert.ok(comparability(a, b).some(x => /part name differs/i.test(x)));
});

test('a clean like-for-like comparison warns about nothing', () => {
  assert.deepEqual(comparability(analysis(), analysis()), []);
});
