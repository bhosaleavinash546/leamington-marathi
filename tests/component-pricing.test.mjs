// Live part pricing: provider normalization, break selection, FX, cache —
// all against injected fetch fixtures shaped like real API responses.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { providerStatus, lookupPart, lookupParts, selectBreak, __resetPricingCachesForTest } from '../component-pricing.mjs';

const FX = { EUR: 1, GBP: 0.85, USD: 1.08, CNY: 7.85 };   // → 1 USD ≈ £0.787

const DIGIKEY_ENV = { DIGIKEY_CLIENT_ID: 'id', DIGIKEY_CLIENT_SECRET: 'secret' };
const NEXAR_ENV = { NEXAR_TOKEN: 'tok' };

function digikeyFetch(prices = [[1, 2.5], [1000, 1.1], [10000, 0.82]]) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    if (String(url).includes('/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'T', expires_in: 600 }) };
    }
    return {
      ok: true,
      json: async () => ({
        Products: [{
          ManufacturerProductNumber: 'STM32F103C8T6',
          Manufacturer: { Name: 'STMicroelectronics' },
          Description: { ProductDescription: 'ARM Cortex-M3 MCU 64KB' },
          ProductVariations: [{ StandardPricing: prices.map(([q, p]) => ({ BreakQuantity: q, UnitPrice: p })) }],
        }],
      }),
    };
  };
  return { impl, calls };
}

function nexarFetch() {
  return async () => ({
    ok: true,
    json: async () => ({
      data: { supSearchMpn: { results: [{ part: {
        mpn: 'TPS5430DDA',
        manufacturer: { name: 'Texas Instruments' },
        shortDescription: '3A step-down converter',
        sellers: [{ company: { name: 'Digi-Key' }, offers: [{ prices: [
          { quantity: 1, price: 3.1, currency: 'USD' },
          { quantity: 1000, price: 1.42, currency: 'USD' },
        ] }] }],
      } }] } },
    }),
  });
}

beforeEach(() => __resetPricingCachesForTest());

test('providerStatus reflects env config only', () => {
  assert.deepEqual(providerStatus({ env: {} }), { digikey: false, octopart: false });
  assert.deepEqual(providerStatus({ env: DIGIKEY_ENV }), { digikey: true, octopart: false });
  assert.deepEqual(providerStatus({ env: NEXAR_ENV }), { digikey: false, octopart: true });
});

test('selectBreak: largest break ≤ qty; above the table flags atRequestedQty=false', () => {
  const breaks = [{ qty: 1, price: 3 }, { qty: 1000, price: 1.2 }, { qty: 10000, price: 0.9 }].map(b => ({ ...b, currency: 'USD' }));
  assert.equal(selectBreak(breaks, 500).qty, 1);
  assert.equal(selectBreak(breaks, 1000).qty, 1000);
  assert.equal(selectBreak(breaks, 5000).qty, 1000);
  const over = selectBreak(breaks, 150000);
  assert.equal(over.qty, 10000);
  assert.equal(over.atRequestedQty, false, '150k exceeds published table');
  assert.equal(selectBreak(breaks, 10000).atRequestedQty, true);
  assert.equal(selectBreak([], 100), null);
});

test('DigiKey lookup: OAuth then search, normalized + USD→GBP converted', async () => {
  const { impl } = digikeyFetch();
  const r = await lookupPart('STM32F103', { qty: 150000 }, { env: DIGIKEY_ENV, fetchImpl: impl, fxRates: FX });
  assert.ok(r);
  assert.equal(r.source, 'digikey');
  assert.equal(r.match.mpn, 'STM32F103C8T6');
  assert.equal(r.match.manufacturer, 'STMicroelectronics');
  assert.equal(r.currency, 'GBP');
  // best published break is 10k @ $0.82 → £0.82 × (0.85/1.08)
  assert.ok(Math.abs(r.unitPrice - 0.82 * (0.85 / 1.08)) < 0.001, `got ${r.unitPrice}`);
  assert.equal(r.breakQty, 10000);
  assert.equal(r.atRequestedQty, false, 'must flag that 150k exceeds the table');
});

test('Octopart/Nexar lookup normalizes GraphQL offers', async () => {
  const r = await lookupPart('TPS5430', { qty: 1000 }, { env: NEXAR_ENV, fetchImpl: nexarFetch(), fxRates: FX });
  assert.ok(r);
  assert.equal(r.source, 'octopart');
  assert.equal(r.match.mpn, 'TPS5430DDA');
  assert.ok(Math.abs(r.unitPrice - 1.42 * (0.85 / 1.08)) < 0.001);
  assert.equal(r.atRequestedQty, true);
});

test('DigiKey preferred when both providers are configured', async () => {
  const { impl } = digikeyFetch();
  const r = await lookupPart('STM32F103', { qty: 1000 }, { env: { ...DIGIKEY_ENV, ...NEXAR_ENV }, fetchImpl: impl, fxRates: FX });
  assert.equal(r.source, 'digikey');
});

test('returns null when nothing configured, query too short, or provider errors', async () => {
  assert.equal(await lookupPart('STM32', { qty: 100 }, { env: {}, fxRates: FX }), null);
  assert.equal(await lookupPart('ab', { qty: 100 }, { env: DIGIKEY_ENV, fetchImpl: digikeyFetch().impl, fxRates: FX }), null);
  const failing = async () => ({ ok: false, status: 500, json: async () => ({}) });
  assert.equal(await lookupPart('STM32F103', { qty: 100 }, { env: DIGIKEY_ENV, fetchImpl: failing, fxRates: FX }), null);
});

test('24h SQLite cache: second lookup hits no network', async () => {
  const db = new Database(':memory:');
  const { impl, calls } = digikeyFetch();
  const o = { env: DIGIKEY_ENV, fetchImpl: impl, fxRates: FX, db };
  await lookupPart('STM32F103', { qty: 1000 }, o);
  const callsAfterFirst = calls.length;   // token + search
  await lookupPart('STM32F103', { qty: 1000 }, o);
  assert.equal(calls.length, callsAfterFirst, 'cached — no extra fetches');
  // different qty bucket → cache miss → new search (token still cached in-process)
  await lookupPart('STM32F103', { qty: 100000 }, o);
  assert.ok(calls.length > callsAfterFirst);
});

test('lookupParts batch isolates failures per line and preserves indices', async () => {
  const { impl } = digikeyFetch();
  const flaky = async (url, init) => {
    if (String(url).includes('token')) return impl(url, init);
    // fail the search for queries containing FAIL
    const body = JSON.parse(init.body);
    if (body.Keywords?.includes('FAIL')) return { ok: false, status: 500, json: async () => ({}) };
    return impl(url, init);
  };
  const res = await lookupParts(
    [{ index: 0, query: 'STM32F103', qty: 1000 }, { index: 1, query: 'FAILPART99', qty: 1000 }, { index: 2, query: 'STM32F103', qty: 1000 }],
    {}, { env: DIGIKEY_ENV, fetchImpl: flaky, fxRates: FX },
  );
  assert.equal(res.length, 3);
  assert.equal(res[0].found, true);
  assert.equal(res[1].found, false);
  assert.equal(res[2].found, true);
  assert.deepEqual(res.map(r => r.index), [0, 1, 2]);
});
