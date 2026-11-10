/**
 * A drawing belongs to the users who uploaded it, its files and readings are swept on a timer, and the upload limit is
 * the same on both routes (offline drawing review, Nov 2026 — review F05, F06, F07, D07).
 *
 *  - F06: the record is shared by hash (one read per file) but keeps the SET of uploaders. Another signed-in user is told
 *    a drawing does not exist — the same 404 words as an unknown one — on GET /jobs/:id, GET /:hash/sheet/:n and when a
 *    costing names it by hash (`drawingFromBody`, used by /reanalyze, compare-routes and option-costs). An admin may.
 *  - F05: the review a costing replays carries the signed-in user, never the name the client wrote.
 *  - F07: files and sheet pictures older than a day, readings and uploaders older than a week, are swept on an hourly
 *    unref'd timer as well as at start-up.
 *  - D07: a file of exactly 30 MB is accepted by POST /api/drawing/read (busboy fires at size == limit).
 *
 * The reader is a stand-in (as in drawing-service-queue.test.ts); the sheet picture is drawn for real.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const env = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/cv-drawing-scope-${process.pid}-${Date.now()}`;
  process.env.CV_DATA_DIR = dir;
  process.env.CV_DRAWING_FILE_DIR = `${dir}/drawings`;
  process.env.JWT_SECRET = 'drawing-scope-test-secret-0123456789abcdef0123';
  process.env.AIR_GAPPED = '1';
  process.env.CV_DRAWING_READ_WAIT_MS = '0';
  process.env.CAD_RATE_LIMIT_SCALE = '100';
  return { dir };
});

const reader = vi.hoisted(() => ({ needsOcr: false }));
vi.mock('../server/drawing/worker.js', async () => {
  const { READER_VERSION } = await vi.importActual<typeof import('../server/drawing/index.js')>('../server/drawing/index.js');
  return {
    readDrawingOffThread: async (_buf: Uint8Array, filename: string, opts: { ocr?: string } = {}) => {
      const ocr = opts.ocr !== 'off';
      await new Promise(r => setTimeout(r, ocr ? 20 : 2));
      const scanned = reader.needsOcr && !ocr;
      return {
        schemaVersion: 1, readerVersion: READER_VERSION, sourceFile: filename, fileKind: 'pdf',
        sheets: [{ sheet: 1, widthPt: 842, heightPt: 595, content: scanned ? 'scanned' : 'vector-text', textItemCount: 1, rotationDeg: 0 }],
        parameters: scanned ? [] : [{ id: 'drawing:material.designation:1', name: 'material.designation', value: 'A356-T6', source: 'drawing', method: 'pdf-text', kind: 'extracted', status: 'extracted' }],
        text: [], warnings: [],
      };
    },
  };
});

import express from 'express';
import db from '../server/db.js';
import drawingRouter from '../server/routes/drawing.js';
import { signToken } from '../server/middleware/auth-middleware.js';
import {
  drawingHash, startDrawingSweeper, stopDrawingSweeper, sweepDrawingStore, getDrawing, canSeeDrawing, drawingUploaders,
  MAX_DRAWING_BYTES, SWEEP_INTERVAL_MS, FILE_TTL_MS, EXTRACTION_TTL_MS,
} from '../server/services/drawing-service.js';
import { drawingFromBody } from '../server/services/drawing-context.js';

const FIX = join(__dirname, 'fixtures', 'drawings');
const ALICE = 'scope-alice', BOB = 'scope-bob', ADMIN = 'scope-admin';
const tok = (id: string) => signToken(id, `${id}@test`, true);
let srv: Server;
let base = '';

beforeAll(async () => {
  const now = new Date().toISOString();
  for (const [id, role] of [[ALICE, 'user'], [BOB, 'user'], [ADMIN, 'admin']]) {
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at)
                VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, id, role, now);
  }
  const app = express();
  app.use(express.json());
  app.use('/api/drawing', drawingRouter);
  srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); stopDrawingSweeper(); rmSync(env.dir, { recursive: true, force: true }); });

async function upload(bytes: Uint8Array, who: string, name = 'bracket.pdf'): Promise<{ status: number; body: Record<string, any> }> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const fd = new FormData();
  fd.append('drawing', new Blob([new Uint8Array(bytes)]), name);
  fd.append('wait', '0');
  const r = await fetch(`${base}/api/drawing/read`, { method: 'POST', headers: { Authorization: `Bearer ${tok(who)}` }, body: fd });
  return { status: r.status, body: await r.json() as Record<string, any> };   // eslint-disable-line @typescript-eslint/no-explicit-any
}
const get = async (path: string, who: string) => fetch(base + path, { headers: { Authorization: `Bearer ${tok(who)}` } });

/** A real drawing, made distinct per call (the service keys on the bytes). */
let n = 0;
const drawing = (): Uint8Array => new Uint8Array(Buffer.concat([readFileSync(join(FIX, 'real-casting-bracket.pdf')), Buffer.from(`\n% copy ${++n} ${Date.now()}\n`)]));

describe('F06 — a drawing is shown only to the users who uploaded it (and an admin)', () => {
  it('the sheet picture: the uploader gets it; another user gets the same 404 as an unknown drawing; an admin gets it', async () => {
    const bytes = drawing();
    const up = await upload(bytes, ALICE);
    expect(up.status).toBe(200);
    const hash = up.body.drawing.hash as string;
    expect(hash).toBe(drawingHash(bytes));
    expect(drawingUploaders(hash)).toEqual([ALICE]);

    const mine = await get(`/api/drawing/${hash}/sheet/1`, ALICE);
    expect(mine.status).toBe(200);
    expect(mine.headers.get('content-type')).toMatch(/image\/png/);

    const theirs = await get(`/api/drawing/${hash}/sheet/1`, BOB);
    const unknown = await get(`/api/drawing/${'e'.repeat(64)}/sheet/1`, BOB);
    expect(theirs.status).toBe(404);
    expect(await theirs.json()).toEqual(await unknown.json());
    expect(unknown.status).toBe(404);

    expect((await get(`/api/drawing/${hash}/sheet/1`, ADMIN)).status).toBe(200);
  });

  it('the OCR job: the uploader polls it; another user gets the same 404 as an unknown job', async () => {
    reader.needsOcr = true;
    try {
      const up = await upload(drawing(), ALICE, 'scan.pdf');
      expect(up.status).toBe(202);
      const jobId = up.body.drawing.jobId as string;
      expect(jobId).toBeTruthy();
      expect((await get(`/api/drawing/jobs/${jobId}?wait=1`, ALICE)).status).toBe(200);
      const theirs = await get(`/api/drawing/jobs/${jobId}?reading=1`, BOB);
      const unknown = await get('/api/drawing/jobs/00000000-0000-0000-0000-000000000000', BOB);
      expect(theirs.status).toBe(404);
      expect(await theirs.json()).toEqual(await unknown.json());
      expect((await get(`/api/drawing/jobs/${jobId}`, ADMIN)).status).toBe(200);
    } finally { reader.needsOcr = false; }
  });

  it('the same bytes uploaded by a second user: one record, both may see it; a third may not', async () => {
    const bytes = drawing();
    const a = await upload(bytes, ALICE), b = await upload(bytes, BOB);
    expect(a.body.drawing.hash).toBe(b.body.drawing.hash);
    const hash = a.body.drawing.hash as string;
    expect(drawingUploaders(hash).sort()).toEqual([ALICE, BOB].sort());
    expect(canSeeDrawing(hash, { userId: BOB })).toBe(true);
    expect(canSeeDrawing(hash, { userId: 'scope-carol' })).toBe(false);
  });

  it('a costing naming the drawing by hash (drawingFromBody): the uploader gets it, another user is told it is gone', async () => {
    const up = await upload(drawing(), ALICE);
    const hash = up.body.drawing.hash as string;
    const body = { drawingHash: hash, drawingReview: { ops: [{ op: 'confirm', id: 'drawing:material.designation:1', drawingHash: hash, by: 'Forged Name', at: '1999-01-01T00:00:00.000Z' }] } };
    const mine = drawingFromBody(body, { userId: ALICE, email: `${ALICE}@test` });
    expect(mine && !('gone' in mine)).toBe(true);
    expect(drawingFromBody(body, { userId: BOB, email: `${BOB}@test` })).toEqual({ gone: true });
    expect(drawingFromBody(body, null)).toEqual({ gone: true });
    const admin = drawingFromBody(body, { userId: ADMIN, email: `${ADMIN}@test` });
    expect(admin && !('gone' in admin)).toBe(true);

    // F05: who decided is the signed-in user; when is the server's clock — not what the client wrote
    const ops = (mine as Exclude<typeof mine, null | { gone: true }>).review.ops;
    expect(ops[0].by).toBe(`${ALICE}@test`);
    expect(Math.abs(Date.parse(ops[0].at) - Date.now())).toBeLessThan(60_000);
  });
});

describe('F07 — retention is enforced on a timer, not only at start-up or when a file is read again', () => {
  it('an hourly, unref\'d sweep removes files and sheet pictures older than a day and readings older than a week', async () => {
    const dir = process.env.CV_DRAWING_FILE_DIR!;
    mkdirSync(dir, { recursive: true });
    const old = join(dir, `${'1'.repeat(64)}.bin`), oldSheet = join(dir, `${'1'.repeat(64)}.s1.png`), fresh = join(dir, `${'2'.repeat(64)}.bin`);
    for (const f of [old, oldSheet, fresh]) writeFileSync(f, 'x');
    const twoDaysAgo = (Date.now() - FILE_TTL_MS - 86_400_000) / 1000;
    utimesSync(old, twoDaysAgo, twoDaysAgo); utimesSync(oldSheet, twoDaysAgo, twoDaysAgo);
    // a reading and an uploader row older than a week
    const staleHash = '3'.repeat(64);
    db.prepare('INSERT OR REPLACE INTO drawing_extraction_by_hash (key, ts, payload) VALUES (?, ?, ?)').run(`${staleHash}:x`, Date.now() - EXTRACTION_TTL_MS - 1000, '{}');
    db.prepare('INSERT OR REPLACE INTO drawing_uploaders (hash, user_id, ts) VALUES (?, ?, ?)').run(staleHash, ALICE, Date.now() - EXTRACTION_TTL_MS - 1000);

    stopDrawingSweeper();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      startDrawingSweeper();                             // sweeps at once …
      expect(existsSync(old)).toBe(false);
      expect(existsSync(oldSheet)).toBe(false);
      expect(existsSync(fresh)).toBe(true);
      expect(db.prepare('SELECT COUNT(*) AS n FROM drawing_extraction_by_hash WHERE key = ?').get(`${staleHash}:x`)).toEqual({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM drawing_uploaders WHERE hash = ?').get(staleHash)).toEqual({ n: 0 });

      writeFileSync(old, 'x'); utimesSync(old, twoDaysAgo, twoDaysAgo);
      vi.advanceTimersByTime(SWEEP_INTERVAL_MS);        // … and again every hour while the server runs
      expect(existsSync(old)).toBe(false);
    } finally { stopDrawingSweeper(); vi.useRealTimers(); }
    expect(SWEEP_INTERVAL_MS).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(sweepDrawingStore().files).toBe(0);
  });

  it('a drawing whose uploader record has expired is not visible to its uploader any more', async () => {
    const up = await upload(drawing(), ALICE);
    const hash = up.body.drawing.hash as string;
    expect(getDrawing(hash)).not.toBeNull();
    db.prepare('UPDATE drawing_uploaders SET ts = ? WHERE hash = ?').run(Date.now() - EXTRACTION_TTL_MS - 1000, hash);
    expect(canSeeDrawing(hash, { userId: ALICE })).toBe(false);
  });
});

describe('D07 — exactly 30 MB is accepted by POST /api/drawing/read, one byte more is refused', () => {
  it('31,457,280 bytes: read; 31,457,281 bytes: 413 with the limit stated', async () => {
    const head = drawing();
    const exact = new Uint8Array(MAX_DRAWING_BYTES);
    exact.set(head, 0);
    exact.fill(0x20, head.length);                  // trailing spaces after %%EOF: still the same drawing to a PDF reader
    const ok = await upload(exact, ALICE, 'exact.pdf');
    expect(ok.status).toBe(200);
    expect(ok.body.drawing.sizeBytes).toBe(MAX_DRAWING_BYTES);

    const over = new Uint8Array(MAX_DRAWING_BYTES + 1);
    over.set(exact, 0); over[MAX_DRAWING_BYTES] = 0x20;
    const no = await upload(over, ALICE, 'over.pdf');
    expect(no.status).toBe(413);
    expect(no.body.error).toMatch(/limit is 30 MB/);
  }, 60_000);
});
