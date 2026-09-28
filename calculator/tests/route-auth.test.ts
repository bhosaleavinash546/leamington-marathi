/**
 * Every route that holds or spends anything requires a signed-in user.
 *
 * Eleven route files used to have no check at all. With no credentials you
 * could create and list supplier quotes, and read, add and delete every user's
 * saved scenarios. This boots the real server and asks each route with no
 * token, then checks that the few routes that are public on purpose still are,
 * and that one user cannot reach another's scenarios.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { seedUser } from './helpers/seed-user.js';

const ROOT = join(__dirname, '..');
const SECRET = 'route-auth-secret-' + Math.random().toString(36).slice(2);
const PORT = 4100 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let dir = '', srv: ChildProcess | null = null;
const tokenFor = (userId: string) =>
  jwt.sign({ userId, email: `${userId}@test`, emailVerified: true }, SECRET, { expiresIn: '5m' });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cv-auth-'));
  writeFileSync(join(dir, '.env'), `JWT_SECRET=${SECRET}\nPORT=${PORT}\nAIR_GAPPED=1\n`);
  const env: NodeJS.ProcessEnv = { ...process.env, CV_DATA_DIR: dir, NODE_ENV: 'development' };
  delete env.JWT_SECRET; delete env.PORT; delete env.TEAM_API_KEY; delete env.HOST;
  srv = spawn(join(ROOT, 'node_modules/.bin/tsx'), [join(ROOT, 'server/index.ts')], { cwd: dir, env, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) { for (const u of ['alice', 'bob', 'carol', 'dave']) seedUser(dir, u); return; }
    } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}, 60_000);
afterAll(() => { srv?.kill(); rmSync(dir, { recursive: true, force: true }); });

const call = (method: string, path: string, token?: string, body?: unknown) =>
  fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const PROTECTED: Array<[string, string, unknown?]> = [
  ['GET', '/api/quotes'], ['POST', '/api/quotes', { scenario_id: 's', supplier_name: 'x', unit_price: 1 }],
  ['GET', '/api/bom/s1'], ['POST', '/api/rfq', {}],
  ['GET', '/api/pcb/countries'], ['POST', '/api/pcb/live-pricing', { partNumbers: ['X'] }],
  ['POST', '/api/aichat', { message: 'hi' }], ['POST', '/api/agent/chat', { message: 'hi' }],
  ['GET', '/api/sync/scenarios'], ['POST', '/api/sync/scenarios', { id: 'a', name: 'a' }],
  ['DELETE', '/api/sync/scenarios/a'], ['GET', '/api/sync/library'], ['PUT', '/api/sync/library', { library: {} }],
  ['GET', '/api/news'], ['POST', '/api/news/refresh'], ['GET', '/api/commodities'],
  ['GET', '/api/prices/status'], ['POST', '/api/prices/refresh'],
  ['POST', '/api/dfm/analyze', {}], ['GET', '/api/telemetry/recent'],
];

describe('no token, no data', () => {
  it.each(PROTECTED)('%s %s refuses an anonymous caller', async (method, path, body) => {
    expect((await call(method, path, undefined, body)).status).toBe(401);
  });
});

describe('the routes that are public on purpose still are', () => {
  it('health', async () => { expect((await call('GET', '/api/health')).status).toBe(200); });
  it('posting a client error report (sendBeacon cannot carry a token)', async () => {
    expect((await call('POST', '/api/telemetry/error', undefined, { message: 'x', url: '/', stack: '' })).status).not.toBe(401);
  });
  it('opening a share link', async () => {
    expect((await call('GET', '/api/share/does-not-exist')).status).not.toBe(401);
  });
  it('signing in', async () => {
    // A wrong password is itself a 401, so the check is on WHY it was refused:
    // the route must be reachable, answering about the credentials rather than
    // with the sign-in guard's "Authentication required".
    const r = await call('POST', '/api/auth/signin', undefined, { email: 'a@b.c', password: 'x' });
    const body = await r.json() as { error?: string };
    expect(body.error ?? '').not.toBe('Authentication required');
  });
});

describe('a scenario belongs to the user who saved it', () => {
  const alice = tokenFor('alice'), bob = tokenFor('bob');

  it('is listed for its owner and not for anyone else', async () => {
    expect((await call('POST', '/api/sync/scenarios', alice, { id: 'sc-alice', name: 'Bracket quote', result: { total: 9.34 } })).status).toBe(200);
    const mine = await (await call('GET', '/api/sync/scenarios', alice)).json() as { scenarios: { id: string }[] };
    const theirs = await (await call('GET', '/api/sync/scenarios', bob)).json() as { scenarios: { id: string }[] };
    expect(mine.scenarios.map(s => s.id)).toContain('sc-alice');
    expect(theirs.scenarios.map(s => s.id)).not.toContain('sc-alice');
  });

  it('cannot be overwritten by someone who knows its id', async () => {
    expect((await call('POST', '/api/sync/scenarios', bob, { id: 'sc-alice', name: 'Hijacked' })).status).toBe(409);
    const mine = await (await call('GET', '/api/sync/scenarios', alice)).json() as { scenarios: { id: string; name: string }[] };
    expect(mine.scenarios.find(s => s.id === 'sc-alice')!.name).toBe('Bracket quote');
  });

  it('cannot be deleted by someone else', async () => {
    await call('DELETE', '/api/sync/scenarios/sc-alice', bob);
    const mine = await (await call('GET', '/api/sync/scenarios', alice)).json() as { scenarios: { id: string }[] };
    expect(mine.scenarios.map(s => s.id)).toContain('sc-alice');
  });

  it('records who changed the shared library from the session, not the request body', async () => {
    await call('PUT', '/api/sync/library', alice, { library: { v: 1 }, updatedBy: 'someone-else' });
    const lib = await (await call('GET', '/api/sync/library', bob)).json() as { updatedBy: string };
    expect(lib.updatedBy).toBe('alice@test');
  });
});

// M4: a signature alone used to be enough for seven days.
describe('a session ends when the account does', () => {
  const sql = (q: string, ...args: unknown[]) => {
    const db = new Database(join(dir, 'should-cost.db'));
    try { db.prepare(q).run(...args); } finally { db.close(); }
  };

  it('refuses a validly signed token for a user who never existed', async () => {
    const r = await call('GET', '/api/quotes', tokenFor('nobody'));
    expect(r.status).toBe(401);
  });

  it('refuses a deleted user at once, not after the token expires', async () => {
    const t = tokenFor('carol');
    expect((await call('GET', '/api/quotes', t)).status).toBe(200);
    sql('DELETE FROM users WHERE id = ?', 'carol');
    expect((await call('GET', '/api/quotes', t)).status).toBe(401);
  });

  it('takes the email from the account, not from the token', async () => {
    const forged = jwt.sign({ userId: 'alice', email: 'ceo@elsewhere', emailVerified: true }, SECRET, { expiresIn: '5m' });
    await call('PUT', '/api/sync/library', forged, { library: { v: 2 } });
    const lib = await (await call('GET', '/api/sync/library', forged)).json() as { updatedBy: string };
    expect(lib.updatedBy).toBe('alice@test');
  });

  it('"sign out everywhere" ends every session that user has, and only theirs', async () => {
    // iat is in whole seconds: sign a token that is clearly older than the revocation.
    const old = jwt.sign({ userId: 'dave', email: 'dave@test', emailVerified: true, iat: Math.floor(Date.now() / 1000) - 60 }, SECRET, { expiresIn: '5m' });
    const other = tokenFor('bob');
    expect((await call('POST', '/api/auth/signout-all', old)).status).toBe(200);
    expect((await call('GET', '/api/quotes', old)).status).toBe(401);
    expect((await call('GET', '/api/quotes', other)).status).toBe(200);
    // Signing in again afterwards works: a new token is not revoked.
    await new Promise(r => setTimeout(r, 1100));
    expect((await call('GET', '/api/quotes', tokenFor('dave'))).status).toBe(200);
  });
});
