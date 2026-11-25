/**
 * Phase 2 · A-10 (P1, part): the record import refuses a row with a costing date in the future (after
 * today + 1 day, server date in UTC — confirmed at Stop 1) and a row that points at a record that was
 * deleted from the dashboard. Each refused row is reported with its row, column and reason; the import
 * stays all-or-nothing. Imported approval / validation / saving flags and re-import overwriting
 * in-app decisions are D-9 and are not changed here.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.hoisted(() => {
  process.env.CV_DATA_DIR = `${process.env.TMPDIR || '/tmp'}/cv-kpi-p2-a10-${process.pid}-${Date.now()}`;
  process.env.JWT_SECRET = 'kpi-phase2-a10-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
});

import express from 'express';
import db from '../server/db.js';
import kpiRouter from '../server/routes/kpi.js';
import { signToken, requireAuth } from '../server/middleware/auth-middleware.js';
import { parseImportRows, IMPORT_COLUMNS } from '../server/utils/kpi-import.js';

const ADMIN = 'a10-admin', BOB = 'a10-bob';
const tok = (id: string) => signToken(id, `${id}@test`, true);
let srv: Server; let base = '';
async function call(user: string, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() as any };
}
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const HEAD = 'source_tool,source_record_id,owner,part_number,component_name,commodity,programme,model_year,powertrain,country,status,costing_date,should_cost,should_currency,should_terms,current_cost,current_currency,current_terms';
const line = (ref: string, pn: string, date: string, should = 5) => `CSS System,${ref},R. Rao,${pn},Part,Casting,L460,2027,BEV,GB,completed,${date},${should},GBP,DAP,6,GBP,DAP`;
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const HEADERS = IMPORT_COLUMNS.map(c => c.key);
const row = (date: string) => ({ source_tool: 'CSS System', source_record_id: 'X', owner: 'R', component_name: 'P', status: 'completed', costing_date: date });

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

describe('A-10 future costing date (parser)', () => {
  it('today and today + 1 are accepted; today + 2 and 2031 are refused with row and column', () => {
    const today = '2026-11-17';
    expect(parseImportRows([row('2026-11-17'), row('2026-11-18')].map((r, i) => ({ ...r, source_record_id: `X${i}` })), HEADERS, { today }).errors).toEqual([]);
    const r = parseImportRows([row('2026-11-19'), { ...row('2031-01-01'), source_record_id: 'Y' }], HEADERS, { today });
    expect(r.records).toEqual([]);
    expect(r.errors.map(e => `${e.row}:${e.column}`)).toEqual(['2:costing_date', '3:costing_date']);
    expect(r.errors[0].message).toMatch(/future/);
  });
});

describe('A-10 over HTTP', () => {
  it('a row dated 2031 is refused, nothing is imported', async () => {
    const csv = `${HEAD}\n${line('OK-1', 'A10-OK', dayOffset(0))}\n${line('F-1', 'A10-FUTURE', '2031-01-01')}\n`;
    const r = await call(ADMIN, 'POST', '/api/kpi/import', { fileBase64: b64(csv) });
    expect(r.status).toBe(400);
    expect(r.json.errors).toEqual([expect.objectContaining({ row: 3, column: 'costing_date' })]);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM costing_records WHERE part_number LIKE 'A10-%'`).get() as { n: number }).n).toBe(0);
  });

  it('tomorrow (UTC) is accepted', async () => {
    const r = await call(ADMIN, 'POST', '/api/kpi/import', { fileBase64: b64(`${HEAD}\n${line('T-1', 'A10-TOMORROW', dayOffset(1))}\n`) });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ added: 1, updated: 0 });
  });

  it('a row that points at a deleted record is refused, naming the row; the rest of the file is not imported', async () => {
    expect((await call(ADMIN, 'POST', '/api/kpi/import', { fileBase64: b64(`${HEAD}\n${line('DEL-1', 'A10-DEL', dayOffset(0))}\n`) })).json).toEqual({ added: 1, updated: 0 });
    const id = (db.prepare(`SELECT id FROM costing_records WHERE source_ref = 'DEL-1'`).get() as { id: string }).id;
    expect((await call(ADMIN, 'DELETE', `/api/kpi/records/${id}`)).status).toBe(200);
    const csv = `${HEAD}\n${line('NEW-1', 'A10-NEW', dayOffset(0))}\n${line('DEL-1', 'A10-DEL', dayOffset(0), 4)}\n`;
    const r = await call(ADMIN, 'POST', '/api/kpi/import', { fileBase64: b64(csv) });
    expect(r.status).toBe(400);
    expect(r.json.errors).toEqual([expect.objectContaining({ row: 3, column: 'source_record_id' })]);
    expect(r.json.errors[0].message).toMatch(/deleted/);
    // the deleted record is untouched, the new row was not added
    const del = db.prepare(`SELECT should_cost, deleted_at FROM costing_records WHERE id = ?`).get(id) as { should_cost: number; deleted_at: string | null };
    expect(del.should_cost).toBe(5);
    expect(del.deleted_at).not.toBeNull();
    expect(db.prepare(`SELECT 1 FROM costing_records WHERE source_ref = 'NEW-1'`).get()).toBeUndefined();
  });

  it('a valid file still imports, and a re-import of a live record still updates it', async () => {
    const csv = `${HEAD}\n${line('LIVE-1', 'A10-LIVE', dayOffset(-3))}\n`;
    expect((await call(ADMIN, 'POST', '/api/kpi/import', { fileBase64: b64(csv) })).json).toEqual({ added: 1, updated: 0 });
    expect((await call(ADMIN, 'POST', '/api/kpi/import', { fileBase64: b64(csv) })).json).toEqual({ added: 0, updated: 1 });
    expect((await call(BOB, 'POST', '/api/kpi/import', { fileBase64: b64(csv) })).status).toBe(403);
  });
});
