/**
 * Phase 2 · A-03 (P0): a validated annual volume stays validated only for the value an admin
 * validated. Any change to the volume of a validated record clears the flag, whoever makes it;
 * an admin re-validates it as a separate, logged save. Called over real HTTP as the owner and an admin.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.hoisted(() => {
  process.env.CV_DATA_DIR = `${process.env.TMPDIR || '/tmp'}/cv-kpi-p2-a03-${process.pid}-${Date.now()}`;
  process.env.JWT_SECRET = 'kpi-phase2-a03-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
});

import express from 'express';
import db from '../server/db.js';
import kpiRouter from '../server/routes/kpi.js';
import { signToken, requireAuth } from '../server/middleware/auth-middleware.js';

const ALICE = 'a03-alice', BOB = 'a03-bob', ADMIN = 'a03-admin';
const tok = (id: string) => signToken(id, `${id}@test`, true);
let srv: Server; let base = '';

async function call(user: string, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json };
}
const f = (o: object) => `f=${encodeURIComponent(JSON.stringify(o))}`;
const annualised = async (prog: string) => (await call(BOB, 'GET', `/api/kpi/summary?${f({ datePreset: 'all', programme: [prog] })}`)).json.financial.annualised;

async function validatedRecord(sid: string, prog: string): Promise<string> {
  const s = await call(ALICE, 'POST', '/api/kpi/records', {
    scenario: { id: sid, name: 'Volume part', commodity: 'casting', region: 'UK', input: { deliveryTerms: 'DAP' }, result: { total: 10 } },
    details: { partNumber: `A03-${sid}`, programme: prog, modelYear: 2028, powertrain: 'BEV', status: 'completed', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP' },
  });
  expect(s.status).toBe(201);
  const id = s.json.record.id as string;
  const v = await call(ADMIN, 'PATCH', `/api/kpi/records/${id}`, { annualVolume: 60000, volumeValidated: true });
  expect(v.status).toBe(200);
  expect(v.json.record.volumeValidated).toBe(true);
  return id;
}

beforeAll(async () => {
  const now = new Date().toISOString();
  for (const [id, role, name] of [[ALICE, 'user', 'Alice Able'], [BOB, 'user', 'Bob Baker'], [ADMIN, 'admin', 'Ada Admin']]) {
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, now);
  }
  const app = express(); app.use(express.json()); app.use('/api/kpi', requireAuth, kpiRouter);
  await new Promise<void>(r => { srv = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); });

describe('A-03 validated annual volume', () => {
  it('the OWNER changing a validated volume clears the validation, and the annualised KPI drops it', async () => {
    const id = await validatedRecord('own', 'A03P1');
    expect(await annualised('A03P1')).toEqual({ n: 1, gbp: 120000 });
    const r = await call(ALICE, 'PATCH', `/api/kpi/records/${id}`, { annualVolume: 6_000_000 });
    expect(r.status).toBe(200);
    expect(r.json.record.annualVolume).toBe(6_000_000);
    expect(r.json.record.volumeValidated).toBe(false);
    expect(await annualised('A03P1')).toEqual({ n: 0, gbp: 0 });
  });

  it('an ADMIN changing a validated volume clears it too (whoever makes the change)', async () => {
    const id = await validatedRecord('adm', 'A03P2');
    const r = await call(ADMIN, 'PATCH', `/api/kpi/records/${id}`, { annualVolume: 70000 });
    expect(r.status).toBe(200);
    expect(r.json.record.volumeValidated).toBe(false);
  });

  it('a save that sends the SAME volume (the edit form sends every field) keeps the validation', async () => {
    const id = await validatedRecord('same', 'A03P3');
    const r = await call(ALICE, 'PATCH', `/api/kpi/records/${id}`, { annualVolume: 60000, notes: 'note only' });
    expect(r.status).toBe(200);
    expect(r.json.record.volumeValidated).toBe(true);
    expect(await annualised('A03P3')).toEqual({ n: 1, gbp: 120000 });
  });

  it('changing a validated volume and re-validating it in the SAME request is refused; a separate re-validation works', async () => {
    const id = await validatedRecord('both', 'A03P4');
    const both = await call(ADMIN, 'PATCH', `/api/kpi/records/${id}`, { annualVolume: 80000, volumeValidated: true });
    expect(both.status).toBe(400);
    expect(both.json.error).toMatch(/separate/i);
    const unchanged = await call(ADMIN, 'GET', `/api/kpi/records/${id}`);
    expect(unchanged.json.record).toMatchObject({ annualVolume: 60000, volumeValidated: true });
    const change = await call(ADMIN, 'PATCH', `/api/kpi/records/${id}`, { annualVolume: 80000 });
    expect(change.json.record.volumeValidated).toBe(false);
    const again = await call(ADMIN, 'PATCH', `/api/kpi/records/${id}`, { volumeValidated: true });
    expect(again.status).toBe(200);
    expect(again.json.record).toMatchObject({ annualVolume: 80000, volumeValidated: true });
    expect(await annualised('A03P4')).toEqual({ n: 1, gbp: 160000 });
    // both saves are in the audit log as separate entries
    const audit = (await call(ADMIN, 'GET', '/api/kpi/audit')).json.rows.filter((a: any) => a.target === id && a.action === 'record.edit');
    expect(audit.map((a: any) => JSON.parse(a.detail))).toEqual(expect.arrayContaining([{ annualVolume: 80000, volumeValidated: false }, { volumeValidated: true }]));
  });

  it('a first validation of a volume the admin types (record not yet validated) is still one save', async () => {
    const s = await call(ALICE, 'POST', '/api/kpi/records', {
      scenario: { id: 'first', name: 'Volume part', commodity: 'casting', region: 'UK', input: { deliveryTerms: 'DAP' }, result: { total: 10 } },
      details: { partNumber: 'A03-first', programme: 'A03P5', modelYear: 2028, powertrain: 'BEV', status: 'completed', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP', annualVolume: 1000 },
    });
    const r = await call(ADMIN, 'PATCH', `/api/kpi/records/${s.json.record.id}`, { annualVolume: 60000, volumeValidated: true });
    expect(r.status).toBe(200);
    expect(r.json.record.volumeValidated).toBe(true);
  });
});
