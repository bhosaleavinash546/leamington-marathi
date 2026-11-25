/**
 * Phase 2 · A-04 (P1): the server refuses a should-cost total that does not re-add from its
 * breakdown. Tolerance = number of numeric breakdown lines × 0.005 (the most that rounding each
 * line to two decimals can add up to; 8 lines → 0.04 — confirmed at Stop 1). A record with no
 * breakdown (an import, or a save without one) is not refused: it is marked "total only, not
 * re-added", in the record panel and in the data-quality count. Called over real HTTP.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.hoisted(() => {
  process.env.CV_DATA_DIR = `${process.env.TMPDIR || '/tmp'}/cv-kpi-p2-a04-${process.pid}-${Date.now()}`;
  process.env.JWT_SECRET = 'kpi-phase2-a04-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
});

import express from 'express';
import db from '../server/db.js';
import kpiRouter from '../server/routes/kpi.js';
import { signToken, requireAuth } from '../server/middleware/auth-middleware.js';
import { insertRecord, fxContext } from '../server/data/kpi-store.js';
import { reAddCheck, shouldCostBasis, buildDashboard, DEFAULT_FILTERS, type KpiRecord } from '../src/engine/kpi-dashboard.js';
import { dataQualityHtml, shouldBasisHtml } from '../src/ui/kpi-dashboard/kpi-builders.js';

const BOB = 'a04-bob', ADMIN = 'a04-admin';
const tok = (id: string) => signToken(id, `${id}@test`, true);
let srv: Server; let base = '';

async function call(user: string, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json };
}
const f = (o: object) => `f=${encodeURIComponent(JSON.stringify(o))}`;
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const EIGHT = { rawMaterial: 4, process: 3, labour: 2, tooling: 1.5, packaging: 0.3, logistics: 0.4, overhead: 1, margin: 0.8 }; // Σ 13.00
const body = (sid: string, pn: string, result: Record<string, unknown>) => ({
  scenario: { id: sid, name: pn, commodity: 'casting', region: 'UK', input: { deliveryTerms: 'DAP' }, result },
  details: { partNumber: pn, programme: 'A04', modelYear: 2027, powertrain: 'BEV', status: 'completed', currentCost: 14, currentCcy: 'GBP', currentTerms: 'DAP' },
});
const rowOf = async (pn: string) => (await call(BOB, 'GET', `/api/kpi/records?scope=all&all=1&search=${pn}&${f({ datePreset: 'all' })}`)).json.rows.find((r: any) => r.partNumber === pn);
const count = () => (db.prepare('SELECT COUNT(*) AS n FROM costing_records').get() as { n: number }).n;

beforeAll(async () => {
  const now = new Date().toISOString();
  for (const [id, role, name] of [[BOB, 'user', 'Bob Baker'], [ADMIN, 'admin', 'Ada Admin']]) {
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, now);
  }
  const app = express(); app.use(express.json()); app.use('/api/kpi', requireAuth, kpiRouter);
  await new Promise<void>(r => { srv = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); });

describe('A-04 the re-add rule (pure)', () => {
  it('tolerance is lines × 0.005; only numeric lines count', () => {
    expect(reAddCheck(13.04, EIGHT)).toMatchObject({ lines: 8, tolerance: 0.04, ok: true });
    expect(reAddCheck(13.04, EIGHT)!.sum).toBeCloseTo(13, 12);
    expect(reAddCheck(12.96, EIGHT)?.ok).toBe(true);
    expect(reAddCheck(13.05, EIGHT)?.ok).toBe(false);
    expect(reAddCheck(0.01, { rawMaterial: 999, process: 999 })).toMatchObject({ lines: 2, sum: 1998, tolerance: 0.01, ok: false });
    expect(reAddCheck(5, { rawMaterial: 5, note: 'x', nested: { a: 1 } })).toMatchObject({ lines: 1, ok: true });
    expect(reAddCheck(5, undefined)).toBeNull();
    expect(reAddCheck(5, {})).toBeNull();
    expect(reAddCheck(5, [5])).toBeNull();
  });
  it('basis: re-added / does not re-add / total only', () => {
    expect(shouldCostBasis(13, EIGHT)).toBe('re-added');
    expect(shouldCostBasis(0.01, { rawMaterial: 999, process: 999 })).toBe('not-re-added');
    expect(shouldCostBasis(13, null)).toBe('total-only');
    expect(shouldCostBasis(null, EIGHT)).toBeNull();
  });
});

describe('A-04 save', () => {
  it('refuses a total that does not re-add from its breakdown (P15) and stores nothing', async () => {
    const n = count();
    const r = await call(BOB, 'POST', '/api/kpi/records', body('a04-fake', 'A04-FAKE', { total: 0.01, breakdown: { rawMaterial: 999, process: 999 } }));
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/re-add/);
    expect(count()).toBe(n);
    expect(db.prepare('SELECT 1 FROM scenarios WHERE id = ?').get('a04-fake')).toBeUndefined();
  });

  it('accepts a total within rounding (8 lines → £0.04) and refuses one beyond it', async () => {
    expect((await call(BOB, 'POST', '/api/kpi/records', body('a04-r', 'A04-ROUND', { total: 13.04, breakdown: EIGHT }))).status).toBe(201);
    expect((await call(BOB, 'POST', '/api/kpi/records', body('a04-b', 'A04-BEYOND', { total: 13.05, breakdown: EIGHT }))).status).toBe(400);
    expect((await rowOf('A04-ROUND')).shouldBasis).toBe('re-added');
  });

  it('a save with no breakdown is accepted and marked "total only"', async () => {
    expect((await call(BOB, 'POST', '/api/kpi/records', body('a04-n', 'A04-NOBD', { total: 13 }))).status).toBe(201);
    expect((await rowOf('A04-NOBD')).shouldBasis).toBe('total-only');
  });

  it('an imported record (total, no breakdown) is marked "total only"; a record saved before the rule is "does not re-add"', async () => {
    const head = 'source_tool,source_record_id,owner,part_number,component_name,commodity,programme,model_year,powertrain,country,status,costing_date,should_cost,should_currency,should_terms,current_cost,current_currency,current_terms';
    const imp = await call(ADMIN, 'POST', '/api/kpi/import', { fileBase64: b64(`${head}\r\nCSS System,A04-1,R. Rao,A04-IMP,Imported,Casting,A04,2027,BEV,GB,completed,2026-10-01,5,GBP,DAP,6,GBP,DAP\r\n`) });
    expect(imp.status).toBe(200);
    expect((await rowOf('A04-IMP')).shouldBasis).toBe('total-only');
    // A record saved before this rule (Phase 1 P15): total £0.01 against a £1,998 breakdown.
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO scenarios (id, name, description, data, created_at, created_by) VALUES ('a04-old', 'old', '', ?, ?, ?)`)
      .run(JSON.stringify({ input: {}, result: { total: 0.01, breakdown: { rawMaterial: 999, process: 999 } }, region: 'UK', commodity: 'casting' }), now, BOB);
    insertRecord(db, { sourceTool: 'CostVision', sourceRef: 'a04-old', ownerId: BOB, ownerLabel: '', partNumber: 'A04-OLD', componentName: 'Old', commodity: 'Casting', programme: 'A04', modelYear: 2027, powertrain: 'BEV', country: 'UK', status: 'completed', costingDate: now.slice(0, 10), shouldCost: 0.01, shouldCcy: 'GBP', shouldTerms: 'DAP', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP', currentSource: null, annualVolume: null, volumeValidated: false, savingStatus: null, savingPerPiece: null, savingCcy: null, isTest: false, notes: '' }, fxContext(db));
    // a scenario row with malformed JSON must not break the listing
    db.prepare(`INSERT INTO scenarios (id, name, description, data, created_at, created_by) VALUES ('a04-bad', 'bad', '', '{not json', ?, ?)`).run(now, BOB);
    insertRecord(db, { sourceTool: 'CostVision', sourceRef: 'a04-bad', ownerId: BOB, ownerLabel: '', partNumber: 'A04-BADJSON', componentName: 'Bad', commodity: 'Casting', programme: 'A04', modelYear: 2027, powertrain: 'BEV', country: 'UK', status: 'completed', costingDate: now.slice(0, 10), shouldCost: 3, shouldCcy: 'GBP', shouldTerms: 'DAP', currentCost: 4, currentCcy: 'GBP', currentTerms: 'DAP', currentSource: null, annualVolume: null, volumeValidated: false, savingStatus: null, savingPerPiece: null, savingCcy: null, isTest: false, notes: '' }, fxContext(db));
    await call(BOB, 'POST', '/api/kpi/records', body('a04-bump', 'A04-BUMP', { total: 13, breakdown: EIGHT })); // a write drops the cache
    expect((await rowOf('A04-OLD')).shouldBasis).toBe('not-re-added');
    expect((await rowOf('A04-BADJSON')).shouldBasis).toBe('total-only');
    const s = await call(BOB, 'GET', `/api/kpi/summary?${f({ datePreset: 'all', programme: ['A04'] })}`);
    // current records with a should-cost: ROUND, BUMP re-add; NOBD, IMP, BADJSON total only; OLD does not re-add
    expect(s.json.dataQuality.shouldBasis).toEqual({ reAdded: 2, notReAdded: 1, totalOnly: 3 });
    // the record view carries the basis for the panel
    const id = (await rowOf('A04-OLD')).id;
    expect((await call(BOB, 'GET', `/api/kpi/records/${id}`)).json.record.shouldBasis).toBe('not-re-added');
  });
});

describe('A-04 screen', () => {
  it('the data-quality table and the record panel show the basis', () => {
    const r = (id: string, shouldBasis: KpiRecord['shouldBasis'], pn: string): KpiRecord => ({
      id, sourceTool: 'CostVision', sourceRef: id, ownerId: 'u', ownerName: 'U', partNumber: pn, componentName: 'P', commodity: 'Casting', programme: 'L460', modelYear: 2027,
      powertrain: 'BEV', country: 'UK', status: 'completed', costingDate: '2026-10-01', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
      shouldCost: 10, shouldCcy: 'GBP', shouldTerms: 'DAP', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP', currentSource: null, costUnit: 'piece',
      annualVolume: null, volumeValidated: false, savingStatus: null, savingPerPiece: null, savingCcy: null, fx: {}, gbpShould: 10, gbpCurrent: 12, gbpSaving: null,
      isTest: false, deleted: false, notes: '', shouldBasis,
    });
    const s = buildDashboard([r('a', 're-added', 'P1'), r('b', 'total-only', 'P2'), r('c', 'not-re-added', 'P3')], { ...DEFAULT_FILTERS, datePreset: 'all' },
      { today: '2026-11-11', nowIso: '2026-11-11T00:00:00Z', fxPolicy: 'monthly', approvedRates: 0, referenceLabel: 'ref' });
    expect(s.dataQuality.shouldBasis).toEqual({ reAdded: 1, notReAdded: 1, totalOnly: 1 });
    const html = dataQualityHtml(s, false);
    expect(html).toMatch(/Should-cost total only, not re-added<\/th><td class="num">1</);
    expect(html).toMatch(/Should-cost does not re-add<\/th><td class="num">1</);
    expect(shouldBasisHtml('total-only')).toContain('Total only, not re-added');
    expect(shouldBasisHtml('not-re-added')).toContain('Does not re-add from its breakdown');
    expect(shouldBasisHtml('re-added')).toContain('Re-adds from its breakdown');
    expect(shouldBasisHtml(null)).toBe('');
  });
});
