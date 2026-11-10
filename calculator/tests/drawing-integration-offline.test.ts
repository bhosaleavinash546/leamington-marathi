/**
 * Test F of the brief, at the SERVER: the whole drawing path — upload, read, consolidate, review, answers, the
 * headless costing with them, the sheet picture — with every way out of the machine blocked, AIR_GAPPED=1 and no API
 * key. Any connection to anything but this test's own loopback server throws AND is counted; the count must be zero.
 *
 * The reader normally runs in a worker thread, which has its own copies of node's network modules — a block set here
 * would not see into it. So in this file the worker hop is replaced by a direct call of the SAME reader function in
 * this thread: every line of the reader, the PDF library, the image library and the OCR engine then runs under the
 * block. (tests/drawing-offline.test.ts proves the reader alone the same way.)
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import dgram from 'node:dgram';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const env = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/cv-drawing-offline-${process.pid}-${Date.now()}`;
  process.env.CV_DATA_DIR = dir;
  process.env.CV_DRAWING_FILE_DIR = `${dir}/drawings`;
  process.env.JWT_SECRET = 'drawing-offline-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
  process.env.CV_DRAWING_OCR_INLINE_MS = '120000';
  process.env.CAD_RATE_LIMIT_SCALE = '20';
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
  return { dir };
});

// The reader in THIS thread (see the header): the same function the worker runs.
vi.mock('../server/drawing/worker.js', async () => {
  const { readDrawing } = await vi.importActual<typeof import('../server/drawing/index.js')>('../server/drawing/index.js');
  return { readDrawingOffThread: (buf: Uint8Array, name: string, opts: Record<string, unknown> = {}) => { const { timeoutMs: _t, ...o } = opts; return readDrawing(buf, name, o); } };
});
vi.mock('../server/drawing/sheet-image.js', async () => {
  const real = await vi.importActual<typeof import('../server/drawing/sheet-image.js')>('../server/drawing/sheet-image.js');
  return { ...real, renderSheetOffThread: (buf: Uint8Array, sheet: number) => real.renderSheetImage(buf, sheet) };
});

import express from 'express';
import db from '../server/db.js';
import cadRouter from '../server/routes/cad.js';
import drawingRouter from '../server/routes/drawing.js';
import { signToken } from '../server/middleware/auth-middleware.js';
import { putGeometry } from '../server/utils/geometry-store.js';
import { isAirGapped } from '../server/utils/ai-client.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';

const ROOT = join(__dirname, '..');
const FIX = join(ROOT, 'tests', 'fixtures', 'drawings');
const BASELINE = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'real-parts-baseline.json'), 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
const HASH = 'c'.repeat(64);

const attempts: string[] = [];
const restore: Array<() => void> = [];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '::ffff:127.0.0.1']);
let srv: Server;
let base = '';
const tok = signToken('off-user', 'off-user@test', true);

/** The host a net / tls connect call names, whatever the call shape. */
function hostOf(args: unknown[]): string {
  const a = args[0];
  if (a && typeof a === 'object' && !Array.isArray(a)) return String((a as { host?: string; path?: string }).host ?? ((a as { path?: string }).path ? 'unix-socket' : 'localhost'));
  if (Array.isArray(a)) return hostOf(a);
  return typeof args[1] === 'string' ? args[1] : 'localhost';
}

beforeAll(async () => {
  db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES ('off-user', 'off-user@test', 'x', 'Off', 1, 'user', ?)`).run(new Date().toISOString());
  putGeometry(HASH, BASELINE.find(p => p.part === 'Casting_Braket.stp')!.geometry);
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/cad', cadRouter);
  app.use('/api/drawing', drawingRouter);
  srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;

  // Sockets: only this test's own loopback server may be reached.
  const sockConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guarded(this: net.Socket, ...args: unknown[]) {
    const host = hostOf(args);
    if (!LOOPBACK.has(host)) { attempts.push(`net.Socket.connect ${host}`); throw new Error(`network blocked in test: ${host}`); }
    return (sockConnect as (...a: unknown[]) => net.Socket).apply(this, args);
  } as typeof net.Socket.prototype.connect;
  restore.push(() => { net.Socket.prototype.connect = sockConnect; });
  const block = <T extends object, K extends keyof T>(obj: T, key: K, name: string, allow?: (args: unknown[]) => boolean): void => {
    const orig = obj[key] as unknown as (...a: unknown[]) => unknown;
    (obj as Record<K, unknown>)[key] = function guarded(this: unknown, ...args: unknown[]) {
      if (allow?.(args)) return orig.apply(this, args);
      attempts.push(`${name} ${String(typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0] ?? '')).slice(0, 80)}`);
      throw new Error(`network blocked in test: ${name}`);
    };
    restore.push(() => { (obj as Record<K, unknown>)[key] = orig; });
  };
  const local = (args: unknown[]) => LOOPBACK.has(hostOf(args)) || (typeof args[0] === 'string' && (args[0].startsWith(base) || LOOPBACK.has(args[0])));
  block(tls, 'connect', 'tls.connect');
  block(https, 'request', 'https.request'); block(https, 'get', 'https.get');
  block(http, 'request', 'http.request', local); block(http, 'get', 'http.get', local);
  block(dns, 'lookup', 'dns.lookup', local); block(dns, 'resolve', 'dns.resolve');
  block(dns.promises, 'lookup', 'dns.promises.lookup', local);
  block(dgram.Socket.prototype, 'send', 'dgram.send'); block(dgram.Socket.prototype, 'connect', 'dgram.connect');
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(base)) { attempts.push(`fetch ${url}`); return Promise.reject(new Error(`network blocked in test: fetch ${url}`)); }
    return realFetch(input, init);
  }) as typeof fetch;
  restore.push(() => { globalThis.fetch = realFetch; });
});
afterAll(() => { for (const r of restore.reverse()) r(); srv?.close(); rmSync(env.dir, { recursive: true, force: true }); });

type Json = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
const auth = { Authorization: `Bearer ${tok}` };
const post = async (path: string, body: unknown): Promise<{ status: number; body: Json }> => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as Json };
};
const upload = async (path: string, files: Record<string, [string, string]>, fields: Record<string, string> = {}): Promise<{ status: number; body: Json }> => {
  const fd = new FormData();
  for (const [field, [file, name]] of Object.entries(files)) fd.append(field, new Blob([new Uint8Array(readFileSync(file))]), name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(base + path, { method: 'POST', headers: auth, body: fd });
  return { status: r.status, body: await r.json() as Json };
};

describe('the server\'s drawing path with all outbound connections blocked, AIR_GAPPED=1, no key', () => {
  it('the block works, and the installation is air-gapped with no key', async () => {
    expect(isAirGapped()).toBe(true);
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(() => new net.Socket().connect(443, 'api.anthropic.com')).toThrow(/network blocked/);
    await expect(fetch('https://example.com/x')).rejects.toThrow(/network blocked/);
    expect(() => https.request('https://example.com')).toThrow(/network blocked/);
    expect(attempts).toHaveLength(3);
    attempts.length = 0;
  });

  it('drawing-only read of a vector PDF', async () => {
    const r = await upload('/api/drawing/read', { drawing: [join(FIX, 'real-casting-bracket.pdf'), 'bracket.pdf'] }, { commodity: 'cast_and_machine' });
    expect(r.status).toBe(200);
    expect(r.body.extraction.parameters.find((p: Json) => p.name === 'material.designation').value).toBe('A356-T6');
    expect(attempts).toEqual([]);
  });

  it('the combined flow: read → review replayed → answers → the rules, the comparison (the headless costing) and the sheet picture', async () => {
    const d = await upload('/api/drawing/read', { drawing: [join(FIX, 'real-casting-bracket.pdf'), 'bracket.pdf'] });
    const hash = d.body.drawing.hash as string;
    const body = { geometryHash: HASH, filename: 'Casting_Braket.stp', mode: 'deterministic', annualVolume: 50_000, programmeYears: 5,
      decisionAnswers: { 'commodity.route': 'cast_and_machine' }, drawingHash: hash };
    const ops: Json[] = [];
    let last = (await post('/api/cad/reanalyze', body)).body;
    for (let round = 0; round < 5; round++) {
      const ids = [...new Set<string>(last.drawingCosting.leanings.map((l: Json) => l.parameterId))].filter(id => !ops.some(o => o.id === id));
      if (!ids.length) break;
      ops.push(...ids.map(id => ({ op: 'confirm', id, by: 'off-user', at: '2026-11-10T10:00:00.000Z' })));
      last = (await post('/api/cad/reanalyze', { ...body, drawingReview: { ops } })).body;
    }
    expect(last.drawingCosting.answers).toMatchObject({ 'material.family': 'aluminium', 'material.grade': 'mat-lm25', 'service.finish': 'e_coat', 'casting.heatTreat': 'T6' });
    expect(last.mode).toBe('deterministic');
    const cmp = await post('/api/cad/compare-routes', { geometryHash: HASH, filename: 'Casting_Braket.stp', current: 'cast_and_machine', annualVolume: 50_000, programmeYears: 5,
      decisionAnswers: { 'commodity.route': 'cast_and_machine' }, ladder: false, bands: false, drawingHash: hash, drawingReview: { ops } });
    expect(cmp.status).toBe(200);
    expect(cmp.body.comparison.rows[0]).toMatchObject({ route: 'cast_and_machine', status: 'costed' });
    expect(cmp.body.comparison.rows[0].total).toBeGreaterThan(1);
    const img = await fetch(`${base}/api/drawing/${hash}/sheet/1`, { headers: auth });
    expect(img.status).toBe(200);
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(5000);
    expect(attempts).toEqual([]);
  }, 120_000);

  it('an AI mode is refused outright (air-gapped) — with or without a drawing — and no connection is tried', async () => {
    const r = await post('/api/cad/reanalyze', { geometryHash: HASH, filename: 'Casting_Braket.stp', mode: 'ai', decisionAnswers: {} });
    expect(r.status).toBe(503);
    expect(attempts).toEqual([]);
  });

  it('the upload route with a mesh and a drawing — and a scanned drawing read by OCR — opens no connection', async () => {
    const dir = join(ROOT, 'tests', 'fixtures', 'stl-dfm');
    const stl = existsSync(dir) ? readdirSync(dir).find(f => f === 'IM_ECU_Cover.stl') ?? readdirSync(dir).find(f => f.endsWith('.stl')) : undefined;
    if (!stl) return;
    const vector = await upload('/api/cad/analyze', { cadFile: [join(dir, stl), stl], drawingPdf: [join(FIX, 'gen-moulding.pdf'), 'connector.pdf'] }, { mode: 'deterministic', commodity: 'injection_moulding' });
    expect(vector.status).toBe(200);
    expect(vector.body.drawing.status).toBe('ready');
    expect(vector.body.engineeringData.parameters.length).toBeGreaterThan(20);
    // The scan: decoded and OCRed in this thread, under the block.
    const scan = await upload('/api/drawing/read', { drawing: [join(FIX, 'gen-moulding.scan200.jpg'), 'scan.jpg'] }, { commodity: 'injection_moulding' });
    expect(scan.status).toBe(200);
    expect(scan.body.drawing).toMatchObject({ status: 'ready', fileKind: 'image' });
    expect(scan.body.extraction.parameters.find((p: Json) => p.name === 'material.designation')).toMatchObject({ value: 'PA66-GF30', method: 'ocr', status: 'needs-validation' });
    expect(attempts).toEqual([]);
  }, 240_000);
});
