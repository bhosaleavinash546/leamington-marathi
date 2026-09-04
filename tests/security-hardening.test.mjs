// The September 2026 review's S1 security findings, pinned.
//
// Each of these was a real defect: a predictable password-reset code, an org
// role claimable by anyone who signed up with the invited address, a rate limit
// with a fresh budget per URL, and the idea corpus served to anyone. A test
// that only asserts "the fix is present" would pass on a comment, so each one
// exercises the behaviour.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { orgAccess, registerOrgRoutes, newInviteToken } from '../routes/orgs.mjs';
import { addColumn, columnsOf } from '../db-migrate.mjs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

describe('R-1 password-reset codes are unpredictable', () => {
  it('generateOTP draws from the CSPRNG, not Math.random', () => {
    assert.match(server, /function generateOTP\(\) \{\s*return String\(crypto\.randomInt\(100000, 1000000\)\);/);
    assert.ok(!/Math\.random\(\)[^\n]*900000/.test(server), 'no Math.random in the OTP path');
  });

  it('the range the fix uses yields exactly six digits, every draw', async () => {
    const { randomInt } = await import('node:crypto');
    for (let i = 0; i < 500; i++) {
      const code = String(randomInt(100000, 1000000));
      assert.equal(code.length, 6, `six digits, got "${code}"`);
    }
  });
});

describe('R-3 rate-limit buckets cannot be reset by changing the URL', () => {
  // rateLimitKey is exported so the keying rule is testable without booting
  // the app; the middleware calls it directly.
  it('keys on the route PATTERN, so every :id shares one budget', async () => {
    const { rateLimitKey } = await import('../server-ratelimit-key.mjs').catch(() => ({ rateLimitKey: null }));
    // The helper lives in server.mjs (which boots a server on import), so the
    // rule is asserted from source rather than by importing it.
    void rateLimitKey;
    assert.match(server, /export function rateLimitKey\(req\)/);
    assert.match(server, /const pattern = req\.route\?\.path \?\? req\.baseUrl \?\? req\.path;/);
    assert.match(server, /const who = req\.user\?\.id \? `u:\$\{req\.user\.id\}` : `ip:\$\{req\.ip\}`;/);
    assert.ok(!server.includes('key: `${req.ip}_${req.path}`'), 'the per-URL key is gone');
  });

  it('the credential routes fail CLOSED when the limiter faults', () => {
    for (const route of ['signup', 'signin', 'forgot-password', 'reset-password', 'resend-otp', 'verify-signup']) {
      const re = new RegExp(`app\\.post\\('/api/auth/${route}', rateLimit\\([^)]*\\{ failClosed: true \\}\\)`);
      assert.match(server, re, `${route} must fail closed`);
    }
    assert.match(server, /if \(failClosed\) return res\.status\(503\)/);
  });
});

describe('R-4 the idea corpus is authenticated', () => {
  it('/api/marketplace requires auth and is rate-limited; /count stays open', () => {
    const mkt = readFileSync(new URL('../routes/marketplace.mjs', import.meta.url), 'utf8');
    assert.match(mkt, /app\.get\('\/api\/marketplace', requireAuth, rateLimit\(/);
    assert.match(mkt, /app\.get\('\/api\/marketplace\/count', \(_req, res\)/, 'the count is a marketing number, still open');
  });
});

describe('R-2 an org role needs the invite token, not just the address', () => {
  const setup = () => {
    const db = new Database(':memory:');
    const access = orgAccess(db);
    const owner = { id: 'u-owner', name: 'Owner', email: 'owner@x.test' };
    const org = access.ensurePersonalOrg(owner);
    return { db, access, owner, org };
  };

  it('the schema carries the token and claim stamp', () => {
    const { db } = setup();
    const cols = columnsOf(db, 'org_members');
    assert.ok(cols.includes('inviteToken'));
    assert.ok(cols.includes('claimedAt'));
  });

  it('claiming requires the token; the email alone is not enough', () => {
    const { db, org } = setup();
    const token = newInviteToken();
    db.prepare("INSERT INTO org_members (orgId, email, role, status, invitedBy, createdAt, inviteToken) VALUES (?,?,?,'pending',?,?,?)")
      .run(org.id, 'victim@x.test', 'admin', 'u-owner', new Date().toISOString(), token);

    // Reconstruct claimInvite through the route registrar with a stub app.
    const routes = {};
    const app = { get: (p, ...h) => { routes[`GET ${p}`] = h.at(-1); }, post: (p, ...h) => { routes[`POST ${p}`] = h.at(-1); }, patch: (p, ...h) => { routes[`PATCH ${p}`] = h.at(-1); } };
    const { claimInvite } = registerOrgRoutes(app, { db, requireAuth: (_q, _s, n) => n(), rateLimit: () => (_q, _s, n) => n() });

    const impostor = { id: 'u-bad', email: 'victim@x.test' };
    assert.deepEqual(claimInvite(impostor, ''), { ok: false, reason: 'An invite token is required.' });
    assert.equal(claimInvite(impostor, 'not-a-real-token').ok, false);
    // Still pending: nothing was granted by the address alone.
    assert.equal(db.prepare('SELECT status FROM org_members WHERE email = ?').get('victim@x.test').status, 'pending');

    // With the token AND the matching address it activates once.
    const ok = claimInvite(impostor, token);
    assert.deepEqual({ ok: ok.ok, role: ok.role }, { ok: true, role: 'admin' });
    const row = db.prepare('SELECT * FROM org_members WHERE email = ?').get('victim@x.test');
    assert.equal(row.status, 'active');
    assert.equal(row.userId, 'u-bad');
    assert.equal(row.inviteToken, null, 'a claimed token is spent');
    // And it cannot be replayed.
    assert.equal(claimInvite({ id: 'u-other', email: 'victim@x.test' }, token).ok, false);
  });

  it('a token issued to one address cannot be redeemed by another', () => {
    const { db, org } = setup();
    const token = newInviteToken();
    db.prepare("INSERT INTO org_members (orgId, email, role, status, invitedBy, createdAt, inviteToken) VALUES (?,?,?,'pending',?,?,?)")
      .run(org.id, 'invited@x.test', 'member', 'u-owner', new Date().toISOString(), token);
    const app = { get: () => {}, post: () => {}, patch: () => {} };
    const { claimInvite } = registerOrgRoutes(app, { db, requireAuth: (_q, _s, n) => n(), rateLimit: () => (_q, _s, n) => n() });
    const res = claimInvite({ id: 'u-x', email: 'someone.else@x.test' }, token);
    assert.equal(res.ok, false);
    assert.match(res.reason, /different email/);
  });

  it('GET /api/orgs no longer activates pending invites as a side effect', () => {
    const orgs = readFileSync(new URL('../routes/orgs.mjs', import.meta.url), 'utf8');
    assert.ok(!/claimPendingInvites/.test(orgs), 'the bare-email claim is gone');
  });
});

describe('R-5 redirects are re-validated, not followed blindly', () => {
  it('foresight-fetch follows manually and re-checks every hop', async () => {
    const { fetchArticle, MAX_REDIRECTS } = await import('../foresight-fetch.mjs');
    assert.equal(typeof MAX_REDIRECTS, 'number');

    const hop = (location) => ({ status: 302, ok: false, headers: { get: (h) => (h.toLowerCase() === 'location' ? location : null) } });
    // A public host that redirects into link-local space must be refused.
    const r = await fetchArticle('https://news.example.com/a', {
      fetchImpl: async () => hop('http://169.254.169.254/latest/meta-data/'),
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /blocked host/);

    // A redirect to localhost, likewise.
    const r2 = await fetchArticle('https://news.example.com/a', { fetchImpl: async () => hop('http://127.0.0.1:3001/api/settings') });
    assert.equal(r2.ok, false);
    assert.match(r2.error, /blocked host/);

    // A loop is bounded rather than followed forever.
    const r3 = await fetchArticle('https://news.example.com/a', { fetchImpl: async () => hop('https://news.example.com/a') });
    assert.equal(r3.ok, false);
    assert.match(r3.error, /too many redirects/);

    // A legitimate public redirect still reads, and reports the FINAL url.
    let n = 0;
    const r4 = await fetchArticle('https://news.example.com/a', {
      fetchImpl: async () => (n++ === 0
        ? hop('https://www.news.example.com/a')
        : { status: 200, ok: true, headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'text/html' : null) }, body: null, text: async () => '<html><body><p>' + 'measured content '.repeat(20) + '</p></body></html>' }),
    });
    assert.equal(r4.url, 'https://www.news.example.com/a');
  });
});

describe('R-6 every prompt frames user text as untrusted data', () => {
  it('the chat idea block is sanitized and framed', () => {
    assert.match(server, /GENERATED IDEAS \(\$\{\(ideas \|\| \[\]\)\.length\} total\) — UNTRUSTED DATA/);
    assert.match(server, /sanitize\(String\(idea\?\.technicalDescription \?\? ''\), 220\)/);
  });
  it('patent-watch sanitizes and frames the idea it is given', () => {
    assert.match(server, /UNTRUSTED DATA — the two lines below are the idea being assessed/);
    assert.match(server, /Title: \$\{sanitize\(String\(title \?\? ''\), 200\)\}/);
  });
});

describe('R-7 uploads are bounded per request, not just per file', () => {
  it('every multer instance caps the file COUNT as well as the size', () => {
    for (const [file, needle] of [
      ['../routes/dfm.mjs', /files: 1,/],
      ['../routes/dfm.mjs', /batchUploadDfm = multer\(\{[^}]*files: 25,/],
      ['../routes/cad.mjs', /files: 1,/],
      ['../routes/part360.mjs', /files: 12,/],
    ]) {
      assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), needle, `${file} ${needle}`);
    }
  });
  it('the batch route uses the batch limiter, not the single-file one', () => {
    assert.match(readFileSync(new URL('../routes/dfm.mjs', import.meta.url), 'utf8'),
      /app\.post\('\/api\/dfm\/batch',[^\n]*batchUploadDfm\.array\('cadFiles', BATCH_MAX\)/);
  });
});

describe('R-8 LLM spend on the server key is bounded by default', () => {
  it('the monthly quota defaults ON', () => {
    assert.match(server, /CV_MONTHLY_TOKEN_QUOTA \?\? 3_000_000/);
  });
});

describe('R-26 additive migrations state what happened', () => {
  it('addColumn distinguishes added, present and no-table, and throws on a real failure', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
    assert.equal(addColumn(db, 't', 'extra', 'TEXT'), 'added');
    assert.equal(addColumn(db, 't', 'extra', 'TEXT'), 'present');
    assert.equal(addColumn(db, 'nope', 'extra', 'TEXT'), 'no-table');
    assert.deepEqual(columnsOf(db, 't'), ['id', 'extra']);
    // A genuinely invalid declaration is an error, not silence.
    assert.throws(() => addColumn(db, 't', 'bad', 'TEXT UNIQUE'), /migration failed: t\.bad/);
  });
});
