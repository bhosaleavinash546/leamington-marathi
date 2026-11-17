/**
 * Phase 2 · A-18 (P2): a malformed or unknown filter is an error (400 BAD_FILTER with the reason), never
 * the unfiltered company-wide totals. A well-formed filter that matches nothing is still 200 with 0.
 * The screen shows the error with a "Clear filters" button (builder test below; live screenshots in
 * phase2-evidence/A-18). Filters in the page address are not approved in this phase.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.hoisted(() => {
  process.env.CV_DATA_DIR = `${process.env.TMPDIR || '/tmp'}/cv-kpi-p2-a18-${process.pid}-${Date.now()}`;
  process.env.JWT_SECRET = 'kpi-phase2-a18-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
});

import express from 'express';
import db from '../server/db.js';
import kpiRouter from '../server/routes/kpi.js';
import { signToken, requireAuth } from '../server/middleware/auth-middleware.js';
import { validateFilters, parseFilters, DEFAULT_FILTERS } from '../src/engine/kpi-dashboard.js';
import { badFilterHtml } from '../src/ui/kpi-dashboard/kpi-builders.js';

const BOB = 'a18-bob';
const tok = (id: string) => signToken(id, `${id}@test`, true);
let srv: Server; let base = '';
async function get(path: string) {
  const r = await fetch(base + path, { headers: { Authorization: `Bearer ${tok(BOB)}` } });
  const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: r.status, json, text };
}
const enc = (s: string) => `f=${encodeURIComponent(s)}`;
const f = (o: unknown) => enc(JSON.stringify(o));

beforeAll(async () => {
  db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', 'Bob Baker', 1, 'user', ?)`).run(BOB, `${BOB}@test`, new Date().toISOString());
  const app = express(); app.use(express.json()); app.use('/api/kpi', requireAuth, kpiRouter);
  await new Promise<void>(r => { srv = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  for (const [sid, prog] of [['a18-1', 'L460'], ['a18-2', 'L461']]) {
    const r = await fetch(base + '/api/kpi/records', { method: 'POST', headers: { Authorization: `Bearer ${tok(BOB)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      scenario: { id: sid, name: 'P', commodity: 'casting', region: 'UK', input: { deliveryTerms: 'DAP' }, result: { total: 5 } },
      details: { partNumber: `A18-${prog}`, programme: prog, modelYear: 2027, powertrain: 'BEV', status: 'completed', currentCost: 6, currentCcy: 'GBP', currentTerms: 'DAP' } }) });
    expect(r.status).toBe(201);
  }
});
afterAll(() => { srv?.close(); });

const BAD: [string, string][] = [
  ['truncated JSON (P17)', enc('{"programme":["NOPE"')],
  ['not an object', f(['L460'])],
  ['null', f(null)],
  ['unknown key', f({ datePreset: 'all', programmes: ['L460'] })],
  ['a value that is not a list', f({ datePreset: 'all', programme: 'L460' })],
  ['a list with a non-string', f({ datePreset: 'all', programme: [460] })],
  ['an empty value', f({ datePreset: 'all', programme: [''] })],
  ['a value over 120 characters', f({ datePreset: 'all', programme: ['x'.repeat(121)] })],
  ['more than 200 values', f({ datePreset: 'all', programme: Array.from({ length: 201 }, (_, i) => `P${i}`) })],
  ['unknown date preset', f({ datePreset: 'last-decade' })],
  ['a bad custom date', f({ datePreset: 'custom', dateFrom: '2026-13-01' })],
  ['a date that is not a string', f({ datePreset: 'custom', dateTo: 20261101 })],
  ['an unknown status', f({ datePreset: 'all', status: ['maybe'] })],
  ['a non-ISO currency', f({ datePreset: 'all', currency: ['XYZ'] })],
  ['a model year that is not a year', f({ datePreset: 'all', modelYear: ['MY27'] })],
];

describe('A-18 server', () => {
  for (const [name, q] of BAD) {
    it(`${name} → 400 BAD_FILTER on every filtered endpoint, never the unfiltered totals`, async () => {
      for (const path of ['/api/kpi/summary', '/api/kpi/records', '/api/kpi/records.csv', '/api/kpi/drill']) {
        const r = await get(`${path}?${q}`);
        expect(r.status, `${path}`).toBe(400);
        expect(r.json).toMatchObject({ code: 'BAD_FILTER' });
        expect(r.json.error).toMatch(/^This filter could not be applied: /);
      }
    });
  }
  it('a well-formed filter that matches nothing is 200 with 0; no filter and a good filter still work', async () => {
    expect((await get(`/api/kpi/summary?${f({ datePreset: 'all', programme: ['NOPE'] })}`)).json.operational.totalRecords).toBe(0);
    expect((await get(`/api/kpi/summary?${f({ datePreset: 'all', programme: ['L460'] })}`)).json.operational.totalRecords).toBe(1);
    expect((await get(`/api/kpi/summary?${f({ ...DEFAULT_FILTERS, datePreset: 'all' })}`)).json.operational.totalRecords).toBe(2);
    expect((await get('/api/kpi/summary')).status).toBe(200);
    expect((await get(`/api/kpi/summary?${f({ datePreset: 'all', status: ['completed'], currency: ['GBP', '(not set)'], modelYear: ['2027', '(not set)'] })}`)).json.operational.totalRecords).toBe(2);
    expect((await get(`/api/kpi/summary?${f({ datePreset: '12m', dateFrom: '2026-01-01' })}`)).status).toBe(200);   // a left-over custom date with another preset is ignored, as before
  });
});

describe('A-18 engine + screen', () => {
  // (A filter over 20,000 characters is also refused 400 by the server, but a URL that long is refused
  //  by Node with 431 before it reaches the route — Phase 1 P12 — so it is not reachable over HTTP here.)
  it('validateFilters returns the same filters parseFilters builds for a valid object', () => {
    const raw = { datePreset: 'custom', dateFrom: '2026-01-01', dateTo: '2026-03-31', programme: ['L460', 'a, b'], status: ['approved'] };
    const v = validateFilters(raw);
    expect(v).toEqual({ ok: true, filters: parseFilters(raw) });
    expect(validateFilters({ datePreset: 'nope' })).toEqual({ ok: false, reason: expect.stringMatching(/date preset/) });
  });
  it('the error state says the filter could not be applied and offers "Clear filters"', () => {
    const html = badFilterHtml('This filter could not be applied: unknown filter "programmes".');
    expect(html).toContain('role="alert"');
    expect(html).toContain('This filter could not be applied');
    expect(html).toMatch(/<button type="button" class="btn btn-secondary" data-clear-all>Clear filters<\/button>/);
    expect(badFilterHtml('<img src=x>')).not.toContain('<img');
  });
});
