/**
 * With AIR_GAPPED=1 every AI entry point says AI is switched off — not "add an
 * API key", which is the one thing a no-AI policy forbids.
 *
 * The routes used to check for a key before the air gap, so the JLR build told
 * users to configure a key. The air gap itself held (createAnthropic throws),
 * but the message was wrong, and /api/health did not report the air gap, so
 * the interface could not hide its AI features.
 *
 * The server here has a key that passes the key check, to prove the air gap is
 * what refuses — not a missing key.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import jwt from 'jsonwebtoken';
import { seedUser } from './helpers/seed-user.js';

const ROOT = join(__dirname, '..');
const SECRET = 'air-gap-secret-' + Math.random().toString(36).slice(2);
const PORT = 4200 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = 'sk-ant-this-key-passes-the-shape-check-000000';
let dir = '', srv: ChildProcess | null = null;
const token = jwt.sign({ userId: 'u1', email: 'u1@test', emailVerified: true }, SECRET, { expiresIn: '5m' });
const auth = { Authorization: `Bearer ${token}` };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cv-airgap-'));
  writeFileSync(join(dir, '.env'), `JWT_SECRET=${SECRET}\nPORT=${PORT}\nAIR_GAPPED=1\nANTHROPIC_API_KEY=${KEY}\n`);
  const env: NodeJS.ProcessEnv = { ...process.env, CV_DATA_DIR: dir, NODE_ENV: 'development' };
  delete env.JWT_SECRET; delete env.PORT; delete env.HOST; delete env.AIR_GAPPED; delete env.ANTHROPIC_API_KEY;
  srv = spawn(join(ROOT, 'node_modules/.bin/tsx'), [join(ROOT, 'server/index.ts')], { cwd: dir, env, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) { seedUser(dir, 'u1'); return; } } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}, 60_000);
afterAll(() => { srv?.kill(); rmSync(dir, { recursive: true, force: true }); });

const postJson = (path: string, body: unknown) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(body) });

const onePixelPng = () => new Blob([Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')],
  { type: 'image/png' });

type Body = { error?: string; code?: string; airGapped?: boolean; reply?: string };

function expectSwitchedOff(status: number, body: Body): void {
  expect(status).toBe(503);
  expect(body.code).toBe('AI_DISABLED');
  expect(body.error).toMatch(/AI is switched off in this installation/);
  expect(body.error).not.toMatch(/API key|ANTHROPIC_API_KEY|Settings/i);
}

describe('health reports the air gap', () => {
  it('airGapped is true and AI is not available, even with a key configured', async () => {
    const h = await (await fetch(`${BASE}/api/health`)).json() as Record<string, unknown>;
    expect(h.airGapped).toBe(true);
    expect(h.aiAvailable).toBe(false);
    expect(h.apiKeyConfigured).toBe(true);
  });
});

describe('every AI route says AI is switched off', () => {
  it('assistant chat — and its reply says so too, for older clients that only read reply', async () => {
    const r = await postJson('/api/aichat', { message: 'hi' });
    const b = await r.json() as Body;
    expectSwitchedOff(r.status, b);
    expect(b.reply).toMatch(/AI is switched off/);
  });

  it.each(['/api/agent/chat', '/api/agent/chat/stream'])('costing agent %s', async path => {
    const r = await postJson(path, { message: 'cost a bracket' });
    expectSwitchedOff(r.status, await r.json() as Body);
  });

  it('expert DFM commentary', async () => {
    const r = await postJson('/api/dfm/analyze', {});
    expectSwitchedOff(r.status, await r.json() as Body);
  });

  it('reading line items from RFQ text', async () => {
    const r = await postJson('/api/rfq/analyze', { text: '100 off aluminium bracket' });
    expectSwitchedOff(r.status, await r.json() as Body);
  });

  it.each(['/api/pcb/analyze-image', '/api/pcb/reanalyze'])('PCB photo %s', async path => {
    const fd = new FormData();
    fd.append('pcbImages', onePixelPng(), 'board.png');
    const r = await fetch(BASE + path, { method: 'POST', headers: auth, body: fd });
    expectSwitchedOff(r.status, await r.json() as Body);
  });

  it('PCB photo, streamed — the error event carries the same message', async () => {
    const fd = new FormData();
    fd.append('pcbImages', onePixelPng(), 'board.png');
    const text = await (await fetch(BASE + '/api/pcb/analyze-image-stream', { method: 'POST', headers: auth, body: fd })).text();
    const evt = JSON.parse(text.split('\n').find(l => l.startsWith('data: '))!.slice(6)) as { type: string; message: string; code: string };
    expect(evt.type).toBe('error');
    expect(evt.code).toBe('AI_DISABLED');
    expect(evt.message).toMatch(/AI is switched off in this installation/);
  });

  it('CAD analysis when AI mode is asked for', async () => {
    const fd = new FormData();
    fd.append('cadFile', new Blob([readFileSync(join(ROOT, 'tests/fixtures/cad-parts/block-2holes.stl'))]), 'block.stl');
    fd.append('mode', 'ai');
    const r = await fetch(BASE + '/api/cad/analyze', { method: 'POST', headers: auth, body: fd });
    const b = await r.json() as Body;
    expectSwitchedOff(r.status, b);
    expect(b.error).toMatch(/deterministic/);   // and says what still works
  }, 30_000);
});

describe('what does not need AI still works air-gapped', () => {
  it('RFQ with structured lines', async () => {
    const r = await postJson('/api/rfq/analyze', {
      lines: [{ partName: 'Bracket', commodity: 'machining', material: 'aluminium', quantity: 100 }],
    });
    expect(r.status).toBe(200);
  });

  it('CAD analysis in the default (deterministic) mode is not refused for AI', async () => {
    const fd = new FormData();
    fd.append('cadFile', new Blob([readFileSync(join(ROOT, 'tests/fixtures/cad-parts/block-2holes.stl'))]), 'block.stl');
    const r = await fetch(BASE + '/api/cad/analyze', { method: 'POST', headers: auth, body: fd });
    const b = await r.json() as Body;
    expect(b.code).not.toBe('AI_DISABLED');
    expect(r.status).not.toBe(500);
  }, 30_000);
});
