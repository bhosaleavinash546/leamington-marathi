// Patent search: honest no-key degradation, query building, retrieval mapping,
// TTL cache — all via DI, no network.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { providerStatus, buildPatentQuery, searchPatents, __resetPatentCacheForTest } from '../patent-search.mjs';

beforeEach(() => __resetPatentCacheForTest());

test('providerStatus reflects the key', () => {
  assert.equal(providerStatus({ env: {} }).configured, false);
  assert.equal(providerStatus({ env: { PATENTSVIEW_API_KEY: 'k' } }).configured, true);
});

test('buildPatentQuery: distinctive deduped terms, capped', () => {
  const q = buildPatentQuery('Hairpin winding for the stator', 'Rectangular copper bar conductors for the stator winding');
  assert.ok(q.includes('hairpin') && q.includes('copper'));
  assert.ok(!q.includes('the'), 'stopwords removed');
  assert.ok(q.split(' ').length <= 8, 'capped at 8 terms');
});

test('no key → configured:false with NO patents (honest degradation, no fetch)', async () => {
  let fetched = false;
  const r = await searchPatents('Aluminium HPDC bracket', '', {}, { env: {}, fetchImpl: async () => { fetched = true; } });
  assert.equal(r.configured, false);
  assert.deepEqual(r.patents, []);
  assert.equal(fetched, false, 'never calls the network without a key');
});

const FAKE_RESPONSE = {
  ok: true,
  json: async () => ({
    patents: [
      { patent_id: '11223344', patent_title: 'High pressure die cast bracket', patent_date: '2023-05-02', patent_abstract: 'A cast bracket…', assignees: [{ assignee_organization: 'Example Corp' }] },
      { patent_title: 'No id — dropped' },
    ],
  }),
};

test('retrieval maps PatentsView records to citable entries with links', async () => {
  const calls = [];
  const r = await searchPatents('HPDC bracket', 'aluminium casting', {}, {
    env: { PATENTSVIEW_API_KEY: 'k' },
    fetchImpl: async (url, opts) => { calls.push({ url, opts }); return FAKE_RESPONSE; },
    now: () => 1000,
  });
  assert.equal(r.configured, true);
  assert.equal(r.patents.length, 1, 'record without an id dropped');
  assert.equal(r.patents[0].number, '11223344');
  assert.equal(r.patents[0].assignee, 'Example Corp');
  assert.match(r.patents[0].url, /patents\.google\.com\/patent\/US11223344/);
  assert.equal(calls[0].opts.headers['X-Api-Key'], 'k');
});

test('24h cache: second identical query never refetches; API errors throw', async () => {
  let n = 0;
  const deps = { env: { PATENTSVIEW_API_KEY: 'k' }, fetchImpl: async () => { n++; return FAKE_RESPONSE; }, now: () => 1000 };
  await searchPatents('HPDC bracket', '', {}, deps);
  const second = await searchPatents('HPDC bracket', '', {}, deps);
  assert.equal(n, 1, 'served from cache');
  assert.equal(second.cached, true);
  await assert.rejects(
    searchPatents('different query entirely', '', {}, { ...deps, fetchImpl: async () => ({ ok: false, status: 403 }) }),
    /PatentsView 403/,
  );
});
