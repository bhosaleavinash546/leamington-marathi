/**
 * UI audit capture: the real app (production build, real server, fresh database) walked
 * through its main screens at three widths in light and dark. For each screen it saves a
 * screenshot and records axe WCAG 2.1 A/AA violations, console errors, page errors,
 * horizontal overflow and DOM size; plus load timing for the first paint.
 *
 *   CV_UI_OUT=/dir [CV_UI_LABEL=before] npx tsx e2e/ui-audit.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const OUT = process.env.CV_UI_OUT ?? join(tmpdir(), 'ui-audit');
const LABEL = process.env.CV_UI_LABEL ?? 'now';
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'phone', width: 390, height: 844 },
];

interface ScreenRecord {
  screen: string; viewport: string; theme: string; file: string;
  axe: string[]; overflowPx: number; consoleErrors: string[]; domNodes: number;
}

async function measure(page: Page, screen: string, vp: string, theme: string, consoleErrors: string[]): Promise<ScreenRecord> {
  await page.waitForTimeout(700);
  const file = `${LABEL}-${screen}-${vp}-${theme}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: false });
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE);
  const axe = await page.evaluate(() => (window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: string[] }> }> }> } })
    .axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    .then(r => r.violations.map(v => `${v.impact} ${v.id} ×${v.nodes.length} (${v.nodes[0]?.target.join(' ')})`
      + (v.id === 'color-contrast' ? ' ' + v.nodes.slice(0, 4).map(n => { const d = (n as unknown as { any: Array<{ data: { fgColor: string; bgColor: string; contrastRatio: number } }> }).any[0]?.data;
        return d ? `[${n.target.join(' ')}: ${d.fgColor} on ${d.bgColor} = ${d.contrastRatio} ${(n as unknown as { html: string }).html.slice(0, 160)}]` : ''; }).join(' ') : ''))));
  const overflowPx = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  const domNodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  const rec = { screen, viewport: vp, theme, file, axe, overflowPx, consoleErrors: [...consoleErrors], domNodes };
  consoleErrors.length = 0;
  return rec;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-ui-'));
  const secret = 'ui-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  const records: ScreenRecord[] = [];
  const timing: Record<string, unknown> = {};
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'Priya Sharma', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });

    for (const theme of ['light', 'dark']) {
      for (const vp of VIEWPORTS) {
        if (theme === 'dark' && vp.name === 'tablet') continue;   // dark at desktop and phone is enough
        const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: vp.width, height: vp.height }, colorScheme: theme as 'light' | 'dark', acceptDownloads: true });
        const page = await ctx.newPage();
        const errs: string[] = [];
        page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
        page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 200)));

        // Sign-in page (no token)
        await page.addInitScript(t => { localStorage.setItem('sc-theme', t); }, theme);
        await page.goto(`${base}/calculator/auth.html`, { waitUntil: 'networkidle' });
        records.push(await measure(page, 'signin', vp.name, theme, errs));

        await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
        const t0 = Date.now();
        await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
        if (vp.name === 'desktop' && theme === 'light') {
          timing.networkIdleMs = Date.now() - t0;
          timing.nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming; const fcp = performance.getEntriesByName('first-contentful-paint')[0];
            return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null, transferKB: Math.round(performance.getEntriesByType('resource').reduce((s, r) => s + ((r as PerformanceResourceTiming).transferSize || 0), n.transferSize || 0) / 1024) }; });
        }
        await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 }).catch(() => undefined);
        records.push(await measure(page, 'home', vp.name, theme, errs));

        // Commodity picker
        await page.click('#new-costing-btn').catch(async () => { await page.click('.cv-hero-start').catch(() => undefined); });
        await page.waitForTimeout(500);
        records.push(await measure(page, 'picker', vp.name, theme, errs));

        // Machining form, then calculate → results
        await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="machining"]:visible').first().click({ timeout: 15_000 });
        await page.waitForTimeout(800);
        records.push(await measure(page, 'form-machining', vp.name, theme, errs));
        await page.click('#calc-btn');
        await page.waitForTimeout(3000);
        records.push(await measure(page, 'results', vp.name, theme, errs));
        for (const tab of ['insights', 'detail']) {
          const t = page.locator(`.rtab[data-panel="${tab}"]`).first();
          if (await t.count() && await t.isVisible()) { await t.click(); await page.waitForTimeout(900); records.push(await measure(page, `results-${tab}`, vp.name, theme, errs)); }
        }

        // CAD-to-cost entry
        await page.click('#new-costing-btn').catch(() => undefined);
        await page.waitForTimeout(400);
        await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="cad_analysis"]:visible').first().click({ timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(800);
        records.push(await measure(page, 'cad-entry', vp.name, theme, errs));

        // Other primary views
        for (const [btn, name] of [['#negotiation-btn', 'negotiation'], ['#news-btn', 'news'], ['#analytics-btn', 'portfolio'], ['#viewer-btn', 'viewer'], ['#help-btn', 'help']] as const) {
          const b = page.locator(btn);
          if (vp.name === 'phone') { const menu = page.locator('#mobile-menu-btn, .mobile-nav-toggle, #anav-toggle').first(); if (await menu.count() && await menu.isVisible()) await menu.click().catch(() => undefined); }
          if (await b.count() && await b.isVisible().catch(() => false)) {
            await b.click().catch(() => undefined);
            await page.waitForTimeout(1000);
            records.push(await measure(page, name, vp.name, theme, errs));
            await page.keyboard.press('Escape').catch(() => undefined);
          }
        }
        await ctx.close();
        process.stdout.write(`[ui] ${theme} ${vp.name} done\n`);
      }
    }
    writeFileSync(join(OUT, `${LABEL}-audit.json`), JSON.stringify({ timing, records }, null, 1));
  } finally {
    try { await browser?.close(); } catch { /* closing */ }
    try { if (server.pid) process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
main();
