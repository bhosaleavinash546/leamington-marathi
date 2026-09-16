import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effortFor, thinkingHeadroom, ideationParams, truncationReason } from '../llm-budget.mjs';

test('CV_THINKING_BUDGET maps to an effort level; below the floor is off', () => {
  assert.equal(effortFor(0), null);
  assert.equal(effortFor(1023), null);
  assert.equal(effortFor('nonsense'), null);
  assert.equal(effortFor(1024), 'low');
  assert.equal(effortFor(6000), 'low');       // the shipped default: the original 6k intent
  assert.equal(effortFor(8000), 'low');
  assert.equal(effortFor(12000), 'medium');
  assert.equal(effortFor(20000), 'high');
});

test('thinking adds headroom ABOVE the output budget — output is never starved', () => {
  const off = ideationParams(24000, 0);
  assert.equal(off.max_tokens, 24000);
  assert.equal(off.thinking, null);

  const low = ideationParams(24000, 6000);
  assert.equal(low.max_tokens, 24000 + thinkingHeadroom('low'));
  assert.deepEqual(low.thinking, { type: 'adaptive' });
  assert.deepEqual(low.output_config, { effort: 'low' });
  assert.ok(low.max_tokens > 24000, 'thinking must not eat the output budget');

  const high = ideationParams(24000, 30000);
  assert.equal(high.max_tokens, 48000);
});

test('a max_tokens stop with no usable idea list is named, not swallowed', () => {
  assert.equal(truncationReason('end_turn', { input: { ideas: [] } }, 24000, true), null);
  assert.equal(truncationReason('tool_use', { input: { ideas: [{}] } }, 24000, true), null);
  assert.equal(truncationReason('max_tokens', { input: { ideas: [{}, {}] } }, 24000, true), null,
    'partial output with surviving ideas goes to the validator, not to an error');
  const none = truncationReason('max_tokens', null, 24000, true);
  assert.match(none, /24,000-token output limit/);
  assert.match(none, /no idea list was started/);
  assert.match(none, /reasoning consumed the budget/);
  const cut = truncationReason('max_tokens', { input: { ideas: [] } }, 32000, false);
  assert.match(cut, /idea list was cut off/);
  assert.doesNotMatch(cut, /reasoning/);
});
