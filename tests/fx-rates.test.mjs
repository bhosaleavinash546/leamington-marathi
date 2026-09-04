import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFxRates, FX_FALLBACK, FX_SYMBOLS, FX_CURRENCIES, __resetFxCacheForTest } from '../fx-rates.mjs';

test('supported currency set and symbols are aligned', () => {
  assert.deepEqual(FX_CURRENCIES, Object.keys(FX_FALLBACK));
  for (const c of FX_CURRENCIES) assert.ok(FX_SYMBOLS[c], `no symbol for ${c}`);
  assert.equal(FX_FALLBACK.EUR, 1);
});

test('falls back to the static table when the feed is unreachable', async () => {
  __resetFxCacheForTest();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const fx = await getFxRates();
    assert.deepEqual(fx.rates, FX_FALLBACK);
    assert.equal(fx.live, false);
    assert.equal(fx.source, 'static reference');
    // A fallback rate IS stale — that is what fallback means. This used to
    // assert false, which is how a deployment that never reached the feed
    // reported a fresh rate forever (Sept 2026 review, R-33).
    assert.equal(fx.stale, true);
    assert.ok(fx.date, 'the fallback table states its own vintage');
  } finally { globalThis.fetch = realFetch; __resetFxCacheForTest(); }
});

test('accepts a partial feed response per-currency (missing one keeps fallback)', async () => {
  __resetFxCacheForTest();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ date: '2026-06-30', rates: { GBP: 0.86, USD: 1.09 } }) }); // no CNY
  try {
    const fx = await getFxRates();
    assert.equal(fx.live, true);
    assert.equal(fx.rates.GBP, 0.86);          // live value used
    assert.equal(fx.rates.USD, 1.09);
    assert.equal(fx.rates.CNY, FX_FALLBACK.CNY); // missing one falls back, not discarded
    assert.equal(fx.date, '2026-06-30');
  } finally { globalThis.fetch = realFetch; __resetFxCacheForTest(); }
});

test('concurrent callers share a single refresh (dedup)', async () => {
  __resetFxCacheForTest();
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ date: '2026-06-30', rates: { GBP: 0.86, USD: 1.09, CNY: 7.9 } }) }; };
  try {
    await Promise.all([getFxRates(), getFxRates(), getFxRates(), getFxRates()]);
    assert.equal(calls, 1, 'expected a single outbound fetch for concurrent callers');
  } finally { globalThis.fetch = realFetch; __resetFxCacheForTest(); }
});
