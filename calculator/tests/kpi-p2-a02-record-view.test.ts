/**
 * Phase 2 · A-02 (P1): the record view (GET /api/kpi/records/:id) returns to an ordinary user only
 * what the record panel shows of another user's costing — commodity, region, the total, the eight
 * buckets and each operation's name and cost. The full saved costing (inputs, target prices, quotes,
 * traces) goes only to its owner or an admin. Called over real HTTP as each role.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.hoisted(() => {
  process.env.CV_DATA_DIR = `${process.env.TMPDIR || '/tmp'}/cv-kpi-p2-a02-${process.pid}-${Date.now()}`;
  process.env.JWT_SECRET = 'kpi-phase2-a02-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
});

import express from 'express';
import db from '../server/db.js';
import kpiRouter from '../server/routes/kpi.js';
import { signToken, requireAuth } from '../server/middleware/auth-middleware.js';

const ALICE = 'a02-alice', BOB = 'a02-bob', ADMIN = 'a02-admin';
const tok = (id: string) => signToken(id, `${id}@test`, true);
let srv: Server; let base = '';

async function call(user: string | null, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { ...(user ? { Authorization: `Bearer ${tok(user)}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}

const BREAKDOWN = { rawMaterial: 4, process: 3, labour: 2, tooling: 1.5, packaging: 0.3, logistics: 0.4, overhead: 1, margin: 0.8 };
const SAVED = {
  input: { partName: 'Front knuckle', deliveryTerms: 'DAP', secretSupplierQuote: 77.7, targetPrice: 66.6, annualVolume: 50000 },
  result: {
    total: 13, partName: 'Front knuckle', breakdown: BREAKDOWN, subtotal: 12.2, factoryCost: 11.2,
    operationDetails: [{ name: 'Op 10 rough turn', cost: 2.5, cycleTimeSec: 42, machineId: 'mach-x' }, { name: 'Op 20 drill', cost: 0.5, cycleTimeSec: 9 }],
    traceability: [{ field: 'rate', value: 55, unit: '£/h', rateSource: 'book', rateId: 'mach-x', confidence: 'High' }],
  },
};
let recId = '';

beforeAll(async () => {
  const now = new Date().toISOString();
  for (const [id, role, name] of [[ALICE, 'user', 'Alice Able'], [BOB, 'user', 'Bob Baker'], [ADMIN, 'admin', 'Ada Admin']]) {
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, now);
  }
  const app = express(); app.use(express.json()); app.use('/api/kpi', requireAuth, kpiRouter);
  await new Promise<void>(r => { srv = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const s = await call(ALICE, 'POST', '/api/kpi/records', {
    scenario: { id: 'a02-sc', name: 'Front knuckle', commodity: 'casting', region: 'UK', input: SAVED.input, result: SAVED.result },
    details: { partNumber: 'A02-100', programme: 'L460', modelYear: 2027, powertrain: 'BEV', status: 'completed', currentCost: 14, currentCcy: 'GBP', currentTerms: 'DAP' },
  });
  expect(s.status).toBe(201);
  recId = s.json.record.id;
});
afterAll(() => { srv?.close(); });

describe('A-02 record view fields', () => {
  it('signed-out → 401', async () => {
    expect((await call(null, 'GET', `/api/kpi/records/${recId}`)).status).toBe(401);
  });

  it('an ordinary user gets only what the panel shows of another user’s costing', async () => {
    const r = await call(BOB, 'GET', `/api/kpi/records/${recId}`);
    expect(r.status).toBe(200);
    expect(r.json.canEdit).toBe(false);
    expect(r.json.costing).toEqual({
      commodity: 'casting', region: 'UK',
      result: { total: 13, breakdown: BREAKDOWN, operationDetails: [{ name: 'Op 10 rough turn', cost: 2.5 }, { name: 'Op 20 drill', cost: 0.5 }] },
    });
    expect(r.text).not.toMatch(/secretSupplierQuote|targetPrice|cycleTimeSec|mach-x|traceability/);
  });

  it('the owner and an admin get the full saved costing', async () => {
    for (const u of [ALICE, ADMIN]) {
      const r = await call(u, 'GET', `/api/kpi/records/${recId}`);
      expect(r.status).toBe(200);
      expect(r.json.costing).toMatchObject({ commodity: 'casting', region: 'UK', input: SAVED.input, result: SAVED.result });
    }
  });

  it('a bucket that is not a number, or a non-bucket key, is not passed through to an ordinary user', async () => {
    const s = await call(ALICE, 'POST', '/api/kpi/records', {
      scenario: { id: 'a02-odd', name: 'Odd', commodity: 'casting', region: 'UK', input: {}, result: { total: 5, breakdown: { rawMaterial: 5, note: 'internal' }, operationDetails: [{ name: 'Op', cost: 'x' }] } },
      details: { partNumber: 'A02-ODD', status: 'completed' },
    });
    const r = await call(BOB, 'GET', `/api/kpi/records/${s.json.record.id}`);
    expect(r.json.costing.result).toEqual({ total: 5, breakdown: { rawMaterial: 5 }, operationDetails: [{ name: 'Op', cost: null }] });
  });
});
