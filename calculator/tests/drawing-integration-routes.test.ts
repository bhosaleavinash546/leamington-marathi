/**
 * Offline 2D drawing intelligence — the INTEGRATION, through the real Express routes in process (temp database,
 * AIR_GAPPED, no key). The customer brief's tests, by letter:
 *
 *   A / H  no drawing → /reanalyze, /analyze, compare-routes and option-costs answer exactly as before: no drawing key
 *          in the payload, and the real parts cost what the recorded baseline says;
 *   B      POST /api/drawing/read returns the readings and their consolidation, and starts no costing;
 *   C      a real part with its matching drawing: confirmed readings cost exactly what the same answers typed by hand
 *          cost (`costMeasuredPart`), and an INDEPENDENT re-add from the trace's stack input closes to half a penny;
 *   D      the WRONG gear drawing (z 40 against 38 measured): a conflict, nothing chosen, the cost unchanged — before
 *          and after the engineer settles it (the measured count stands, and the panel says why);
 *   E      a drawing with the material left off: "missing", the material question exactly as without a drawing;
 *   G      one route per commodity pack family: the drawing's confirmed values reach that route's own questions;
 *   and    an unconfirmed drawing costs the same as none; the engineer's own answer wins over a confirmed reading and
 *          the difference is reported; the review survives save / reopen (projects table); a cached costing is never
 *          served for another drawing or another review state; an OCR drawing answers "reading" with a job to poll.
 *
 * Every costing here runs on geometry RECORDED from the real parts (tests/fixtures/real-parts-baseline.json), so it
 * runs without the CAD kernel; the /analyze upload is exercised with an STL (no kernel needed).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const env = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/cv-drawing-int-${process.pid}-${Date.now()}`;
  process.env.CV_DATA_DIR = dir;
  process.env.CV_DRAWING_FILE_DIR = `${dir}/drawings`;
  process.env.JWT_SECRET = 'drawing-integration-test-secret-0123456789abcdef';
  process.env.AIR_GAPPED = '1';
  process.env.CV_DRAWING_OCR_INLINE_MS = '0';   // an OCR drawing always answers "reading" first — deterministic
  process.env.CAD_RATE_LIMIT_SCALE = '100';     // this file makes a few hundred requests from one address
  delete process.env.ANTHROPIC_API_KEY;
  return { dir };
});

import express from 'express';
import db from '../server/db.js';
import cadRouter from '../server/routes/cad.js';
import drawingRouter from '../server/routes/drawing.js';
import projectsRouter from '../server/routes/projects.js';
import { signToken } from '../server/middleware/auth-middleware.js';
import { putGeometry } from '../server/utils/geometry-store.js';
import { resolveActiveRateBook } from '../server/routes/rate-library.js';
import { costMeasuredPart, type BulkPartResult } from '../server/services/bulk-run.js';
import { exactTotal } from '../server/services/route-compare.js';
import { recomputeMachineRates } from '../src/engine/rate-library.js';
import { READER_VERSION } from '../server/drawing/index.js';
import { drawingCacheKey, DRAWING_GONE } from '../server/services/drawing-context.js';
import { getDrawing } from '../server/services/drawing-service.js';
import type { ConsolidatedEngineeringData, EngineeringParameter, ReviewOp } from '../src/engine/engineering-data/index.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';

const ROOT = join(__dirname, '..');
const FIX = join(ROOT, 'tests', 'fixtures', 'drawings');
const PARTS = join(ROOT, '..', 'cad-audit', 'parts');
const BASELINE = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'real-parts-baseline.json'), 'utf8')) as
  Array<{ part: string; answers: Record<string, string>; commodity?: string; geometry: OCCTGeometry; outcome: { commodity?: string; total?: number } }>;
const rec = (part: string) => BASELINE.find(p => p.part === part)!;

let srv: Server;
let base = '';
const USER = 'dr-user', OTHER = 'dr-other';
const tok = (id: string) => signToken(id, `${id}@test`, true);
const AT = '2026-11-10T10:00:00.000Z';

/** A stable fake geometry hash per part (the server looks the measured geometry up by it). */
const hashOf = (part: string): string => Buffer.from(part).toString('hex').padEnd(64, '0').slice(0, 64);

beforeAll(async () => {
  const now = new Date().toISOString();
  for (const id of [USER, OTHER]) {
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at)
                VALUES (?, ?, 'x', ?, 1, 'user', ?)`).run(id, `${id}@test`, id, now);
  }
  for (const p of BASELINE) putGeometry(hashOf(p.part), p.geometry);
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/cad', cadRouter);
  app.use('/api/drawing', drawingRouter);
  app.use('/api/projects', projectsRouter);
  srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); rmSync(env.dir, { recursive: true, force: true }); });

type Json = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
/** A review sent with a request names the drawing it was taken on (review F04): the request's own drawing. */
const bound = (body: unknown): unknown => {
  const b = body as Json;
  return b && typeof b === 'object' && typeof b.drawingHash === 'string' && b.drawingReview && typeof b.drawingReview === 'object' && !b.drawingReview.drawingHash
    ? { ...b, drawingReview: { ...b.drawingReview, drawingHash: b.drawingHash } } : body;
};
const post = async (path: string, body: unknown, who: string | null = USER): Promise<{ status: number; body: Json }> => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tok(who)}` } : {}) }, body: JSON.stringify(bound(body)) });
  return { status: r.status, body: await r.json() as Json };
};
const get = async (path: string, who: string | null = USER): Promise<Response> =>
  fetch(base + path, { headers: who ? { Authorization: `Bearer ${tok(who)}` } : {} });

/** Upload a drawing to the drawing-only route (which also registers it under its hash for the costing routes). */
async function readDrawing(file: string, name = file.split('/').pop()!, fields: Record<string, string> = {}, who: string | null = USER): Promise<{ status: number; body: Json }> {
  const fd = new FormData();
  fd.append('drawing', new Blob([new Uint8Array(readFileSync(file))]), name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(`${base}/api/drawing/read`, { method: 'POST', headers: who ? { Authorization: `Bearer ${tok(who)}` } : {}, body: fd });
  return { status: r.status, body: await r.json() as Json };
}

interface Case { part: string; commodity: string; answers: Record<string, string>; volume?: number }
const reBody = (c: Case, extra: Json = {}): Json => ({
  geometryHash: hashOf(c.part), filename: c.part, mode: 'deterministic', annualVolume: c.volume ?? 50_000, programmeYears: 5,
  decisionAnswers: { 'commodity.route': c.commodity, ...c.answers }, ...extra,
});
const cmpBody = (c: Case, extra: Json = {}): Json => ({
  geometryHash: hashOf(c.part), filename: c.part, current: c.commodity, annualVolume: c.volume ?? 50_000, programmeYears: 5,
  decisionAnswers: { 'commodity.route': c.commodity, ...c.answers }, ladder: false, bands: false, ...extra,
});
const confirmOp = (id: string): ReviewOp => ({ op: 'confirm', id, by: USER, at: AT });
const named = (data: ConsolidatedEngineeringData, name: string): EngineeringParameter[] => data.parameters.filter(p => p.name === name);

/**
 * Confirm, as an engineer working down the panel would, every reading that offers an answer — round by round, because
 * confirming the material opens the readings that depend on it (the finish a family takes).
 */
async function confirmAllOffered(c: Case, drawingHash: string, alsoNames: string[] = []): Promise<{ ops: ReviewOp[]; last: Json }> {
  const ops: ReviewOp[] = [];
  let last = (await post('/api/cad/reanalyze', reBody(c, { drawingHash }))).body;
  for (let round = 0; round < 5; round++) {
    const ids = [...new Set<string>((last.drawingCosting.leanings as Array<{ parameterId: string }>).map(l => l.parameterId))]
      .filter(id => !ops.some(o => 'id' in o && o.id === id));
    if (!ids.length) break;
    ops.push(...ids.map(confirmOp));
    last = (await post('/api/cad/reanalyze', reBody(c, { drawingHash, drawingReview: { ops } }))).body;
  }
  const extra = (last.engineeringData as ConsolidatedEngineeringData).parameters
    .filter(p => alsoNames.includes(p.name) && (p.status === 'extracted' || p.status === 'needs-validation')).map(p => confirmOp(p.id));
  if (extra.length) { ops.push(...extra); last = (await post('/api/cad/reanalyze', reBody(c, { drawingHash, drawingReview: { ops } }))).body; }
  return { ops, last };
}

const book = () => recomputeMachineRates(resolveActiveRateBook());
/** The headless chain with answers typed by hand — what the drawing route must equal to the penny. */
async function byHand(c: Case, answers: Record<string, unknown>, finishFields?: { depositThicknessUm?: number; maskedFeatures?: number }): Promise<BulkPartResult> {
  return costMeasuredPart(rec(c.part).geometry, c.part,
    { partNumber: c.part, file: c.part, commodity: c.commodity, annualVolume: c.volume ?? 50_000 },
    { 'commodity.route': c.commodity, ...answers }, 'UK',
    { annualVolume: c.volume ?? 50_000, programmeYears: 5, acknowledge: [], ...(finishFields ? { finishFields } : {}) },
    book(), { partNumber: c.part, file: c.part, status: 'error' });
}
const refRow = (cmp: Json, commodity: string): Json => (cmp.rows[0]?.route === commodity ? cmp.rows[0] : cmp.rows.find((r: Json) => r.route === commodity));

/**
 * An independent re-add of a costing from what the engine RECORDED (rates, times, weights, tooling, percentages) —
 * written here, not shared with the engine or with the comparison's own audit. Returns |re-added − engine| in £.
 */
function reAddGap(r: BulkPartResult): number {
  const si = r.trace!.stackInput!, res = r.trace!.result!;
  let process = 0, labour = 0;
  for (const op of res.operationDetails) {
    const n = Math.max(1, op.partsPerCycle || 1);
    if (!op.benchOperation) process += op.machineRateUsed * op.cycleTimeHr / (op.oee || 1) / n;
    labour += op.labourRateUsed * (op.manning ?? 1) * (op.labourTimeHr ?? op.cycleTimeHr) / (op.labourEfficiency || 1) / n;
  }
  labour += res.learningCurveApplied?.labourSaving ?? 0;
  const rm = si.rawMaterial;
  const trace = (f: string) => Number(res.traceability.find(t => t.field === f)?.value ?? 0);
  const gross = rm.materialUtilization > 0 ? rm.netWeightKg / rm.materialUtilization : rm.netWeightKg;
  const credit = rm.lossIsNotScrap ? 0 : Math.max(0, gross - rm.netWeightKg) * trace('material.scrapRecoveryPricePerKg');
  const metal = rm.directCost !== undefined ? rm.directCost : gross * trace('material.pricePerKg') - credit;
  const energy = res.traceability.filter(t => /^rawMaterial\.energyKwh\./.test(t.field)).reduce((s, t) => s + (Number(t.value) || 0), 0);
  const boughtIn = Math.max(0, rm.boughtIn?.cost ?? 0);
  const material = metal + energy + (rm.consumablesCostPerPart ?? 0) + boughtIn;
  const tooling = si.tooling.mode === 'amortized' ? (si.tooling.amortizationVolume > 0 ? si.tooling.totalToolingCost / si.tooling.amortizationVolume : 0) : si.tooling.totalToolingCost;
  const baseCost = material + process + labour + tooling - boughtIn;
  const overhead = si.overheadPct * baseCost + boughtIn * Math.max(0, rm.boughtIn?.handlingPct ?? 0);
  const subtotal = material + process + labour + tooling + si.packagingPerPart + si.logisticsPerPart + overhead;
  const total = subtotal + si.marginPct * (subtotal - boughtIn);
  return Math.abs(total - exactTotal(r)!);
}

// ─── A / H — no drawing: nothing moved ──────────────────────────────────────────────────────────────────────────────

describe('A / H — with no drawing every route answers as it did', () => {
  const cases: Case[] = [
    { part: 'test-gear-m3-z38.step', commodity: 'gear', answers: { 'material.family': 'steel', 'gear.helix': 'spur', 'gear.qualityClass': '7', 'gear.materialClass': 'case_hardening_steel' } },
    { part: 'Casting_Braket.stp', commodity: 'cast_and_machine', answers: { 'material.family': 'steel', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' } },
    { part: 'Seat_Locking_Bracket.stp', commodity: 'sheet_metal', answers: { 'material.family': 'steel' } },
    { part: 'IM_ECU_Cover.stp', commodity: 'injection_moulding', answers: { 'material.resin': 'mat-pa66gf30', 'commodity.thinWallRoute': 'injection_moulding' } },
  ];

  it.each(cases)('$part: /reanalyze and compare-routes carry no drawing key, and the part costs the recorded baseline', async c => {
    const re = await post('/api/cad/reanalyze', reBody(c));
    expect(re.status).toBe(200);
    for (const k of ['drawing', 'engineeringData', 'drawingCosting']) expect(k in re.body, k).toBe(false);
    expect(re.body.decisions.filter((d: Json) => d.severity === 'blocking')).toEqual([]);
    const cmp = await post('/api/cad/compare-routes', cmpBody(c));
    expect(cmp.status).toBe(200);
    const row = refRow(cmp.body.comparison, c.commodity);
    const hand = await byHand(c, c.answers);
    expect(hand.status).toBe('costed');
    expect(row.total).toBe(exactTotal(hand));
    // …and that is the figure the real-parts baseline records for this part (at its own volume the baseline is pinned
    // by tests/real-parts-baseline.test.ts; here the headless chain and the route agree at this volume).
    expect(row.audit.closes).toBe(true);
  });

  it('option-costs with no drawing takes no drawing field and prices the options as the headless chain does', async () => {
    const c = cases[1];
    const { PRICED_QUESTION_IDS } = await import('../server/services/option-costs.js');
    expect(PRICED_QUESTION_IDS).toContain('service.finish');
    const r = await post('/api/cad/option-costs', { ...cmpBody(c), questions: [{ id: 'service.finish', values: ['none', 'e_coat'], selected: 'none' }] });
    expect(r.status).toBe(200);
    const q = r.body.questions[0];
    const bare = q.options.find((o: Json) => o.value === 'none'), coated = q.options.find((o: Json) => o.value === 'e_coat');
    expect(bare.total).toBe(exactTotal(await byHand(c, { ...c.answers, 'service.finish': 'none' })));
    expect(coated.total).toBe(exactTotal(await byHand(c, { ...c.answers, 'service.finish': 'e_coat' })));
    expect(coated.total).toBeGreaterThan(bare.total);
  });

  it('/analyze on an STL with no drawing has no drawing key (the upload path, no kernel needed)', async () => {
    const stl = join(ROOT, 'tests', 'fixtures', 'stl-dfm');
    const file = ['ecu-cover.stl', 'IM_ECU_Cover.stl'].map(f => join(stl, f)).find(existsSync) ?? null;
    if (!file) return;   // the fixture set has no STL of this name on this checkout
    const fd = new FormData();
    fd.append('cadFile', new Blob([new Uint8Array(readFileSync(file))]), 'part.stl');
    fd.append('mode', 'deterministic');
    const r = await fetch(`${base}/api/cad/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${tok(USER)}` }, body: fd });
    const j = await r.json() as Json;
    expect(r.status).toBe(200);
    for (const k of ['drawing', 'engineeringData', 'drawingCosting']) expect(k in j, k).toBe(false);
  });
});

// ─── B — drawing only ───────────────────────────────────────────────────────────────────────────────────────────────

describe('B — POST /api/drawing/read: the readings, and no costing', () => {
  it('needs a session', async () => {
    expect((await readDrawing(join(FIX, 'gen-casting.pdf'), 'x.pdf', {}, null)).status).toBe(401);
    expect((await get('/api/drawing/jobs/none', null)).status).toBe(401);
    expect((await get(`/api/drawing/${'a'.repeat(64)}/sheet/1`, null)).status).toBe(401);
  });

  it('returns the extraction and its consolidation with no CAD, and nothing that is a cost', async () => {
    const r = await readDrawing(join(FIX, 'gen-casting.pdf'), 'pump-housing.pdf', { commodity: 'casting' });
    expect(r.status).toBe(200);
    expect(r.body.drawing).toMatchObject({ file: 'pump-housing.pdf', status: 'ready', readerVersion: READER_VERSION, fileKind: 'pdf', ocrReadings: 0 });
    expect(r.body.drawing.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(r.body.extraction.parameters.find((p: Json) => p.name === 'material.designation').value).toBe('EN-GJS-500-7');
    const data = r.body.engineeringData as ConsolidatedEngineeringData;
    expect(data.commodity).toBe('casting');
    expect(data.parameters.some(p => p.source === 'cad')).toBe(false);          // no model was measured
    expect(data.sources.map(s => s.source)).toEqual(expect.arrayContaining(['drawing']));
    expect(data.missing.map(m => m.name)).toContain('part.volume');              // said, not invented
    expect(named(data, 'material.family')[0]).toMatchObject({ value: 'cast iron', source: 'derived', status: 'extracted' });
    // nothing here is a costing
    expect(r.body.costing).toBeNull();
    const text = JSON.stringify(r.body);
    for (const k of ['"analysis"', '"breakdown"', '"costInputSuggestions"', '"decisions"', '"ruleFields"', 'GBP', '£']) expect(text.includes(k), k).toBe(false);
  });

  it('the route file calls no costing code and no AI client (read off its imports)', () => {
    const src = readFileSync(join(ROOT, 'server', 'routes', 'drawing.ts'), 'utf8') + readFileSync(join(ROOT, 'server', 'services', 'drawing-service.ts'), 'utf8');
    expect(src).not.toMatch(/cost-executor|bulk-run|to-cost-params|deterministic\.js|computeUniversalStack|costMeasuredPart|route-compare/);
    expect(src).not.toMatch(/ai-client|createAnthropic|@anthropic-ai|\bfetch\s*\(/);
  });

  it('refuses what the reader refuses, in the reader\'s words', async () => {
    const dwg = join(env.dir, 'part.dwg');
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(env.dir, { recursive: true });
    writeFileSync(dwg, Buffer.concat([Buffer.from('AC1027'), Buffer.alloc(200)]));
    const r = await readDrawing(dwg);
    expect(r.status).toBe(415);
    expect(r.body.error).toMatch(/DWG cannot be read offline: export the drawing as PDF or DXF/);
    const junk = join(env.dir, 'notes.txt');
    writeFileSync(junk, 'this is not a drawing at all, just words');
    expect((await readDrawing(junk)).status).toBe(415);
    const none = await fetch(`${base}/api/drawing/read`, { method: 'POST', headers: { Authorization: `Bearer ${tok(USER)}` }, body: new FormData() });
    expect(none.status).toBe(400);
  });

  it('serves the sheet as a picture for the review panel', async () => {
    const r = await readDrawing(join(FIX, 'gen-casting.pdf'));
    const img = await get(`/api/drawing/${r.body.drawing.hash}/sheet/1`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    const bytes = Buffer.from(await img.arrayBuffer());
    expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect((await get(`/api/drawing/${r.body.drawing.hash}/sheet/9`)).status).toBe(404);
    expect((await get(`/api/drawing/${'f'.repeat(64)}/sheet/1`)).status).toBe(404);
  }, 60_000);
});

// ─── C — the combined flow on real parts ────────────────────────────────────────────────────────────────────────────

describe('C — a real part with its drawing: confirmed readings cost what the same answers typed by hand cost', () => {
  it('the gear: an unconfirmed drawing changes nothing; confirmed, it answers helix, quality class and hardening', async () => {
    const c: Case = { part: 'test-gear-m3-z38.step', commodity: 'gear', answers: { 'material.family': 'steel', 'gear.materialClass': 'case_hardening_steel' } };
    const d = await readDrawing(join(PARTS, 'gear-drawing-m3-z38.pdf'));
    const hash = d.body.drawing.hash as string;

    const none = (await post('/api/cad/reanalyze', reBody(c))).body;
    const unconfirmed = (await post('/api/cad/reanalyze', reBody(c, { drawingHash: hash }))).body;
    // Unconfirmed: the same questions, the same analysis, the same fields — only the three drawing keys are new.
    const core = (x: Json) => JSON.stringify({ a: x.analysis, d: x.decisions, f: x.ruleFields, w: x.sanityWarnings, c: x.costable, r: x.analysisByRegion });
    expect(core(unconfirmed)).toBe(core(none));
    expect(unconfirmed.drawingCosting.answers).toEqual({});
    expect(unconfirmed.drawingCosting.leanings.map((l: Json) => [l.decisionId, l.value])).toEqual(
      expect.arrayContaining([['gear.helix', '0'], ['gear.qualityClass', '7'], ['gear.hardeningRoute', 'case_hardening']]));
    expect(unconfirmed.drawing).toMatchObject({ status: 'ready', hash, readerVersion: READER_VERSION });
    expect(unconfirmed.decisions.map((x: Json) => x.id)).toEqual(expect.arrayContaining(['gear.helix', 'gear.qualityClass']));

    const { ops, last } = await confirmAllOffered(c, hash);
    expect(last.drawingCosting.answers).toEqual({ 'gear.helix': '0', 'gear.qualityClass': '7', 'gear.hardeningRoute': 'case_hardening' });
    expect(last.drawingCosting.skipped).toEqual([]);
    expect(last.decisions.filter((x: Json) => x.severity === 'blocking')).toEqual([]);
    for (const id of ['gear.helix', 'gear.qualityClass']) expect(last.decisions.some((x: Json) => x.id === id)).toBe(false);
    // each answer names the reading behind it, with its place on the sheet
    expect(last.drawingCosting.evidence['gear.helix']).toMatchObject({ source: 'drawing', status: 'confirmed', location: { sheet: 1 } });

    // The rules ran on exactly the answers an engineer would have clicked.
    const typed = (await post('/api/cad/reanalyze', reBody({ ...c, answers: { ...c.answers, ...last.drawingCosting.answers } }))).body;
    expect(JSON.stringify({ a: last.analysis, d: last.decisions, f: last.ruleFields })).toBe(JSON.stringify({ a: typed.analysis, d: typed.decisions, f: typed.ruleFields }));

    // The cost: the headless chain on the server with the drawing = the headless chain with the answers typed by hand.
    const cmp = (await post('/api/cad/compare-routes', cmpBody(c, { drawingHash: hash, drawingReview: { ops } }))).body;
    const hand = await byHand(c, { ...c.answers, ...last.drawingCosting.answers });
    expect(hand.status).toBe('costed');
    expect(refRow(cmp.comparison, 'gear').total).toBe(exactTotal(hand));
    expect(reAddGap(hand)).toBeLessThan(0.005);
    // With the drawing UNCONFIRMED the comparison is what it is with no drawing at all (it takes the questions'
    // own suggestions and says so) — the drawing contributes nothing until the engineer confirms.
    const open = (await post('/api/cad/compare-routes', cmpBody(c, { drawingHash: hash }))).body;
    const bare = (await post('/api/cad/compare-routes', cmpBody(c))).body;
    expect(JSON.stringify(open.comparison)).toBe(JSON.stringify(bare.comparison));
  }, 120_000);

  it('the casting bracket: aluminium A356-T6, tight, leak-tested, safety-critical, e-coated with 3 masked bores — every one from the drawing', async () => {
    const c: Case = { part: 'Casting_Braket.stp', commodity: 'cast_and_machine', answers: {} };
    const d = await readDrawing(join(FIX, 'real-casting-bracket.pdf'));
    const hash = d.body.drawing.hash as string;
    const { ops, last } = await confirmAllOffered(c, hash, ['finish.maskedFeatures', 'finish.coatingThickness']);
    const answers = last.drawingCosting.answers as Record<string, string>;
    expect(answers).toEqual({
      'material.family': 'aluminium', 'material.grade': 'mat-lm25', 'service.pressureTight': 'yes', 'service.toleranceClass': 'tight',
      'service.safetyCritical': 'yes', 'service.finish': 'e_coat', 'casting.heatTreat': 'T6',
    });
    expect(last.decisions.filter((x: Json) => x.severity === 'blocking')).toEqual([]);
    // Masked features: no question takes them — they reach the costing through the finish block, bounded by the holes measured.
    expect(last.drawingCosting.formFields).toEqual([expect.objectContaining({ fieldId: 'cam-sf-mask', value: 3 })]);
    expect(last.drawingCosting.formFields[0].note).toMatch(/3 masked feature\(s\), confirmed from the drawing — no more than the 11 measured on the 3D model/);
    expect(last.analysis.costInputSuggestions.surfaceFinish).toMatchObject({ route: 'e_coat', maskedFeatures: 3 });
    // The 20–35 µm e-coat film is a RANGE, and e-coat is not priced by deposit: it is not used, and the panel says so.
    expect(last.analysis.costInputSuggestions.surfaceFinish.depositThicknessUm).toBeUndefined();
    expect(last.drawingCosting.formNotes.join(' ')).toMatch(/20–35 µm is a range/);

    const cmp = (await post('/api/cad/compare-routes', cmpBody(c, { drawingHash: hash, drawingReview: { ops } }))).body;
    const row = refRow(cmp.comparison, 'cast_and_machine');
    const hand = await byHand(c, answers, { maskedFeatures: 3 });
    expect(hand.status).toBe('costed');
    expect(row.total).toBe(exactTotal(hand));
    expect(reAddGap(hand)).toBeLessThan(0.005);
    expect(row.audit.closes).toBe(true);
    // The drawing's answers differ from the defaults, and so does the cost: steel, standard, no test, bare.
    const defaults = await byHand(c, { 'material.family': 'steel', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' });
    expect(Math.abs(exactTotal(hand)! - exactTotal(defaults)!)).toBeGreaterThan(0.5);
    // the masks are in the cost: without them the same answers cost less
    const noMasks = await byHand(c, answers);
    expect(exactTotal(hand)!).toBeGreaterThan(exactTotal(noMasks)!);

    // The option £ of a question re-cost with the drawing's answers too (the selected option IS the headline).
    const opt = await post('/api/cad/option-costs', { ...cmpBody(c, { drawingHash: hash, drawingReview: { ops } }), questions: [{ id: 'service.finish', values: ['e_coat', 'none'], selected: 'e_coat' }] });
    expect(opt.status).toBe(200);
    expect(opt.body.questions[0].options.find((o: Json) => o.value === 'e_coat').total).toBe(exactTotal(hand));
  }, 180_000);

  it('the seat bracket: S420MC, safety-critical, zinc plated 12 µm — the deposit thickness reaches the finish block', async () => {
    const c: Case = { part: 'Seat_Locking_Bracket.stp', commodity: 'sheet_metal', answers: {} };
    const d = await readDrawing(join(FIX, 'real-seat-bracket.pdf'));
    const hash = d.body.drawing.hash as string;
    const { ops, last } = await confirmAllOffered(c, hash, ['finish.coatingThickness']);
    const answers = last.drawingCosting.answers as Record<string, string>;
    expect(answers).toEqual({ 'material.family': 'steel', 'material.grade': 'mat-s420mc', 'service.safetyCritical': 'yes', 'service.finish': 'zinc_plate' });
    expect(last.drawingCosting.formFields).toEqual([expect.objectContaining({ fieldId: 'sm-sf-um', value: 12 })]);
    expect(last.drawingCosting.formFields[0].note).toMatch(/12 µm, confirmed from the drawing — inside 5–25 µm \(ISO 2081/);
    const costed = String(last.analysis.costInputSuggestions.recommendedCommodity);
    expect(last.analysis.costInputSuggestions.surfaceFinish).toMatchObject({ route: 'zinc_plate', depositThicknessUm: 12 });

    const cmp = (await post('/api/cad/compare-routes', cmpBody(c, { drawingHash: hash, drawingReview: { ops } }))).body;
    const hand = await byHand(c, answers, { depositThicknessUm: 12 });
    expect(hand.status).toBe('costed');
    expect(refRow(cmp.comparison, 'sheet_metal').total).toBe(exactTotal(hand));
    expect(reAddGap(hand)).toBeLessThan(0.005);
    expect(['sheet_metal', 'sheet_metal_fab']).toContain(costed);
    // DC-grade default against HSLA S420MC, bare against plated: the drawing moved the cost
    const defaults = await byHand(c, { 'material.family': 'steel' });
    expect(Math.abs(exactTotal(hand)! - exactTotal(defaults)!)).toBeGreaterThan(0.05);
  }, 180_000);
});

// ─── D — the wrong drawing ──────────────────────────────────────────────────────────────────────────────────────────

describe('D — the WRONG gear drawing (z 40 against 38 teeth measured)', () => {
  const c: Case = { part: 'test-gear-m3-z38.step', commodity: 'gear', answers: { 'material.family': 'steel', 'gear.helix': 'spur', 'gear.qualityClass': '7', 'gear.materialClass': 'case_hardening_steel' } };

  it('is shown as a conflict with both sides, nothing is chosen, and the cost does not move — before or after it is settled', async () => {
    const d = await readDrawing(join(PARTS, 'gear-drawing-WRONG-z40.pdf'));
    const hash = d.body.drawing.hash as string;
    const before = refRow((await post('/api/cad/compare-routes', cmpBody(c))).body.comparison, 'gear').total as number;

    const r = (await post('/api/cad/reanalyze', reBody(c, { drawingHash: hash }))).body;
    const data = r.engineeringData as ConsolidatedEngineeringData;
    const conflict = data.conflicts.find(x => x.name === 'gear.teeth')!;
    expect(conflict.sides.map(s => [s.source, s.value])).toEqual([['cad', 38], ['drawing', 40]]);
    expect(conflict.resolution).toBeUndefined();
    expect(conflict.suggested).toBe('cad:gear.teeth');                         // a suggestion — never applied by itself
    expect(named(data, 'gear.teeth').map(p => p.status)).toEqual(['conflict', 'conflict']);
    expect(r.drawingCosting.answers).toEqual({});
    expect(r.analysis.costInputSuggestions.gear.teeth).toBe(38);               // the measured count, untouched
    expect(refRow((await post('/api/cad/compare-routes', cmpBody(c, { drawingHash: hash }))).body.comparison, 'gear').total).toBe(before);

    // "Confirm" on one side of a conflict is not a way round it: the decision is skipped, with the reason.
    const tried = (await post('/api/cad/reanalyze', reBody(c, { drawingHash: hash, drawingReview: { ops: [confirmOp('drawing:gear.teeth:1')] } }))).body;
    expect(tried.drawingCosting.skipped).toHaveLength(1);
    expect(tried.drawingCosting.skipped[0].why).toMatch(/one side of a conflict — resolve the conflict/);
    expect((tried.engineeringData as ConsolidatedEngineeringData).conflicts.find(x => x.name === 'gear.teeth')!.resolution).toBeUndefined();

    // Settled for the 3D model: the cost is the same.
    const forCad: ReviewOp[] = [{ op: 'resolve', name: 'gear.teeth', choose: 'cad:gear.teeth', by: USER, at: AT }];
    const s1 = (await post('/api/cad/reanalyze', reBody(c, { drawingHash: hash, drawingReview: { ops: forCad } }))).body;
    expect((s1.engineeringData as ConsolidatedEngineeringData).conflicts.find(x => x.name === 'gear.teeth')!.resolution).toMatchObject({ parameterId: 'cad:gear.teeth', by: `${USER}@test` });   // the signed-in user, stamped by the server (F05)
    expect(refRow((await post('/api/cad/compare-routes', cmpBody(c, { drawingHash: hash, drawingReview: { ops: forCad } }))).body.comparison, 'gear').total).toBe(before);

    // Settled for the DRAWING: the engine counted the teeth on the model, its question is not open, so the measured
    // count stands — and that is said, not hidden.
    const forDrawing: ReviewOp[] = [{ op: 'resolve', name: 'gear.teeth', choose: 'drawing:gear.teeth:1', by: USER, at: AT }];
    const s2 = (await post('/api/cad/reanalyze', reBody(c, { drawingHash: hash, drawingReview: { ops: forDrawing } }))).body;
    expect(s2.drawingCosting.answers).toEqual({});
    expect(s2.drawingCosting.dropped).toEqual([expect.objectContaining({ decisionId: 'gear.teethEntry', parameterId: 'drawing:gear.teeth:1' })]);
    expect(s2.drawingCosting.dropped[0].why).toMatch(/measured this on the 3D model — its question is not open, so the measured figure stands/);
    expect(s2.analysis.costInputSuggestions.gear.teeth).toBe(38);
    expect(refRow((await post('/api/cad/compare-routes', cmpBody(c, { drawingHash: hash, drawingReview: { ops: forDrawing } }))).body.comparison, 'gear').total).toBe(before);
  }, 120_000);
});

// ─── E — missing ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('E — a drawing with the material left off', () => {
  it('lists it as missing, invents nothing, and leaves the material question exactly as without a drawing', async () => {
    const c: Case = { part: 'Casting_Braket.stp', commodity: 'cast_and_machine', answers: {} };
    const d = await readDrawing(join(FIX, 'real-casting-bracket-nomaterial.pdf'));
    const hash = d.body.drawing.hash as string;
    const none = (await post('/api/cad/reanalyze', reBody(c))).body;
    const { last } = await confirmAllOffered(c, hash);
    const data = last.engineeringData as ConsolidatedEngineeringData;
    expect(data.missing.map(m => m.name)).toContain('material.designation');
    for (const n of ['material.designation', 'material.family', 'material.grade', 'material.condition', 'part.mass']) {
      expect(data.parameters.filter(p => p.name === n && p.source !== 'cad'), n).toEqual([]);
    }
    // Everything the sheet DOES state was confirmed; the material still is not answered by anything.
    expect(Object.keys(last.drawingCosting.answers).sort()).toEqual(['service.finish', 'service.pressureTight', 'service.safetyCritical', 'service.toleranceClass']);
    const q = (x: Json) => x.decisions.find((k: Json) => k.id === 'material.family');
    expect(q(last)).toBeTruthy();
    expect(q(last)).toEqual(q(none));                                          // the same question, the same options, the same leaning
    expect(q(last).severity).toBe('blocking');
    expect(last.costable).toBe(false);
    expect(none.costable).toBe(false);
  }, 120_000);
});

// ─── G — every commodity pack family ────────────────────────────────────────────────────────────────────────────────

describe('G — the drawing\'s confirmed values reach each route\'s own questions', () => {
  const families: Array<{ family: string; part: string; drawing: string; commodity: string; answers?: Record<string, string>; expect: Record<string, string> }> = [
    { family: 'casting', part: 'PRCR002.stp', drawing: 'gen-casting.pdf', commodity: 'cast_and_machine', expect: { 'material.family': 'cast iron', 'service.pressureTight': 'yes', 'service.safetyCritical': 'yes' } },
    { family: 'forging', part: 'FORGE_Hub_Flange.stp', drawing: 'gen-forging.pdf', commodity: 'forging', expect: { 'material.family': 'steel', 'material.grade': 'mat-steel-42crmo4', 'service.safetyCritical': 'yes' } },   // ISO 2768-mK is the only tolerance note: it sets machined dimensions, not the as-forged class (validation, 10 Nov 2026)
    { family: 'sheet metal', part: 'BIW_Reinf_Channel.stp', drawing: 'gen-sheetmetal.pdf', commodity: 'sheet_metal', answers: { 'commodity.thinWallRoute': 'sheet_metal' }, expect: { 'material.family': 'steel', 'material.grade': 'mat-dc04', 'service.finish': 'zinc_nickel' } },
    { family: 'machining', part: 'MACH_Hydraulic_Manifold.stp', drawing: 'gen-machined.pdf', commodity: 'machining', expect: { 'material.family': 'aluminium' } },
    { family: 'polymers', part: 'IM_ECU_Cover.stp', drawing: 'gen-moulding.pdf', commodity: 'injection_moulding', answers: { 'commodity.thinWallRoute': 'injection_moulding' }, expect: { 'material.resin': 'mat-pa66gf30' } },
    { family: 'rubber', part: 'RUB_Grommet.stp', drawing: 'gen-rubber.pdf', commodity: 'rubber', expect: { 'material.elastomer': 'mat-epdm' } },
    { family: 'composites', part: 'COMP_Roof_Panel.stp', drawing: 'gen-composite.pdf', commodity: 'composites', expect: { 'material.laminate': 'prepreg-cf' } },
    { family: 'gear', part: 'test-gear-m3-z38.step', drawing: 'gen-gear.pdf', commodity: 'gear', expect: { 'gear.helix': '15', 'gear.qualityClass': '6', 'gear.hardeningRoute': 'case_hardening' } },
    { family: 'aluminium extrusion', part: 'AL_Battery_Rail.stp', drawing: 'gen-extrusion.pdf', commodity: 'aluminium_extrusion', expect: { 'material.alAlloy': '6063', 'al.temper': 'T66', 'al.finish': 'anodise' } },
  ];

  it.each(families)('$family ($commodity): confirmed readings answer $expect', async f => {
    const c: Case = { part: f.part, commodity: f.commodity, answers: f.answers ?? {} };
    const d = await readDrawing(join(FIX, f.drawing));
    expect(d.status).toBe(200);
    const hash = d.body.drawing.hash as string;
    const before = (await post('/api/cad/reanalyze', reBody(c, { drawingHash: hash }))).body;
    expect(before.drawingCosting.answers).toEqual({});                         // nothing until the engineer confirms
    const { last } = await confirmAllOffered(c, hash);
    expect(last.drawingCosting.answers).toMatchObject(f.expect);
    // an answered question is no longer asked, and every answer names its reading
    for (const id of Object.keys(f.expect)) {
      expect(last.decisions.some((x: Json) => x.id === id), id).toBe(false);
      expect(last.drawingCosting.evidence[id]).toMatchObject({ status: 'confirmed' });
    }
    // the rules took the answers exactly as typed ones
    const typed = (await post('/api/cad/reanalyze', reBody({ ...c, answers: { ...c.answers, ...last.drawingCosting.answers } }))).body;
    expect(JSON.stringify(last.analysis.costInputSuggestions)).toBe(JSON.stringify(typed.analysis.costInputSuggestions));
    expect(last.decisions).toEqual(typed.decisions);
  }, 120_000);
});

// ─── The engineer's own answer wins ─────────────────────────────────────────────────────────────────────────────────

describe('an answer the engineer gave by hand is never replaced by a drawing value', () => {
  it('a differing confirmed reading is reported as overridden, with both values, and the hand answer is costed', async () => {
    const c: Case = { part: 'Casting_Braket.stp', commodity: 'cast_and_machine', answers: {} };
    const d = await readDrawing(join(FIX, 'real-casting-bracket.pdf'));
    const hash = d.body.drawing.hash as string;
    const { ops } = await confirmAllOffered(c, hash);
    const mine = { ...c, answers: { 'service.toleranceClass': 'standard' } };
    const r = (await post('/api/cad/reanalyze', reBody(mine, { drawingHash: hash, drawingReview: { ops } }))).body;
    expect(r.drawingCosting.answers['service.toleranceClass']).toBeUndefined();
    expect(r.drawingCosting.overridden).toEqual([expect.objectContaining({ decisionId: 'service.toleranceClass', handValue: 'standard', drawingValue: 'tight' })]);
    expect(r.drawingCosting.answers['material.family']).toBe('aluminium');     // the rest of the drawing still applies
    const typed = (await post('/api/cad/reanalyze', reBody({ ...c, answers: { ...r.drawingCosting.answers, 'service.toleranceClass': 'standard' } }))).body;
    expect(JSON.stringify(r.analysis.costInputSuggestions)).toBe(JSON.stringify(typed.analysis.costInputSuggestions));
  }, 120_000);

  it('a pinned material is the engineer\'s answer too: the drawing\'s material is not used over it', async () => {
    const c: Case = { part: 'Casting_Braket.stp', commodity: 'cast_and_machine', answers: {} };
    const d = await readDrawing(join(FIX, 'real-casting-bracket.pdf'));
    const hash = d.body.drawing.hash as string;
    const { ops } = await confirmAllOffered(c, hash);
    const r = (await post('/api/cad/reanalyze', reBody(c, { drawingHash: hash, drawingReview: { ops }, material: 'mat-gjs500' }))).body;
    expect(r.drawingCosting.answers['material.family']).toBeUndefined();
    expect(r.drawingCosting.answers['material.grade']).toBeUndefined();
    expect(r.drawingCosting.overridden).toEqual([expect.objectContaining({ decisionId: 'material.family', handValue: 'cast iron', drawingValue: 'aluminium' })]);
    // the drawing's grade is of another family than the pinned one: refused by the question's own scope, and said
    expect(r.drawingCosting.dropped.find((x: Json) => x.decisionId === 'material.grade').why).toMatch(/is aluminium, and the material is settled as cast iron/);
    expect(r.analysis.costInputSuggestions.materialId).toBe('mat-gjs500');
  }, 120_000);
});

// ─── Cache ──────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('a cached costing is never served for another drawing or another review state', () => {
  const c: Case = { part: 'test-gear-m3-z38.step', commodity: 'gear', answers: { 'material.family': 'steel', 'gear.materialClass': 'case_hardening_steel' } };

  it('/reanalyze: the same request with the right drawing, the wrong drawing, and two review states gives four different answers — and each repeats', async () => {
    const right = (await readDrawing(join(PARTS, 'gear-drawing-m3-z38.pdf'))).body.drawing.hash as string;
    const wrong = (await readDrawing(join(PARTS, 'gear-drawing-WRONG-z40.pdf'))).body.drawing.hash as string;
    expect(right).not.toBe(wrong);
    const helix = [confirmOp('drawing:gear.helixAngle:1')];
    const view = (x: Json) => ({ hash: x.drawing?.hash ?? null, answers: x.drawingCosting?.answers ?? null, conflicts: (x.engineeringData?.conflicts ?? []).length, open: x.decisions.map((d: Json) => d.id) });
    const run = async (extra: Json) => view((await post('/api/cad/reanalyze', reBody(c, extra))).body);
    const a = await run({}), b = await run({ drawingHash: right }), w = await run({ drawingHash: wrong }), h = await run({ drawingHash: right, drawingReview: { ops: helix } });
    expect(a.hash).toBeNull();
    expect(b).toMatchObject({ hash: right, answers: {}, conflicts: 0 });
    expect(w).toMatchObject({ hash: wrong, answers: {}, conflicts: 1 });
    expect(h).toMatchObject({ hash: right, answers: { 'gear.helix': '0' } });
    expect(h.open).not.toContain('gear.helix');
    expect(b.open).toContain('gear.helix');
    // served again (now from the cache): each request still gets ITS answer
    expect(await run({ drawingHash: right, drawingReview: { ops: helix } })).toEqual(h);
    expect(await run({ drawingHash: wrong })).toEqual(w);
    expect(await run({ drawingHash: right })).toEqual(b);
    expect(await run({})).toEqual(a);
  }, 120_000);

  it('the key holds the drawing\'s bytes, the reader\'s version, how far the read got and the decisions', () => {
    const record = getDrawing(Object.keys({})[0] ?? 'x') ?? null;
    expect(record).toBeNull();
    const rec1 = { hash: 'a'.repeat(64), filename: 'd.pdf', sizeBytes: 1, fileKind: 'pdf' as const, status: 'ready' as const, extraction: null, jobId: null, error: null, errorCode: null };
    const k = (r: typeof rec1 | (Omit<typeof rec1, 'status'> & { status: 'reading' }), ops: ReviewOp[]) => drawingCacheKey({ record: r, review: { schemaVersion: 1, ops } });
    expect(drawingCacheKey(null)).toBe('');
    const base0 = k(rec1, []);
    expect(base0).toContain(READER_VERSION);
    expect(k({ ...rec1, hash: 'b'.repeat(64) }, [])).not.toBe(base0);
    expect(k({ ...rec1, status: 'reading' }, [])).not.toBe(base0);
    expect(k(rec1, [confirmOp('x')])).not.toBe(base0);
    expect(k(rec1, [confirmOp('x')])).toBe(k(rec1, [confirmOp('x')]));
  });

  it('a drawing the server does not hold is refused on every costing route — never costed without it', async () => {
    const gone = { drawingHash: 'e'.repeat(64) };
    for (const [path, body] of [['/api/cad/reanalyze', reBody(c, gone)], ['/api/cad/compare-routes', cmpBody(c, gone)],
      ['/api/cad/option-costs', { ...cmpBody(c, gone), questions: [] }]] as const) {
      const r = await post(path, body);
      expect(r.status, path).toBe(409);
      expect(r.body).toEqual({ error: DRAWING_GONE, code: 'DRAWING_GONE' });
    }
  });
});

// ─── The review saved with the project ──────────────────────────────────────────────────────────────────────────────

describe('the review state survives save and reopen (projects table)', () => {
  it('saved as a project, read back and replayed: the same confirmations, the same answers', async () => {
    const c: Case = { part: 'Seat_Locking_Bracket.stp', commodity: 'sheet_metal', answers: {} };
    const hash = (await readDrawing(join(FIX, 'real-seat-bracket.pdf'))).body.drawing.hash as string;
    const { ops, last } = await confirmAllOffered(c, hash, ['finish.coatingThickness']);
    const id = `dr-${hash.slice(0, 20)}-test`;
    const saved = await post('/api/projects', { id, kind: 'cad_drawing_review', name: `${c.part} + real-seat-bracket.pdf`,
      data: { schemaVersion: 1, drawingHash: hash, drawingFile: 'real-seat-bracket.pdf', cadFile: c.part, readerVersion: READER_VERSION, review: { ops }, savedAt: AT } });
    expect(saved.status).toBe(200);
    // another signed-in user does not see it
    expect(((await (await get('/api/projects?kind=cad_drawing_review', OTHER)).json()) as Json).projects).toEqual([]);
    const back = ((await (await get('/api/projects?kind=cad_drawing_review')).json()) as Json).projects.find((p: Json) => p.id === id);
    expect(back.data.review.ops).toEqual(ops);
    const again = (await post('/api/cad/reanalyze', reBody(c, { drawingHash: back.data.drawingHash, drawingReview: back.data.review }))).body;
    const statuses = (x: Json) => (x.engineeringData as ConsolidatedEngineeringData).parameters.map(p => [p.id, p.status]);
    expect(statuses(again)).toEqual(statuses(last));
    expect(again.drawingCosting.answers).toEqual(last.drawingCosting.answers);
    expect(again.drawingCosting.formFields).toEqual(last.drawingCosting.formFields);
    // every confirmation carries who and when
    const conf = (again.engineeringData as ConsolidatedEngineeringData).parameters.filter(p => p.status === 'confirmed');
    expect(conf.length).toBe(ops.length);
    for (const p of conf) expect(p.history?.[0]).toMatchObject({ by: `${USER}@test`, action: 'confirm' });   // who: the session; when: the server's clock (F05)
  }, 120_000);

  it('an old project with no review, or a malformed one, opens as an unreviewed drawing', async () => {
    const c: Case = { part: 'Seat_Locking_Bracket.stp', commodity: 'sheet_metal', answers: {} };
    const hash = (await readDrawing(join(FIX, 'real-seat-bracket.pdf'))).body.drawing.hash as string;
    const plain = (await post('/api/cad/reanalyze', reBody(c, { drawingHash: hash }))).body;
    for (const review of [undefined, null, 'garbage', { ops: 'x' }, { ops: [{ op: 'confirm' }] }]) {
      const r = (await post('/api/cad/reanalyze', reBody(c, { drawingHash: hash, drawingReview: review }))).body;
      expect(r.drawingCosting.answers).toEqual({});
      expect(JSON.stringify(r.engineeringData)).toBe(JSON.stringify(plain.engineeringData));
    }
  }, 60_000);

  it('decisions made on one route that do not apply on another are skipped and listed — never guessed onto other readings', async () => {
    const hash = (await readDrawing(join(FIX, 'real-casting-bracket.pdf'))).body.drawing.hash as string;
    const cam: Case = { part: 'Casting_Braket.stp', commodity: 'cast_and_machine', answers: {} };
    const { ops } = await confirmAllOffered(cam, hash);
    const asMachined = (await post('/api/cad/reanalyze', reBody({ ...cam, commodity: 'machining' }, { drawingHash: hash, drawingReview: { ops } }))).body;
    const skipped = asMachined.drawingCosting.skipped as Array<{ op: ReviewOp; why: string }>;
    expect(skipped.length).toBeGreaterThan(0);
    for (const s of skipped) expect(s.why).toMatch(/no parameter ".*" in this dataset/);
    // what still applies on the machining route (the family, leak-tightness) is used; what machining does not ask is not
    expect(asMachined.drawingCosting.answers['material.family']).toBe('aluminium');
    for (const id of ['service.toleranceClass', 'casting.heatTreat', 'service.finish', 'material.grade']) expect(asMachined.drawingCosting.answers[id], id).toBeUndefined();
  }, 120_000);
});

// ─── /analyze with a drawing, and a drawing that needs OCR ──────────────────────────────────────────────────────────

describe('/api/cad/analyze reads the attached drawing on the no-AI path', () => {
  const stlDir = join(ROOT, 'tests', 'fixtures', 'stl-dfm');
  const stl = existsSync(stlDir) ? (require('node:fs') as typeof import('node:fs')).readdirSync(stlDir).find(f => f.endsWith('.stl')) : undefined;
  const analyze = async (files: Record<string, [string, string]>, fields: Record<string, string> = {}): Promise<{ status: number; body: Json }> => {
    const fd = new FormData();
    for (const [field, [path, name]] of Object.entries(files)) fd.append(field, new Blob([new Uint8Array(readFileSync(path))]), name);
    fd.append('mode', 'deterministic');
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    const r = await fetch(`${base}/api/cad/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${tok(USER)}` }, body: fd });
    return { status: r.status, body: await r.json() as Json };
  };

  it.skipIf(!stl)('a vector PDF is in the first response: read, consolidated with the measured mesh, nothing confirmed', async () => {
    const r = await analyze({ cadFile: [join(stlDir, stl!), stl!], drawingPdf: [join(FIX, 'gen-moulding.pdf'), 'connector.pdf'] }, { commodity: 'injection_moulding' });
    expect(r.status).toBe(200);
    expect(r.body.drawing).toMatchObject({ file: 'connector.pdf', status: 'ready', readerVersion: READER_VERSION });
    expect(r.body.drawing.jobId).toBeUndefined();
    const data = r.body.engineeringData as ConsolidatedEngineeringData;
    expect(data.sources.map(s => s.source)).toEqual(expect.arrayContaining(['cad', 'drawing']));
    expect(named(data, 'material.designation')[0].value).toBe('PA66-GF30');
    expect(r.body.drawingCosting.answers).toEqual({});
    expect(r.body.drawingCosting.leanings.map((l: Json) => l.decisionId)).toContain('material.resin');
    expect(r.body.mode).toBe('deterministic');
    // the same upload with the review: the resin is answered
    const resin = named(data, 'material.grade').find(p => p.status === 'extracted' || p.status === 'needs-validation');
    expect(resin).toBeTruthy();
    const r2 = await analyze({ cadFile: [join(stlDir, stl!), stl!], drawingPdf: [join(FIX, 'gen-moulding.pdf'), 'connector.pdf'] },
      { commodity: 'injection_moulding', drawingReview: JSON.stringify({ drawingHash: r.body.drawing.hash, ops: [confirmOp(resin!.id)] }) });
    expect(r2.body.drawingCosting.answers).toEqual({ 'material.resin': 'mat-pa66gf30' });
    expect(r2.body.decisions.some((d: Json) => d.id === 'material.resin')).toBe(false);
  }, 120_000);

  it.skipIf(!stl)('refuses a DWG and an unknown file as the drawing, before anything is costed', async () => {
    const { writeFileSync } = await import('node:fs');
    const dwg = join(env.dir, 'd.dwg'); writeFileSync(dwg, Buffer.concat([Buffer.from('AC1032'), Buffer.alloc(100)]));
    const r = await analyze({ cadFile: [join(stlDir, stl!), stl!], drawingPdf: [dwg, 'd.dwg'] });
    expect(r.status).toBe(415);
    expect(r.body).toMatchObject({ code: 'drawing_unsupported-type' });
    expect(r.body.error).toMatch(/The drawing cannot be read: This is a DWG file/);
  });

  it.skipIf(!stl)('a scanned drawing does not hold the costing up: "reading" with a job, then the readings — all needing validation', async () => {
    const r = await analyze({ cadFile: [join(stlDir, stl!), stl!], drawingPdf: [join(FIX, 'gen-moulding.scan200.jpg'), 'scan.jpg'] }, { commodity: 'injection_moulding' });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);                                         // the costing answered
    expect(r.body.drawing).toMatchObject({ status: 'reading', file: 'scan.jpg' });
    expect(r.body.drawing.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.body.engineeringData).toBeNull();
    expect(r.body.drawingCosting).toBeNull();
    // poll the job as the screen does
    let job: Json = {};
    for (let i = 0; i < 60; i++) {
      job = await (await get(`/api/drawing/jobs/${r.body.drawing.jobId}?wait=1`)).json() as Json;
      if (job.status === 'done' || job.status === 'failed') break;
    }
    expect(job.status).toBe('done');
    expect(job.drawing).toMatchObject({ status: 'ready', fileKind: 'image' });
    expect(job.drawing.ocrReadings).toBe(job.drawing.readings);
    // the same upload again: now read, and every reading is OCR → needs validation → nothing is "read exactly"
    const r2 = await analyze({ cadFile: [join(stlDir, stl!), stl!], drawingPdf: [join(FIX, 'gen-moulding.scan200.jpg'), 'scan.jpg'] }, { commodity: 'injection_moulding' });
    expect(r2.body.drawing.status).toBe('ready');
    const data = r2.body.engineeringData as ConsolidatedEngineeringData;
    const fromDrawing = data.parameters.filter(p => p.source === 'drawing');
    expect(fromDrawing.length).toBeGreaterThan(5);
    expect(fromDrawing.every(p => p.method === 'ocr' && p.status === 'needs-validation')).toBe(true);
    expect(r2.body.drawingCosting.answers).toEqual({});
    expect((await get('/api/drawing/jobs/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  }, 240_000);
});
