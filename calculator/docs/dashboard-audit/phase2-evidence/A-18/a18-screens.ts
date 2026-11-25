/**
 * Phase 2 · A-18 evidence (not part of the app): a stored filter the dashboard cannot apply — an unknown key
 * ("programmes") and an unknown date preset — at 1440 and 390 px in both themes. Throwaway server + temp
 * SQLite (AI off), two synthetic records. Run from calculator/ after a build:
 *   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx docs/dashboard-audit/phase2-evidence/A-18/a18-screens.ts <outDir>
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const OUT = resolve(process.argv[2] ?? 'a18-out'); mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

async function main() {
  const port = await freePort(); const dir = mkdtempSync(join(tmpdir(), 'cv-phase2-a18-'));
  const secret = 'a18-' + Math.random().toString(36).slice(2);
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '1', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir }, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const results: Record<string, unknown> = {};
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('no server'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES ('bob', 'bob@test', 'x', 'Bob Baker', 1, 'user', ?)`).run(new Date().toISOString());
    db.close();
    const tok = jwt.sign({ userId: 'bob', email: 'bob@test', emailVerified: true }, secret, { expiresIn: '2h' });
    for (const [sid, prog, cur] of [['a18-1', 'L460', 12], ['a18-2', 'L461', 30]] as const) {
      await fetch(`${base}/api/kpi/records`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
        scenario: { id: sid, name: 'Part', commodity: 'casting', region: 'UK', input: { deliveryTerms: 'DAP' }, result: { total: 10 } },
        details: { partNumber: `A18-${prog}`, programme: prog, modelYear: 2027, powertrain: 'BEV', status: 'completed', currentCost: cur, currentCcy: 'GBP', currentTerms: 'DAP' } }) });
    }
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const cases: [string, unknown][] = [['unknown-key', { programmes: ['L460'] }], ['bad-preset', { datePreset: 'last-decade' }]];
    for (const [name, stored] of cases) {
      for (const theme of ['dark', 'light']) {
        for (const [w, h] of [[1440, 900], [390, 844]]) {
          const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: w, height: h }, reducedMotion: 'reduce' });
          const page = await ctx.newPage();
          const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
          await page.addInitScript('window.__name = (f) => f;');
          await page.addInitScript(([t, th, st]) => {
            localStorage.setItem('auth_token', t!); localStorage.setItem('auth_user', JSON.stringify({ fullName: 'Bob Baker', email: 'x@test' }));
            localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); localStorage.setItem('sc-theme', th!);
            if (!sessionStorage.getItem('a18-seeded')) { localStorage.setItem('cv-kpi-dashboard', st!); sessionStorage.setItem('a18-seeded', '1'); }
          }, [tok, theme, JSON.stringify({ filters: stored })] as const);
          await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
          await page.evaluate(() => (document.getElementById('kpi-btn') as HTMLElement).click());
          await page.waitForFunction(() => { const b = document.querySelector('#kd-body'); return !!b && b.getAttribute('aria-busy') === 'false' && !!b.firstElementChild && !b.querySelector('.kd-skel, .kd-skeleton'); }, undefined, { timeout: 30_000 }).catch(() => undefined);
          await page.waitForTimeout(500);
          const label = `${name}-${theme}-${w}`;
          await page.screenshot({ path: join(OUT, `${label}.png`) });
          if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE);
          const axe = await page.evaluate(() => (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string }[] }> } }).axe.run({ include: [['#kpi-view']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then(r => r.violations.map(v => v.id)));
          const state = await page.evaluate(() => ({
            alert: document.querySelector('#kd-body [role="alert"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
            clearButton: !!document.querySelector('#kd-body [data-clear-all]'),
            kpiCardBlocks: document.querySelectorAll('#kd-body .kd-cards').length, totalsText: (document.querySelector('#kd-body .kd-cards')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
            overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          }));
          let afterClear: unknown = null;
          if (state.clearButton) {
            await page.click('#kd-body [data-clear-all]');
            await page.waitForSelector('.kd-cards', { timeout: 30_000 }).catch(() => undefined);
            await page.waitForTimeout(400);
            await page.screenshot({ path: join(OUT, `${label}-after-clear.png`) });
            afterClear = await page.evaluate(() => ({ cards: document.querySelectorAll('.kd-cards').length, stored: localStorage.getItem('cv-kpi-dashboard') }));
          }
          results[label] = { ...state, axe, errors, afterClear };
          await ctx.close();
        }
      }
    }
    await browser.close();
  } finally {
    writeFileSync(join(OUT, 'a18-results.json'), JSON.stringify(results, null, 1));
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
  }
  console.log(JSON.stringify(results, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
