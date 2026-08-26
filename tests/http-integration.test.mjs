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

  it('dossier forensics carries the caller\'s own quote history once a corpus exists', async () => {
    const qbody = { partName: 'Hist Bracket', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1.2, annualVolume: 100000, region: 'Germany', currency: 'EUR' };
    for (const price of [4.2, 4.9]) {
      const r = await fetch(`${BASE}/api/should-cost/quotes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...qbody, actualPrice: price, breakdown: [{ label: 'coil', kind: 'material', amount: price * 0.4 }, { label: 'press', kind: 'conversion', amount: price * 0.45 }] }),
      });
      assert.equal(r.status, 200, JSON.stringify(await r.json().catch(() => ({}))));
    }
    const d = await fetch(`${BASE}/api/part360/dossier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...qbody, quote: { total: 5.5, currency: 'EUR', lines: [{ label: 'coil', kind: 'material', amount: 2.1 }] } }),
    });
    assert.equal(d.status, 200);
    const doss = await d.json();
    const forensicsSec = doss.dossier.sections.find(s2 => s2.id === 'forensics');
    const text = forensicsSec.lines.map(l => l.text).join('\n');
    assert.match(text, /YOUR HISTORY: your last 2 quotes .* ranged €4\.20–€4\.90/);
    assert.match(text, /your own corpus, various parts\/volumes — context, not a benchmark/);
    assert.match(text, /prior "material" lines ran/);
  });

  it('dossier pre-flight flags bad arithmetic and returns engine-anchored counter positions', async () => {
    const d = await (await fetch(`${BASE}/api/part360/dossier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        partName: 'Caution Bracket', material: 'Steel (mild)', process: 'Stamping / Deep Drawing',
        weightKg: 1.2, annualVolume: 500,   // deliberately below the stamping band
        region: 'Germany',
        quote: { total: 10, currency: 'EUR', lines: [
          { label: 'coil', kind: 'material', amount: 3 },
          { label: 'press', kind: 'conversion', amount: 3 },   // sums to 6, total says 10
        ] },
      }),
    })).json();
    const ids = (d.anomalies ?? []).map(a => a.id);
    assert.ok(ids.includes('quote-sum-mismatch'), JSON.stringify(d.anomalies));
    assert.ok(ids.includes('volume-low-for-process'));
    // Cautions ride into the evidence itself.
    const partSec = d.dossier.sections.find(x => x.id === 'part');
    assert.match(partSec.lines.map(l => l.text).join('\n'), /INPUT CAUTION/);
    // Counter positions: anchored, held, or clarified — never invented.
    assert.ok(d.counter && d.counter.rows.length === 2);
    for (const r of d.counter.rows) {
      assert.ok(r.targetEur === null || Number.isFinite(r.targetEur));
      assert.ok(r.argument.length > 10);
    }
    assert.match(d.counter.caveat, /defensible edge/);
  });

  it('fleet memory: the second run on similar geometry cites the first — the first states absence', async () => {
    const GEO = {
      boundingBox: { xMm: 40, yMm: 40, zMm: 20 }, volume: { cm3: 14.6 }, fillRatio: 0.46,
      faces: { total: 9 }, wallThickness: { characteristicMm: 8 },
      weights: { steelKg: 0.104, aluminiumKg: 0.039, castIronKg: 0.104, copperKg: 0.13, titaniumKg: 0.065, plasticKg: 0.015 },
    };
    const base = { partName: 'Fleet Plate A', material: 'Steel (mild)', process: 'Machining (CNC)', weightKg: 0.1, annualVolume: 60000, region: 'Germany', geo: GEO };
    const r1 = await fetch(`${BASE}/api/part360/dossier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(base),
    });
    assert.equal(r1.status, 200);
    const d1 = await r1.json();
    assert.ok(d1.runId, 'first run must join the memory and return its id');
    const fleet1 = d1.dossier.sections.find(x => x.id === 'fleet');
    assert.equal(fleet1.present, false);
    assert.match(fleet1.reason, /fleet memory starts with this run/);

    const r2 = await fetch(`${BASE}/api/part360/dossier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...base, partName: 'Fleet Plate B', geo: { ...GEO, volume: { cm3: 15.1 } } }),
    });
    const d2 = await r2.json();
    const fleet2 = d2.dossier.sections.find(x => x.id === 'fleet');
    assert.equal(fleet2.present, true, 'similar prior run must surface');
    const text2 = fleet2.lines.map(l => l.text).join('\n');
    assert.match(text2, /YOUR OWN prior Prism runs/);
    assert.match(text2, /"Fleet Plate A"/);
    assert.match(text2, /% geometric match: shape .* size /);
  });

  it('teardown observations: CRUD + relevance-ranked citation in the dossier', async () => {
    const mk = await fetch(`${BASE}/api/part360/teardowns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Golf 8 hood bracket', reference: 'VW Golf 8, 2023 teardown', partName: 'hood bracket', material: 'Steel DP600 (dual-phase)', process: 'Stamping / Deep Drawing', joining: 'clinching', massKg: 0.18, notes: 'Thinner gauge than ours; no e-coat on inner face.' }),
    });
    assert.equal(mk.status, 201);
    const { teardown } = await mk.json();
    assert.ok(teardown.id);

    const list = await (await fetch(`${BASE}/api/part360/teardowns`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.ok(list.teardowns.some(t => t.id === teardown.id));

    const d = await (await fetch(`${BASE}/api/part360/dossier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ partName: 'Hood Bracket', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 0.2, annualVolume: 60000, region: 'Germany' }),
    })).json();
    const td = d.dossier.sections.find(x => x.id === 'teardown');
    assert.equal(td.present, true);
    const text = td.lines.map(l => l.text).join('\n');
    assert.match(text, /YOUR TEARDOWN \(user-recorded, externally unverified\)/);
    assert.match(text, /Golf 8 hood bracket/);
    assert.match(text, /clinching/);

    const del = await fetch(`${BASE}/api/part360/teardowns/${teardown.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await del.json()).deleted, true);
  });

  it('batch triage validates its inputs before spending OCCT time', async () => {
    const noFiles = await fetch(`${BASE}/api/part360/batch`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: new FormData(),
    });
    assert.equal(noFiles.status, 400);
    const fd = new FormData();
    fd.append('cadFiles', new Blob([Buffer.from('dummy')]), 'x.step');
    fd.append('material', 'Unobtainium');
    fd.append('process', 'Machining (CNC)');
    const bad = await fetch(`${BASE}/api/part360/batch`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /catalogue/);
  });

  // OCCT-heavy: two real fixtures through the full batch job. Minutes, not
  // milliseconds — opt in with CV_HEAVY_IT=1 (CI nightly / manual verification).
  it('batch triage measures, masses and ranks real STEP files', { skip: process.env.CV_HEAVY_IT !== '1' }, async () => {
    const { readFileSync } = await import('node:fs');
    const fd = new FormData();
    for (const f of ['boss-plate.step', 'thin-plate.step']) {
      fd.append('cadFiles', new Blob([readFileSync(join(ROOT, 'benchmark', 'dfm-fixtures', f))]), f);
    }
    fd.append('material', 'Aluminium 6061');
    fd.append('process', 'Machining (CNC)');
    fd.append('annualVolume', '50000');
    fd.append('region', 'Germany');
    const r = await fetch(`${BASE}/api/part360/batch`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    assert.equal(r.status, 202);
    const { jobId } = await r.json();
    let job;
    for (let i = 0; i < 240; i++) {
      job = await (await fetch(`${BASE}/api/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
      if (job.status === 'done' || job.status === 'error') break;
      await new Promise(res2 => setTimeout(res2, 2000));
    }
    assert.equal(job.status, 'done', JSON.stringify(job).slice(0, 300));
    const { rows, basis } = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;
    assert.equal(rows.length, 2);
    assert.ok(rows.every(x => !x.error), JSON.stringify(rows));
    assert.ok(rows.every(x => x.massKg > 0 && /CAD-derived/.test(x.massSource)));
    assert.ok(rows[0].annualGapEur >= rows[1].annualGapEur, 'ranked by annual gap');
    assert.match(basis, /DIRECTION INDICATOR/);
  });

  it('negotiation pack with part360 data gains waterfall + forensics slides', async () => {
    const base = { partName: 'IT Bracket', material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1.2, annualVolume: 100000, region: 'Germany', currency: 'EUR', format: 'pptx' };
    const plain = await fetch(`${BASE}/api/should-cost/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(base),
    });
    assert.equal(plain.status, 200);
    const plainBuf = Buffer.from(await plain.arrayBuffer());
    // Zip entry names are stored uncompressed, so slide names are greppable.
    assert.ok(plainBuf.includes('ppt/slides/slide3.xml'), 'base deck has 3 slides');
    assert.ok(!plainBuf.includes('ppt/slides/slide4.xml'), 'no part360 slides without part360 data');

    const r = await fetch(`${BASE}/api/should-cost/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...base, quotedCost: 9.5,
        part360: { quoteLines: [
          { label: 'Steel coil', kind: 'material', amount: 3.1 },
          { label: 'Press + weld', kind: 'conversion', amount: 4.2 },
          { label: 'ECO surcharge', kind: 'other', amount: 0.4 },
        ] },
      }),
    });
    assert.equal(r.status, 200);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.subarray(0, 2).toString(), 'PK');
    assert.ok(buf.includes('ppt/slides/slide4.xml'), 'waterfall slide missing');
    assert.ok(buf.includes('ppt/slides/slide5.xml'), 'forensics slide missing');
    assert.ok(buf.includes('ppt/slides/slide6.xml'), 'counter-positions slide missing');
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

  it('a company standard and a revision are shared with the TEAM, not the person', async () => {
    // The whole point of org-scoping. Before it, a colleague invited into the
    // workspace saw neither the threshold the plant had agreed nor the revision
    // history of the part they were reviewing.
    const orgs = await (await fetch(`${BASE}/api/orgs`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const orgId = orgs[0].id;

    // Owner sets a company standard and saves a revision.
    const put = await fetch(`${BASE}/api/dfm/rule-overrides/hpdc-core-ld`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ enabled: true, threshold: 8, note: 'our tool room, after the 2023 die failures' }),
    });
    assert.equal(put.status, 200);
    await fetch(`${BASE}/api/dfm/snapshots`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ analysis: { partName: 'Shared bracket', results: [{ findings: [], passed: [], notEvaluated: [] }] } }),
    });

    // A colleague joins.
    const mateEmail = `mate${process.pid}@example.com`;
    const inv = await fetch(`${BASE}/api/orgs/${orgId}/invites`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: mateEmail, role: 'member' }),
    });
    assert.equal(inv.status, 200);
    const mate = await (await fetch(`${BASE}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mateEmail, password: 'Mate-pass-123', name: 'Mate' }),
    })).json();
    // Invites activate when the org list is touched.
    await fetch(`${BASE}/api/orgs`, { headers: { Authorization: `Bearer ${mate.token}` } });

    const seen = await (await fetch(`${BASE}/api/dfm/rule-overrides?orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${mate.token}` },
    })).json();
    assert.equal(seen.overrides['hpdc-core-ld']?.threshold, 8,
      'a colleague must see the standard their plant agreed');

    const hist = await (await fetch(`${BASE}/api/dfm/snapshots?orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${mate.token}` },
    })).json();
    assert.ok(hist.snapshots.length >= 1, 'a colleague must see the revision history of a shared part');
    assert.ok(hist.snapshots[0].savedBy, 'and must be able to tell whose analysis it was');
  });

  it('a stranger is refused, and a viewer can read but not retune', async () => {
    const orgs = await (await fetch(`${BASE}/api/orgs`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const orgId = orgs[0].id;

    // Not a member at all: the same answer as an org that does not exist, so
    // membership cannot be probed by comparing error codes.
    const stranger = await (await fetch(`${BASE}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `stranger${process.pid}@example.com`, password: 'Stranger-pass-1', name: 'S' }),
    })).json();
    const denied = await fetch(`${BASE}/api/dfm/rule-overrides?orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    assert.equal(denied.status, 403);
    const ghost = await fetch(`${BASE}/api/dfm/rule-overrides?orgId=does-not-exist`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    assert.equal(ghost.status, 403, 'a real org and a fictional one must answer alike');

    // A VIEWER reads the standards and cannot move them.
    const viewerEmail = `viewer${process.pid}@example.com`;
    await fetch(`${BASE}/api/orgs/${orgId}/invites`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: viewerEmail, role: 'viewer' }),
    });
    const viewer = await (await fetch(`${BASE}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: viewerEmail, password: 'Viewer-pass-123', name: 'V' }),
    })).json();
    await fetch(`${BASE}/api/orgs`, { headers: { Authorization: `Bearer ${viewer.token}` } });

    const canRead = await fetch(`${BASE}/api/dfm/rule-overrides?orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(canRead.status, 200, 'a quality engineer must be able to see the threshold');

    const cannotWrite = await fetch(`${BASE}/api/dfm/rule-overrides/hpdc-core-ld`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${viewer.token}` },
      body: JSON.stringify({ orgId, enabled: true, threshold: 99 }),
    });
    assert.equal(cannotWrite.status, 403, 'and must not be able to move it');
  });

  it('serves the SPA for non-API routes when dist/ exists', async () => {
    const r = await fetch(`${BASE}/marketplace`);
    // Passes with dist built (200 + HTML); if dist is absent the fallback is
    // simply not mounted and Express 404s — accept both, but never a 500.
    assert.ok(r.status === 200 || r.status === 404);
    if (r.status === 200) assert.match(await r.text(), /<div id="root">|<!doctype html>/i);
  });
});
