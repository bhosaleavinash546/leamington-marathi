/**
 * Software costing UX audit shots: a real server + browser walks the software module as a user would and saves a
 * full-page screenshot of each state (guided steps, advanced setup, results, mobile), plus the DOM size and timings.
 *   npm run build && CV_OUT=<dir> [CV_WIDTH=400] [CV_THEME=light] npx tsx e2e/sw-ux-shots.ts
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

async function shot(page: Page, name: string, full = true): Promise<void> {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
}

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-swux-'));
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
    const width = Number(process.env.CV_WIDTH ?? 1440);
    const page = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 900 } })).newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript('window.__name = (f) => f;');
    await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
    if (process.env.CV_THEME) await page.addInitScript(th => { localStorage.setItem('sc-theme', th); }, process.env.CV_THEME);
    await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });
    await page.click('#new-costing-btn');
    await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="automotive_software"]:visible').first().click();
    const t0 = Date.now();
    await page.waitForSelector('#sw-panel');
    out.panelOpenMs = Date.now() - t0;
    await page.waitForTimeout(600);
    out.layout = await page.evaluate(() => {
      const r = (sel: string) => { const e = document.querySelector(sel) as HTMLElement | null; if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), getComputedStyle(e).position]; };
      const sc = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(e => e.scrollTop > 0).map(e => `${e.id || e.className}:${e.scrollTop}`);
      return { head: r('.swk-head'), rail: r('#swk-rail'), tabs: r('.swk-tabs'), panel: r('#sw-panel'), scrolled: sc };
    });
    out.domNodes = await page.evaluate(() => document.getElementById('sw-panel')?.querySelectorAll('*').length);
    out.rail = await page.evaluate(() => document.getElementById('swk-rail')?.textContent?.replace(/\s+/g, ' ').trim());
    await shot(page, '01-setup', false);
    const tabs = ['scope', 'overview', 'vehicle', 'risk', 'spend', 'modules', 'supplier', 'scenarios', 'rates', 'report'];
    for (const [i, t] of tabs.entries()) {
      await page.click(`[data-swk-tab="${t}"]`);
      await page.waitForTimeout(t === 'vehicle' ? 900 : 500);
      if (t === 'supplier') { await page.fill('#swk-q-nre', '60000000'); await page.fill('#swk-q-pv', '60'); await page.waitForTimeout(300); }
      if (t === 'scenarios') { await page.click('[data-sc-mode="hub"]'); await page.waitForTimeout(500); }
      await page.locator('#sw-panel').screenshot({ path: join(OUT, `${String(i + 2).padStart(2, '0')}-${t}.png`) });
    }
    // Live: change the volume on Setup and read the rail's delta chip.
    await page.click('[data-swk-tab="setup"]');
    const tLive = Date.now();
    await page.fill('#sw-vol', '120000');
    await page.waitForFunction(() => /▼|▲/.test(document.querySelector('#swk-rail [data-fig="pv"] .swk-delta')?.textContent ?? ''), null, { timeout: 5000 });
    out.liveMs = Date.now() - tLive;
    out.railAfterVolume = await page.evaluate(() => document.getElementById('swk-rail')?.textContent?.replace(/\s+/g, ' ').trim());
    await page.locator('#swk-rail').screenshot({ path: join(OUT, '13-rail-delta.png') });
    out.pageErrors = errors;
  } finally {
    writeFileSync(join(OUT, 'sw-ux-shots.json'), JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    await browser?.close();
    try { process.kill(-server.pid!); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
void main();
