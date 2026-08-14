// The homepage's headline accuracy number must be the number we measured.
//
// The audit found "2×  more accurate than a mass-based estimate on held-out
// parts". The recorded results say 1.27× for machining and 1.92× for stamping:
// "2×" was the better of the two, rounded up, and presented as if it described
// both. The repo's own house rule is "no asserted improvements" — so the claim
// is pinned here, and re-running the benchmarks with different results fails
// this test until the marketing copy is brought back into line.
//
// This is deliberately a test and not a comment. A comment does not fail CI.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const home = readFileSync(new URL('../src/pages/HomePage.tsx', import.meta.url), 'utf8');

const machining = read('../benchmark/machining-results.json');
const stamping = read('../benchmark/stamping-results.json');

const ratio = (r) => r.massMape / r.featureMape;

describe('homepage accuracy claim matches the recorded benchmarks', () => {
  it('the claimed range brackets both measured ratios', () => {
    const lo = Math.min(ratio(machining), ratio(stamping));
    const hi = Math.max(ratio(machining), ratio(stamping));
    // Round the way the copy does — one decimal place.
    const claimed = home.match(/([\d.]+)–([\d.]+)×/);
    assert.ok(claimed, 'homepage no longer states a range — has the claim changed?');
    const [, cLo, cHi] = claimed;
    assert.equal(Number(cLo), Number(lo.toFixed(1)), `claimed low ${cLo} but measured ${lo.toFixed(2)}`);
    assert.equal(Number(cHi), Number(hi.toFixed(1)), `claimed high ${cHi} but measured ${hi.toFixed(2)}`);
  });

  it('does not claim a single flattering number for two different processes', () => {
    // The specific regression: quoting the stamping ratio as though it applied
    // to machining too. The two differ by more than 0.5x, so one number cannot
    // honestly stand for both.
    assert.ok(
      Math.abs(ratio(machining) - ratio(stamping)) > 0.5,
      'the ratios have converged — a single-number claim may now be defensible, revisit this test',
    );
    assert.doesNotMatch(
      home,
      /">\s*2×\s*</,
      'homepage is back to the unsupported single "2×" figure',
    );
  });

  it('states the sample size, because 12 parts is not a large study', () => {
    const n = (machining.fixtureCount ?? 6) + (stamping.fixtureCount ?? 6);
    assert.match(home, new RegExp(`${n} held-out`), `copy should name the ${n}-part sample`);
  });

  it('the absolute error is reported honestly somewhere, not hidden behind the ratio', () => {
    // Both models still sit above 30% MAPE in absolute terms. Being relatively
    // better than a cruder model is not the same as being accurate, and the
    // claim must not imply otherwise by talking only about the ratio.
    assert.ok(machining.featureMape > 0.3 && stamping.featureMape > 0.3);
    assert.doesNotMatch(home, /highly accurate|precise to|accurate to within/i);
  });
});
