import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberTokens, keepGroundedSentences, groundNarrative } from '../narrative-grounding.mjs';

test('number tokens normalise separators and decimals', () => {
  assert.deepEqual([...numberTokens('1,200 MPa, 12.0% and 30,511 rpm in 2025')].sort(), ['1200', '12', '2025', '30511'].sort());
});

test('a sentence with an invented number is dropped; grounded ones stay', () => {
  const allowed = numberTokens('adoption 20% -> ~65.8% in 5y; BYD 30,511 rpm (2025)');
  const r = keepGroundedSentences('Hairpin is at 20% today. It will hit 50% by 2028. BYD runs 30,511 rpm.', allowed);
  assert.equal(r.text, 'Hairpin is at 20% today. BYD runs 30,511 rpm.');
  assert.equal(r.dropped, 1);
});

test('a signal must be grounded in ITS OWN card, and drops are counted', () => {
  const cards = { a: '- [a] X adoption 20%', b: '- [b] Y adoption 3%' };
  const out = groundNarrative(
    { briefing: 'X leads at 20%. Y will reach a $40/kWh threshold.', signals: [{ techId: 'a', watch: 'X passing 20% share' }, { techId: 'b', watch: 'price below $40/kWh' }] },
    Object.values(cards).join('\n'), cards);
  assert.equal(out.briefing, 'X leads at 20%.');
  assert.deepEqual(out.signals.map((s) => s.techId), ['a']);
  assert.deepEqual(out.numbersChecked, { droppedSentences: 1, droppedSignals: 1 });
});
