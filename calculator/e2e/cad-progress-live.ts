/**
 * The CAD analysis wait, live: a large STEP through a real server + browser. Captures the progress strip mid-wait
 * (step, elapsed time, the server's allowance, Cancel), then cancels and checks the page recovers.
 *
 *   npm run build && CV_FILE=<large.stp> CV_OUT=<dir> npx tsx e2e/cad-progress-live.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const FILE = process.env.CV_FILE!;
const OUT = process.env.CV_OUT ?? tmpdir();
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-prog-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  let browser;
  const out: Record<string, unknown> = {};
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const page = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })).newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript('window.__name = (f) => f;');
    await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
    await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });
    await page.click('#new-costing-btn');
    await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="cad_analysis"]:visible').first().click();
    await page.setInputFiles('#cad-file-input', FILE);
    await page.click('#cad-analyze-btn');
    await page.waitForSelector('#cad-progress-fill.is-indeterminate', { timeout: 120_000 });
    await page.waitForTimeout(6000);
    const strip = page.locator('#cad-progress-wrap');
    await strip.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, 'cad-progress-wait.png'), clip: { ...(await strip.boundingBox())!, x: 200, width: 1240, height: 140 } }).catch(async () => page.screenshot({ path: join(OUT, 'cad-progress-wait.png') }));
    out.duringWait = await page.evaluate(() => ({
      label: document.getElementById('cad-progress-label')?.textContent,
      elapsed: document.getElementById('cad-progress-elapsed')?.textContent,
      hint: document.getElementById('cad-progress-hint')?.textContent,
      role: document.getElementById('cad-progress-wrap')?.getAttribute('role'),
      valuetext: document.getElementById('cad-progress-wrap')?.getAttribute('aria-valuetext'),
      cancelVisible: !(document.getElementById('cad-progress-cancel') as HTMLButtonElement).hidden,
    }));
    await page.click('#cad-progress-cancel');
    await page.waitForFunction(() => (document.getElementById('cad-progress-wrap') as HTMLElement).style.display === 'none', null, { timeout: 15_000 });
    out.afterCancel = await page.evaluate(() => ({
      analyzeEnabled: !document.getElementById('cad-analyze-btn')?.hasAttribute('disabled'),
      errorCard: !!document.querySelector('#cad-results .risk-card'),
      toast: Array.from(document.querySelectorAll('#toast-container *')).map(e => e.textContent).join(' ').slice(0, 200),
    }));
    out.pageErrors = errors;
  } finally {
    writeFileSync(join(OUT, 'cad-progress-live.json'), JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    await browser?.close();
    try { process.kill(-server.pid!); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
void main();
