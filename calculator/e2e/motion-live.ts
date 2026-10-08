/**
 * Motion review, live (Oct 2026): a real server + browser checks the one motion system behaves —
 * the More menu fades in and OUT (it used to vanish), a result tab fades in, buttons do not scale on hover, and with
 * reduced motion the menus still open. Toasts are checked in e2e/cad-progress-live.ts (its Cancel raises one).
 *
 *   npm run build && CV_OUT=<dir> npx tsx e2e/motion-live.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const OUT = process.env.CV_OUT ?? tmpdir();
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

async function open(page: Page, base: string, token: string): Promise<void> {
  await page.addInitScript('window.__name = (f) => f;');
  await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
  await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });
}

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-motion-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const out: Record<string, unknown> = {};
  let browser;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });

    // ── Normal motion ──
    const page = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })).newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await open(page, base, token);
    await page.click('#new-costing-btn');
    await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="machining"]:visible').first().click();
    await page.waitForSelector('#calc-btn');
    await page.click('#calc-btn');
    await page.waitForFunction(() => /\d/.test(document.querySelector('#cv-result-hero .crh-total')?.textContent ?? ''), null, { timeout: 60_000 });
    await page.waitForTimeout(1200);

    // More menu: opacity sampled while opening and closing — it must pass through intermediate values both ways.
    const sample = async (fn: string) => page.evaluate(async (f) => {
      const menu = document.querySelector('.cv-more-menu') as HTMLElement;
      const btn = document.querySelector('.cv-more-btn') as HTMLElement;
      (f === 'open' ? btn : btn).click();
      const seen: number[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 260) { seen.push(+getComputedStyle(menu).opacity); await new Promise(r => requestAnimationFrame(r)); }
      return { seen: seen.map(v => +v.toFixed(2)), display: getComputedStyle(menu).display };
    }, fn);
    out.moreOpen = await sample('open');
    out.moreClose = await sample('close');

    // Button hover: no scale.
    await page.hover('#calc-btn');
    await page.waitForTimeout(300);
    out.calcHoverTransform = await page.$eval('#calc-btn', b => getComputedStyle(b).transform);

    // Result tab fades in.
    await page.click('.rtab[data-panel="detail"]');
    out.tabEnterClass = await page.$eval('#results-detail', e => e.classList.contains('cv-tab-enter'));
    await page.click('.rtab[data-panel="breakdown"]');

    await page.screenshot({ path: join(OUT, 'motion-results.png') });
    out.pageErrors = errors;

    // ── Reduced motion: the menus still open, instantly ──
    const ctx2 = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const p2 = await ctx2.newPage();
    await open(p2, base, token);
    await p2.click('#new-costing-btn');
    await p2.locator('#commodity-picker-view .cpicker-tile[data-commodity="machining"]:visible').first().click();
    await p2.waitForSelector('.cv-more-btn');
    await p2.click('.cv-more-btn');
    await p2.waitForTimeout(60);
    out.reducedMoreMenu = await p2.$eval('.cv-more-menu', m => ({ display: getComputedStyle(m).display, opacity: getComputedStyle(m).opacity }));
  } finally {
    writeFileSync(join(OUT, 'motion-live.json'), JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    await browser?.close();
    try { process.kill(-server.pid!); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
void main();
