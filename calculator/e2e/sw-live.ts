/**
 * Software should-cost panel, live (P1 fixes, Oct 2026): a real server + browser opens the panel, checks the wizard's
 * Powertrain picker, switches the advanced form to each powertrain, calculates, and checks the estimate labels, the
 * unverified benchmark labels, a demo, and axe WCAG 2.1 AA on the panel.
 *   npm run build && CV_OUT=<dir> npx tsx e2e/sw-live.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const OUT = process.env.CV_OUT ?? tmpdir();
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-sw-'));
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
    const page = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })).newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript('window.__name = (f) => f;');
    await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
    await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });
    await page.click('#new-costing-btn');
    await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="automotive_software"]:visible').first().click();
    await page.waitForSelector('#sw-panel');
    out.wizardPowertrainOptions = await page.$$eval('#wiz-powertrain option', os => os.map(o => (o as HTMLOptionElement).value));
    await page.click('.sw-mode-btn[data-mode="advanced"]');
    const totals: Record<string, string> = {};
    for (const pt of ['ICE', 'MHEV', 'PHEV', 'BEV']) {
      await page.selectOption('#sw-powertrain', pt);
      await page.waitForTimeout(300);
      await page.click('#sw-calc-btn');
      await page.waitForTimeout(800);
      totals[pt] = await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll('#sw-panel .sw-summary-card, #sw-panel .sw-card')).map(e => e.textContent?.replace(/\s+/g, ' ').trim() ?? '').find(x => /Total/i.test(x));
        return t?.slice(0, 80) ?? '';
      });
      if (pt === 'PHEV') {
        out.estimateBadgesPHEV = await page.$$eval('#sw-panel .sw-module-row', rows => rows.filter(r => (r.querySelector('.sw-mod-enable') as HTMLInputElement).checked && /estimate/.test(r.textContent ?? '')).length);
        out.unverifiedLabels = await page.$$eval('#sw-benchmarks td', tds => tds.filter(td => /Unverified/.test(td.textContent ?? '')).length);
        await page.screenshot({ path: join(OUT, 'sw-phev.png'), fullPage: false });
      }
    }
    out.totals = totals;
    await page.addScriptTag({ content: AXE });
    out.axe = await page.evaluate(async () => {
      const r = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string; nodes: unknown[] }> }> } })
        .axe.run(document.getElementById('sw-panel'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.map(v => `${v.impact} ${v.id} ×${v.nodes.length}: ${(v.nodes as Array<{ target: string[] }>).slice(0, 4).map(n => n.target.join(' ')).join(' | ')}`);
    });
    await page.click('.sw-vehicle-btn[data-vehicle="rr_l460"]');
    await page.waitForTimeout(1200);
    out.demoL460 = await page.evaluate(() => ({
      powertrain: (document.getElementById('sw-powertrain') as HTMLSelectElement | null)?.value,
      engineControlOn: (document.querySelector('.sw-mod-enable[data-id="engine_control"]') as HTMLInputElement | null)?.checked,
      staleNote: !!document.getElementById('sw-reports-stale'),
    }));
    out.pageErrors = errors;
  } finally {
    writeFileSync(join(OUT, 'sw-live.json'), JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    await browser?.close();
    try { process.kill(-server.pid!); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
void main();
