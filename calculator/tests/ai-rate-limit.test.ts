/**
 * The routes that call a model are rate-limited per user (M5).
 *
 * None were (CAD was). Scaled down here with AI_RATE_LIMIT_SCALE so a budget
 * runs out in a few calls. The server is air-gapped, so every call is a cheap
 * 503 — the limiter sits in front of the handler, which is the point: a
 * refused call still counts, and a runaway client is stopped either way.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import jwt from 'jsonwebtoken';
import { seedUser } from './helpers/seed-user.js';
import { AI_BUDGETS } from '../server/middleware/ai-limit.js';

const ROOT = join(__dirname, '..');
const SECRET = 'ai-limit-' + Math.random().toString(36).slice(2);
const PORT = 4300 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const SCALE = 0.05;
let dir = '', srv: ChildProcess | null = null;
const tok = (u: string) => jwt.sign({ userId: u, email: `${u}@test`, emailVerified: true }, SECRET, { expiresIn: '5m' });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cv-ailimit-'));
  writeFileSync(join(dir, '.env'), `JWT_SECRET=${SECRET}\nPORT=${PORT}\nAIR_GAPPED=1\nAI_RATE_LIMIT_SCALE=${SCALE}\n`);
  const env: NodeJS.ProcessEnv = { ...process.env, CV_DATA_DIR: dir, NODE_ENV: 'development' };
  delete env.JWT_SECRET; delete env.PORT; delete env.HOST; delete env.AI_RATE_LIMIT_SCALE;
  srv = spawn(join(ROOT, 'node_modules/.bin/tsx'), [join(ROOT, 'server/index.ts')], { cwd: dir, env, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) { seedUser(dir, 'ann'); seedUser(dir, 'ben'); return; } } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}, 60_000);
afterAll(() => { srv?.kill(); rmSync(dir, { recursive: true, force: true }); });

const chat = (u: string) => fetch(`${BASE}/api/aichat`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok(u)}` },
  body: JSON.stringify({ message: 'hi' }),
});

describe('AI routes are rate-limited per user', () => {
  const budget = Math.max(1, Math.round(AI_BUDGETS.chat * SCALE));   // 3

  it('the call after the budget is refused with a clear 429', async () => {
    for (let i = 0; i < budget; i++) expect((await chat('ann')).status).toBe(503);   // air-gapped, but counted
    const r = await chat('ann');
    expect(r.status).toBe(429);
    const b = await r.json() as { code: string; error: string };
    expect(b.code).toBe('AI_RATE_LIMITED');
    expect(b.error).toMatch(/costing, CAD geometry and exports are not limited/);
  });

  it('one user running out does not lock out another', async () => {
    expect((await chat('ben')).status).toBe(503);
  });

  it('costing and data routes are not limited', async () => {
    for (let i = 0; i < budget + 2; i++) {
      const r = await fetch(`${BASE}/api/quotes`, { headers: { Authorization: `Bearer ${tok('ann')}` } });
      expect(r.status).toBe(200);
    }
  });

  it('every AI route has a budget', async () => {
    const routes: Array<[string, string]> = [
      ['/api/agent/chat', 'agent'], ['/api/dfm/analyze', 'dfm'], ['/api/rfq/analyze', 'rfq'],
    ];
    for (const [path] of routes) {
      const limit = (await fetch(BASE + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok('ben')}` }, body: '{}',
      })).headers.get('ratelimit-limit') ?? (await fetch(BASE + path, { method: 'POST', headers: { Authorization: `Bearer ${tok('ben')}` } })).headers.get('ratelimit');
      expect(limit, `${path} carries no rate-limit header`).toBeTruthy();
    }
    const fd = new FormData();
    const pcb = await fetch(`${BASE}/api/pcb/analyze-image`, { method: 'POST', headers: { Authorization: `Bearer ${tok('ben')}` }, body: fd });
    expect(pcb.headers.get('ratelimit-limit') ?? pcb.headers.get('ratelimit')).toBeTruthy();
  });
});
