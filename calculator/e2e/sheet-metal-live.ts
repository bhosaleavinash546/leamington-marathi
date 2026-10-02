/**
 * Live end-to-end run of a sheet-metal STEP (the seat bracket by default)
 * through a real server and a real browser, at whichever checkout ROOT points
 * to: upload, answer the material, apply the rules to the form, Calculate.
 * Writes live-<label>.json — every rule-filled field with its provenance, the
 * server's blank record, the cost breakdown — and the DXF the tool developed,
 * so two checkouts can be compared field by field (docs/sheet-metal/
 * blank-development-research-2026-10.md §5.4). Needs the OCP kernel.
 *
 *   npm run test:e2e:sheet                                      # this checkout, label "live"
 *   npx tsx e2e/sheet-metal-live.ts <calculator dir> <label> [blank.dxf]
 *   CV_LIVE_OUT=/some/dir CV_LIVE_PART=/path/part.step npx tsx e2e/sheet-metal-live.ts . mine
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

import { resolve } from 'node:path';
/** The calculator checkout to run (its server and its built bundle); '.' for this one. */
const ROOT = resolve(process.argv[2] ?? '.');
const LABEL = process.argv[3] ?? 'run';
/** Optional: a developed-blank DXF to attach, as the FASTBLANK file would be. */
const DXF = process.argv[4];
const PART = process.env.CV_LIVE_PART ?? resolve(ROOT, '..', 'cad-audit', 'parts', 'Seat_Locking_Bracket.stp');
/** Where live-<label>.json and the tool's DXF are written. */
const OUT = process.env.CV_LIVE_OUT ?? tmpdir();
const log = (m: string) => process.stdout.write(`[${LABEL}] ${m}\n`);
const freePort = () => new Promise<number>((resolve, reject) => {
  const s = createServer(); s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); });
});
const heroTotal = (page: Page) => page.evaluate(() => {
  const h = document.getElementById('cv-result-hero');
  if (!h || getComputedStyle(h).display === 'none') return null;
  const m = h.textContent?.match(/£\s*([\d,]+\.\d{2})/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
});

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-live-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout?.on('data', d => { serverLog += d.toString(); });
  server.stderr?.on('data', d => { serverLog += d.toString(); });
  const cleanup = () => { try { if (server.pid) process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } rmSync(dir, { recursive: true, force: true }); };
  const summary: Record<string, unknown> = { label: LABEL, root: ROOT };
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
      if (i > 240) throw new Error('server did not start:\n' + serverLog.slice(-2000));
      await new Promise(r => setTimeout(r, 250));
    }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    log(`server up on ${port}`);

    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => { pageErrors.push(`dialog: ${d.message()}`); void d.dismiss(); });
    let analyzeJson: Record<string, unknown> | null = null;
    const calls: Array<Record<string, unknown>> = [];
    page.on('response', async r => {
      const u = r.url();
      if ((u.includes('/api/cad/analyze') || u.includes('/api/cad/reanalyze')) && r.request().method() === 'POST') {
        try {
          const j = await r.json() as Record<string, unknown>;
          analyzeJson = j;
          const post = r.request().postData() ?? '';
          const fields = u.includes('reanalyze') ? post.slice(0, 600) : [...post.matchAll(/name="([^"]+)"/g)].map(m => m[1]).join(',');
          const a = j.analysis as Record<string, unknown> | undefined;
          calls.push({ url: u.replace(/^.*\/api/, '/api'), status: r.status(), fields, decisions: (j.decisions as Array<{ id: string }> | undefined)?.map(d => d.id),
            recommended: (a?.costInputSuggestions as { recommendedCommodity?: string } | undefined)?.recommendedCommodity, geometrySource: j.geometrySource, fromCache: j.fromCache, mode: j.mode,
            error: j.error, costable: j.costable, hasBlank: !!(j.occtGeometry as { blank?: unknown } | undefined)?.blank, timings: j.timings });
        } catch { calls.push({ url: u, status: r.status(), unparsed: true }); }
      }
    });
    await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
    await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });

    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="cad_analysis"]:visible').first().click({ timeout: 15_000 });
    await page.waitForTimeout(300);
    await page.setInputFiles('#cad-file-input', PART);
    // CV_LIVE_VOLUME sets the annual volume the analysis runs at (sheet-metal review: the route choice is volume-led).
    if (process.env.CV_LIVE_VOLUME) await page.fill('#cad-annual-volume', process.env.CV_LIVE_VOLUME).catch(() => log('no #cad-annual-volume field'));
    if (DXF && existsSync(DXF)) {
      const hasBlankInput = await page.$('#cad-blank-input');
      if (hasBlankInput) { await page.setInputFiles('#cad-blank-input', DXF); log(`attached DXF ${DXF}`); }
      else log('this build has no DXF upload field');
    }
    const t0 = Date.now();
    await page.click('#cad-analyze-btn');
    const ANSWERS: Record<string, string> = process.env.CV_LIVE_ANSWERS
      ? JSON.parse(process.env.CV_LIVE_ANSWERS) as Record<string, string>
      : { 'commodity.route': 'sheet_metal', 'material.family': 'steel' };
    const rounds: string[] = [];
    for (let round = 0; round < 6; round++) {
      await page.waitForSelector('#cad-results #cad-apply-btn, #cad-results .cad-decision', { timeout: 300_000 });
      await page.waitForTimeout(400);
      const open = await page.$$eval('#cad-decisions-panel .cad-decision', ds => ds.map(d => ({
        id: (d as HTMLElement).dataset.decisionId!, typed: !!d.querySelector('input[data-decision-entry]'),
        text: (d as HTMLElement).textContent!.replace(/\s+/g, ' ').trim().slice(0, 900),
        preselected: (d.querySelector('input[type=radio]:checked') as HTMLInputElement | null)?.value ?? null })));
      summary[`questionsRound${round}`] = open;
      rounds.push(open.map(o => o.id).join(','));
      const toAnswer = open.filter(o => o.id in ANSWERS);
      if (!toAnswer.length) { if (open.length) summary.unansweredDecisions = open; break; }
      for (const o of toAnswer) {
        const sel = `.cad-decision[data-decision-id="${o.id}"]`;
        if (o.typed) await page.fill(`${sel} input[data-decision-entry]`, ANSWERS[o.id]);
        else await page.check(`${sel} input[type=radio][value="${ANSWERS[o.id]}"]`);
      }
      const before = await page.evaluate(() => document.getElementById('cad-results')!.innerHTML.length);
      await page.click('#cad-decisions-apply');
      await page.waitForFunction(b => document.getElementById('cad-results')!.innerHTML.length !== b, before, { timeout: 300_000 });
    }
    summary.analyzeMs = Date.now() - t0;
    summary.calls = calls;
    summary.decisionRounds = rounds;
    // What the results panel says about the geometry and the blank.
    summary.geometrySummary = await page.evaluate(() => (document.querySelector('#cad-results')?.textContent ?? '').replace(/\s+/g, ' ').match(/Blank:[^\n]{0,260}/)?.[0] ?? null);
    summary.dxfLink = await page.$eval('#cad-results a[href*="/blank.dxf"]', a => (a as HTMLAnchorElement).getAttribute('href')).catch(() => null);
    const aj = analyzeJson as Record<string, unknown> | null;
    const geo = aj?.geometry as Record<string, unknown> | undefined;
    const occt = (aj?.occtGeometry ?? geo) as Record<string, unknown> | undefined;
    summary.serverGeometry = occt ? { sheetMetal: occt.sheetMetal, volume: occt.volume, surfaceArea: occt.surfaceArea, boundingBox: occt.boundingBox, blank: occt.blank && { ...(occt.blank as object), outline: undefined, forming: (occt.blank as { forming?: { strainPoints?: unknown } }).forming && { ...(occt.blank as { forming: object }).forming, strainPoints: undefined } } } : null;
    summary.blankDxfError = aj?.blankDxfError ?? null;
    summary.blankHash = aj?.blankHash ?? null;
    const sugg = (aj?.analysis as { costInputSuggestions?: { sheetMetal?: unknown } } | undefined)?.costInputSuggestions?.sheetMetal;
    summary.suggestionsSheetMetal = sugg ?? null;
    summary.ruleFields = (aj?.ruleFields ?? aj?._cadRuleFields ?? null);

    await page.click('#cad-apply-btn');
    await page.waitForTimeout(1500);
    const fields = ['sm-mat', 'sm-net-wt', 'sm-blank-l', 'sm-blank-w', 'sm-thick', 'sm-perim', 'sm-shear', 'sm-strip-w', 'sm-pitch', 'sm-pps', 'sm-spm', 'sm-press', 'sm-num-ops', 'sm-die-type', 'sm-die-cost', 'sm-die-life', 'sm-amort', 'sm-press-line', 'sm-presses', 'sm-blanking', 'sm-blank-bpm', 'sm-addendum'];
    summary.form = await page.evaluate(ids => Object.fromEntries(ids.map(id => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      return [id, el ? { value: el.value, prov: el.getAttribute('data-prov'), title: (el.getAttribute('title') ?? '').slice(0, 220) } : null];
    })), fields);
    // Every field of whichever commodity form is on screen, for parity checks.
    summary.allFields = await page.evaluate(() => Object.fromEntries(
      Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('#commodity-form-area input[id], #commodity-form-area select[id]'))
        .filter(e => (e as HTMLInputElement).type !== 'file')
        .map(e => [e.id, { value: e.value, prov: e.getAttribute('data-prov'), title: (e.getAttribute('title') ?? '').slice(0, 200) }])));
    summary.formWarnings = await page.evaluate(() => (document.getElementById('validation-errors')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400));
    await page.click('#calc-btn');
    await page.waitForTimeout(1500);
    summary.total = await heroTotal(page);
    summary.breakdown = await page.$$eval('#results-breakdown tbody tr', rs => rs.map(r => r.textContent!.replace(/\s+/g, ' ').trim())).catch(() => null);
    summary.checks = await page.evaluate(() => (document.querySelector('#results-checks, #self-audit, .self-audit')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 600));
    summary.validation = await page.evaluate(() => (document.getElementById('validation-errors')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400));
    summary.pageErrors = pageErrors;
    // Pull the DXF the tool developed, for the second run.
    if (summary.blankHash) {
      const r = await fetch(`${base}/api/cad/blank/${summary.blankHash}/blank.dxf`, { headers: { Authorization: `Bearer ${token}` } });
      summary.dxfStatus = r.status;
      if (r.ok) { const text = await r.text(); writeFileSync(join(OUT, `seat-${LABEL}.dxf`), text); summary.dxfBytes = text.length; }
    }
    writeFileSync(join(OUT, `live-${LABEL}.json`), JSON.stringify(summary, null, 2));
    log(`total £${summary.total} — written live-${LABEL}.json`);
  } catch (e) {
    summary.error = (e as Error).message;
    summary.serverLog = serverLog.slice(-3000);
    writeFileSync(join(OUT, `live-${LABEL}.json`), JSON.stringify(summary, null, 2));
    log(`ERROR ${(e as Error).message.split('\n')[0]}`);
    process.exitCode = 1;
  } finally {
    try { await browser?.close(); } catch { /* closing */ }
    cleanup();
  }
}
main();
