/**
 * Real CAD parts, live, end to end — and the reports they export.
 *
 * Every part in a manifest goes through a real server and browser the way an engineer costs it: upload the STEP, answer
 * the route / material / service questions with the stated choice, apply, Calculate, then export the Excel workbook and
 * the PDF report. What the screen shows and what both exports say are recorded side by side, so a figure that differs
 * between them — or a NaN, an "undefined", a £ the costing never produced — is found, not assumed away.
 *
 *   npm run build && CV_PARTS=parts.json CV_LIVE_OUT=/tmp/out npx tsx e2e/cad-parts-live.ts
 *
 * parts.json: [{ "label": "PRCR002", "file": "/path/PRCR002.stp", "answers": { "commodity.route": "cast_and_machine", … } }]
 * Writes <label>.json / .xlsx / .pdf per part and summary.json to CV_LIVE_OUT. Needs OCP for STEP.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';

interface PartSpec { label: string; file: string; answers: Record<string, string>; annualVolume?: number; region?: string; programmeYears?: number; programmeYearsFirst?: boolean }
const ROOT = resolve('.');
const OUT = process.env.CV_LIVE_OUT ?? tmpdir();
const PARTS: PartSpec[] = JSON.parse(readFileSync(process.env.CV_PARTS ?? 'parts.json', 'utf8'));
const ONLY = process.env.CV_ONLY ? new Set(process.env.CV_ONLY.split(',')) : null;
const log = (m: string) => process.stdout.write(`[parts] ${m}\n`);
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const sheetRows = (wb: XLSX.WorkBook, name: string) => wb.Sheets[name] ? XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true }) : null;

async function costOne(page: Page, base: string, p: PartSpec): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { label: p.label, file: p.file, answersGiven: p.answers };
  const calls: Array<{ url: string; status: number; body?: unknown }> = [];
  page.on('response', async r => {
    if (!/\/api\/cad\/(analyze|reanalyze)/.test(r.url())) return;
    try { calls.push({ url: r.url().replace(base, ''), status: r.status(), body: await r.json() }); } catch { calls.push({ url: r.url(), status: r.status() }); }
  });
  await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });
  await page.click('#new-costing-btn', { timeout: 15_000 });
  await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="cad_analysis"]:visible').first().click({ timeout: 15_000 });
  // The manufacturing country, as the header picker sets it (every rate book follows it).
  if (p.region) {
    await page.selectOption('#mfg-region-selector', p.region);
    await page.waitForTimeout(800);
  }
  if (p.annualVolume) await page.fill('#cad-annual-volume', String(p.annualVolume));
  // Programme life typed BEFORE the upload (the order an engineer filling the page top-down uses).
  if (p.programmeYears && p.programmeYearsFirst) await page.fill('#programme-years', String(p.programmeYears));
  await page.setInputFiles('#cad-file-input', p.file);
  await page.click('#cad-analyze-btn');
  const asked: Array<{ id: string; severity: string; options: string[]; checked: string | null }> = [];
  let lastOpen: string[] = [];
  for (let round = 0; round < 8; round++) {
    await page.waitForSelector('#cad-results #cad-apply-btn, #cad-results .cad-decision', { timeout: 900_000 });
    await page.waitForTimeout(500);
    const open = await page.$$eval('#cad-decisions-panel .cad-decision', ds => ds.map(d => ({
      id: (d as HTMLElement).dataset.decisionId!,
      blocking: !!d.closest('#cad-decisions-panel') && (d.parentElement?.id === 'cad-decisions-panel'),
      options: Array.from(d.querySelectorAll('input[type=radio]')).map(r => (r as HTMLInputElement).value),
      checked: (d.querySelector('input[type=radio]:checked') as HTMLInputElement | null)?.value ?? null,
      entry: !!d.querySelector('input[data-decision-entry]'),
    })));
    for (const o of open) if (!asked.some(a => a.id === o.id)) asked.push({ id: o.id, severity: o.blocking ? 'blocking' : 'advisory', options: o.options, checked: o.checked });
    const toAnswer = open.filter(o => o.id in p.answers && o.checked !== p.answers[o.id]);
    log(`${p.label} round ${round}: ${open.map(o => `${o.id}${o.checked ? `=${o.checked}` : ''}`).join(', ') || '(none)'}`);
    // A pre-selected lean that matches the chosen answer still has to be APPLIED while a blocking question is open.
    if (!toAnswer.length && !open.some(o => o.blocking)) break;
    if (!toAnswer.length && round > 0 && JSON.stringify(open.map(o => o.id)) === JSON.stringify(lastOpen)) break;
    lastOpen = open.map(o => o.id);
    for (const o of toAnswer) {
      const sel = `.cad-decision[data-decision-id="${o.id}"]`;
      if (o.entry) await page.fill(`${sel} input[data-decision-entry]`, p.answers[o.id]);
      else if (o.options.includes(p.answers[o.id])) await page.check(`${sel} input[type=radio][value="${p.answers[o.id]}"]`);
      else { (out.unanswerable as string[] | undefined)?.push(o.id) ?? (out.unanswerable = [`${o.id} (no option ${p.answers[o.id]}; offered ${o.options.join('|')})`]); }
    }
    // Wait for the re-analysis itself: a DFM job landing also re-renders the panel, and the loop then read the
    // pre-answer questions (the stub axle stopped after one round in the casting 360 re-run).
    const reanalysed = page.waitForResponse(r => r.url().includes('/api/cad/reanalyze') && r.request().method() === 'POST', { timeout: 600_000 });
    await page.click('#cad-decisions-apply');
    await reanalysed;
    await page.waitForTimeout(1500);
  }
  out.questions = asked;
  out.cadPanel = await page.evaluate(() => {
    const t = (s: string) => (document.querySelector(s)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return { banner: t('#cad-results .cad-sanity, #cad-results .cad-warnings'), header: t('#cad-results h3, #cad-results .cad-head').slice(0, 300) };
  });
  const filledBefore = await page.evaluate(() => document.documentElement.dataset.cadFilled ?? '');
  await page.click('#cad-apply-btn');
  await page.waitForFunction(b => (document.documentElement.dataset.cadFilled ?? '') !== b, filledBefore, { timeout: 180_000 });
  await page.waitForTimeout(800);
  out.form = await page.evaluate(() => {
    const active = document.querySelector('.ctab.active') as HTMLElement | null;
    const sel = (id: string) => { const e = document.getElementById(id) as HTMLSelectElement | null; return e ? { value: e.value, text: e.selectedOptions?.[0]?.textContent?.trim() } : null; };
    return { commodity: active?.dataset.commodity ?? active?.textContent?.trim(), title: document.querySelector('.wf-panel-header h2, .wf-panel-title')?.textContent?.trim(),
      materials: ['cast-mat', 'cam-mat', 'forge-mat', 'sm-mat', 'smf-mat', 'imm-mat', 'bm-mat', 'tf-mat', 'ext-mat', 'mach-mat', 'gear-mat', 'gear-material-class'].map(id => [id, sel(id)]).filter(([, v]) => v && (v as { value: string }).value) };
  });
  if (p.programmeYears && !p.programmeYearsFirst) {
    await page.fill('#programme-years', String(p.programmeYears));
    await page.dispatchEvent('#programme-years', 'change');
    await page.waitForTimeout(400);
  }
  out.inputsBeforeCalc = await page.evaluate(() => {
    const v = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? null;
    return { region: v('mfg-region-selector'), cadVolume: v('cad-annual-volume'), annualVolume: v('annual-volume'), programmeYears: v('programme-years'),
      amort: Array.from(document.querySelectorAll<HTMLInputElement>('input[id$="-amort"]')).filter(e => e.offsetParent !== null).map(e => [e.id, e.value, e.dataset.amortDefault ?? null]) };
  });
  await page.click('#calc-btn');
  await page.waitForFunction(() => /\d/.test(document.querySelector('#cv-result-hero .crh-total')?.textContent ?? ''), null, { timeout: 120_000 });
  await page.waitForTimeout(4000);
  // CV_DFM_WAIT_MS: wait for the background geometric DFM to land before exporting (default: do not wait — then the PDF
  // says "not included"). The casting 360 review exported mid-job and the stub axle's report had no DFM.
  const dfmWait = Number(process.env.CV_DFM_WAIT_MS ?? 0);
  if (dfmWait > 0) {
    out.dfmLanded = await page.waitForFunction(() => (document.getElementById('geometric-dfm-panel')?.innerHTML.length ?? 0) > 0, null, { timeout: dfmWait })
      .then(() => true, () => false);
    await page.waitForTimeout(1000);
  }
  out.screen = await page.evaluate(() => {
    const t = (s: string) => (document.querySelector(s)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      headline: t('#cv-result-hero .crh-total'), chips: t('#cv-result-hero .crh-chips'),
      breakdown: Array.from(document.querySelectorAll('#results-breakdown tbody tr')).map(r => r.textContent!.replace(/\s+/g, ' ').trim()),
      warnings: Array.from(document.querySelectorAll('#results-area .result-warning, #results-area .warning-item, .cv-warn li')).map(w => w.textContent!.replace(/\s+/g, ' ').trim()).slice(0, 20),
      commodity: (document.querySelector('.ctab.active') as HTMLElement | null)?.dataset.commodity ?? null,
    };
  });
  // Exports: the Excel workbook and the PDF report, as the buttons produce them.
  const xl = join(OUT, `${p.label}.xlsx`);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.evaluate(() => document.getElementById('export-excel-btn')!.click())]);
  await dl.saveAs(xl);
  const wb = XLSX.read(readFileSync(xl));
  out.excel = { sheets: wb.SheetNames, rows: Object.fromEntries(wb.SheetNames.map(n => [n, sheetRows(wb, n)])) };
  const pdf = join(OUT, `${p.label}.pdf`);
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.evaluate(() => document.getElementById('export-pdf-btn')!.click())]);
  await dl2.saveAs(pdf);
  out.pdf = pdf;
  out.calls = calls.map(c => {
    const b = c.body as Record<string, unknown> | undefined;
    const a = (b?.analysis ?? b) as Record<string, unknown> | undefined;
    return { url: c.url, status: c.status, commodity: (b?.commodity ?? a?.commodity ?? (b as { selectedCommodity?: string } | undefined)?.selectedCommodity) ?? null,
      ratesRegion: b?.ratesRegion ?? null, sanity: (b?.sanityWarnings as Array<{ code: string; message: string }> | undefined)?.map(w => `${w.code}: ${w.message}`) ?? null,
      decisions: (b?.decisions as Array<{ id: string; severity: string }> | undefined)?.map(d => `${d.id}(${d.severity})`) ?? null };
  });
  return out;
}

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-parts-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout?.on('data', d => { serverLog += d.toString(); if (serverLog.length > 400_000) serverLog = serverLog.slice(-200_000); });
  server.stderr?.on('data', d => { serverLog += d.toString(); });
  const summary: Array<Record<string, unknown>> = [];
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '6h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    for (const p of PARTS) {
      if (ONLY && !ONLY.has(p.label)) continue;
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', e => pageErrors.push(e.message));
      page.on('dialog', d => { pageErrors.push(`dialog: ${d.message()}`); void d.dismiss(); });
      // tsx names arrow functions with an `__name` helper that does not exist in the page.
      await page.addInitScript('window.__name = (f) => f;');
      await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
      const t0 = Date.now();
      let rec: Record<string, unknown>;
      try { rec = await costOne(page, base, p); }
      catch (e) {
        rec = { label: p.label, error: (e as Error).message.split('\n')[0] };
        try { await page.screenshot({ path: join(OUT, `${p.label}-error.png`), fullPage: false }); } catch { /* closed */ }
      }
      rec.seconds = Math.round((Date.now() - t0) / 1000);
      rec.pageErrors = pageErrors;
      writeFileSync(join(OUT, `${p.label}.json`), JSON.stringify(rec, null, 1));
      const s = rec.screen as { headline?: string; commodity?: string } | undefined;
      summary.push({ label: p.label, headline: s?.headline ?? null, commodity: s?.commodity ?? null, error: rec.error ?? null, seconds: rec.seconds });
      log(`${p.label}: ${rec.error ? `ERROR ${rec.error}` : `${s?.commodity} ${s?.headline}`} (${rec.seconds}s)`);
      writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
      await context.close();
    }
  } finally {
    writeFileSync(join(OUT, 'server.log'), serverLog.slice(-200_000));
    try { await browser?.close(); } catch { /* closed */ }
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(e => { log(`ERROR ${(e as Error).message}`); process.exit(1); });
