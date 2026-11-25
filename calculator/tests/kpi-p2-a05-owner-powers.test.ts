/**
 * Phase 2 · A-05 (P1): owner powers on admin-set records, enforced on the server.
 *  - test flag, commodity and country are admin-only;
 *  - an owner cannot change a status an admin set (reviewed / approved);
 *  - a changed identity field (part number, programme, model year, powertrain) or annual volume on a
 *    reviewed / approved record returns it to "completed", whoever makes the change; an admin re-approves
 *    it as a separate save (a request that changes them AND asks for reviewed / approved is refused 400);
 *  - the edit form sends every field, so "changed" is a value comparison (a notes-only save of an
 *    approved record keeps it approved).
 * Deleting an approved record is D-4 (blank) and stays as it is. Called over real HTTP.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.hoisted(() => {
  process.env.CV_DATA_DIR = `${process.env.TMPDIR || '/tmp'}/cv-kpi-p2-a05-${process.pid}-${Date.now()}`;
  process.env.JWT_SECRET = 'kpi-phase2-a05-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
});

import express from 'express';
import db from '../server/db.js';
import kpiRouter from '../server/routes/kpi.js';
import { signToken, requireAuth } from '../server/middleware/auth-middleware.js';

const OWNER = 'a05-owner', ADMIN = 'a05-admin';
const tok = (id: string) => signToken(id, `${id}@test`, true);
let srv: Server; let base = '';
let seq = 0;

async function call(user: string, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json };
}
const DETAILS = { programme: 'L461', modelYear: 2027, powertrain: 'BEV', currentCost: 50, currentCcy: 'GBP', currentTerms: 'DAP', annualVolume: 1000 };
/** A record the admin has set to `status` (default approved). */
async function adminSet(status: 'approved' | 'reviewed' | 'completed' = 'approved'): Promise<string> {
  const n = ++seq;
  const s = await call(OWNER, 'POST', '/api/kpi/records', {
    scenario: { id: `a05-${n}`, name: 'Identity part', commodity: 'casting', region: 'UK', input: { deliveryTerms: 'DAP' }, result: { total: 40 } },
    details: { partNumber: `A05-${n}`, status: 'completed', ...DETAILS },
  });
  expect(s.status).toBe(201);
  const id = s.json.record.id as string;
  if (status !== 'completed') expect((await call(ADMIN, 'PATCH', `/api/kpi/records/${id}`, { status })).json.record.status).toBe(status);
  return id;
}
/** What the record panel's edit form sends: every field, the current status included. */
const formBody = (pn: string, status: string, over: Record<string, unknown> = {}) =>
  ({ status, partNumber: pn, programme: DETAILS.programme, powertrain: DETAILS.powertrain, modelYear: DETAILS.modelYear, currentCost: DETAILS.currentCost, currentCcy: 'GBP', currentTerms: 'DAP', annualVolume: DETAILS.annualVolume, notes: '', ...over });
const get = async (id: string) => (await call(ADMIN, 'GET', `/api/kpi/records/${id}`)).json.record;

beforeAll(async () => {
  const now = new Date().toISOString();
  for (const [id, role, name] of [[OWNER, 'user', 'Owen Owner'], [ADMIN, 'admin', 'Ada Admin']]) {
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, now);
  }
  const app = express(); app.use(express.json()); app.use('/api/kpi', requireAuth, kpiRouter);
  await new Promise<void>(r => { srv = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); });

describe('A-05 admin-only fields', () => {
  it('an owner cannot set the test flag, commodity or country; an admin can', async () => {
    const id = await adminSet('completed');
    for (const patch of [{ isTest: true }, { commodity: 'Forging' }, { country: 'CN' }]) {
      const r = await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, patch);
      expect(r.status).toBe(403);
      expect(r.json.error).toMatch(/Only an admin/);
    }
    expect(await get(id)).toMatchObject({ isTest: false, commodity: 'Casting', country: 'UK', excluded: null });
    const a = await call(ADMIN, 'PATCH', `/api/kpi/records/${id}`, { commodity: 'Forging', country: 'CN', isTest: true });
    expect(a.status).toBe(200);
    expect(a.json.record).toMatchObject({ commodity: 'Forging', country: 'CN', isTest: true, excluded: 'test' });
  });
});

describe('A-05 status an admin set', () => {
  it('an owner cannot downgrade an approved or reviewed costing', async () => {
    for (const st of ['approved', 'reviewed'] as const) {
      const id = await adminSet(st);
      for (const to of ['draft', 'completed']) {
        const r = await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, { status: to });
        expect(r.status).toBe(403);
      }
      expect((await get(id)).status).toBe(st);
    }
  });

  it('a notes-only save from the edit form (status sent unchanged) keeps an approved costing approved', async () => {
    const id = await adminSet();
    const r = await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, formBody(`A05-${seq}`, 'approved', { notes: 'owner note' }));
    expect(r.status).toBe(200);
    expect(r.json.record).toMatchObject({ status: 'approved', notes: 'owner note' });
  });

  it('an owner still cannot mark a completed costing reviewed or approved', async () => {
    const id = await adminSet('completed');
    expect((await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, { status: 'approved' })).status).toBe(403);
    expect((await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, { status: 'reviewed' })).status).toBe(403);
  });
});

describe('A-05 identity or volume change on an approved / reviewed costing → completed', () => {
  const CHANGES: Record<string, unknown>[] = [{ partNumber: 'A05-MOVED' }, { programme: 'L460' }, { modelYear: 2028 }, { powertrain: 'MHEV' }, { annualVolume: 2000 }];
  for (const who of [OWNER, ADMIN]) {
    for (const ch of CHANGES) {
      it(`${who === OWNER ? 'owner' : 'admin'} changes ${Object.keys(ch)[0]} → completed`, async () => {
        const id = await adminSet();
        const r = await call(who, 'PATCH', `/api/kpi/records/${id}`, ch);
        expect(r.status).toBe(200);
        expect(r.json.record.status).toBe('completed');
        expect(r.json.record).toMatchObject(ch);
      });
    }
  }

  it('a reviewed costing goes back to completed too', async () => {
    const id = await adminSet('reviewed');
    expect((await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, { programme: 'L460' })).json.record.status).toBe('completed');
  });

  it('the same value sent again is not a change', async () => {
    const id = await adminSet();
    const r = await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, { partNumber: `A05-${seq}`, programme: 'L461', modelYear: 2027, powertrain: 'BEV', annualVolume: 1000, currentCost: 50 });
    expect(r.json.record.status).toBe('approved');
  });

  it('a change that asks to keep or set reviewed / approved in the same request is refused; nothing is written', async () => {
    const id = await adminSet();
    const owner = await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, formBody('A05-ECHO', 'approved'));
    expect(owner.status).toBe(400);
    expect(owner.json.error).toMatch(/separate/i);
    const admin = await call(ADMIN, 'PATCH', `/api/kpi/records/${id}`, { programme: 'L460', status: 'approved' });
    expect(admin.status).toBe(400);
    expect(await get(id)).toMatchObject({ status: 'approved', partNumber: `A05-${seq}`, programme: 'L461' });
    // as two saves: the owner (or admin) changes it → completed; the admin re-approves it
    const changed = await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, formBody('A05-ECHO', 'completed'));
    expect(changed.status).toBe(200);
    expect(changed.json.record).toMatchObject({ status: 'completed', partNumber: 'A05-ECHO' });
    const again = await call(ADMIN, 'PATCH', `/api/kpi/records/${id}`, { status: 'approved' });
    expect(again.json.record).toMatchObject({ status: 'approved', partNumber: 'A05-ECHO' });
  });

  it('an admin approving a COMPLETED costing while correcting its programme is one save (nothing to reset)', async () => {
    const id = await adminSet('completed');
    const r = await call(ADMIN, 'PATCH', `/api/kpi/records/${id}`, { programme: 'L460', status: 'approved' });
    expect(r.status).toBe(200);
    expect(r.json.record).toMatchObject({ status: 'approved', programme: 'L460' });
  });

  it('an owner changing the current cost of an approved costing still sends it back (existing rule)', async () => {
    const id = await adminSet();
    expect((await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, { currentCost: 51 })).json.record.status).toBe('completed');
  });

  it('D-4: the owner deletes an approved costing only with a reason, which the audit log records', async () => {
    const id = await adminSet();
    expect((await call(OWNER, 'DELETE', `/api/kpi/records/${id}`)).status).toBe(400);
    expect((await call(OWNER, 'DELETE', `/api/kpi/records/${id}`, { reason: 'no' })).status).toBe(400);   // too short
    expect((await call(OWNER, 'DELETE', `/api/kpi/records/${id}`, { reason: 'supplier quote superseded' })).status).toBe(200);
    const audit = await call(ADMIN, 'GET', '/api/kpi/audit');
    const row = audit.json.rows.find((r: any) => r.action === 'record.delete' && r.target === id);
    expect(JSON.parse(row.detail)).toMatchObject({ status: 'approved', reason: 'supplier quote superseded' });
  });

  it('D-4: a completed costing is deleted by its owner without a reason, as before', async () => {
    const id = await adminSet('completed');
    expect((await call(OWNER, 'DELETE', `/api/kpi/records/${id}`)).status).toBe(200);
  });

  it('D-4: the owner withdraws an approved costing to Completed or Draft with a reason (audited); without one, 403', async () => {
    const id = await adminSet();
    expect((await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, { status: 'completed' })).status).toBe(403);
    const w = await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, { status: 'draft', reason: 'programme cancelled' });
    expect(w.status).toBe(200);
    expect(w.json.record.status).toBe('draft');
    const audit = await call(ADMIN, 'GET', '/api/kpi/audit');
    const row = audit.json.rows.find((r: any) => r.action === 'record.withdraw' && r.target === id);
    expect(JSON.parse(row.detail)).toEqual({ from: 'approved', to: 'draft', reason: 'programme cancelled' });
    // the reason is not stored on the record
    expect(w.json.record.notes ?? '').not.toMatch(/programme cancelled/);
  });

  it('D-4: a reason never lets the owner raise a status', async () => {
    const id = await adminSet('completed');
    expect((await call(OWNER, 'PATCH', `/api/kpi/records/${id}`, { status: 'approved', reason: 'please approve this' })).status).toBe(403);
  });
});
