// The AI-error messages a user sees — pinned because a demo failed on a
// generic "request was rejected" when the real cause (no credit) needed a
// different fix entirely (29 Sept 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeLlmError, providerDetail, isProviderError } from '../llm-error.mjs';

// The shape the Anthropic SDK raises: status + parsed error body.
const sdkError = (status, type, message) => Object.assign(new Error(`${status} ${JSON.stringify({ type: 'error', error: { type, message } })}`),
  { status, error: { type: 'error', error: { type, message } } });

test('no credit is named as a billing problem, not a key or input problem', () => {
  const m = describeLlmError(sdkError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'));
  assert.match(m, /run out of credit/);
  assert.match(m, /Plans & Billing/);
  assert.match(m, /key is valid/);
});

test('any other 400 carries Anthropic\'s own reason', () => {
  const m = describeLlmError(sdkError(400, 'invalid_request_error', 'max_tokens: 999999 > 128000, which is the maximum allowed'));
  assert.match(m, /Anthropic rejected the request/);
  assert.match(m, /max_tokens: 999999/);
});

test('the reason is read from an unparsed SDK message too', () => {
  const e = Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'), { status: 400 });
  assert.equal(providerDetail(e).type, 'invalid_request_error');
  assert.match(describeLlmError(e), /run out of credit/);
});

test('each status gets its own instruction', () => {
  assert.match(describeLlmError(sdkError(401, 'authentication_error', 'invalid x-api-key')), /API key was rejected/);
  assert.match(describeLlmError(sdkError(403, 'permission_error', 'no access')), /not allowed/);
  assert.match(describeLlmError(sdkError(404, 'not_found_error', 'model: claude-x')), /could not find the model/);
  assert.match(describeLlmError(sdkError(429, 'rate_limit_error', 'slow down')), /rate or usage limit/);
  assert.match(describeLlmError(sdkError(529, 'overloaded_error', 'Overloaded')), /overloaded/);
  assert.match(describeLlmError(Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' })), /Could not reach Anthropic/);
  assert.equal(isProviderError(sdkError(400, 'x', 'y')), true);
  assert.equal(isProviderError(new Error('plain')), false);
});

test('a spend limit is not reported as an empty balance', () => {
  const m = describeLlmError(sdkError(400, 'invalid_request_error', 'You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.'));
  assert.match(m, /spend limit/);
  assert.match(m, /adding credit will not lift it/);
});
