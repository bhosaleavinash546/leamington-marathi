/**
 * Full browser run — the built app on the real server, every commodity, the
 * Assembly roll-up, both exports, and a CAD upload from file to cost.
 *
 * The smoke test drives one commodity through `vite preview`, which has no
 * server, so nothing behind /api is exercised. This boots the real server the
 * way the Windows package runs it — air-gapped, its own data folder, a signed-in
 * user — and serves the build from it. It exists because unit tests passed while
 * the app showed one commodity's cost under another's heading (M1), hid its
 * result below the fold (M7), and could not cost an STL at all: answering its
 * questions ended in an alert, and correcting its cycle time left it blocked.
 *
 * Any uncaught page error or browser dialog fails the run: every dialog found so
 * far was a dead end that a headless test would otherwise pass straight through.
 *
 *   npm run build && npm run test:e2e:full
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Browser, type Page } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const ROOT = join(import.meta.dirname, '..');
const IS_CI = !!process.env.CI;
const log = (m: string) => process.stdout.write(`[e2e] ${m}\n`);
const failures: string[] = [];
const fail = (m: string) => { failures.push(m); log(`FAIL ${m}`); };

const freePort = () => new Promise<number>((resolve, reject) => {
  const s = createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); });
});

/** The on-screen total as a number, or null when no result is showing. */
const heroTotal = (page: Page) => page.evaluate(() => {
  const h = document.getElementById('cv-result-hero');
  if (!h || getComputedStyle(h).display === 'none') return null;
  const m = h.textContent?.match(/£\s*([\d,]+\.\d{2})/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
});

/** WCAG 2.1 A/AA violations on the page as it stands (M10 regression guard). */
async function axeViolations(page: Page): Promise<string[]> {
  await page.waitForTimeout(700);   // let theme and entrance transitions settle
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE);
  return page.evaluate(() => (window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } })
    .axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    .then(r => r.violations.map(v => `${v.id} ×${v.nodes.length} (${v.nodes[0]?.target.join(' ')})`)));
}

async function pick(page: Page, commodity: string): Promise<void> {
  await page.click('#new-costing-btn', { timeout: 15_000 });
  // The first VISIBLE tile: PCB fab has a plain tile and an AI photo tile, and
  // CAD-to-Cost sits in the AI row although it measures geometry, not AI.
  await page.locator(`#commodity-picker-view .cpicker-tile[data-commodity="${commodity}"]:visible`).first().click({ timeout: 15_000 });
  await page.waitForTimeout(300);
}

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-e2e-'));
  const secret = 'e2e-' + Math.random().toString(36).slice(2);
  const env: NodeJS.ProcessEnv = {
    ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1',
    JWT_SECRET: secret, AIR_GAPPED: '1', CV_DATA_DIR: dir,
  };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'],
    { cwd: ROOT, env, stdio: 'ignore', detached: true });
  let browser: Browser | undefined;
  let page: Page | undefined;
  const cleanup = () => {
    try { void browser?.close(); } catch { /* closing */ }
    try { if (server.pid) process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  };

  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
      if (i > 120) throw new Error('server did not start');
      await new Promise(r => setTimeout(r, 250));
    }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at)
                VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    log(`server up on ${port} (air-gapped, production build)`);

    try {
      browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    } catch (e) {
      if (!IS_CI) { log(`SKIP — no launchable Chromium (${(e as Error).message.split('\n')[0]})`); return; }
      throw e;
    }
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => { fail(`browser dialog: "${d.message()}"`); void d.dismiss(); });
    await page.addInitScript(t => {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('cv-tour-v41-seen', '1');
      localStorage.setItem('cv-wizard-off', '1');
    }, token);
    await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
    for (const v of await axeViolations(page)) fail(`home: accessibility — ${v}`);

    // ── Every commodity costs on its defaults ──────────────────────────────
    const commodities = await page.$$eval('#commodity-picker-view .cpicker-tile[data-commodity]:not(.cpicker-tile--ai)',
      ts => [...new Set(ts.map(t => (t as HTMLElement).dataset.commodity!))]
        .filter(c => !['automotive_software', 'assembly', 'cad_analysis', 'ai_agent'].includes(c)));
    const costed: string[] = [];
    for (const c of commodities) {
      await pick(page, c);
      if (await heroTotal(page) !== null) fail(`${c}: the previous commodity's result is still on screen`);
      await page.click('#calc-btn', { timeout: 15_000 });
      await page.waitForTimeout(1300);
      const total = await heroTotal(page);
      const err = await page.evaluate(() => {
        const e = document.getElementById('validation-errors');
        return e && getComputedStyle(e).display !== 'none' ? e.textContent?.replace(/\s+/g, ' ').trim() : '';
      });
      if (total === null || !(total > 0)) { fail(`${c}: no result on its default inputs${err ? ` (${err.slice(0, 120)})` : ''}`); continue; }
      const onScreen = await page.evaluate(() => {
        const r = document.getElementById('cv-result-hero')!.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      });
      if (!onScreen) fail(`${c}: result not scrolled into view`);
      for (const v of await axeViolations(page)) fail(`${c}: accessibility — ${v}`);
      costed.push(`${c} £${total.toFixed(2)}`);
    }
    log(`${costed.length}/${commodities.length} commodities cost on their defaults, each with no WCAG 2.1 AA violation`);

    // ── Exports reproduce the on-screen total ──────────────────────────────
    await pick(page, 'machining');
    await page.click('#calc-btn');
    await page.waitForTimeout(1300);
    const screen = await heroTotal(page);
    const [xlsx] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.evaluate(() => document.getElementById('export-excel-btn')!.click())]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(await xlsx.path());
    let inWorkbook = false;
    wb.getWorksheet('1-Summary')?.eachRow(r => r.eachCell(cell => {
      const v = String((cell.value as { result?: unknown })?.result ?? cell.value ?? '');
      if (screen !== null && v.includes(screen.toFixed(2))) inWorkbook = true;
    }));
    if (!inWorkbook) fail(`Excel export: summary sheet does not carry the on-screen £${screen}`);
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.evaluate(() => document.getElementById('export-pdf-btn')!.click())]);
    const pdfBytes = readFileSync(await pdf.path());
    if (pdfBytes.subarray(0, 5).toString() !== '%PDF-' || pdfBytes.length < 20_000) fail(`PDF export: not a PDF or suspiciously small (${pdfBytes.length} bytes)`);
    log(`exports: workbook carries £${screen}, PDF ${Math.round(pdfBytes.length / 1024)} KB`);

    // ── Assembly rolls up priced lines, and explains an empty BOM ──────────
    await pick(page, 'assembly');
    if (!(await page.locator('#asm-lines-container').count())) fail('assembly: its form did not render');
    await page.click('#calc-btn');
    await page.waitForTimeout(400);
    if (!(await page.getByText('Nothing to roll up yet').count())) fail('assembly: an empty BOM did not explain itself');
    await page.fill('.asm-line-row .asm-qty', '2');
    await page.fill('.asm-line-row .asm-cost', '10');
    // The row recomputes its extended cost on input; calculate only once it has.
    await page.waitForFunction(() => document.querySelector('.asm-line-row .asm-ext-cost')?.textContent?.includes('20.00'), null, { timeout: 5_000 });
    await page.click('#calc-btn');
    await page.waitForTimeout(600);
    // The table row, not the headline card: the card counts up over ~550 ms
    // (animations.ts), and reading it mid-count gave £24.18 on a loaded machine.
    const asm = await page.evaluate(() => document.querySelector('#results-breakdown tr.total-row td:nth-child(2)')?.textContent ?? '');
    if (!asm.includes('24.19')) {   // 20 × 1.12 × 1.08
      const why = await page.evaluate(() => JSON.stringify({
        oh: (document.getElementById('overhead-pct') as HTMLInputElement).value,
        margin: (document.getElementById('margin-pct') as HTMLInputElement).value,
        rows: [...document.querySelectorAll('#results-breakdown tbody tr')].map(r => r.textContent!.replace(/\s+/g, ' ').trim()),
      }));
      fail(`assembly: 2 × £10 at 12% overhead, 8% margin should be £24.19, got "${asm}" ${why}`);
    }
    log(`assembly rolls up: ${asm.trim()}`);

    // ── CAD upload: STL → questions → form → cost ──────────────────────────
    await pick(page, 'cad_analysis');
    await page.setInputFiles('#cad-file-input', join(ROOT, 'tests/fixtures/cad-parts/block-2holes.stl'));
    await page.click('#cad-analyze-btn');
    const ANSWERS: Record<string, string> = { 'commodity.route': 'machining', 'material.family': 'aluminium', 'geometry.holeCount': '2' };
    for (let round = 0; round < 6; round++) {
      await page.waitForSelector('#cad-results #cad-apply-btn, #cad-results .cad-decision', { timeout: 60_000 });
      await page.waitForTimeout(400);
      const open = await page.$$eval('#cad-decisions-panel .cad-decision', ds => ds.map(d => ({
        id: (d as HTMLElement).dataset.decisionId!, typed: !!d.querySelector('input[data-decision-entry]') })));
      const toAnswer = open.filter(o => o.id in ANSWERS);
      if (!toAnswer.length) break;
      for (const o of toAnswer) {
        const sel = `.cad-decision[data-decision-id="${o.id}"]`;
        if (o.typed) await page.fill(`${sel} input[data-decision-entry]`, ANSWERS[o.id]);
        else await page.check(`${sel} input[type=radio][value="${ANSWERS[o.id]}"]`);
      }
      const before = await page.evaluate(() => document.getElementById('cad-results')!.innerHTML.length);
      await page.click('#cad-decisions-apply');
      await page.waitForFunction(b => document.getElementById('cad-results')!.innerHTML.length !== b, before, { timeout: 60_000 });
    }
    await page.click('#cad-apply-btn');
    await page.waitForTimeout(1500);
    const netWt = Number(await page.inputValue('#mach-net-wt').catch(() => '0'));
    if (!(netWt > 0.1 && netWt < 0.15)) fail(`CAD: net weight ${netWt} kg, expected the measured 0.121 kg of aluminium`);
    // An STL has no feature table, so the route has no cycle time: the engineer
    // types one, and the gate must accept it rather than demand an acknowledgement.
    const op = (await page.$$eval('#commodity-form-area input[id$="-ct"]', es => es.map(e => e.id.replace(/-ct$/, ''))))[0];
    if (op) { await page.fill(`#${op}-ct`, '0.05'); await page.fill(`#${op}-lt`, '0.05'); }
    await page.click('#calc-btn');
    await page.waitForTimeout(1500);
    const cadTotal = await heroTotal(page);
    if (cadTotal === null || !(cadTotal > 0)) {
      const err = await page.evaluate(() => document.getElementById('validation-errors')?.textContent?.replace(/\s+/g, ' ').trim() ?? '');
      fail(`CAD: the uploaded STL did not cost (${err.slice(0, 160)})`);
    } else log(`CAD: STL measured (${netWt} kg), questions answered, costed at £${cadTotal.toFixed(2)}`);

    if (failures.length) throw new Error(`${failures.length} failure(s):\n  - ${failures.join('\n  - ')}`);
    log(`PASSED — ${costed.join(', ')}`);
  } catch (e) {
    // What the page looked like when it failed; CI uploads e2e/full-failure.png.
    await page?.screenshot({ path: join(ROOT, 'e2e/full-failure.png'), fullPage: false }).catch(() => {});
    throw e;
  } finally {
    cleanup();
  }
}

main().then(() => process.exit(0)).catch(err => {
  log(`FAILED: ${err.message}`);
  process.exit(1);
});
