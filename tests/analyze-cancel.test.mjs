// Cancel must stop the bill, not just the spinner.
//
// Before this, a browser that closed the tab or hit Cancel mid-generation
// left the upstream model call running for up to ten more minutes — billed,
// and the result unreadable because the closed SSE response was its only
// channel. This boots the REAL server against the stub model
// (scripts/fake-llm.mjs, which counts calls its caller hung up on), opens an
// /api/analyze stream, aborts it, and checks two things: the stub saw the
// abort, and the metering table recorded the call as cancelled.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 19300 + (process.pid % 100);
const STUB = 19400 + (process.pid % 100);
const BASE = `http://127.0.0.1:${PORT}`;
const STUB_BASE = `http://127.0.0.1:${STUB}`;
let server, stub, dataDir, token;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(url, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error(`${url} did not come up`);
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'bs-cancel-'));
  stub = spawn(process.execPath, ['scripts/fake-llm.mjs'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, FAKE_LLM_PORT: String(STUB), FAKE_LLM_PACE_MS: '20000' },   // slow, so we can hang up mid-reply
  });
  server = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, JWT_SECRET: 'cancel-test-secret', LOG_LEVEL: 'silent',
      ANTHROPIC_BASE_URL: STUB_BASE, CV_THINKING_BUDGET: '0', BRAINSPARK_BACKUPS: '0' },
  });
  await waitFor(`${STUB_BASE}/__stats`);
  await waitFor(`${BASE}/api/health`);
  const r = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Cancel', email: 'cancel@test.local', password: 'correct-horse-9' }),
  });
  token = (await r.json()).token;
  assert.ok(token);
});

after(() => {
  server?.kill('SIGKILL'); stub?.kill('SIGKILL');
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

const body = () => JSON.stringify({
  config: { apiKey: 'sk-ant-api03-STUB', annualVolume: 120000, plantRegion: 'uk', currency: 'GBP', vehicleType: 'Mid-Size SUV — BEV (800V)',
    bodyStyle: 'suv', programmeLengthYears: 5, additionalContext: 'cancel test', deepMode: false, systemId: 'bev-mhev', subassemblyId: 'edu' },
  systemName: 'Powertrain — BEV / MHEV', subassemblyName: 'Electric Drive Unit (EDU)', partName: 'SiC MOSFET Power Inverter Module', enableSearch: false,
});

describe('cancelling /api/analyze', () => {
  it('aborting the SSE response aborts the upstream model call and meters it as cancelled', async () => {
    const ctl = new AbortController();
    const res = await fetch(`${BASE}/api/analyze`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
      body: body(),
    });
    assert.equal(res.status, 200);
    // Read until the stub has been called (the upstream stream is open), then hang up.
    const reader = res.body.getReader();
    const t0 = Date.now();
    let opened = false;
    while (Date.now() - t0 < 20000) {
      const stats = await (await fetch(`${STUB_BASE}/__stats`)).json();
      if (stats.requests >= 1) { opened = true; break; }
      await Promise.race([reader.read(), sleep(200)]);
    }
    assert.ok(opened, 'the stub never received the model call');
    await sleep(800);           // let a few deltas flow so the abort is genuinely mid-reply
    ctl.abort();
    // The stub must observe the hang-up within a couple of seconds.
    let aborted = 0;
    for (let i = 0; i < 30 && !aborted; i++) { await sleep(200); aborted = (await (await fetch(`${STUB_BASE}/__stats`)).json()).aborted; }
    assert.equal(aborted, 1, 'upstream call was not aborted after the client disconnected');
    // …and the metering row says so, rather than pretending the call failed on its own.
    let row = null;
    for (let i = 0; i < 30 && !row; i++) {
      await sleep(200);
      const db = new Database(join(dataDir, 'brainspark.db'), { readonly: true });
      row = db.prepare("SELECT model, ok FROM llm_calls WHERE model LIKE '%cancelled%' ORDER BY createdAt DESC LIMIT 1").get();
      db.close();
    }
    assert.ok(row, 'no llm_calls row labelled cancelled');
    assert.equal(row.ok, 0);
  });

  it('an uninterrupted run still completes against the stub (the abort wiring did not break the happy path)', async () => {
    const res = await fetch(`${BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body(),
    });
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.ok(Array.isArray(d.ideas) && d.ideas.length > 0, 'stub run returned no ideas');
    const stats = await (await fetch(`${STUB_BASE}/__stats`)).json();
    assert.ok(stats.completed >= 1);
  });
});
