/**
 * 3D viewer screenshots — the standalone viewer with a real STEP, in both themes, through a real
 * server (needs OCP for STEP tessellation, and a build: `npm run build` first).
 *
 *   npx tsx e2e/viewer-shots.ts [out-dir] [part.stp]
 *
 * Shoots: empty state, loaded (default view), face-type colouring, wall thickness. Used to prove
 * viewer UI changes before / after (docs/ui/3d-viewer-plan-2026-10.md).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'e2e/viewer-shots'));
const PART = resolve(process.argv[3] ?? join(ROOT, '../cad-audit/parts/Casting_Braket.stp'));

const freePort = () => new Promise<number>((ok) => { const s = createServer(); s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-viewer-'));
  const secret = 'vw-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'Priya Sharma', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.addInitScript(([t, th]) => {
        localStorage.setItem('auth_token', t); localStorage.setItem('sc-theme', th);
        localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1');
      }, [token, theme]);
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.click('#viewer-btn');
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(OUT, `${theme}-empty.png`) });
      await page.setInputFiles('#viewer-file-input', PART);
      // Loaded = the status bar names the file with its triangle count, or an error shows.
      await page.waitForFunction(() => /tri|faces|error|Cannot/i.test(document.querySelector('#viewer-view')?.textContent ?? ''), null, { timeout: 120_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(OUT, `${theme}-loaded.png`) });
      for (const [label, re] of [['faces', /face type/i], ['thickness', /thickness/i]] as const) {
        const btn = page.locator('#viewer-view button').filter({ hasText: re }).first();
        if (await btn.count() && await btn.isEnabled()) {
          await btn.click(); await page.waitForTimeout(3000);
          await page.screenshot({ path: join(OUT, `${theme}-${label}.png`) });
          await btn.click(); await page.waitForTimeout(500);
        }
      }
      if (errors.length) console.log(`${theme}: page errors`, errors);
      await page.close();
    }
    console.log(`shots in ${OUT}`);
  } finally {
    await browser?.close();
    try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
