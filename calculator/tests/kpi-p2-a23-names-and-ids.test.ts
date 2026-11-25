/**
 * Phase 2 · A-23 (P3, also F-27): an e-mail address is never shown as a display name ("Unnamed user"
 * instead), and internal user ids are not in the rows sent to ordinary users. Called over real HTTP.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.hoisted(() => {
  process.env.CV_DATA_DIR = `${process.env.TMPDIR || '/tmp'}/cv-kpi-p2-a23-${process.pid}-${Date.now()}`;
  process.env.JWT_SECRET = 'kpi-phase2-a23-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
});

import express from 'express';
import db from '../server/db.js';
import kpiRouter from '../server/routes/kpi.js';
import { signToken, requireAuth } from '../server/middleware/auth-middleware.js';

const NONAME = 'a23-noname', BLANK = 'a23-blank', EMAILNAME = 'a23-emailname', BOB = 'a23-bob', ADMIN = 'a23-admin';
const tok = (id: string) => signToken(id, `${id}@corp.test`, true);
let srv: Server; let base = '';
async function call(user: string, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await r.arrayBuffer());
  let json: any = null; try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: r.status, json, text };
}
const f = (o: object) => `f=${encodeURIComponent(JSON.stringify(o))}`;
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const save = (user: string, sid: string, pn: string) => call(user, 'POST', '/api/kpi/records', {
  scenario: { id: sid, name: pn, commodity: 'casting', region: 'UK', input: { deliveryTerms: 'DAP' }, result: { total: 7 } },
  details: { partNumber: pn, programme: 'A23', modelYear: 2028, powertrain: 'BEV', status: 'completed' },
});

beforeAll(async () => {
  const now = new Date().toISOString();
  for (const [id, role, name] of [[NONAME, 'user', ''], [BLANK, 'user', '   '], [EMAILNAME, 'user', 'someone@corp.test'], [BOB, 'user', 'Bob Baker'], [ADMIN, 'admin', 'Ada Admin']]) {
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@corp.test`, name, role, now);
  }
  const app = express(); app.use(express.json({ limit: '10mb' })); app.use('/api/kpi', requireAuth, kpiRouter);
  await new Promise<void>(r => { srv = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  for (const [u, pn] of [[NONAME, 'A23-NONAME'], [BLANK, 'A23-BLANK'], [EMAILNAME, 'A23-EMAILNAME'], [BOB, 'A23-BOB']]) expect((await save(u, `sc-${pn}`, pn)).status).toBe(201);
  const head = 'source_tool,source_record_id,owner,part_number,component_name,commodity,programme,model_year,powertrain,country,status,costing_date,should_cost,should_currency,should_terms';
  const imp = await call(ADMIN, 'POST', '/api/kpi/import', { fileBase64: b64(`${head}\nCSS System,I-1,R. Rao,A23-IMPNAME,P,Casting,A23,2028,BEV,GB,completed,2026-10-01,5,GBP,DAP\nCSS System,I-2,r.rao@supplier.test,A23-IMPMAIL,P,Casting,A23,2028,BEV,GB,completed,2026-10-01,5,GBP,DAP\n`) });
  expect(imp.status).toBe(200);
});
afterAll(() => { srv?.close(); });

const ALL = f({ datePreset: 'all', programme: ['A23'] });
const names = (rows: any[]) => Object.fromEntries(rows.map(r => [r.partNumber, r.ownerName]));

describe('A-23 display names', () => {
  it('no e-mail as a name: blank / whitespace / e-mail-shaped names show "Unnamed user"; real names stay', async () => {
    const r = await call(BOB, 'GET', `/api/kpi/records?scope=all&all=1&${ALL}`);
    expect(names(r.json.rows)).toEqual({
      'A23-NONAME': 'Unnamed user', 'A23-BLANK': 'Unnamed user', 'A23-EMAILNAME': 'Unnamed user', 'A23-BOB': 'Bob Baker',
      'A23-IMPNAME': 'R. Rao', 'A23-IMPMAIL': 'Unnamed user',
    });
  });
  it('no e-mail anywhere in the rows, the record view, the summary (Created-by filter) or the CSV', async () => {
    const rows = await call(BOB, 'GET', `/api/kpi/records?scope=all&all=1&${ALL}`);
    const id = rows.json.rows.find((x: any) => x.partNumber === 'A23-NONAME').id;
    for (const body of [rows.text, (await call(BOB, 'GET', `/api/kpi/records/${id}`)).text, (await call(BOB, 'GET', `/api/kpi/summary?${ALL}`)).text, (await call(BOB, 'GET', `/api/kpi/records.csv?scope=all&${ALL}`)).text]) {
      expect(body).not.toMatch(/@corp\.test|@supplier\.test/);
    }
  });
});

describe('A-23 internal ids', () => {
  it('rows and the record view sent to an ordinary user carry no ownerId', async () => {
    const rows = await call(BOB, 'GET', `/api/kpi/records?scope=all&all=1&${ALL}`);
    expect(rows.json.rows.length).toBe(6);
    for (const r of rows.json.rows) expect(r).not.toHaveProperty('ownerId');
    expect(rows.text).not.toMatch(/a23-noname|import:CSS System/);
    const own = rows.json.rows.find((x: any) => x.partNumber === 'A23-BOB');
    const d = await call(BOB, 'GET', `/api/kpi/records/${own.id}`);
    expect(d.json.record).not.toHaveProperty('ownerId');
    expect(d.json.canEdit).toBe(true);   // the owner's edit rights are worked out on the server
  });
  it('an admin still gets the owner id', async () => {
    const rows = await call(ADMIN, 'GET', `/api/kpi/records?scope=all&all=1&${ALL}`);
    expect(rows.json.rows.find((x: any) => x.partNumber === 'A23-NONAME').ownerId).toBe(NONAME);
  });
});
