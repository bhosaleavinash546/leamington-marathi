/**
 * The settings in `.env` must be loaded before any module reads them.
 *
 * They weren't. ES modules evaluate every import before the importing file's
 * body, so `config()` in the middle of server/index.ts ran after the auth
 * middleware had already read JWT_SECRET, found nothing and fallen back to the
 * default printed in its own source. The banner, reading the env afterwards,
 * said "configured". On a native start (make start, npm run server) anyone who
 * had read the source could sign a session as any user.
 *
 * This boots the real server from a folder whose ONLY copy of the secret is a
 * `.env` file, with JWT_SECRET removed from the environment, and checks the
 * thing that matters: a token signed with that secret is accepted and one
 * signed with the public default is refused.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import jwt from 'jsonwebtoken';

const ROOT = join(__dirname, '..');
const SECRET = 'env-file-only-secret-' + Math.random().toString(36).slice(2);
const DEFAULT = 'should-cost-dev-secret-DO-NOT-USE-IN-PRODUCTION';
const PORT = 3900 + Math.floor(Math.random() * 90);
let dir = '', srv: ChildProcess | null = null;

const sign = (secret: string) =>
  jwt.sign({ userId: 'someone', email: 'someone@test', emailVerified: true }, secret, { expiresIn: '5m' });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cv-env-'));
  writeFileSync(join(dir, '.env'), `JWT_SECRET=${SECRET}\nPORT=${PORT}\n`);
  const env: NodeJS.ProcessEnv = { ...process.env, CV_DATA_DIR: dir, NODE_ENV: 'development' };
  delete env.JWT_SECRET; delete env.PORT;
  srv = spawn(join(ROOT, 'node_modules/.bin/tsx'), [join(ROOT, 'server/index.ts')], { cwd: dir, env, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}, 60_000);

afterAll(() => { srv?.kill(); rmSync(dir, { recursive: true, force: true }); });

const me = async (token: string) =>
  (await fetch(`http://127.0.0.1:${PORT}/api/projects`, { headers: { Authorization: `Bearer ${token}` } })).status;

describe('.env is read before the middleware', () => {
  it('accepts a session signed with the secret in .env', async () => {
    expect(await me(sign(SECRET))).not.toBe(401);
  });

  it('refuses a session signed with the default from the source code', async () => {
    expect(await me(sign(DEFAULT))).toBe(401);
  });

  it('reports the secret the middleware actually uses', async () => {
    const h = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json() as { jwtConfigured: boolean };
    expect(h.jwtConfigured).toBe(true);
  });

  it('keeps the dotenv import first in the file', () => {
    // A later import that reads the environment at load time would re-open the
    // hole, so the order itself is pinned.
    const first = readFileSync(join(ROOT, 'server/index.ts'), 'utf8')
      .split('\n').find(l => l.startsWith('import '));
    expect(first).toBe("import 'dotenv/config';");
  });
});
