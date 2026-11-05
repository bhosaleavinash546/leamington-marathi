/**
 * Rates flow R1 (Nov 2026), end to end through the REAL Express routes, in process (temp database):
 *
 *   download the template → change one machine, one labour, one material and one energy row → upload as admin →
 *   cost a real part through the server (POST /api/cad/compare-routes, whose reference row is `costMeasuredPart` on the
 *   server's resolved book) → the exact Δ re-added by hand from the trace → reset → the original cost to the penny.
 *
 * Plus: the upload reply and the admin status list what was changed / added / left built-in, the upload clears the
 * cell overrides and says so, the audit trail records every mutation with the fingerprint before and after, and the
 * /analyze and /reanalyze caches follow an upload, an override and a source switch (they replayed the old book).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import * as XLSX from 'xlsx';

const env = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/cv-rates-flow-r1-${process.pid}-${Date.now()}`;
  process.env.CV_DATA_DIR = dir;
  process.env.JWT_SECRET = 'rates-flow-r1-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';   // no model contributes — every figure is the rules and the book
  delete process.env.ANTHROPIC_API_KEY;
  return { dir };
});

import express from 'express';
import db from '../server/db.js';
import rateRouter from '../server/routes/rate-library.js';
import cadRouter from '../server/routes/cad.js';
import { signToken } from '../server/middleware/auth-middleware.js';
import { putGeometry, hashUpload, putBlank, BLANK_GONE } from '../server/utils/geometry-store.js';
import { createAnalysisCache } from '../server/utils/analysis-cache.js';
import { resolveActiveRateBook } from '../server/routes/rate-library.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { UK_ELECTRICITY_GBP_PER_KWH } from '../src/engine/uk-energy.js';
import { systemPromptFor } from '../server/routes/agent.js';
import { ANSWERS } from '../scripts/real-parts-baseline.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';
import type { RateLibrary, UniversalStackInput } from '../src/engine/types.js';

const BASELINE = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (part: string) => BASELINE.find(p => p.part === part)!.geometry;

let srv: Server;
let base = '';
const ADMIN = 'r1-admin', USER = 'r1-user';
const tok = (id: string) => signToken(id, `${id}@test`, true);

beforeAll(async () => {
  const now = new Date().toISOString();
  for (const [id, role] of [[ADMIN, 'admin'], [USER, 'user']] as const) {
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at)
                VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, id, role, now);
  }
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/rate-library', rateRouter);
  app.use('/api/cad', cadRouter);
  srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); rmSync(env.dir, { recursive: true, force: true }); });

const call = (method: string, path: string, who: string | null, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(who ? { Authorization: `Bearer ${tok(who)}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const json = async <T = Record<string, unknown>>(r: Response): Promise<T> => r.json() as Promise<T>;

async function uploadWorkbook(buf: Buffer, who = ADMIN): Promise<Response> {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(buf)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'company-rates.xlsx');
  return fetch(`${base}/api/rate-library/upload`, { method: 'POST', headers: { Authorization: `Bearer ${tok(who)}` }, body: fd });
}

/** Set column `col` of the row with id `id` on `sheet`. */
function setCell(wb: XLSX.WorkBook, sheet: string, id: string, col: string, value: number): void {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1 });
  const c = (rows[0] as string[]).indexOf(col);
  const r = rows.findIndex(x => (x as unknown[])[0] === id);
  if (c < 0 || r < 0) throw new Error(`no ${sheet}!${id}.${col}`);
  XLSX.utils.sheet_add_aoa(wb.Sheets[sheet], [[value]], { origin: { r, c } });
}

// ── The part, and the four rows changed ──────────────────────────────────────
// Casting_Braket (steel sand casting + machining): its stack carries a foundry machine, the furnace labour grade, a
// cast-steel grade and melt kWh — and none of the four is read by a rule BEFORE the stack (checked below), so the
// whole Δ is stack arithmetic a person can re-add.
const PART = 'Casting_Braket.stp';
const CURRENT = 'cast_and_machine';
const MACHINE = 'fettle-robot-cell', LABOUR = 'lab-uk-furnace', MATERIAL = 'mat-gs-c25';
const B = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const m0 = B.machines.find(m => m.id === MACHINE)!, l0 = B.labour.find(l => l.id === LABOUR)!;
const mat0 = B.materials.find(m => m.id === MATERIAL)!, e0 = B.energy.find(e => e.id === 'energy-uk')!;
const NEW = {
  dep: m0.buildup.annualDepreciation + 12_000,
  labour: Math.round((l0.fullyLoadedRatePerHr + 4.25) * 100) / 100,
  price: Math.round((mat0.pricePerKg + 0.37) * 100) / 100,
  elec: Math.round((e0.electricityPerKwh + 0.031) * 1000) / 1000,
  gas: Math.round((e0.gasPerKwh + 0.012) * 1000) / 1000,
};

/** The part costed headless on the server's resolved book — what compare-routes / option-costs do. */
async function costHeadless(book: RateLibrary) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = await costMeasuredPart(geoOf(PART), PART, { partNumber: PART, file: PART, annualVolume: 50_000 } as never,
    ANSWERS[PART].answers, 'UK', { annualVolume: 50_000, programmeYears: 5 } as never, book,
    { partNumber: PART, file: PART, status: 'error' } as never);
  expect(r.status).toBe('costed');
  return { total: r.trace.result.total as number, si: r.trace.stackInput as UniversalStackInput, result: r.trace.result };
}

const GEO_HASH = hashUpload(Buffer.from('r1-casting-bracket-geometry'));   // the store takes a SHA-256
async function costViaRoute(): Promise<number> {
  const r = await call('POST', '/api/cad/compare-routes', ADMIN, {
    geometryHash: GEO_HASH, current: CURRENT, decisionAnswers: ANSWERS[PART].answers, filename: PART,
    annualVolume: 50_000, programmeYears: 5, ladder: false, bands: false,
  });
  if (r.status !== 200) throw new Error(`compare-routes ${r.status}: ${await r.text()}`);
  const b = await json<{ rows: Array<{ route: string; alsoRoutes?: string[]; total: number | null }> }>(r);
  const ref = b.rows.find(x => x.route === CURRENT || x.alsoRoutes?.includes(CURRENT)) ?? b.rows[0];
  return ref.total!;
}

describe('template → edit → upload → cost a real part → Δ by hand → reset', () => {
  let T0 = 0, before: Awaited<ReturnType<typeof costHeadless>>;

  it('the template is admin-only, has an Instructions sheet and no country rows', async () => {
    expect((await call('GET', '/api/rate-library/template', USER)).status).toBe(403);
    const r = await call('GET', '/api/rate-library/template', ADMIN);
    expect(r.status).toBe(200);
    const wb = XLSX.read(Buffer.from(await r.arrayBuffer()), { type: 'buffer' });
    expect(wb.SheetNames[0]).toBe('Instructions');
    const labourIds = XLSX.utils.sheet_to_json<{ id: string }>(wb.Sheets.Labour).map(x => x.id);
    expect(labourIds).toContain(LABOUR);
    expect(labourIds.filter(id => /^lab-(?!uk-)/.test(id))).toEqual([]);
  });

  it('the built-in cost, through the route and headless, agree', async () => {
    putGeometry(GEO_HASH, geoOf(PART));
    before = await costHeadless(recomputeMachineRates(resolveActiveRateBook()));
    T0 = await costViaRoute();
    expect(T0).toBeCloseTo(before.total, 9);
  }, 120_000);

  it('upload: four changed rows, nothing added, the rest built-in; an earlier override is cleared and listed', async () => {
    // An override set BEFORE the upload (on a row the sheet changes) used to beat the uploaded value silently.
    expect((await call('POST', '/api/rate-library/overrides', ADMIN, { table: 'labour', id: LABOUR, field: 'fullyLoadedRatePerHr', value: 55 })).status).toBe(200);

    const tpl = Buffer.from(await (await call('GET', '/api/rate-library/template', ADMIN)).arrayBuffer());
    const wb = XLSX.read(tpl, { type: 'buffer' });
    setCell(wb, 'Machines', MACHINE, 'annualDepreciation', NEW.dep);
    setCell(wb, 'Labour', LABOUR, 'fullyLoadedRatePerHr', NEW.labour);
    setCell(wb, 'Materials', MATERIAL, 'pricePerKg', NEW.price);
    setCell(wb, 'Energy', 'energy-uk', 'electricityPerKwh', NEW.elec);
    setCell(wb, 'Energy', 'energy-uk', 'gasPerKwh', NEW.gas);
    const res = await uploadWorkbook(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
    const b = await json<{
      ok: boolean; fingerprint: string; label: string; changed: Array<{ table: string; id: string; fields: string[] }>;
      added: unknown[]; leftBuiltIn: Record<string, number>; overridesCleared: Array<{ id: string; value: number }>; overridesStillApplied: unknown[];
    }>(res);
    expect(res.status).toBe(200);
    expect(b.changed.map(c => `${c.table}:${c.id}:${c.fields.join('+')}`).sort()).toEqual([
      'energy:energy-uk:electricityPerKwh+gasPerKwh', `labour:${LABOUR}:fullyLoadedRatePerHr`,
      `machines:${MACHINE}:buildup.annualDepreciation`, `materials:${MATERIAL}:pricePerKg`,
    ]);
    expect(b.added).toEqual([]);
    expect(b.leftBuiltIn.machines).toBe(DEFAULT_RATE_LIBRARY.machines.length - 1);
    expect(b.leftBuiltIn.materials).toBe(DEFAULT_RATE_LIBRARY.materials.length - 1);
    expect(b.overridesCleared.map(o => [o.id, o.value])).toEqual([[LABOUR, 55]]);
    expect(b.overridesStillApplied).toEqual([]);
    expect(b.label).toBe('company book: 4 changed, 0 added');

    // The admin status report says the same, and the resolved book still has every built-in id (merge by id).
    const st = await json<{ fingerprint: string; companyRows: { changed: unknown[] }; overrides: unknown[] }>(await call('GET', '/api/rate-library/status', ADMIN));
    expect(st.fingerprint).toBe(b.fingerprint);
    expect(st.companyRows.changed).toHaveLength(4);
    expect(st.overrides).toEqual([]);
    const active = await json<{ library: RateLibrary; fingerprint: string }>(await call('GET', '/api/rate-library/active', USER));
    expect(active.fingerprint).toBe(b.fingerprint);
    expect(active.library.machines).toHaveLength(DEFAULT_RATE_LIBRARY.machines.length);
    // non-admins see the book's identity but not the admin report
    const stUser = await json<Record<string, unknown>>(await call('GET', '/api/rate-library/status', USER));
    expect(stUser.fingerprint).toBe(b.fingerprint);
    expect(stUser.companyRows).toBeUndefined();
  });

  it('the part re-costs through the route by exactly the hand re-add of the four changes; reset gives the original to the penny', async () => {
    const after = await costHeadless(recomputeMachineRates(resolveActiveRateBook()));
    const T1 = await costViaRoute();
    expect(T1).toBeCloseTo(after.total, 9);

    // Nothing but the rates moved: the same operations, weights, kWh, overhead and margin. One rule item moves with
    // the tariff and the trace shows it: the shot blast is priced at the blast machine's £/h before the stack, and that
    // £/h now carries its electricity at the new tariff — taken from the trace as its own line.
    const shape = (si: UniversalStackInput) => JSON.stringify({ ...si, rawMaterial: { ...si.rawMaterial, consumablesCostPerPart: 0, consumablesItems: [] } });
    expect(shape(after.si)).toBe(shape(before.si));
    const items = (si: UniversalStackInput) => new Map((si.rawMaterial.consumablesItems ?? []).map(i => [i.label, i.gbp]));
    const i0 = items(before.si), i1 = items(after.si);
    const movedItems = [...i1].filter(([k, v]) => v !== i0.get(k)).map(([k]) => k);
    expect(movedItems).toEqual(['shot blast']);
    const dRule = after.si.rawMaterial.consumablesCostPerPart! - before.si.rawMaterial.consumablesCostPerPart!;
    expect(dRule).toBeCloseTo(i1.get('shot blast')! - i0.get('shot blast')!, 12);
    const si = before.si;
    expect(si.learningCurve).toBeUndefined();
    expect(si.rawMaterial.boughtIn).toBeUndefined();

    // The hand re-add, from the trace's stack input.
    const gross = si.rawMaterial.netWeightKg / si.rawMaterial.materialUtilization;
    const dMaterial = (NEW.price - mat0.pricePerKg) * gross;
    // Every machine's £/h moves with the tariff too: its build-up electricity is kWh a year (energy £ ÷ £0.182) priced
    // at the resolved book's energy-uk (perturbation run, Nov 2026: the autoclave's machine electricity did not follow).
    const tariffStep = NEW.elec / UK_ELECTRICITY_GBP_PER_KWH - 1;
    const dMachineRate = (id: string) => {
      const b = B.machines.find(m => m.id === id)!.buildup;
      return ((id === MACHINE ? NEW.dep - b.annualDepreciation : 0) + b.energy * tariffStep) / (b.annualAvailableHours * b.machineUtilization);
    };
    const dProcess = si.operations.reduce((t, o) => t + dMachineRate(o.machineId) * o.cycleTimeHr / o.partsPerCycle / o.oee, 0);
    const dMachineElectricity = si.operations.reduce((t, o) => {
      const b = B.machines.find(m => m.id === o.machineId)!.buildup;
      return t + b.energy * tariffStep / (b.annualAvailableHours * b.machineUtilization) * o.cycleTimeHr / o.partsPerCycle / o.oee;
    }, 0);
    expect(dMachineElectricity).toBeGreaterThan(0);
    const dLabour = si.operations.filter(o => o.labourId === LABOUR)
      .reduce((t, o) => t + (NEW.labour - l0.fullyLoadedRatePerHr) * o.manning * o.labourTimeHr / o.partsPerCycle / o.labourEfficiency, 0);
    const kwh = si.rawMaterial.energyKwh!;
    const dEnergy = (NEW.elec - e0.electricityPerKwh) * (kwh.electricity ?? 0) + (NEW.gas - e0.gasPerKwh) * (kwh.gas ?? 0);
    expect(dProcess).toBeGreaterThan(0);
    expect(dLabour).toBeGreaterThan(0);
    expect(dEnergy).toBeGreaterThan(0);
    const dFactory = dMaterial + dProcess + dLabour + dEnergy + dRule;
    const dTotal = dFactory * (1 + si.overheadPct) * (1 + si.marginPct);
    expect(T1 - T0).toBeCloseTo(dTotal, 10);
    // bucket by bucket
    expect(after.result.breakdown.process - before.result.breakdown.process).toBeCloseTo(dProcess, 10);
    expect(after.result.breakdown.labour - before.result.breakdown.labour).toBeCloseTo(dLabour, 10);
    expect(after.result.breakdown.rawMaterial - before.result.breakdown.rawMaterial).toBeCloseTo(dMaterial + dEnergy + dRule, 10);

    const reset = await call('POST', '/api/rate-library/reset', ADMIN);
    expect(reset.status).toBe(200);
    const T2 = await costViaRoute();
    expect(Math.round(T2 * 100)).toBe(Math.round(T0 * 100));
    expect(T2).toBe(T0);
  }, 180_000);

  it('the audit trail records every mutation with the fingerprint before and after (admin only)', async () => {
    expect((await call('GET', '/api/rate-library/audit', USER)).status).toBe(403);
    const a = await json<{ entries: Array<{ action: string; by: string; fingerprintBefore: string; fingerprintAfter: string; rows: Record<string, unknown> }> }>(
      await call('GET', '/api/rate-library/audit', ADMIN));
    const actions = a.entries.map(e => e.action).reverse();
    expect(actions).toEqual(['override-set', 'upload', 'reset']);
    const up = a.entries.find(e => e.action === 'upload')!;
    expect(up.by).toBe(`${ADMIN}@test`);
    expect(up.fingerprintBefore).not.toBe(up.fingerprintAfter);
    expect(up.rows).toMatchObject({ changed: 4, added: 0, overridesCleared: 1 });
    const reset = a.entries.find(e => e.action === 'reset')!;
    expect(reset.fingerprintBefore).toBe(up.fingerprintAfter);
    expect(reset.fingerprintAfter).toBe(a.entries.find(e => e.action === 'override-set')!.fingerprintBefore);   // the built-in again
  });
});

describe('overrides are validated like the sheet', () => {
  it('refuses an unknown row, a misspelt field, utilisation 80, zero hours', async () => {
    const post = (b: unknown) => call('POST', '/api/rate-library/overrides', ADMIN, b);
    expect((await post({ table: 'machines', id: 'no-such-machine', field: 'buildup.maintenance', value: 1 })).status).toBe(400);
    expect((await post({ table: 'materials', id: MATERIAL, field: 'pricePerKgg', value: 1 })).status).toBe(400);
    const pct = await post({ table: 'machines', id: MACHINE, field: 'buildup.machineUtilization', value: 80 });
    expect(pct.status).toBe(400);
    expect((await json<{ error: string }>(pct)).error).toBe('value 80 looks like a percentage — use 0.80');
    expect((await post({ table: 'machines', id: MACHINE, field: 'buildup.annualAvailableHours', value: 0 })).status).toBe(400);
  });
});

describe('every cache keys on the resolved book', () => {
  // The machining manifold's CAM programming is priced at the engineer's £/h before the stack (machining.ts), so the
  // analysis itself carries the rate; its geometry is seeded so no kernel is needed.
  const MPART = 'MACH_Hydraulic_Manifold.stp';
  const bytes = Buffer.from('ISO-10303-21;\n/* rates flow R1 — the geometry is seeded by hash */\n');
  const engineerRate = (body: unknown) => {
    const m = /× £([\d.]+)\/h manufacturing engineer/.exec(JSON.stringify(body));
    return m ? Number(m[1]) : null;
  };
  const analyze = async () => {
    const fd = new FormData();
    fd.append('cadFile', new Blob([new Uint8Array(bytes)]), MPART);
    fd.append('mode', 'deterministic');
    fd.append('decisionAnswers', JSON.stringify(ANSWERS[MPART].answers));
    fd.append('annualVolume', '50000');
    const r = await fetch(`${base}/api/cad/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${tok(USER)}` }, body: fd });
    if (r.status !== 200) throw new Error(`analyze ${r.status}: ${await r.text()}`);
    return json<{ versions: { rateBook: string }; geometryHash?: string }>(r);
  };
  const reanalyze = async () => {
    const r = await call('POST', '/api/cad/reanalyze', USER, {
      geometryHash: hashUpload(bytes), mode: 'deterministic', decisionAnswers: ANSWERS[MPART].answers, filename: MPART, annualVolume: 50_000,
    });
    if (r.status !== 200) throw new Error(`reanalyze ${r.status}: ${await r.text()}`);
    return json<{ versions: { rateBook: string } }>(r);
  };
  const builtInEngineer = DEFAULT_RATE_LIBRARY.labour.find(l => l.id === 'lab-uk-engineer')!.fullyLoadedRatePerHr;

  it('/analyze follows a cell override (its key was version|lastModified, which an override left unchanged)', async () => {
    putGeometry(hashUpload(bytes), geoOf(MPART));
    const a0 = await analyze();
    expect(engineerRate(a0)).toBeCloseTo(builtInEngineer, 2);
    const again = await analyze();
    expect(again.versions.rateBook).toBe(a0.versions.rateBook);
    expect((await call('POST', '/api/rate-library/overrides', ADMIN, { table: 'labour', id: 'lab-uk-engineer', field: 'fullyLoadedRatePerHr', value: 77.77 })).status).toBe(200);
    const a1 = await analyze();
    expect(engineerRate(a1)).toBe(77.77);
    expect(a1.versions.rateBook).not.toBe(a0.versions.rateBook);
  }, 120_000);

  it('/reanalyze follows an override, an upload and a source switch (its key carried no book)', async () => {
    const r1 = await reanalyze();
    expect(engineerRate(r1)).toBe(77.77);
    // upload a company engineer rate — the upload clears the override, so the company row is what is costed
    const wb = XLSX.read(Buffer.from(await (await call('GET', '/api/rate-library/template', ADMIN)).arrayBuffer()), { type: 'buffer' });
    setCell(wb, 'Labour', 'lab-uk-engineer', 'fullyLoadedRatePerHr', 61.5);
    expect((await uploadWorkbook(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer)).status).toBe(200);
    expect(engineerRate(await reanalyze())).toBe(61.5);
    expect(engineerRate(await analyze())).toBe(61.5);
    // switch back to built-in
    expect((await call('PUT', '/api/rate-library/source', ADMIN, { source: 'builtin' })).status).toBe(200);
    expect(engineerRate(await reanalyze())).toBeCloseTo(builtInEngineer, 2);
    expect(engineerRate(await analyze())).toBeCloseTo(builtInEngineer, 2);
  }, 180_000);

  it('the agent system prompt follows the book (it was cached per region for the process lifetime)', async () => {
    const p0 = systemPromptFor('UK');
    expect((await call('PUT', '/api/rate-library/source', ADMIN, { source: 'company' })).status).toBe(200);
    const p1 = systemPromptFor('UK');
    expect(p1).not.toBe(p0);
    expect((await call('POST', '/api/rate-library/reset', ADMIN)).status).toBe(200);
    expect(systemPromptFor('UK')).toBe(p0);
  });

  it('/status gives an open tab the fingerprint to compare — it moves on a switch and matches /active', async () => {
    const s0 = await json<{ fingerprint: string }>(await call('GET', '/api/rate-library/status', USER));
    expect((await call('POST', '/api/rate-library/overrides', ADMIN, { table: 'materials', id: MATERIAL, field: 'pricePerKg', value: 9.99 })).status).toBe(200);
    const s1 = await json<{ fingerprint: string; label: string }>(await call('GET', '/api/rate-library/status', USER));
    expect(s1.fingerprint).not.toBe(s0.fingerprint);
    expect(s1.label).toBe('built-in + 1 cell override');
    expect((await json<{ fingerprint: string }>(await call('GET', '/api/rate-library/active', USER))).fingerprint).toBe(s1.fingerprint);
    await call('POST', '/api/rate-library/reset', ADMIN);
  });
});

describe('developed blanks survive a restart, and a missing one is never costed around', () => {
  it('a blank is stored in the database beside the geometry (a fresh cache over the same table reads it)', () => {
    const h = hashUpload(Buffer.from('r1-blank'));
    putBlank(h, { blankHash: h, areaMm2: 1234 });
    // A new process opens the same SQLite table: it was an in-memory Map, gone on restart.
    expect(createAnalysisCache('cad_blank_by_hash').get(h)).toEqual({ blankHash: h, areaMm2: 1234 });
  });

  it('compare-routes and /reanalyze refuse a blank the server no longer holds (they costed without it, silently)', async () => {
    const gone = hashUpload(Buffer.from('r1-blank-that-was-never-stored'));
    const cmp = await call('POST', '/api/cad/compare-routes', ADMIN, {
      geometryHash: GEO_HASH, blankHash: gone, current: CURRENT, decisionAnswers: ANSWERS[PART].answers, filename: PART, ladder: false, bands: false,
    });
    expect(cmp.status).toBe(409);
    expect((await json<{ error: string }>(cmp)).error).toBe(BLANK_GONE);
    const re = await call('POST', '/api/cad/reanalyze', ADMIN, {
      geometryHash: GEO_HASH, blankHash: gone, mode: 'deterministic', decisionAnswers: ANSWERS[PART].answers, filename: PART,
    });
    expect(re.status).toBe(409);
  });
});

describe('a bad workbook is refused or its effect is said', () => {
  const template = async () => XLSX.read(Buffer.from(await (await call('GET', '/api/rate-library/template', ADMIN)).arrayBuffer()), { type: 'buffer' });
  const send = async (wb: XLSX.WorkBook) => uploadWorkbook(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);

  it('a missing sheet is refused (a missing Machines sheet was accepted, then failed costing with HTTP 500)', async () => {
    const wb = await template();
    delete wb.Sheets.Machines; wb.SheetNames = wb.SheetNames.filter(n => n !== 'Machines');
    const r = await send(wb);
    expect(r.status).toBe(400);
    expect((await json<{ errors: string[] }>(r)).errors).toContain('Machines: sheet is missing — start from the template (GET /api/rate-library/template).');
  });

  it('a price in pence and utilisation 75 are refused; a duplicate id is refused', async () => {
    let wb = await template();
    setCell(wb, 'Materials', MATERIAL, 'pricePerKg', Math.round(mat0.pricePerKg * 100));
    let r = await send(wb);
    expect(r.status).toBe(400);
    expect((await json<{ errors: string[] }>(r)).errors[0]).toMatch(/pricePerKg: \d+ is 9\d\.\d× the built-in [\d.]+ — looks like a unit error/);
    wb = await template();
    setCell(wb, 'Machines', MACHINE, 'machineUtilization', 75);
    r = await send(wb);
    expect((await json<{ errors: string[] }>(r)).errors).toContain(`Machines row ${XLSX.utils.sheet_to_json<{ id: string }>(wb.Sheets.Machines).findIndex(x => x.id === MACHINE) + 2}, column machineUtilization: 75 looks like a percentage — use 0.75.`);
    wb = await template();
    XLSX.utils.sheet_add_aoa(wb.Sheets.Labour, [[LABOUR, 'UK', 'Furnace', 30, 'GBP']], { origin: -1 });
    r = await send(wb);
    expect(r.status).toBe(400);
    expect((await json<{ errors: string[] }>(r)).errors[0]).toMatch(new RegExp(`duplicate id '${LABOUR}'`));
  });

  it('a deleted row stays built-in and a typo\'d id is added — and the reply says both', async () => {
    const wb = await template();
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Materials, { header: 1 });
    const i = rows.findIndex(x => (x as unknown[])[0] === MATERIAL);
    (rows[i] as unknown[])[0] = `${MATERIAL}x`;                 // the id typo'd
    rows.splice(i + 1, 1);                                     // and the next row deleted
    wb.Sheets.Materials = XLSX.utils.aoa_to_sheet(rows);
    const r = await send(wb);
    const b = await json<{ added: Array<{ id: string }>; warnings: string[] }>(r);
    expect(r.status).toBe(200);
    expect(b.added.map(a => a.id)).toEqual([`${MATERIAL}x`]);
    expect(b.warnings.some(w => w.includes(`'${MATERIAL}x' is a NEW id, added beside the built-in '${MATERIAL}'`))).toBe(true);
    expect(b.warnings).toContain('Materials: 2 template rows are not in the sheet — they keep their built-in values.');
    // the built-in rows are still costed
    const active = await json<{ library: RateLibrary }>(await call('GET', '/api/rate-library/active', USER));
    expect(active.library.materials.find(m => m.id === MATERIAL)!.pricePerKg).toBe(mat0.pricePerKg);
    await call('POST', '/api/rate-library/reset', ADMIN);
  });
});
