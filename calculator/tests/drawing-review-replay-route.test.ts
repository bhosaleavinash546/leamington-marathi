/**
 * The validation's B13 / B14 through the real /reanalyze route (offline drawing review, Nov 2026 — review D02 / F04):
 * the casting bracket's review, sent with the GEAR drawing, used to confirm the gear drawing's reading at the same
 * positional id — the bracket was costed as steel (20MnCr5). Now every decision names the drawing and the value it was
 * taken on, and the server skips (and lists) every decision that does not belong to the drawing it is replayed on.
 *
 * Runs on the recorded geometry of the real bracket (no CAD kernel) and the exact-text drawings (no OCR).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const env = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/cv-drawing-replay-${process.pid}-${Date.now()}`;
  process.env.CV_DATA_DIR = dir;
  process.env.CV_DRAWING_FILE_DIR = `${dir}/drawings`;
  process.env.JWT_SECRET = 'drawing-replay-test-secret-0123456789abcdef0123';
  process.env.AIR_GAPPED = '1';
  process.env.CAD_RATE_LIMIT_SCALE = '100';
  delete process.env.ANTHROPIC_API_KEY;
  return { dir };
});

import express from 'express';
import db from '../server/db.js';
import cadRouter from '../server/routes/cad.js';
import drawingRouter from '../server/routes/drawing.js';
import { signToken } from '../server/middleware/auth-middleware.js';
import { putGeometry } from '../server/utils/geometry-store.js';
import { seenKey, type ReviewOp } from '../src/engine/engineering-data/review-state.js';
import type { ConsolidatedEngineeringData } from '../src/engine/engineering-data/index.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';

const ROOT = join(__dirname, '..');
const FIX = join(ROOT, 'tests', 'fixtures', 'drawings');
const BASELINE = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'real-parts-baseline.json'), 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
const GEO = 'c'.repeat(64);
const USER = 'replay-user';
type Json = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
let srv: Server;
let base = '';

beforeAll(async () => {
  db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', 'R', 1, 'user', ?)`)
    .run(USER, `${USER}@test`, new Date().toISOString());
  putGeometry(GEO, BASELINE.find(p => p.part === 'Casting_Braket.stp')!.geometry);
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/cad', cadRouter);
  app.use('/api/drawing', drawingRouter);
  srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); rmSync(env.dir, { recursive: true, force: true }); });

const auth = { Authorization: `Bearer ${signToken(USER, `${USER}@test`, true)}` };
async function read(file: string): Promise<string> {
  const fd = new FormData();
  fd.append('drawing', new Blob([new Uint8Array(readFileSync(join(FIX, file)))]), file);
  const r = await fetch(`${base}/api/drawing/read`, { method: 'POST', headers: auth, body: fd });
  expect(r.status).toBe(200);
  return ((await r.json()) as Json).drawing.hash as string;
}
const reanalyze = async (extra: Json): Promise<Json> => {
  const r = await fetch(`${base}/api/cad/reanalyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ geometryHash: GEO, filename: 'Casting_Braket.stp', mode: 'deterministic', annualVolume: 50_000, programmeYears: 5,
      decisionAnswers: { 'commodity.route': 'cast_and_machine' }, ...extra }) });
  expect(r.status).toBe(200);
  return await r.json() as Json;
};

describe('B13 / B14 — the bracket\'s review is never replayed onto the gear drawing', () => {
  it('bound decisions: applied on the bracket drawing, every one skipped on the gear drawing (no steel from 20MnCr5)', async () => {
    const bracket = await read('real-casting-bracket.pdf');
    const gear = await read('gen-gear.pdf');
    // the engineer confirms what the bracket drawing offers, as the screen does: each decision bound to drawing + value
    const first = await reanalyze({ drawingHash: bracket });
    const data = first.engineeringData as ConsolidatedEngineeringData;
    const ids = [...new Set<string>(first.drawingCosting.leanings.map((l: Json) => l.parameterId))];
    const ops: ReviewOp[] = ids.map(id => ({ op: 'confirm', id, drawingHash: bracket, seen: seenKey(data.parameters.find(p => p.id === id)!.value),
      by: 'whoever', at: '2026-11-10T10:00:00.000Z' }));
    expect(ops.length).toBeGreaterThan(0);
    const onBracket = await reanalyze({ drawingHash: bracket, drawingReview: { ops } });
    expect(onBracket.drawingCosting.answers['material.family']).toBe('aluminium');
    expect(onBracket.drawingCosting.skipped).toEqual([]);

    const onGear = await reanalyze({ drawingHash: gear, drawingReview: { ops } });
    expect(onGear.drawingCosting.answers).toEqual({});
    expect(onGear.drawingCosting.skipped).toHaveLength(ops.length);
    for (const s of onGear.drawingCosting.skipped as Json[]) expect(s.why).toMatch(/taken on another drawing/);
  }, 120_000);

  it('a review that names no drawing at all (an old saved review) is skipped and listed, on any drawing', async () => {
    const gear = await read('gen-gear.pdf');
    const r = await reanalyze({ drawingHash: gear, drawingReview: { ops: [{ op: 'confirm', id: 'drawing:material.designation:1', by: 'x', at: '2026-11-10T10:00:00.000Z' }] } });
    expect(r.drawingCosting.answers).toEqual({});
    expect(r.drawingCosting.skipped).toHaveLength(1);
    expect(r.drawingCosting.skipped[0].why).toMatch(/does not say which drawing/);
  }, 120_000);
});
