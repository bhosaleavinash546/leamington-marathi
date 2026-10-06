/**
 * 360 review (Oct 2026): the fixes, pinned. Security on a live server (the OTP leak, routes that read
 * any file or let any account change shared rates); the engine (band on bought-in, conformal coverage,
 * NaN, casting melt loss, duplicated tornado levers); PCB (hedged part numbers, order quantity, escaped
 * model text). docs/review-360-2026-10.md.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack, validateStackInput } from '../src/engine/core.js';
import { computeCostUncertainty } from '../src/engine/uncertainty.js';
import { computeConformalBand, applyConformalBand, computeCalibrationHierarchical, type CalibrationRecord } from '../src/engine/calibration.js';
import { runSensitivity } from '../src/engine/sensitivity.js';
import { computeCastingDrivers } from '../src/engine/modules/casting.js';
import { catalogueEntry } from '../server/utils/pcb-price-catalogue.js';
import { parseOrderQty } from '../server/routes/pcb.js';
import { buildSanityWarningsBanner, buildASILBadge } from '../src/ui/pcb/panels.js';

const LIB = DEFAULT_RATE_LIBRARY;
const ROOT = join(__dirname, '..');

describe('engine', () => {
  const base = {
    partName: 'x', overheadPct: 0.12, marginPct: 0.08, packagingPerPart: 0, logisticsPerPart: 0,
    rawMaterial: { directCost: 2, materialId: 'mat-virtual', boughtIn: { cost: 100, handlingPct: 0.03 } },
    operations: [{ operationName: 'Weld', machineId: LIB.machines[0].id, labourId: LIB.labour[0].id, cycleTimeHr: 0.1, manning: 1, labourTimeHr: 0.1, oee: 0.85, labourEfficiency: 0.9, partsPerCycle: 1 }],
    tooling: { totalToolingCost: 0, amortizationVolume: 1 },
  } as never;

  it('the Monte-Carlo band of a mostly bought-in part contains its headline (no overhead / margin on the bought-in content)', () => {
    const r = computeUniversalStack(base, LIB);
    const u = computeCostUncertainty(r, base, { trials: 2000 });
    expect(u.p10).toBeLessThanOrEqual(r.total);
    expect(u.p90).toBeGreaterThanOrEqual(r.total);
    expect(Math.abs(u.p50 - r.total) / r.total).toBeLessThan(0.03);
  });

  it('NaN or Infinity in an optional adder is an input error, not a NaN total', () => {
    const bad = (rm: Record<string, unknown>) => validateStackInput({ ...(base as object), rawMaterial: { ...(base as { rawMaterial: object }).rawMaterial, ...rm } } as never, LIB).errors.map(e => e.field);
    expect(bad({ consumablesCostPerPart: NaN })).toContain('rawMaterial.consumablesCostPerPart');
    expect(bad({ energyKwh: { electricity: Infinity } })).toContain('rawMaterial.energyKwh.electricity');
    expect(bad({ boughtIn: { cost: -1, handlingPct: 0 } })).toContain('rawMaterial.boughtIn.cost');
  });

  it('the conformal band contains every logged quote it claims to cover, and is never negative', () => {
    const recs: CalibrationRecord[] = [[100, 150], [100, 80], [100, 120], [100, 95], [100, 300], [100, 105]].map(([e, a], i) =>
      ({ id: String(i), savedAt: i, commodity: 'machining', shouldCost: e, actualCost: a, currency: 'GBP' }));
    const band = computeConformalBand(recs, { commodity: 'machining' }, 0.9);
    const bias = computeCalibrationHierarchical(recs, { commodity: 'machining' }).biasFactor;
    const { low, high } = applyConformalBand(100 * bias, band);
    expect(low).toBeGreaterThanOrEqual(0);
    const inside = recs.filter(r => r.actualCost >= low - 0.01 && r.actualCost <= high + 0.01).length;
    expect(inside / recs.length).toBeGreaterThanOrEqual(band.empiricalCoverage / 100 - 1e-9);
  });

  it('a casting buys good part + melt loss — the lost metal is not credited back as scrap', () => {
    const d = computeCastingDrivers({ subtype: 'sand', materialId: 'mat-gs-c25', partWeightKg: 2.5, castingYield: 0.65, rejectRate: 0.03,
      labourId: 'lab-uk-foundry', oee: 0.8, manning: 1, labourEfficiency: 0.92, amortizationVolume: 50_000,
      sand: { mouldLineId: 'sand-cast-line', cycleTimeHr: 0.01, patternCost: 4000, patternLife: 8000, coreCostPerPart: 0 },
      melt: { energyKwhPerKg: 0 } } as never);
    expect((d.rawMaterial as { lossIsNotScrap?: boolean }).lossIsNotScrap).toBe(true);
    const r = computeUniversalStack({ partName: 'x', ...d, overheadPct: 0, marginPct: 0, packagingPerPart: 0, logisticsPerPart: 0 } as never, LIB);
    const mat = LIB.materials.find(m => m.id === 'mat-gs-c25')!;
    const gross = d.rawMaterial.netWeightKg! / d.rawMaterial.materialUtilization!;
    expect(r.breakdown.rawMaterial).toBeCloseTo(gross * mat.pricePerKg + (d.rawMaterial.consumablesCostPerPart ?? 0), 4);
  });

  it('a rate shared by several operations is ONE tornado lever, not one per operation', () => {
    const op = { machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.05, manning: 1, labourTimeHr: 0.05, oee: 0.85, labourEfficiency: 0.9, partsPerCycle: 1 };
    const input = { partName: 'x', overheadPct: 0.1, marginPct: 0.08, packagingPerPart: 0, logisticsPerPart: 0,
      rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.6 },
      operations: ['Op 10', 'Op 20', 'Op 30'].map(n => ({ ...op, operationName: n })), tooling: { totalToolingCost: 0, amortizationVolume: 1 } } as never;
    const names = runSensitivity(input, LIB).drivers.map(d => d.driver);
    expect(names.filter(n => /Labour Rate/.test(n))).toHaveLength(1);
    expect(names.filter(n => /Machine Rate/.test(n))).toHaveLength(1);
    expect(names.find(n => /Labour Rate/.test(n))).toMatch(/shared by 3 ops/);
    expect(names.filter(n => /utilisation/i.test(n))).toHaveLength(1);
  });
});

describe('PCB', () => {
  it('a hedged part number is not a confirmed catalogue part', () => {
    expect(catalogueEntry('assumed TLF35584')).toBeNull();
    expect(catalogueEntry('TLF35584 or similar')).toBeNull();
    expect(catalogueEntry('TJA1044?')).toBeNull();
  });

  it('order quantity: "1e7" is ten million, 0 / negative / junk is the default, never above 10 M', () => {
    expect(parseOrderQty('1e7')).toBe(10_000_000);
    expect(parseOrderQty('2500')).toBe(2500);
    expect(parseOrderQty(0)).toBe(100);
    expect(parseOrderQty('-5')).toBe(100);
    expect(parseOrderQty('abc')).toBe(100);
    expect(parseOrderQty(5e9)).toBe(10_000_000);
  });

  it('the PCB panels take the screen\'s escaped copy and do not escape it again ("$&" included)', () => {
    // buildPCBImagePanel feeds every builder escapedForDisplay(result): the text is ALREADY escaped.
    const banner = buildSanityWarningsBanner({ _sanityWarnings: [{ code: 'X', severity: 'warn', message: '&lt;img src=x&gt; R&amp;D' }] } as never);
    expect(banner).toContain('&lt;img src=x&gt; R&amp;D');
    expect(banner).not.toContain('&amp;lt;');
    const badge = buildASILBadge({ _asilLevel: 'ASIL-B', _asilSafetyFunctions: ['$&amp; &lt;b&gt;'], _asilRationale: 'R&amp;D' } as never);
    expect(badge).toContain('Safety functions: $&amp; &lt;b&gt;');
    expect(badge).not.toContain('&amp;amp;');
  });
});

describe('security (live server)', () => {
  let srv: ChildProcess | null = null, dir = '', port = 0;
  const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
  const api = (path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${port}${path}`, init);
  const json = (body: unknown, headers: Record<string, string> = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  let token = '';

  beforeAll(async () => {
    port = await freePort();
    dir = mkdtempSync(join(tmpdir(), 'cv-360-'));
    const env = { ...process.env, CV_DATA_DIR: dir, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production', JWT_SECRET: 'review-360-' + 'x'.repeat(40),
      SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', CV_SHOW_DEV_OTP: '', ANTHROPIC_API_KEY: '', ADMIN_EMAILS: '',
      // Rate limits key on the client IP: each proxied call below is its own client (the limiter is 3 / 10 min).
      CV_TRUST_PROXY: '1' };
    srv = spawn(join(ROOT, 'node_modules/.bin/tsx'), [join(ROOT, 'server/index.ts')], { cwd: ROOT, env, stdio: 'ignore', detached: true });
    for (let i = 0; i < 240; i++) { try { if ((await api('/api/health')).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 250)); }
    // A same-machine sign-up gets the dev code (the laptop install), and so a session.
    const s = await (await api('/api/auth/signup', json({ email: 'Local@Test.dev', password: 'Aa1!aaaaaa', fullName: 'Local' }))).json() as { devOtp?: string };
    expect(s.devOtp).toMatch(/^\d{6}$/);
    const v = await (await api('/api/auth/verify-otp', json({ email: 'local@test.dev', otp: s.devOtp, purpose: 'signup' }))).json() as { token?: string };
    token = v.token ?? '';
    expect(token).not.toBe('');
  }, 90_000);

  afterAll(async () => {
    if (srv?.pid) { const exited = new Promise(r => srv!.once('exit', r)); try { process.kill(-srv.pid, 'SIGKILL'); } catch { /* gone */ } await exited; }
    rmSync(dir, { recursive: true, force: true });
  });

  it('the OTP is never returned to a request that came through a proxy (a public deployment)', async () => {
    const r = await (await api('/api/auth/signup', json({ email: 'remote@test.dev', password: 'Aa1!aaaaaa', fullName: 'R' }, { 'X-Forwarded-For': '203.0.113.1' }))).json() as { devOtp?: string };
    expect(r.devOtp).toBeUndefined();
    const reset = await (await api('/api/auth/resend-otp', json({ email: 'local@test.dev', purpose: 'reset' }, { 'X-Forwarded-For': '203.0.113.2' }))).json() as { devOtp?: string };
    expect(reset.devOtp).toBeUndefined();
  });

  it('an OTP purpose other than signup / reset is refused', async () => {
    expect((await api('/api/auth/resend-otp', json({ email: 'local@test.dev', purpose: 'reset_token' }, { 'X-Forwarded-For': '203.0.113.3' }))).status).toBe(400);
  });

  it('mixed-case sign-up of an existing address is a clean 409, not a crash', async () => {
    expect((await api('/api/auth/signup', json({ email: 'LOCAL@test.dev', password: 'Aa1!aaaaaa', fullName: 'L' }, { 'X-Forwarded-For': '203.0.113.4' }))).status).toBe(409);
  });

  it('CAD tessellation needs a session', async () => {
    const fd = new FormData(); fd.append('cadFile', new Blob(['solid x\nendsolid x']), 'x.stl');
    expect((await api('/api/cad/tessellate', { method: 'POST', body: fd })).status).toBe(401);
  });

  it('a DFM job cannot read an arbitrary file', async () => {
    const r = await api('/api/dfm/jobs', json({ filePath: '/etc/passwd', commodity: 'machining' }, { Authorization: `Bearer ${token}` }));
    expect(r.status).toBe(400);
  });

  it('a non-admin cannot replace the shared rate library or override material prices', async () => {
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    expect((await api('/api/sync/library', { method: 'PUT', headers: auth, body: JSON.stringify({ library: { x: 1 } }) })).status).toBe(403);
    expect((await api('/api/prices/override', { method: 'PATCH', headers: auth, body: JSON.stringify({ materialId: 'mat-dc01', pricePerKg: 0.01 }) })).status).toBe(403);
    expect((await api('/api/prices/refresh', { method: 'POST', headers: auth })).status).toBe(403);
  });
});
