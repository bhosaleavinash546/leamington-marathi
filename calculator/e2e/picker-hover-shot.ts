/**
 * The commodity picker's hover, photographed: a real server + browser, the pointer on one tile, light and dark.
 *   npm run build && CV_OUT=<dir> CV_LABEL=before npx tsx e2e/picker-hover-shot.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const OUT = process.env.CV_OUT ?? tmpdir();
const LABEL = process.env.CV_LABEL ?? 'now';
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-hover-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  let browser;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    for (const theme of ['light', 'dark'] as const) {
      const page = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
      await page.addInitScript('window.__name = (f) => f;');
      await page.addInitScript(([t, th]) => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); localStorage.setItem('cv-theme', th); }, [token, theme]);
      await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });
      await page.evaluate(th => document.documentElement.setAttribute('data-theme', th), theme);
      await page.click('#new-costing-btn');
      const tile = page.locator('#commodity-picker-view .cpicker-tile[data-commodity="casting"]:visible').first();
      await tile.waitFor();
      await page.waitForTimeout(600);
      await tile.hover();
      await page.waitForTimeout(500);
      const box = (await page.locator('#commodity-picker-view .cpicker-grid').first().boundingBox())!;
      await page.screenshot({ path: join(OUT, `${LABEL}-hover-${theme}.png`), clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: 330 } });
    }
  } finally {
    await browser?.close();
    try { process.kill(-server.pid!); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
void main();
