/**
 * Live country run: a real STEP through a real server and a real browser, with a
 * manufacturing country selected BEFORE upload. Captures what the screen sends
 * (the region on every CAD call), what the server's rules priced, the costing the
 * tool produced (its own Excel export: operations, rates, the full rate trace) and
 * the active rate database (its own Rate Database export).
 *
 *   CV_LIVE_REGION=IN CV_LIVE_PART=../cad-audit/parts/PRCR002.stp \
 *   CV_LIVE_ANSWERS='{"material.family":"aluminium",...}' CV_LIVE_OUT=/dir npx tsx e2e/country-live.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';

const ROOT = resolve('.');
const REGION = process.env.CV_LIVE_REGION ?? 'IN';
const PART = resolve(process.env.CV_LIVE_PART ?? '../cad-audit/parts/PRCR002.stp');
const OUT = process.env.CV_LIVE_OUT ?? tmpdir();
const ANSWERS: Record<string, string> = JSON.parse(process.env.CV_LIVE_ANSWERS ?? '{}');
const log = (m: string) => process.stdout.write(`[${REGION}] ${m}\n`);
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const sheet = (wb: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true });

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-country-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout?.on('data', d => { serverLog += d.toString(); });
  server.stderr?.on('data', d => { serverLog += d.toString(); });
  const out: Record<string, unknown> = { region: REGION, part: PART, answers: ANSWERS };
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    const active = await (await fetch(`${base}/api/rate-library/active`, { headers: { Authorization: `Bearer ${token}` } })).json() as { source: string; library: { version: string } };
    out.serverRateSource = { source: active.source, version: active.library.version };
    log(`server up; rate book on the server: ${active.source} ${active.library.version}`);

    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => { pageErrors.push(`dialog: ${d.message()}`); void d.dismiss(); });
    const calls: Array<Record<string, unknown>> = [];
    let lastAnalysis: Record<string, unknown> | null = null;
    page.on('response', async r => {
      const u = r.url();
      if (!/\/api\/(cad|agent|pcb)\//.test(u) || r.request().method() !== 'POST') return;
      // Raw bytes: a multipart upload carrying the STEP file is binary, and postData() can drop it.
      const post = r.request().postDataBuffer()?.toString('latin1') ?? '';
      const sentRegion = /reanalyze/.test(u) ? (JSON.parse(post || '{}') as { region?: string }).region ?? null
        : (post.match(/name="region"\r\n\r\n([^\r\n]*)/)?.[1] ?? null);
      let j: Record<string, unknown> = {};
      try { j = await r.json() as Record<string, unknown>; } catch { /* not json */ }
      if (j.analysis) lastAnalysis = j;
      calls.push({ url: u.replace(/^.*\/api/, '/api'), status: r.status(), sentRegion, ratesRegion: j.ratesRegion ?? null,
        decisions: (j.decisions as Array<{ id: string }> | undefined)?.map(d => d.id), fromCache: j.fromCache, error: j.error });
    });
    await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
    await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });

    // 1. The country, chosen first — the way an engineer does it.
    await page.selectOption('#mfg-region-selector', REGION);
    await page.waitForTimeout(600);
    // The run is only valid if the whole screen took the country (both pickers, rates, currency).
    await page.waitForFunction(r => (document.getElementById('costing-country-sel') as HTMLSelectElement)?.value === r, REGION, { timeout: 30_000 });
    out.afterCountrySwitch = await page.evaluate(() => ({
      header: (document.getElementById('mfg-region-selector') as HTMLSelectElement).value,
      bar: (document.getElementById('costing-country-sel') as HTMLSelectElement).value,
      currency: (document.getElementById('currency-selector') as HTMLSelectElement).value,
      info: document.getElementById('country-bar-info')?.textContent,
    }));
    log(`country set: ${JSON.stringify(out.afterCountrySwitch)}`);

    // 2. Upload and analyse the CAD.
    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="cad_analysis"]:visible').first().click({ timeout: 15_000 });
    await page.waitForTimeout(300);
    await page.setInputFiles('#cad-file-input', PART);
    await page.click('#cad-analyze-btn');
    const rounds: unknown[] = [];
    for (let round = 0; round < 6; round++) {
      await page.waitForSelector('#cad-results #cad-apply-btn, #cad-results .cad-decision', { timeout: 300_000 });
      await page.waitForTimeout(400);
      const open = await page.$$eval('#cad-decisions-panel .cad-decision', ds => ds.map(d => ({ id: (d as HTMLElement).dataset.decisionId!,
        preselected: (d.querySelector('input[type=radio]:checked') as HTMLInputElement | null)?.value ?? null,
        options: Array.from(d.querySelectorAll('input[type=radio]')).map(r => (r as HTMLInputElement).value) })));
      rounds.push(open);
      const toAnswer = open.filter(o => o.id in ANSWERS);
      log(`round ${round}: ${open.map(o => `${o.id} [${o.options.join('|')}]`).join(', ') || '(none)'}`);
      if (!toAnswer.length) break;
      for (const o of toAnswer) {
        const sel = `.cad-decision[data-decision-id="${o.id}"]`;
        // A figure the engineer types (quality class, helix angle off the drawing) or a choice.
        if (o.options.length === 0) await page.fill(`${sel} input[data-decision-entry]`, ANSWERS[o.id]);
        else await page.check(`${sel} input[type=radio][value="${ANSWERS[o.id]}"]`);
      }
      const before = await page.evaluate(() => document.getElementById('cad-results')!.innerHTML.length);
      await page.click('#cad-decisions-apply');
      await page.waitForFunction(b => document.getElementById('cad-results')!.innerHTML.length !== b, before, { timeout: 300_000 });
    }
    out.questionRounds = rounds;
    const la = lastAnalysis as Record<string, unknown> | null;
    out.recommended = (la?.analysis as { costInputSuggestions?: { recommendedCommodity?: string } } | undefined)?.costInputSuggestions?.recommendedCommodity;
    out.ruleFields = la?.ruleFields ?? null;

    // 3. Apply to the form and Calculate.
    await page.click('#cad-apply-btn');
    await page.waitForTimeout(1500);
    out.formShop = await page.evaluate(() => Object.fromEntries(['overhead-pct', 'margin-pct', 'packaging', 'logistics'].map(id => [id, (document.getElementById(id) as HTMLInputElement | null)?.value])));
    out.form = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('#commodity-form-area input[id], #commodity-form-area select[id]'))
      .filter(e => (e as HTMLInputElement).type !== 'file').map(e => [e.id, { value: e.value, prov: e.getAttribute('data-prov') }])));
    await page.click('#calc-btn');
    await page.waitForTimeout(4000);   // past the headline's count-up
    out.headline = await page.evaluate(() => (document.querySelector('#cv-result-hero .crh-total')?.textContent ?? '').trim());
    out.heroChip = await page.evaluate(() => (document.querySelector('#cv-result-hero .crh-chips')?.textContent ?? '').replace(/\s+/g, ' ').trim());
    out.breakdownScreen = await page.$$eval('#results-breakdown tbody tr', rs => rs.map(r => r.textContent!.replace(/\s+/g, ' ').trim()));

    // 4. The tool's own record of the costing: its Excel export.
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('#export-excel-btn')]);
    const xlPath = join(OUT, `costing-${REGION}.xlsx`);
    await dl.saveAs(xlPath);
    const wb = XLSX.read(readFileSync(xlPath));
    out.excel = { sheets: wb.SheetNames, summary: sheet(wb, '1-Summary'), operations: sheet(wb, '3-Operations'), labour: sheet(wb, '5-LabourRates').slice(0, 20), trace: sheet(wb, '6-Traceability') };

    // 5. The active rate database, as the tool exports it.
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('#export-rates-btn')]);
    const rbPath = join(OUT, `ratebook-${REGION}.xlsx`);
    await dl2.saveAs(rbPath);
    const rb = XLSX.read(readFileSync(rbPath));
    out.rateDb = Object.fromEntries(rb.SheetNames.map(n => [n, sheet(rb, n)]));

    out.calls = calls;
    out.pageErrors = pageErrors;
    out.serverLogTail = serverLog.split('\n').filter(l => /region|CAD|cad|error|Error/i.test(l)).slice(-30);
    writeFileSync(join(OUT, `live-${REGION}.json`), JSON.stringify(out, null, 1));
    log(`headline ${out.headline} — written live-${REGION}.json`);
  } catch (e) {
    out.error = (e as Error).message; out.serverLog = serverLog.slice(-3000);
    writeFileSync(join(OUT, `live-${REGION}.json`), JSON.stringify(out, null, 1));
    log(`ERROR ${(e as Error).message.split('\n')[0]}`); process.exitCode = 1;
  } finally {
    try { await browser?.close(); } catch { /* closing */ }
    try { if (server.pid) process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
main();
