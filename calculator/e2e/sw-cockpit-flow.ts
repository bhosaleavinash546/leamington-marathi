/**
 * Software cockpit round 2, live (real server + browser): one input pane (domain chips), undo / redo by button and
 * keyboard, the shortcuts dialog, "/" to search, Scenarios (pin, inline save, generated sets, load + undo, delete), the
 * vehicle map without component £, and axe on every tab in dark and light. Writes sw-cockpit-flow.json (checks: PASS /
 * FAIL) and screenshots.
 *   npm run build && CV_OUT=<dir> npx tsx e2e/sw-cockpit-flow.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const OUT = process.env.CV_OUT ?? tmpdir();
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

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
    const rail = () => page.evaluate(() => document.querySelector('#swk-rail [data-fig="total"] .swk-v')?.textContent ?? '');
    const check = (name: string, ok: boolean, detail: unknown = '') => { (out.checks as Record<string, unknown>)[name] = ok ? 'PASS' : { FAIL: detail }; };
    out.checks = {};
    await page.waitForFunction(() => !!document.querySelector('#swk-rail [data-fig="total"]'));
    const total0 = await rail();

    // 1 · One input pane: no mode toggle; domain chips switch a whole domain and the rail follows.
    check('no guided/advanced toggle', await page.locator('.sw-mode-btn, #sw-guided-body').count() === 0);
    const chipC = page.locator('.swk-domain[data-domain="C"]');
    await chipC.click(); await page.waitForTimeout(500);
    const offC = { pressed: await chipC.getAttribute('aria-pressed'), count: await chipC.locator('[data-domain-count]').textContent(), total: await rail() };
    check('domain chip excludes infotainment', offC.pressed === 'false' && /^0 of/.test(offC.count ?? '') && offC.total !== total0, offC);

    // 2 · Undo / redo: button and keyboard; redo re-applies.
    await page.click('#swk-undo'); await page.waitForTimeout(300);
    const afterUndo = { total: await rail(), pressed: await chipC.getAttribute('aria-pressed') };
    check('undo restores the domain and the total', afterUndo.total === total0 && afterUndo.pressed === 'true', afterUndo);
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('Control+Shift+Z'); await page.waitForTimeout(300);
    check('Ctrl+Shift+Z redoes', await rail() === offC.total, await rail());
    await page.keyboard.press('Control+Z'); await page.waitForTimeout(300);
    check('Ctrl+Z undoes', await rail() === total0, await rail());

    // 3 · Keyboard map dialog: ? opens, Esc closes; / jumps to the module search.
    await page.keyboard.press('Shift+?'); await page.waitForTimeout(250);
    const dlgOpen = await page.evaluate(() => (document.getElementById('swk-keys') as HTMLDialogElement).open);
    await page.addScriptTag({ content: AXE });
    const axeRun = () => page.evaluate(async () => {
      const r = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } })
        .axe.run(document.getElementById('sw-panel'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.map(v => `${v.id} ×${v.nodes.length}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
    });
    out.axeDialog = await axeRun();
    await page.locator('#swk-keys').screenshot({ path: join(OUT, '20-shortcuts.png') });
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    const dlgClosed = !(await page.evaluate(() => (document.getElementById('swk-keys') as HTMLDialogElement).open));
    check('? opens the shortcuts, Esc closes', dlgOpen && dlgClosed, { dlgOpen, dlgClosed });
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('/'); await page.waitForTimeout(250);
    check('/ focuses the module search', await page.evaluate(() => document.activeElement?.id) === 'swk-scope-q');

    // 4 · Scenarios: pin baseline, change, save inline (no prompt), compare; generated sets; load; delete.
    await page.click('[data-swk-tab="setup"]');
    await page.click('[data-swk-tab="scenarios"]');
    await page.click('#swk-sc-pin'); await page.waitForTimeout(200);
    await page.click('[data-swk-tab="setup"]');
    await page.selectOption('#sw-region', 'IN'); await page.waitForTimeout(500);
    await page.click('[data-swk-tab="scenarios"]');
    await page.fill('#swk-sc-name', 'India hub'); await page.press('#swk-sc-name', 'Enter'); await page.waitForTimeout(700);
    const sc1 = await page.$$eval('.swk-sc-t tbody tr', rs => rs.map(r => r.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160)));
    out.scenariosSaved = sc1;
    check('saved scenario shows its change and what differs', sc1.some(t => /India hub/.test(t ?? '') && /hub United Kingdom → India/.test(t ?? '') && /▼/.test(t ?? '')), sc1);
    await page.locator('#swk-p-scenarios').screenshot({ path: join(OUT, '21-scenarios-saved.png') });
    for (const m of ['source', 'hub', 'reuse'] as const) {
      await page.click(`[data-sc-mode="${m}"]`); await page.waitForTimeout(500);
      (out as Record<string, unknown>)[`scenarios_${m}`] = await page.$$eval('.swk-sc-t tbody tr th', ths => ths.map(t => t.textContent?.replace(/\s+/g, ' ').trim()));
    }
    await page.locator('#swk-p-scenarios').screenshot({ path: join(OUT, '22-scenarios-reuse.png') });
    const genRows = (out as Record<string, string[]>).scenarios_hub ?? [];
    check('hub set lists the current hub as baseline + 7 others', genRows.length === 8 && /\(current\)/.test(genRows[0] ?? ''), genRows);
    // Load "Platform reuse" → the form follows and the rail recosts; then undo brings India back.
    const beforeLoad = await rail();
    await page.click('[data-sc-load="gen-reuse-Platform"]'); await page.waitForTimeout(500);
    const reuseVals = await page.$$eval('.sw-reuse-sel', ss => [...new Set(ss.map(s => (s as HTMLSelectElement).value))]);
    check('Load writes the scenario into the form', reuseVals.length === 1 && reuseVals[0] === 'Platform' && await rail() !== beforeLoad, { reuseVals });
    await page.click('#swk-undo'); await page.waitForTimeout(400);
    check('undo after Load restores the previous programme', await rail() === beforeLoad, await rail());
    await page.click('[data-sc-mode="saved"]'); await page.waitForTimeout(300);
    const delBtn = page.locator('[data-sc-del]').first();
    if (await delBtn.count()) { await delBtn.click(); await page.waitForTimeout(300); }
    check('Delete removes the saved scenario', !(await page.$$eval('.swk-sc-t tbody tr th', ths => ths.some(t => /India hub/.test(t.textContent ?? '')))));

    // 5 · Vehicle map: no £ in the component list.
    await page.click('[data-swk-tab="vehicle"]'); await page.waitForTimeout(800);
    const metas = await page.$$eval('#sw-studio .swv-li-meta', ms => ms.map(m => m.textContent ?? ''));
    check('component list carries no money', metas.length > 5 && metas.every(m => !/[£€$]/.test(m)), metas.slice(0, 4));

    // 6 · axe on every tab, dark then light.
    const allTabs = async () => { const f: string[] = []; for (const t of ['setup', 'scope', 'overview', 'vehicle', 'risk', 'spend', 'modules', 'supplier', 'scenarios', 'rates', 'report']) {
      await page.click(`[data-swk-tab="${t}"]`); await page.waitForTimeout(350); for (const v of await axeRun()) f.push(`${t}: ${v}`); } return f; };
    out.axeDark = await allTabs();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    out.axeLight = await allTabs();
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    out.pageErrors = errors;
  } finally {
    writeFileSync(join(OUT, 'sw-cockpit-flow.json'), JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
    await browser?.close();
    try { process.kill(-server.pid!); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
void main();
