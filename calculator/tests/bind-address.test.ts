/**
 * The server listens on this machine only, unless told otherwise.
 *
 * It used to call app.listen(PORT) with no host, which binds every interface.
 * With the data routes that needed no sign-in, a laptop install served its
 * saved costings to anyone on the same network whose traffic the firewall let
 * through. Containers opt back in with HOST=0.0.0.0.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, networkInterfaces } from 'node:os';

const ROOT = join(__dirname, '..');
const lanAddress = Object.values(networkInterfaces()).flat()
  .find(a => a && a.family === 'IPv4' && !a.internal)?.address;
let srv: ChildProcess | null = null, dir = '';

async function boot(extra: Record<string, string>): Promise<number> {
  const port = 3990 + Math.floor(Math.random() * 9);
  dir = mkdtempSync(join(tmpdir(), 'cv-bind-'));
  const env: NodeJS.ProcessEnv = { ...process.env, CV_DATA_DIR: dir, PORT: String(port), NODE_ENV: 'development', ...extra };
  if (!('HOST' in extra)) delete env.HOST;
  srv = spawn(join(ROOT, 'node_modules/.bin/tsx'), [join(ROOT, 'server/index.ts')], { cwd: dir, env, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return port; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}
const reach = async (host: string, port: number) =>
  fetch(`http://${host}:${port}/api/health`, { signal: AbortSignal.timeout(1500) }).then(r => r.ok, () => false);

afterEach(() => { srv?.kill(); srv = null; rmSync(dir, { recursive: true, force: true }); });

describe('bind address', () => {
  it.skipIf(!lanAddress)('answers on localhost but not on the network address by default', async () => {
    const port = await boot({});
    expect(await reach('127.0.0.1', port)).toBe(true);
    expect(await reach(lanAddress!, port)).toBe(false);
  }, 60_000);

  it.skipIf(!lanAddress)('answers on the network address when HOST=0.0.0.0, as containers set it', async () => {
    const port = await boot({ HOST: '0.0.0.0' });
    expect(await reach(lanAddress!, port)).toBe(true);
  }, 60_000);
});
