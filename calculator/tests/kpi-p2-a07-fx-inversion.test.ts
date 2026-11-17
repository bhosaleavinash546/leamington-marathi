/**
 * Phase 2 · A-07 (P1): an uploaded FX rate that is an inverted reference rate is refused. On a log
 * scale: refused when the rate is closer to 1 ÷ reference than to the reference. Where the reference is
 * within 10 % of 1.0 the two are hard to tell apart, so the file loads with a warning instead. The
 * direction stays GBP per ONE unit of the currency; the existing 10× guard is unchanged.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.hoisted(() => {
  process.env.CV_DATA_DIR = `${process.env.TMPDIR || '/tmp'}/cv-kpi-p2-a07-${process.pid}-${Date.now()}`;
  process.env.JWT_SECRET = 'kpi-phase2-a07-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
});

import express from 'express';
import db from '../server/db.js';
import kpiRouter from '../server/routes/kpi.js';
import { signToken, requireAuth } from '../server/middleware/auth-middleware.js';
import { builtInFxReference } from '../server/data/kpi-store.js';
import { parseFxRows } from '../server/utils/kpi-import.js';

const ADMIN = 'a07-admin', BOB = 'a07-bob';
const tok = (id: string) => signToken(id, `${id}@test`, true);
let srv: Server; let base = '';
async function call(user: string, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() as any };
}
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const HEAD = 'currency,period,gbp_per_unit,source';
const rows = (...r: [string, string, number | string][]) => r.map(([c, p, v]) => ({ currency: c, period: p, gbp_per_unit: v, source: 'Treasury' }));
const HEADERS = ['currency', 'period', 'gbp_per_unit', 'source'];
const REF = builtInFxReference();
const NOW = '2026-11-17T00:00:00Z';

beforeAll(async () => {
  const now = new Date().toISOString();
  for (const [id, role, name] of [[ADMIN, 'admin', 'Ada Admin'], [BOB, 'user', 'Bob Baker']]) {
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, now);
  }
  const app = express(); app.use(express.json({ limit: '10mb' })); app.use('/api/kpi', requireAuth, kpiRouter);
  await new Promise<void>(r => { srv = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); });

describe('A-07 inversion check (parser)', () => {
  it('refuses EUR 1.19 and USD 1.31 (inverted), naming row and column', () => {
    const r = parseFxRows(rows(['EUR', '2026-01', 1.19], ['USD', '2026-01', 1.31]), HEADERS, REF, NOW);
    expect(r.rates).toEqual([]);
    expect(r.errors.map(e => `${e.row}:${e.column}`)).toEqual(['2:gbp_per_unit', '3:gbp_per_unit']);
    expect(r.errors[0].message).toMatch(/inverted/);
  });
  it('accepts a genuine rate either side of the reference', () => {
    const r = parseFxRows(rows(['EUR', '2026-01', 0.84], ['EUR', '2026-02', 0.95], ['USD', '2026-01', 0.70], ['SGD', '2026-01', 0.55], ['CAD', '2026-01', 0.60]), HEADERS, REF, NOW);
    expect(r.errors).toEqual([]);
    expect(r.rates).toHaveLength(5);
  });
  it('the units-per-£1 column is still turned into GBP per unit and passes', () => {
    const r = parseFxRows([{ currency: 'EUR', period: '2026-01', units_per_gbp: 1.19, source: 'T' }], ['currency', 'period', 'units_per_gbp', 'source'], REF, NOW);
    expect(r.errors).toEqual([]);
    expect(r.rates[0].gbpPerUnit).toBeCloseTo(1 / 1.19, 12);
  });
  it('the existing 10× guard is unchanged (ZAR inverted is still refused by it)', () => {
    const r = parseFxRows(rows(['ZAR', '2026-01', 23.5]), HEADERS, REF, NOW);
    expect(r.errors[0].message).toMatch(/more than 10× away/);
  });
  it('a reference within 10 % of 1.0 warns instead of refusing', () => {
    const near = { ...REF, rates: { ...REF.rates, CHF: 0.95, KWD: 2.6 } };
    const w = parseFxRows(rows(['CHF', '2026-01', 1.04]), HEADERS, near, NOW);
    expect(w.errors).toEqual([]);
    expect(w.rates).toHaveLength(1);
    expect(w.notes.join(' ')).toMatch(/CHF.*inverted/);
    // a reference above 1 is checked the other way round
    expect(parseFxRows(rows(['KWD', '2026-01', 0.40]), HEADERS, near, NOW).errors[0].message).toMatch(/inverted/);
    expect(parseFxRows(rows(['KWD', '2026-01', 2.5]), HEADERS, near, NOW).errors).toEqual([]);
  });
  it('a currency with no reference is not checked here (D-5)', () => {
    expect(parseFxRows(rows(['AED', '2026-01', 4.9]), HEADERS, REF, NOW).errors).toEqual([]);
  });
});

describe('A-07 over HTTP', () => {
  it('the admin upload of inverted EUR / USD is refused 400 and nothing is loaded; a correct file loads', async () => {
    const bad = await call(ADMIN, 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`${HEAD}\nEUR,2026-01,1.19,inverted\nUSD,2026-01,1.31,inverted\n`) });
    expect(bad.status).toBe(400);
    expect(bad.json.errors.map((e: any) => `${e.row}:${e.column}`)).toEqual(['2:gbp_per_unit', '3:gbp_per_unit']);
    expect((await call(ADMIN, 'GET', '/api/kpi/fx')).json.rates).toEqual([]);
    const ok = await call(ADMIN, 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`${HEAD}\nEUR,2026-01,0.84,Treasury\n`) });
    expect(ok.status).toBe(200);
    expect(ok.json.loaded).toBe(1);
  });
  it('a normal user still gets 403', async () => {
    expect((await call(BOB, 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`${HEAD}\nEUR,2026-01,0.84,T\n`) })).status).toBe(403);
  });
});
