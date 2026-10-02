/**
 * The gear review, 2 Oct 2026 — one test per finding.
 *
 * Traced on the real m3 × z38 spur gear (cad-audit/parts/test-gear-m3-z38.step,
 * known-truth drawing alongside). The gear engine itself was already audited;
 * what was wrong sat in what feeds it — and one routing fault that took the
 * screen off the gear form altogether. docs/cad/gear-review-2026-10.md.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import jwt from 'jsonwebtoken';
import { seedUser } from './helpers/seed-user.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import {
  GEAR_RULES, GEAR_SETUP_HR_PER_OPERATION, GEAR_REJECT,
} from '../src/engine/cost-input-rules/commodities/gear.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { CUTTING_DATA } from '../src/engine/machining-time.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number; commodity?: string } }>;
const GEAR = 'test-gear-m3-z38.step';
const geo = baseline.find(b => b.part === GEAR)!.geometry;
const ANSWERS = { 'gear.helix': 'spur', 'gear.qualityClass': '8', 'gear.materialClass': 'case_hardening_steel' };
const ctx = (annualVolume = 50_000): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'gear', commoditySource: 'engineer', annualVolume,
  filename: GEAR, answers: ANSWERS,
} as RuleContext);

describe('1. set-up is in the cost on both paths', () => {
  it('a rule: 0.75 h per operation a batch (headless excluded it; the screen said 0.75)', () => {
    const r = runCostInputRules(GEAR_RULES, ctx());
    expect((r.suggestions.gear as Record<string, number>).setupTimeHrPerOperation).toBe(GEAR_SETUP_HR_PER_OPERATION);
    expect(r.provenance['gear-setup']).toBeDefined();
  });
  it('headless passes it, and the scrap rule', () => {
    const { analysis } = buildDeterministicAnalysis(GEAR_RULES, ctx(), 'gear');
    const p = toCostParams('gear', analysis.costInputSuggestions as never, 50_000, 'steel', geo)!.params;
    expect(p).toMatchObject({ setupTimeHrPerOperation: 0.75, rejectRate: GEAR_REJECT });
  });
});

describe('1b. each operation keeps its own labour headless', () => {
  it('deburr is semi-skilled and inspection an inspector — headless pinned all to a machinist', () => {
    const { analysis } = buildDeterministicAnalysis(GEAR_RULES, ctx(), 'gear');
    const p = toCostParams('gear', analysis.costInputSuggestions as never, 50_000, 'steel', geo)!.params as Record<string, unknown>;
    expect(p.labourId).toBeUndefined();
  });
});

describe('1c. crew: gear machines two to an operator, deburr and checker one', () => {
  it('as the machining routes, at the shop\'s 0.92 efficiency', async () => {
    const { computeGearDrivers, GEAR_MACHINE_CREW } = await import('../src/engine/modules/gear.js');
    const { analysis } = buildDeterministicAnalysis(GEAR_RULES, ctx(), 'gear');
    const p = toCostParams('gear', analysis.costInputSuggestions as never, 50_000, 'steel', geo)!.params;
    const ops = computeGearDrivers(p as never).operations;
    const byName = (n: string) => ops.find(o => o.operationName.startsWith(n))!;
    expect(byName('Gear hobbing').manning).toBe(GEAR_MACHINE_CREW);
    expect(byName('Blank turning').manning).toBe(GEAR_MACHINE_CREW);
    expect(byName('Chamfer and deburr').manning).toBe(1);
    expect(byName('Gear inspection').manning).toBe(1);
    expect(ops.every(o => o.labourEfficiency === 0.92)).toBe(true);
  });
});

describe('2. the blank is turned at the shared machining rate', () => {
  it('steel turns at the machining model\'s 80 cm³/min, not a second 40', () => {
    const r = runCostInputRules(GEAR_RULES, ctx());
    expect(r.byRule['gear.blankPrepCycleSec'].basis).toContain(`@ ${CUTTING_DATA.steel.turnRoughCm3PerMin} cm³/min`);
  });
});

describe('3. the baseline gear is a gear', () => {
  it('routed to the gear commodity and costed', () => {
    const rec = baseline.find(b => b.part === GEAR)!;
    expect(rec.outcome.commodity).toBe('gear');
    expect(rec.outcome.total).toBeGreaterThan(15);
  });
});

/**
 * The routing fault. /reanalyze — the call the screen makes with every answered
 * question — chose the commodity by calling the AI identifier even in
 * deterministic mode; with no client it failed quietly and the part fell to
 * the 'machining' default. Driven here over HTTP against a real server, with
 * the real gear STEP, wherever the OCP kernel is installed.
 */
describe('4. /reanalyze keeps a gear a gear (live server, needs OCP)', () => {
  const ROOT = join(__dirname, '..');
  const STEP = join(ROOT, '..', 'cad-audit', 'parts', GEAR);
  const SECRET = 'gear-secret-' + Math.random().toString(36).slice(2);
  const PORT = 4300 + Math.floor(Math.random() * 90);
  const BASE = `http://127.0.0.1:${PORT}`;
  const token = jwt.sign({ userId: 'u1', email: 'u1@test', emailVerified: true }, SECRET, { expiresIn: '10m' });
  let dir = '', srv: ChildProcess | null = null, kernel = false;

  beforeAll(async () => {
    try { execFileSync(process.env.PYTHON_BIN || 'python3', ['-c', 'import OCP'], { stdio: 'ignore', timeout: 30_000 }); kernel = true; }
    catch { return; }
    if (!existsSync(STEP)) { kernel = false; return; }
    dir = mkdtempSync(join(tmpdir(), 'cv-gear-'));
    writeFileSync(join(dir, '.env'), `JWT_SECRET=${SECRET}\nPORT=${PORT}\nAIR_GAPPED=1\n`);
    const env: NodeJS.ProcessEnv = { ...process.env, CV_DATA_DIR: dir, NODE_ENV: 'development' };
    delete env.JWT_SECRET; delete env.PORT; delete env.HOST; delete env.AIR_GAPPED; delete env.ANTHROPIC_API_KEY;
    srv = spawn(join(ROOT, 'node_modules/.bin/tsx'), [join(ROOT, 'server/index.ts')], { cwd: dir, env, stdio: 'ignore' });
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) { seedUser(dir, 'u1'); return; } } catch { /* starting */ }
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('server did not start');
  }, 60_000);
  afterAll(() => { srv?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

  it('answering the gear questions re-analyses as a gear, not as machining', async () => {
    if (!kernel) { console.warn('[gear-review] OCP unavailable — live routing check skipped'); return; }
    const auth = { Authorization: `Bearer ${token}` };
    const form = new FormData();
    form.append('cadFile', new Blob([readFileSync(STEP)]), GEAR);
    form.append('mode', 'deterministic');
    form.append('annualVolume', '50000');
    const a = await (await fetch(`${BASE}/api/cad/analyze`, { method: 'POST', headers: auth, body: form })).json() as
      { analysis?: { costInputSuggestions?: { recommendedCommodity?: string } }; geometryHash?: string };
    expect(a.analysis?.costInputSuggestions?.recommendedCommodity).toBe('gear');
    const r = await (await fetch(`${BASE}/api/cad/reanalyze`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ geometryHash: a.geometryHash, filename: GEAR, annualVolume: 50000,
        mode: 'deterministic', decisionAnswers: { ...ANSWERS, 'gear.helix': '0' } }),
    })).json() as { analysis?: { costInputSuggestions?: { recommendedCommodity?: string } } };
    expect(r.analysis?.costInputSuggestions?.recommendedCommodity).toBe('gear');   // was 'machining'
  }, 180_000);
});
