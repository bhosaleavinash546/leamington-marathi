/**
 * Software costing studio, live (Chief Engineer review, Oct 2026): a real server + browser opens the software panel,
 * calculates a BEV programme, plays the costing walk-through, checks the SUV skeleton lights each step's components,
 * clicks a component, switches hub (country book), opens the rate library, and runs axe on the studio in both themes.
 *   npm run build && CV_OUT=<dir> npx tsx e2e/sw-studio.ts
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
  const dir = mkdtempSync(join(tmpdir(), 'cv-sws-'));
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

    // Guided and Advanced agree on the same choices (code review F2) — wizard to its cost step, then Advanced.
    out.hubOptions = await page.$$eval('#sw-region option', os => os.length);
    out.hubOptgroups = await page.$$eval('#sw-region optgroup', gs => gs.map(g => g.getAttribute('label')));
    out.rateField = await page.inputValue('#sw-base-rate');

    await page.click('.sw-mode-btn[data-mode="advanced"]');
    await page.selectOption('#sw-powertrain', 'BEV');
    await page.waitForTimeout(300);
    await page.click('#sw-calc-btn');
    await page.waitForSelector('#sw-studio .swp-studio', { timeout: 20_000 });
    await page.waitForTimeout(600);
    out.steps = await page.$$eval('#sw-studio .swp-step', ls => ls.map(l => l.textContent?.replace(/\s+/g, ' ').trim()));
    out.litAtEnd = await page.$$eval('#sw-studio .swv-comp.swv-lit', gs => gs.length);
    await page.locator('#sw-studio').screenshot({ path: join(OUT, 'sw-studio-final.png') });

    // Play: step 2 (effort) lights only the ASIL C/D modules' components.
    await page.click('#sw-studio [data-swp="play"]');
    await page.waitForTimeout(1600);
    out.duringPlay = await page.evaluate(() => ({
      active: document.querySelector('#sw-studio .swp-step.is-active')?.textContent?.replace(/\s+/g, ' ').trim(),
      now: document.querySelector('#sw-studio .swp-now')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200),
      lit: document.querySelectorAll('#sw-studio .swv-comp.swv-lit').length,
    }));
    await page.locator('#sw-studio').screenshot({ path: join(OUT, 'sw-studio-playing.png') });
    await page.waitForTimeout(9000);
    out.afterPlay = await page.evaluate(() => document.querySelector('#sw-studio .swp-step.is-active')?.textContent?.replace(/\s+/g, ' ').trim());

    // Rate step by keyboard; then click a component (the ADAS domain controller).
    await page.click('#sw-studio [data-swp-step="3"]');
    out.rateStep = await page.evaluate(() => document.querySelector('#sw-studio .swp-now')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 400));
    await page.click('#sw-studio [data-comp="adas_dc"]');
    await page.waitForTimeout(300);
    out.afterComponentClick = await page.evaluate(() => ({
      lit: Array.from(document.querySelectorAll('#sw-studio .swv-comp.swv-lit')).map(g => g.getAttribute('data-comp')),
    }));
    await page.hover('#sw-studio [data-comp="bms"]');
    out.bmsDetail = await page.evaluate(() => document.querySelector('#sw-studio .swv-detail')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 300));
    await page.click('#sw-studio [data-swv-mode="cost"]');
    await page.locator('#sw-studio').screenshot({ path: join(OUT, 'sw-studio-cost-colour.png') });

    // Hub: India, re-cost; the rate library lists each hub's build-up.
    const total = () => page.evaluate(() => Array.from(document.querySelectorAll('#sw-panel .sw-summary-card')).map(e => e.textContent?.replace(/\s+/g, ' ').trim() ?? '').find(x => /Total Programme/i.test(x))?.slice(0, 60) ?? '');
    out.totalUK = await total();
    await page.selectOption('#sw-region', 'IN');
    out.rateFieldIN = await page.inputValue('#sw-base-rate');
    await page.click('#sw-calc-btn');
    await page.waitForTimeout(900);
    out.totalIN = await total();
    await page.selectOption('#sw-region', 'UK');
    await page.click('#sw-calc-btn');
    await page.waitForTimeout(900);
    await page.evaluate(() => { const d = document.querySelector('#sw-hub-rates')?.closest('details') as HTMLDetailsElement | null; if (d) d.open = true; });
    out.hubTableRows = await page.$$eval('#sw-hub-rates tbody tr', rs => rs.length);
    await page.locator('#sw-hub-rates').screenshot({ path: join(OUT, 'sw-hub-rates.png') });

    await page.addScriptTag({ content: AXE });
    const axe = () => page.evaluate(async () => {
      const r = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } })
        .axe.run(document.getElementById('sw-panel'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.map(v => `${v.id} ×${v.nodes.length}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
    });
    out.axeDark = await axe();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.waitForTimeout(300);
    await page.locator('#sw-studio').screenshot({ path: join(OUT, 'sw-studio-light.png') });
    out.axeLight = await axe();
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

    // Guided ⇄ Advanced keep the same inputs (F3).
    await page.fill('#sw-vol', '150000');
    await page.click('.sw-mode-btn[data-mode="guided"]');
    await page.click('.sw-mode-btn[data-mode="advanced"]');
    out.volAfterModeSwitch = await page.inputValue('#sw-vol');
    out.pageErrors = errors;
  } finally {
    writeFileSync(join(OUT, 'sw-studio.json'), JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    await browser?.close();
    try { process.kill(-server.pid!); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
void main();
