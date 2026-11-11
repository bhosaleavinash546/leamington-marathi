/**
 * KPI dashboard API over real HTTP with three users (two engineers, one admin):
 * shared visibility, permissions, frozen FX + controlled recalculation, the approved FX
 * table, the CSS / CPSC II import, CSV, validation, and the supplier-quote ownership fix.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/cv-kpi-${process.pid}-${Date.now()}`;
  process.env.CV_DATA_DIR = dir;
  process.env.JWT_SECRET = 'kpi-dashboard-test-secret-0123456789abcdef012345';
  process.env.AIR_GAPPED = '1';
});

import express from 'express';
import db from '../server/db.js';
import kpiRouter from '../server/routes/kpi.js';
import quotesRouter from '../server/routes/quotes.js';
import { signToken, requireAuth } from '../server/middleware/auth-middleware.js';
import { builtInFxReference } from '../server/data/kpi-store.js';

const ALICE = 'kpi-alice', BOB = 'kpi-bob', ADMIN = 'kpi-admin';
const tok = (id: string) => signToken(id, `${id}@test`, true);
const MONTH = new Date().toISOString().slice(0, 7);
let srv: Server; let base = '';

async function call(user: string, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, {
    method, headers: { Authorization: `Bearer ${tok(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await r.arrayBuffer());
  let json: any = null; try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: r.status, json, text };
}
const f = (filters: object) => `f=${encodeURIComponent(JSON.stringify(filters))}`;
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

function saveBody(id: string, over: Record<string, unknown> = {}, total = 10) {
  return {
    scenario: { id, name: 'Knuckle', commodity: 'casting', region: 'UK', input: { partName: 'Front knuckle', deliveryTerms: 'DAP' }, result: { total, partName: 'Front knuckle' } },
    details: { partNumber: 'LR-100', programme: 'L460', modelYear: 2027, powertrain: 'BEV', status: 'completed', currentCost: 12, currentCcy: 'EUR', currentTerms: 'DAP', currentSource: 'quote', annualVolume: 50000, ...over },
  };
}

beforeAll(async () => {
  const now = new Date().toISOString();
  for (const [id, role, name] of [[ALICE, 'user', 'Alice Able'], [BOB, 'user', 'Bob Baker'], [ADMIN, 'admin', 'Ada Admin']]) {
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`)
      .run(id, `${id}@test`, name, role, now);
  }
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/kpi', requireAuth, kpiRouter);
  app.use('/api/quotes', requireAuth, quotesRouter);
  await new Promise<void>(r => { srv = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); });

describe('KPI dashboard API', () => {
  let aliceRec = '';
  const eurRef = builtInFxReference().rates.EUR;

  it('requires sign-in', async () => {
    const r = await fetch(base + '/api/kpi/summary');
    expect(r.status).toBe(401);
  });

  it('saves a CostVision costing with a frozen FX snapshot and never overwrites the original', async () => {
    const r = await call(ALICE, 'POST', '/api/kpi/records', saveBody('sc-alice-1'));
    expect(r.status).toBe(201);
    aliceRec = r.json.record.id;
    expect(r.json.record).toMatchObject({ shouldCost: 10, shouldCcy: 'GBP', currentCost: 12, currentCcy: 'EUR', commodity: 'Casting', country: 'UK', role: 'current', eligible: true });
    // No approved table yet → the built-in reference, labelled not approved. Never 1:1.
    expect(r.json.record.fx.current).toMatchObject({ currency: 'EUR', approved: false });
    expect(r.json.record.gbpCurrent).toBeCloseTo(12 * eurRef, 12);
    expect(r.json.record.gapGbp).toBeCloseTo(12 * eurRef - 10, 12);
  });

  it('validates the save', async () => {
    expect((await call(ALICE, 'POST', '/api/kpi/records', saveBody('sc-x', { partNumber: '' }))).status).toBe(400);
    expect((await call(ALICE, 'POST', '/api/kpi/records', saveBody('sc-x', { currentCcy: null }))).json.error).toMatch(/currency/);
    expect((await call(ALICE, 'POST', '/api/kpi/records', saveBody('sc-x', { currentCcy: 'ABC' }))).status).toBe(400);
    expect((await call(ALICE, 'POST', '/api/kpi/records', saveBody('sc-x', {}, 0))).status).toBe(400);
    expect((await call(ALICE, 'POST', '/api/kpi/records', saveBody('sc-x', { status: 'approved' }))).status).toBe(400);
  });

  it("another user sees it (shared), but cannot take over its costing id", async () => {
    const s = await call(BOB, 'GET', '/api/kpi/summary?' + f({ datePreset: 'all' }));
    expect(s.status).toBe(200);
    expect(s.json.operational.currentRecords).toBe(1);
    expect(s.json.financial.eligible).toBe(1);
    expect(s.json.options.createdBy.map((o: any) => o.value)).toContain('Alice Able');
    const steal = await call(BOB, 'POST', '/api/kpi/records', saveBody('sc-alice-1'));
    expect(steal.status).toBe(409);
    const d = await call(BOB, 'GET', `/api/kpi/records/${aliceRec}`);
    expect(d.status).toBe(200);
    expect(d.json.canEdit).toBe(false);
    expect(d.json.costing).toMatchObject({ region: 'UK', commodity: 'casting' });
  });

  it('a second revision by the same owner supersedes; by another owner is a duplicate', async () => {
    await call(ALICE, 'POST', '/api/kpi/records', saveBody('sc-alice-2', {}, 9));
    await call(BOB, 'POST', '/api/kpi/records', saveBody('sc-bob-1', {}, 9.5));
    const s = await call(ADMIN, 'GET', '/api/kpi/summary?' + f({ datePreset: 'all' }));
    expect(s.json.operational.totalRecords).toBe(3);
    expect(s.json.operational.currentRecords).toBe(1);
    expect(s.json.financial.eligible).toBe(1);
    expect(s.json.dataQuality.supersededRevisions + s.json.dataQuality.duplicateCandidates).toBe(2);
  });

  it('enforces who may edit what', async () => {
    expect((await call(BOB, 'PATCH', `/api/kpi/records/${aliceRec}`, { notes: 'x' })).status).toBe(403);
    expect((await call(BOB, 'DELETE', `/api/kpi/records/${aliceRec}`)).status).toBe(403);
    expect((await call(ALICE, 'PATCH', `/api/kpi/records/${aliceRec}`, { status: 'approved' })).status).toBe(403);
    expect((await call(ALICE, 'PATCH', `/api/kpi/records/${aliceRec}`, { volumeValidated: true })).status).toBe(403);
    expect((await call(ALICE, 'PATCH', `/api/kpi/records/${aliceRec}`, { shouldCost: 1 })).status).toBe(400); // strict schema
    const ok = await call(ADMIN, 'PATCH', `/api/kpi/records/${aliceRec}`, { status: 'approved', volumeValidated: true });
    expect(ok.status).toBe(200);
    expect(ok.json.record.status).toBe('approved');
    // the owner changing the money sends an approved costing back for review
    const back = await call(ALICE, 'PATCH', `/api/kpi/records/${aliceRec}`, { currentCost: 13 });
    expect(back.json.record.status).toBe('completed');
    expect(back.json.record.gbpCurrent).toBeCloseTo(13 * eurRef, 12);
  });

  it('excluded records are admin-only', async () => {
    expect((await call(BOB, 'GET', '/api/kpi/records?scope=excluded&' + f({ datePreset: 'all' }))).status).toBe(403);
    expect((await call(ADMIN, 'GET', '/api/kpi/records?scope=excluded&' + f({ datePreset: 'all' }))).status).toBe(200);
  });

  it('refuses a bad FX file and names the row and column', async () => {
    const bad = `currency,period,gbp_per_unit,source\r\nJPY,${MONTH},180,Treasury\r\nABC,${MONTH},1,x\r\nEUR,2026-13,0.85,x\r\n`;
    expect((await call(BOB, 'POST', '/api/kpi/fx/rates', { fileBase64: b64(bad) })).status).toBe(403);
    const r = await call(ADMIN, 'POST', '/api/kpi/fx/rates', { fileBase64: b64(bad) });
    expect(r.status).toBe(400);
    expect(r.json.errors.map((e: any) => `${e.row}:${e.column}`)).toEqual(['2:gbp_per_unit', '3:currency', '4:period']);
    expect(r.json.errors[0].message).toMatch(/inverted/);
  });

  it('loading approved rates does NOT silently change saved GBP; a recalculation previews then applies with history', async () => {
    const ok = `currency,period,units_per_gbp,source\r\nEUR,${MONTH},1.25,JLR Treasury approved ${MONTH}\r\n`;
    const up = await call(ADMIN, 'POST', '/api/kpi/fx/rates', { fileBase64: b64(ok) });
    expect(up.status).toBe(200);
    expect(up.json.notes.join(' ')).toMatch(/units per £1/);
    const before = await call(ADMIN, 'GET', `/api/kpi/records/${aliceRec}`);
    expect(before.json.record.gbpCurrent).toBeCloseTo(13 * eurRef, 12);       // unchanged

    const preview = await call(ADMIN, 'POST', '/api/kpi/fx/recalculate', { apply: false });
    expect(preview.json.applied).toBe(false);
    expect(preview.json.changed).toBeGreaterThanOrEqual(1);
    expect((await call(ADMIN, 'GET', `/api/kpi/records/${aliceRec}`)).json.record.gbpCurrent).toBeCloseTo(13 * eurRef, 12);
    expect((await call(BOB, 'POST', '/api/kpi/fx/recalculate', { apply: true })).status).toBe(403);

    const applied = await call(ADMIN, 'POST', '/api/kpi/fx/recalculate', { apply: true });
    expect(applied.json.applied).toBe(true);
    const after = await call(ADMIN, 'GET', `/api/kpi/records/${aliceRec}`);
    expect(after.json.record.gbpCurrent).toBeCloseTo(13 * 0.8, 12);           // 1 ÷ 1.25
    expect(after.json.record.fx.current).toMatchObject({ approved: true, method: 'monthly', effectiveDate: MONTH });
    expect(after.json.record.currentCost).toBe(13);                             // original untouched
    expect(after.json.record.currentCcy).toBe('EUR');
    expect(after.json.fxHistory).toHaveLength(1);
    expect(after.json.fxHistory[0].gbpCurrent).toBeCloseTo(13 * eurRef, 12);
    // GBP should-cost has no FX to change
    expect(after.json.record.gbpShould).toBe(10);
  });

  it('imports CSS System / CPSC II records; a re-import updates instead of duplicating', async () => {
    const head = 'source_tool,source_record_id,owner,part_number,component_name,commodity,programme,model_year,powertrain,country,status,costing_date,should_cost,should_currency,should_terms,current_cost,current_currency,current_terms';
    const csv = `${head}\r\nCSS System,CSS-1,R. Rao,LR-900,Bracket,Machining,L663,2026,Petrol,IN,approved,${MONTH}-02,800,INR,EXW,1000,INR,EXW\r\nCPSC II,CP-7,J. Lee,LR-901,Seal,Rubber,EMA,2028,BEV,CN,completed,${MONTH}-03,3,USD,DAP,,,\r\n`;
    const r = await call(ADMIN, 'POST', '/api/kpi/import', { fileBase64: b64(csv) });
    expect(r.json).toEqual({ added: 2, updated: 0 });
    const again = await call(ADMIN, 'POST', '/api/kpi/import', { fileBase64: b64(csv) });
    expect(again.json).toEqual({ added: 0, updated: 2 });
    const s = await call(BOB, 'GET', '/api/kpi/summary?' + f({ datePreset: 'all', tool: ['CSS System'] }));
    expect(s.json.operational.totalRecords).toBe(1);
    expect(s.json.options.tool.map((o: any) => o.value).sort()).toEqual(['CPSC II', 'CSS System', 'CostVision']);
    // INR has no approved rate → reference, flagged
    expect(s.json.dataQuality.unapprovedFx).toBe(1);
    // original-currency mode keeps INR on its own
    expect(s.json.currencyTotals.find((t: any) => t.currency === 'INR')).toMatchObject({ sumCurrent: 1000, sumShould: 800, sumGap: 200 });

    const bad = `${head}\r\nCostVision,X,a,P,n,,,,,,draft,2026-01-01,,,,,,\r\nCSS System,CSS-2,a,P,n,,,,,,maybe,01/02/2026,5,,,,,\r\n`;
    const e = await call(ADMIN, 'POST', '/api/kpi/import', { fileBase64: b64(bad) });
    expect(e.status).toBe(400);
    const cells = e.json.errors.map((x: any) => `${x.row}:${x.column}`);
    expect(cells).toEqual(expect.arrayContaining(['2:source_tool', '3:status', '3:costing_date', '3:should_currency']));
    expect((await call(BOB, 'POST', '/api/kpi/import', { fileBase64: b64(csv) })).status).toBe(403);
  });

  it('records page, CSV and drill-down follow the filters', async () => {
    const page = await call(BOB, 'GET', '/api/kpi/records?scope=all&sort=gapGbp&dir=desc&pageSize=5&' + f({ datePreset: 'all' }));
    expect(page.json.total).toBe(5);
    const csv = await call(BOB, 'GET', '/api/kpi/records.csv?scope=current&' + f({ datePreset: 'all', programme: ['L460'] }));
    expect(csv.text.split('\r\n')[0]).toMatch(/^﻿Costing ID,Original record ID,Component/);
    expect(csv.text.trim().split('\r\n')).toHaveLength(2);      // header + Alice's current record
    const drill = await call(BOB, 'GET', '/api/kpi/drill?drill_commodity=Casting&' + f({ datePreset: 'all' }));
    expect(drill.json.level).toBe('programme');
    expect(drill.json.groups[0].key).toBe('L460');
  });

  it('a deleted record leaves every KPI and is listed for admins only', async () => {
    const r = await call(ALICE, 'POST', '/api/kpi/records', saveBody('sc-alice-del', { partNumber: 'LR-DEL' }, 5));
    const id = r.json.record.id;
    expect((await call(ALICE, 'DELETE', `/api/kpi/records/${id}`)).status).toBe(200);
    const s = await call(BOB, 'GET', '/api/kpi/summary?' + f({ datePreset: 'all' }));
    expect(s.json.dataQuality.excludedBy.deleted).toBe(1);
    expect((await call(BOB, 'GET', `/api/kpi/records/${id}`)).status).toBe(404);
    const ex = await call(ADMIN, 'GET', '/api/kpi/records?scope=excluded&' + f({ datePreset: 'all' }));
    expect(ex.json.rows.map((x: any) => x.id)).toContain(id);
  });
});

describe('supplier quotes belong to the user who entered them', () => {
  it('lists, edits and deletes only your own', async () => {
    const q = await call(ALICE, 'POST', '/api/quotes', { scenario_id: 'sc-alice-1', supplier_name: 'Foundry A', unit_price: 11 });
    expect(q.status).toBe(201);
    expect((await call(ALICE, 'GET', '/api/quotes')).json).toHaveLength(1);
    expect((await call(BOB, 'GET', '/api/quotes')).json).toHaveLength(0);
    expect((await call(BOB, 'GET', '/api/quotes?scenario_id=sc-alice-1')).json).toHaveLength(0);
    expect((await call(BOB, 'PATCH', `/api/quotes/${q.json.id}`, { unit_price: 1 })).status).toBe(404);
    expect((await call(BOB, 'DELETE', `/api/quotes/${q.json.id}`)).status).toBe(404);
    expect((await call(ADMIN, 'GET', '/api/quotes')).json.length).toBeGreaterThanOrEqual(1);
    expect((await call(ALICE, 'DELETE', `/api/quotes/${q.json.id}`)).status).toBe(200);
  });
});
