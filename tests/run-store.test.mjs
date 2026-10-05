// The app-wide AI run store (src/lib/run-store.ts): a run outlives the page
// that started it, only one runs at a time, Cancel aborts the real request,
// and a finished run waits to be opened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRun, cancelRun, consumeRun, getRun, reduceSteps } from '../src/lib/run-store.ts';

const tick = () => new Promise(r => setTimeout(r, 5));

test('a run goes running → done with the route to open, and waits until consumed', async () => {
  let release;
  const ok = startRun({ kind: 'analyze', label: 'Analyze · BIW', returnTo: '/analyze', exec: ({ onProgress }) => new Promise(res => {
    onProgress({ type: 'connecting', message: 'Connecting' });
    onProgress({ type: 'progress', phase: 'reason', outTokens: 120, message: 'thinking 30 s' });
    release = () => res('/results');
  }) });
  assert.equal(ok, true);
  assert.equal(getRun().status, 'running');
  assert.equal(getRun().phase, 'reason');
  assert.equal(getRun().outTokens, 120);
  assert.equal(getRun().steps[0].detail, 'thinking 30 s');
  // A second run is refused while one runs — two would double the bill.
  assert.equal(startRun({ kind: 'prism', label: 'x', returnTo: '/prism', exec: async () => '/results' }), false);
  release(); await tick();
  assert.equal(getRun().status, 'done');
  assert.equal(getRun().openRoute, '/results');
  consumeRun();
  assert.equal(getRun(), null);
});

test('cancel aborts the signal the request was given, and ends as cancelled', async () => {
  let seen;
  startRun({ kind: 'prism', label: 'Prism · knuckle', returnTo: '/prism', exec: ({ signal }) => new Promise((_, rej) => {
    seen = signal;
    signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
  }) });
  cancelRun();
  assert.equal(seen.aborted, true);
  await tick();
  assert.equal(getRun().status, 'cancelled');
  consumeRun();
});

test('a failure keeps its message; an unreachable server says how to start it', async () => {
  startRun({ kind: 'analyze', label: 'a', returnTo: '/analyze', exec: async () => { throw new TypeError('fetch failed'); } });
  await tick();
  assert.equal(getRun().status, 'error');
  assert.match(getRun().error, /Cannot reach the BrainSpark server/);
  consumeRun();
  startRun({ kind: 'analyze', label: 'a', returnTo: '/analyze', exec: async () => { throw new Error('Credit balance too low'); } });
  await tick();
  assert.equal(getRun().error, 'Credit balance too low');
  consumeRun();
});

test('lens completions become their own lines; a running note lands on the active step', () => {
  let s = reduceSteps([], { type: 'connecting', message: 'Connecting' });
  s = reduceSteps(s, { type: 'progress', message: 'reasoning 45 s' });
  assert.equal(s.length, 1); assert.equal(s[0].detail, 'reasoning 45 s');
  s = reduceSteps(s, { type: 'progress', message: 'Lens "vave": 7 candidate ideas.' });
  s = reduceSteps(s, { type: 'progress', message: 'Lens "spec" failed (overloaded) — continuing with the others.' });
  assert.deepEqual(s.slice(1).map(x => x.status), ['done', 'error']);
});
