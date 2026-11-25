/**
 * Phase 2 · A-06 (P1): two costings of one application saved on the same day — the newer CREATED one is
 * current. Editing the older one (a note, an admin PATCH) must not make it current again. Tie-break only:
 * ranking approved above newer costings is decision D-3 and is not built.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { classifyRecords, type KpiRecord } from '../src/engine/kpi-dashboard.js';

vi.hoisted(() => {
  process.env.CV_DATA_DIR = `${process.env.TMPDIR || '/tmp'}/cv-kpi-p2-a06-${process.pid}-${Date.now()}`;
  process.env.JWT_SECRET = 'kpi-phase2-a06-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
});

import express from 'express';
import db from '../server/db.js';
import kpiRouter from '../server/routes/kpi.js';
import { signToken, requireAuth } from '../server/middleware/auth-middleware.js';

const rec = (id: string, p: Partial<KpiRecord>): KpiRecord => ({
  id, sourceTool: 'CostVision', sourceRef: id, ownerId: 'u1', ownerName: 'U', partNumber: 'P-1', componentName: 'Part', commodity: 'Casting',
  programme: 'L460', modelYear: 2027, powertrain: 'BEV', country: 'UK', status: 'completed', costingDate: '2026-10-01',
  createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z', shouldCost: 10, shouldCcy: 'GBP', shouldTerms: 'DAP',
  currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP', currentSource: null, costUnit: 'piece', annualVolume: null, volumeValidated: false,
  savingStatus: null, savingPerPiece: null, savingCcy: null, fx: {}, gbpShould: 10, gbpCurrent: 12, gbpSaving: null, isTest: false, deleted: false, notes: '', ...p,
});
const roleOf = (rs: ReturnType<typeof classifyRecords>, id: string) => rs.find(r => r.id === id)!.role;

describe('A-06 same-day tie (engine)', () => {
  it('the later-created costing is current even when the earlier one was edited later', () => {
    const first = rec('a-first', { createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T17:00:00Z' }); // note edited in the afternoon
    const second = rec('z-second', { createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', shouldCost: 11, gbpShould: 11 });
    const rs = classifyRecords([first, second]);
    expect(roleOf(rs, 'z-second')).toBe('current');
    expect(roleOf(rs, 'a-first')).toBe('superseded');
  });
  it('a later costing DATE still wins over creation time (unchanged)', () => {
    const rs = classifyRecords([rec('older-date', { costingDate: '2026-09-30', createdAt: '2026-10-02T09:00:00Z' }), rec('newer-date', { costingDate: '2026-10-01', createdAt: '2026-10-01T09:00:00Z' })]);
    expect(roleOf(rs, 'newer-date')).toBe('current');
  });
  it('draft v non-draft is unchanged (ranking beyond that is D-3)', () => {
    const rs = classifyRecords([rec('draft-new', { status: 'draft', createdAt: '2026-10-01T12:00:00Z' }), rec('done-old', { status: 'completed', createdAt: '2026-10-01T08:00:00Z' })]);
    expect(roleOf(rs, 'done-old')).toBe('current');
  });
});

const ALICE = 'a06-alice', ADMIN = 'a06-admin';
const tok = (id: string) => signToken(id, `${id}@test`, true);
let srv: Server; let base = '';
async function call(user: string, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() as any };
}
beforeAll(async () => {
  const now = new Date().toISOString();
  for (const [id, role, name] of [[ALICE, 'user', 'Alice Able'], [ADMIN, 'admin', 'Ada Admin']]) {
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, now);
  }
  const app = express(); app.use(express.json()); app.use('/api/kpi', requireAuth, kpiRouter);
  await new Promise<void>(r => { srv = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); });

describe('A-06 same-day tie (HTTP)', () => {
  it('a note on the older same-day costing, or an admin edit of it, does not make it current', async () => {
    const save = (sid: string, total: number) => call(ALICE, 'POST', '/api/kpi/records', {
      scenario: { id: sid, name: 'Tie part', commodity: 'casting', region: 'UK', input: { deliveryTerms: 'DAP' }, result: { total } },
      details: { partNumber: 'A06-TIE', programme: 'L663', modelYear: 2027, powertrain: 'BEV', status: 'completed', currentCost: 20, currentCcy: 'GBP', currentTerms: 'DAP' },
    });
    const one = (await save('a06-1', 15)).json.record.id;
    await new Promise(r => setTimeout(r, 15));
    const two = (await save('a06-2', 17)).json.record.id;
    const roles = async () => Object.fromEntries((await call(ALICE, 'GET', `/api/kpi/records?scope=all&all=1&search=A06-TIE&f=${encodeURIComponent(JSON.stringify({ datePreset: 'all' }))}`)).json.rows.map((r: any) => [r.id === one ? 'first' : 'second', r.role]));
    expect(await roles()).toEqual({ first: 'superseded', second: 'current' });
    await new Promise(r => setTimeout(r, 15));
    await call(ALICE, 'PATCH', `/api/kpi/records/${one}`, { notes: 'a note on the older costing' });
    expect(await roles()).toEqual({ first: 'superseded', second: 'current' });
    await call(ADMIN, 'PATCH', `/api/kpi/records/${one}`, { notes: 'admin note' });
    expect(await roles()).toEqual({ first: 'superseded', second: 'current' });
    expect((await call(ALICE, 'GET', `/api/kpi/summary?f=${encodeURIComponent(JSON.stringify({ datePreset: 'all', programme: ['L663'] }))}`)).json.financial.sumShouldGbp).toBe(17);
    void two;
  });
});
