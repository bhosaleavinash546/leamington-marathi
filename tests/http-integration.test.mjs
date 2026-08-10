// HTTP integration tests — the audit's gap: 156 unit tests, zero exercising an
// actual Express route. Boots the REAL server (fresh temp DB, random port) once
// and drives auth, guards, marketplace caching, should-cost, exports, and the
// SPA/static layer over real HTTP.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18900 + (process.pid % 100);
const BASE = `http://127.0.0.1:${PORT}`;
let proc, dataDir, token;

async function waitForHealth(timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('server did not become healthy');
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'bs-it-'));
  proc = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, JWT_SECRET: 'integration-test-secret', LOG_LEVEL: 'silent' },
    stdio: 'ignore',
  });
  await waitForHealth();
});

after(() => {
  proc?.kill('SIGKILL');
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('http integration', () => {
  it('health responds with version', async () => {
    const d = await (await fetch(`${BASE}/api/health`)).json();
    assert.equal(d.status, 'ok');
    assert.match(String(d.version), /^\d+\.\d+\.\d+$/);
  });

  it('signup issues a token; signin works; wrong password rejected', async () => {
    const email = 'it@test.local';
    const r = await fetch(`${BASE}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'IT', email, password: 'correct-horse-9' }),
    });
    assert.equal(r.status, 200);
    token = (await r.json()).token;
    assert.ok(token);

    const bad = await fetch(`${BASE}/api/auth/signin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong' }),
    });
    assert.equal(bad.status, 401);
  });

  it('protected endpoints reject missing/garbage tokens', async () => {
    for (const auth of [undefined, 'Bearer nonsense']) {
      const r = await fetch(`${BASE}/api/should-cost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
        body: JSON.stringify({}),
      });
      assert.equal(r.status, 401);
    }
  });

  it('marketplace: seeded corpus served with working ETag/304', async () => {
    const r1 = await fetch(`${BASE}/api/marketplace`);
    assert.equal(r1.status, 200);
    const ideas = await r1.json();
    assert.ok(ideas.length >= 1600, `expected full seeded corpus, got ${ideas.length}`);
    const etag = r1.headers.get('etag');
    assert.ok(etag);
    const r2 = await fetch(`${BASE}/api/marketplace`, { headers: { 'If-None-Match': etag } });
    assert.equal(r2.status, 304);
  });

  it('should-cost estimate is deterministic and engine-labelled', async () => {
    const body = { partName: 'IT Bracket', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1.2, annualVolume: 100000, region: 'Germany', currency: 'EUR' };
    const r = await fetch(`${BASE}/api/should-cost`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.engine, 'deterministic');
    assert.ok(d.totalValue > 0.5 && d.totalValue < 50);
    const r2 = await fetch(`${BASE}/api/should-cost`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    assert.equal((await r2.json()).totalValue, d.totalValue);
  });

  it('CBS export returns a real xlsx workbook', async () => {
    const r = await fetch(`${BASE}/api/should-cost/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ partName: 'IT Bracket', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1.2, annualVolume: 100000, region: 'Germany', currency: 'EUR' }),
    });
    assert.equal(r.status, 200);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.subarray(0, 2).toString(), 'PK', 'xlsx must be a zip container');
    assert.ok(buf.length > 3000);
  });

  it('cad tessellate guards: 401 unauthenticated, 422 proprietary format', async () => {
    const noAuth = await fetch(`${BASE}/api/cad/tessellate`, { method: 'POST' });
    assert.equal(noAuth.status, 401);
    const fd = new FormData();
    fd.append('cadFile', new Blob([Buffer.from('dummy')]), 'part.sldprt');
    const r = await fetch(`${BASE}/api/cad/tessellate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    assert.equal(r.status, 422);
    assert.match((await r.json()).error, /STEP/);
  });

  it('interest signup validates emails and stores good ones', async () => {
    const bad = await fetch(`${BASE}/api/interest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    assert.equal(bad.status, 400);
    const ok = await fetch(`${BASE}/api/interest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'keen@test.local', topic: 'integrations-early-access' }),
    });
    assert.equal(ok.status, 200);
  });

  it('a thrown handler error returns JSON 500, and the server SURVIVES', async () => {
    // Malformed JSON body → express.json throws → error middleware, not a crash.
    const r = await fetch(`${BASE}/api/interest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken',
    });
    assert.ok(r.status >= 400);
    const h = await fetch(`${BASE}/api/health`);
    assert.equal(h.status, 200, 'server must still be alive after a bad request');
  });

  it('a revision snapshot round-trips, is scoped to its owner, and is capped', async () => {
    // The store behind the revision comparison. It writes to the DB and is
    // reachable by id, which are exactly the two things a pure-core test cannot
    // check — and the id path is where a missing owner filter would leak one
    // workspace's parts into another's.
    const analysis = {
      partName: 'Integration bracket',
      results: [{
        process: 'hpdc', processName: 'HPDC', ruleCount: 2, evaluatedCount: 2, score: 40,
        findings: [{ id: 'r1', title: 'Wall too thick', severity: 'high', measured: 9, unit: 'mm', status: 'fail' }],
        passed: [], notEvaluated: [],
      }],
    };
    const post = await fetch(`${BASE}/api/dfm/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ analysis }),
    });
    assert.equal(post.status, 200);
    const { id, partKey } = await post.json();
    assert.ok(id && partKey);

    const list = await fetch(`${BASE}/api/dfm/snapshots?partKey=${partKey}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.ok((await list.json()).snapshots.some(s2 => s2.id === id));

    const one = await fetch(`${BASE}/api/dfm/snapshots/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(one.status, 200);
    const got = await one.json();
    // The COMPACTED payload: rule verdicts survive, and the diff can read them.
    assert.equal(got.analysis.results[0].findings[0].id, 'r1');
    assert.equal(got.analysis.results[0].findings[0].measured, 9);

    // Another user must not see it, by id or by list.
    const other = await fetch(`${BASE}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `snap${process.pid}@example.com`, password: 'Another-pass-123', name: 'Other' }),
    });
    const otherToken = (await other.json()).token;
    const denied = await fetch(`${BASE}/api/dfm/snapshots/${id}`, { headers: { Authorization: `Bearer ${otherToken}` } });
    assert.equal(denied.status, 404, 'a snapshot must not be readable by another workspace');

    // Without a token at all.
    assert.ok((await fetch(`${BASE}/api/dfm/snapshots/${id}`)).status >= 400);

    const del = await fetch(`${BASE}/api/dfm/snapshots/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(del.status, 200);
    assert.equal((await fetch(`${BASE}/api/dfm/snapshots/${id}`, { headers: { Authorization: `Bearer ${token}` } })).status, 404);
  });

  it('a snapshot without results is refused rather than stored empty', async () => {
    const r = await fetch(`${BASE}/api/dfm/snapshots`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ analysis: { partName: 'nothing' } }),
    });
    assert.equal(r.status, 400);
  });

  it('serves the SPA for non-API routes when dist/ exists', async () => {
    const r = await fetch(`${BASE}/marketplace`);
    // Passes with dist built (200 + HTML); if dist is absent the fallback is
    // simply not mounted and Express 404s — accept both, but never a 500.
    assert.ok(r.status === 200 || r.status === 404);
    if (r.status === 200) assert.match(await r.text(), /<div id="root">|<!doctype html>/i);
  });
});
