/**
 * Rates flow R2 (Nov 2026), end to end through the REAL Express routes, in process (temp database):
 *
 *   the template (country columns, Overhead, Services & toolroom, no FX) → a company sheet with a UK overhead row, a
 *   China overhead row, a China machine row, a UK toolroom row and a China toolroom row → upload → cost one real part
 *   through POST /api/cad/compare-routes in the UK, China and India → each Δ re-added by hand from the built-in costing's
 *   stack → export round trip → an old workbook with an FX sheet is accepted with a warning → reset.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import * as XLSX from 'xlsx';

const env = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/cv-rates-flow-r2-${process.pid}-${Date.now()}`;
  process.env.CV_DATA_DIR = dir;
  process.env.JWT_SECRET = 'rates-flow-r2-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
  delete process.env.ANTHROPIC_API_KEY;
  return { dir };
});

import express from 'express';
import db from '../server/db.js';
import rateRouter from '../server/routes/rate-library.js';
import cadRouter from '../server/routes/cad.js';
import { signToken } from '../server/middleware/auth-middleware.js';
import { putGeometry, hashUpload } from '../server/utils/geometry-store.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary, type ManufacturingRegion } from '../src/engine/regional-rates.js';
import { ANSWERS } from '../scripts/real-parts-baseline.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const BASELINE = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const PART = 'Casting_Braket.stp', CURRENT = 'cast_and_machine';
const geo = BASELINE.find(p => p.part === PART)!.geometry;

let srv: Server;
let base = '';
const ADMIN = 'r2-admin';
const tok = (id: string) => signToken(id, `${id}@test`, true);

beforeAll(async () => {
  db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at)
              VALUES (?, ?, 'x', ?, 1, 'admin', ?)`).run(ADMIN, `${ADMIN}@test`, ADMIN, new Date().toISOString());
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/rate-library', rateRouter);
  app.use('/api/cad', cadRouter);
  srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); rmSync(env.dir, { recursive: true, force: true }); });

const call = (method: string, path: string, body?: unknown) => fetch(base + path, {
  method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${tok(ADMIN)}` },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
async function upload(buf: Buffer): Promise<Response> {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(buf)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'company.xlsx');
  return fetch(`${base}/api/rate-library/upload`, { method: 'POST', headers: { Authorization: `Bearer ${tok(ADMIN)}` }, body: fd });
}
/** Append a row by header names. */
function addRow(ws: XLSX.WorkSheet, row: Record<string, unknown>): void {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  const head = aoa[0] as string[];
  XLSX.utils.sheet_add_aoa(ws, [head.map(h => (h in row ? row[h] : ''))], { origin: -1 });
}
function setCell(ws: XLSX.WorkSheet, id: string, col: string, value: number): void {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const c = (rows[0] as string[]).indexOf(col), r = rows.findIndex(x => (x as unknown[])[0] === id);
  if (c < 0 || r < 0) throw new Error(`no ${id}.${col}`);
  XLSX.utils.sheet_add_aoa(ws, [[value]], { origin: { r, c } });
}

const GEO_HASH = hashUpload(Buffer.from('r2-casting-bracket-geometry'));
async function viaRoute(region: ManufacturingRegion): Promise<number> {
  const r = await call('POST', '/api/cad/compare-routes', { geometryHash: GEO_HASH, current: CURRENT, decisionAnswers: ANSWERS[PART].answers,
    filename: PART, annualVolume: 50_000, programmeYears: 5, region, ladder: false, bands: false });
  if (r.status !== 200) throw new Error(`compare-routes ${r.status}: ${await r.text()}`);
  const b = await r.json() as { region: string; rows: Array<{ route: string; alsoRoutes?: string[]; total: number | null }> };
  expect(b.region).toBe(region);
  return (b.rows.find(x => x.route === CURRENT || x.alsoRoutes?.includes(CURRENT)) ?? b.rows[0]).total!;
}
async function builtInStack(region: ManufacturingRegion) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = await costMeasuredPart(geo, PART, { partNumber: PART, file: PART, annualVolume: 50_000 } as never, ANSWERS[PART].answers, region,
    { annualVolume: 50_000, programmeYears: 5 } as never, recomputeMachineRates(DEFAULT_RATE_LIBRARY), { partNumber: PART, file: PART, status: 'error' } as never);
  return { total: r.trace.result.total as number, si: r.trace.stackInput as UniversalStackInput, bd: r.trace.result.breakdown as Record<string, number> };
}

const MACHINE = 'fettle-robot-cell';
const cnBook = buildRegionalLibrary(recomputeMachineRates(DEFAULT_RATE_LIBRARY), 'CN');
const cnM = cnBook.machines.find(m => m.id === MACHINE)!;

describe('R2 through the routes: rows apply to their country, Overhead and Services reach the cost', () => {
  const T0: Record<string, number> = {};
  const S0: Record<string, Awaited<ReturnType<typeof builtInStack>>> = {};

  it('the template: no FX sheet; Overhead and Services & toolroom carry a country column', async () => {
    const wb = XLSX.read(Buffer.from(await (await call('GET', '/api/rate-library/template')).arrayBuffer()), { type: 'buffer' });
    expect(wb.SheetNames).not.toContain('FX');
    for (const sh of ['Materials', 'Machines', 'Overhead', 'Services & toolroom']) {
      expect((XLSX.utils.sheet_to_json(wb.Sheets[sh], { header: 1 })[0] as string[]), sh).toContain('country');
    }
  });

  it('built-in: the route equals headless in UK, CN and IN', async () => {
    putGeometry(GEO_HASH, geo);
    for (const cc of ['UK', 'CN', 'IN'] as ManufacturingRegion[]) {
      S0[cc] = await builtInStack(cc);
      T0[cc] = await viaRoute(cc);
      expect(T0[cc], cc).toBeCloseTo(S0[cc].total, 9);
    }
  }, 180_000);

  it('upload: a UK and a CN overhead row, a CN machine row, a CN service row — each moves only its country, by hand', async () => {
    const wb = XLSX.read(Buffer.from(await (await call('GET', '/api/rate-library/template')).arrayBuffer()), { type: 'buffer' });
    setCell(wb.Sheets.Overhead, 'oh-default', 'overheadPct', 0.14);
    setCell(wb.Sheets.Overhead, 'oh-default', 'marginPct', 0.09);
    addRow(wb.Sheets.Overhead, { id: 'oh-default', country: 'CN', commodityType: '*', overheadPct: 0.1, marginPct: 0.05, sourceNote: 'CN audit' });
    addRow(wb.Sheets.Machines, { id: MACHINE, country: 'CN', machineClass: cnM.machineClass, region: 'China',
      annualDepreciation: cnM.buildup.annualDepreciation + 4_000, maintenance: cnM.buildup.maintenance, energy: cnM.buildup.energy,
      floorSpace: cnM.buildup.floorSpace, indirectSupport: cnM.buildup.indirectSupport, financeCost: cnM.buildup.financeCost,
      annualAvailableHours: cnM.buildup.annualAvailableHours, machineUtilization: cnM.buildup.machineUtilization, currency: 'GBP', sourceNote: 'CN plant audit' });
    // a CN service row this part does not price with (the superalloy HIP rate): stored, China's only, moves nothing here
    addRow(wb.Sheets['Services & toolroom'], { id: 'hip.superalloy', country: 'CN', value: 4.1, currency: 'GBP' });
    const r = await upload(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
    expect(r.status).toBe(200);
    const b = await r.json() as { changed: Array<{ table: string; id: string; country?: string }>; added: Array<{ table: string; id: string; country?: string }> };
    expect(b.changed).toEqual(expect.arrayContaining([
      { table: 'overheadDefaults', id: 'oh-default', fields: ['overheadPct', 'marginPct'] },
      { table: 'machines', id: MACHINE, country: 'CN', fields: ['buildup.annualDepreciation'] },
    ]));
    expect(b.added).toEqual(expect.arrayContaining([{ table: 'overheadDefaults', id: 'oh-default', country: 'CN' }, { table: 'services', id: 'hip.superalloy', country: 'CN' }]));

    // UK: only overhead and margin moved — the built-in stack at 14 % / 9 %, re-added
    const uk = S0.UK.bd, ukBase = uk.rawMaterial + uk.process + uk.labour + uk.tooling;
    expect(await viaRoute('UK')).toBeCloseTo((ukBase + uk.packaging + uk.logistics + 0.14 * ukBase) * 1.09, 6);
    // CN: the machine's Δ£/h × its hours, at CN's 10 % / 5 %
    const cn = S0.CN.bd, si = S0.CN.si;
    const hrs = si.operations.filter(o => o.machineId === MACHINE).reduce((t, o) => t + o.cycleTimeHr / o.partsPerCycle / o.oee, 0);
    expect(hrs).toBeGreaterThan(0);
    const dProc = 4_000 / (cnM.buildup.annualAvailableHours * cnM.buildup.machineUtilization) * hrs;
    const cnBase = cn.rawMaterial + cn.process + dProc + cn.labour + cn.tooling;
    expect(await viaRoute('CN')).toBeCloseTo((cnBase + cn.packaging + cn.logistics + 0.1 * cnBase) * 1.05, 6);
    // IN: nothing it costs with was named
    expect(await viaRoute('IN')).toBe(T0.IN);
  }, 180_000);

  it('a CN toolroom row moves China\'s tool build-up only — the UK and India costs do not move', async () => {
    const before = { UK: await viaRoute('UK'), CN: await viaRoute('CN'), IN: await viaRoute('IN') };
    const wb = XLSX.read(Buffer.from(await (await call('GET', '/api/rate-library/export')).arrayBuffer()), { type: 'buffer' });
    addRow(wb.Sheets['Services & toolroom'], { id: 'toolroom.cnc', country: 'CN', value: 18.5, currency: 'GBP' });
    expect((await upload(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer)).status).toBe(200);
    expect(await viaRoute('UK')).toBe(before.UK);
    expect(await viaRoute('IN')).toBe(before.IN);
    const cn = await viaRoute('CN');
    // China's toolroom CNC £/h was the built-in 52.37 × its toolroom factor; at 18.5 the pattern costs more to build
    expect(cn).toBeGreaterThan(before.CN);
  }, 180_000);

  it('the export carries the country rows back; a re-upload of it changes nothing', async () => {
    const exp = Buffer.from(await (await call('GET', '/api/rate-library/export')).arrayBuffer());
    const wb = XLSX.read(exp, { type: 'buffer' });
    expect(wb.SheetNames).not.toContain('FX');
    const machines = XLSX.utils.sheet_to_json<{ id: string; country: string }>(wb.Sheets.Machines);
    expect(machines.filter(m => m.country === 'CN').map(m => m.id)).toEqual([MACHINE]);
    const before = await viaRoute('CN');
    const r = await upload(exp);
    expect(r.status).toBe(200);
    expect(await viaRoute('CN')).toBe(before);
  }, 120_000);

  it('an old workbook with an FX sheet is accepted; the sheet is ignored and the reply says so', async () => {
    const wb = XLSX.read(Buffer.from(await (await call('GET', '/api/rate-library/template')).arrayBuffer()), { type: 'buffer' });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['id', 'fromCurrency', 'toCurrency', 'rate'], ['fx-gbp-usd', 'GBP', 'USD', 2.5]]), 'FX');
    const r = await upload(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
    expect(r.status).toBe(200);
    const b = await r.json() as { warnings: string[] };
    expect(b.warnings.some(w => /FX: sheet ignored/.test(w))).toBe(true);
    const act = await (await call('GET', '/api/rate-library/active')).json() as { library: { fx: Array<{ id: string; rate: number }> } };
    expect(act.library.fx.find(f => f.id === 'fx-gbp-usd')!.rate).toBe(DEFAULT_RATE_LIBRARY.fx.find(f => f.id === 'fx-gbp-usd')!.rate);
    // nothing changed: the costs are the built-in's again
    for (const cc of ['UK', 'CN'] as ManufacturingRegion[]) expect(await viaRoute(cc), cc).toBeCloseTo(T0[cc], 9);
  }, 120_000);

  it('reset: the built-in to the penny', async () => {
    expect((await call('POST', '/api/rate-library/reset')).status).toBe(200);
    for (const cc of ['UK', 'CN', 'IN'] as ManufacturingRegion[]) expect(await viaRoute(cc), cc).toBeCloseTo(T0[cc], 9);
  }, 120_000);
});
