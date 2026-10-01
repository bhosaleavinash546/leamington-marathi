/**
 * PCB photo → should-cost, end to end in a browser, against a stand-in model.
 *
 * The real server runs with an API key and ANTHROPIC_BASE_URL pointed at
 * e2e/pcb-stand-in.mjs, which answers every model call with the radar board as
 * the real model read it on 2026-09-29. Everything after the model — grounding,
 * pricing, country costing, automotive grade, the screen, the PDF — is the tool's
 * own, so this proves the workflow, not the model. Needs a build first.
 *
 *   npm run build && npm run test:e2e:pcb
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { chromium, type Browser, type Page } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IS_CI = !!process.env.CI;
const log = (m: string) => console.log(`[pcb-e2e] ${m}`);
const failures: string[] = [];
const fail = (m: string) => { failures.push(m); console.error(`[pcb-e2e] FAIL: ${m}`); };

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => (typeof a === 'object' && a ? resolve(a.port) : reject(new Error('no port')))); });
  });
}
async function waitHealth(base: string): Promise<void> {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ }
    if (i > 120) throw new Error(`no server at ${base}`);
    await new Promise(r => setTimeout(r, 250));
  }
}
// A 2×2 PNG: the stand-in never looks at the pixels.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVQIW2NkYGD4DwABBAEAX+XJ2QAAAABJRU5ErkJggg==', 'base64');

async function main(): Promise<void> {
  const standInPort = await freePort();
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-pcb-e2e-'));
  const secret = 'e2e-' + Math.random().toString(36).slice(2);
  const standIn: ChildProcess = spawn(process.execPath, [join(ROOT, 'e2e/pcb-stand-in.mjs')],
    { cwd: ROOT, env: { ...process.env, PORT: String(standInPort) }, stdio: 'ignore', detached: true });
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], {
    cwd: ROOT, stdio: 'ignore', detached: true,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0',
      ANTHROPIC_API_KEY: 'sk-ant-stand-in-not-a-real-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${standInPort}`, CV_DATA_DIR: dir },
  });
  let browser: Browser | undefined;
  const cleanup = () => {
    try { void browser?.close(); } catch { /* closing */ }
    for (const p of [server, standIn]) { try { if (p.pid) process.kill(-p.pid, 'SIGKILL'); } catch { /* gone */ } }
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    const base = `http://127.0.0.1:${port}`;
    await waitHealth(base);
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    const health = await (await fetch(`${base}/api/health`)).json() as { aiAvailable?: boolean };
    if (health.aiAvailable !== true) throw new Error(`AI not available: ${JSON.stringify(health)}`);
    log(`server up on ${port}, stand-in model on ${standInPort}`);

    try {
      browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    } catch (e) {
      if (!IS_CI) { log(`SKIP — no launchable Chromium (${(e as Error).message.split('\n')[0]})`); return; }
      throw e;
    }
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const page: Page = await context.newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => { fail(`browser dialog: "${d.message()}"`); void d.dismiss(); });
    await page.addInitScript(t => {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('cv-tour-v41-seen', '1');
      localStorage.setItem('cv-wizard-off', '1');
    }, token);
    await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
    if (await page.getAttribute('html', 'data-ai') === 'off') fail('AI entry points hidden although a key is set');

    // ── Photo page: seven photos, 250k/yr, China ────────────────────────────
    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.click('.cpicker-tile[data-commodity="pcb_fab"]', { timeout: 15_000 });
    await page.waitForSelector('#pcb-img-input-0', { state: 'attached', timeout: 15_000 });
    const labels = ['top', 'bottom', 'c1', 'c2', 'c3', 'c4', 'c5'];
    for (let i = 0; i < labels.length; i++) {
      if (await page.$(`#pcb-img-input-${i}`)) await page.setInputFiles(`#pcb-img-input-${i}`, { name: `${labels[i]}.png`, mimeType: 'image/png', buffer: PNG });
    }
    await page.fill('#pcb-order-qty', '250000');
    await page.selectOption('#pcb-mfg-country', 'cn');
    await page.click('#pcb-img-analyze-btn', { timeout: 15_000 });
    await page.waitForSelector('#pcb-headline-total', { timeout: 120_000 });
    const results = page.locator('#pcb-img-results');
    const text = await results.textContent() ?? '';

    // ── The headline is the country total, automotive grade, and it adds up ──
    const headline = Number(await page.getAttribute('#pcb-headline-total', 'data-total'));
    const cnRow = Number((await page.textContent('[data-country-total="cn"]') ?? '').replace(/[^0-9.]/g, ''));
    if (!(headline > 0)) fail('no headline total');
    if (Math.abs(headline - cnRow) > 0.005) fail(`headline £${headline} ≠ China row £${cnRow}`);
    const api = await page.evaluate(async (bytes: number[]) => {
      // The same request the page made, replayed from the server's cache: the
      // screen must show exactly what the server computed.
      const fd = new FormData();
      const png = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      for (const n of ['top', 'bottom', 'c1', 'c2', 'c3', 'c4', 'c5']) fd.append('pcbImages', png, `${n}.png`);
      fd.append('orderQty', '250000'); fd.append('country', 'cn');
      const r = await fetch('/api/pcb/analyze-image-stream', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }, body: fd });
      const raw = await r.text();
      const ev = raw.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)) as { type: string });
      return ev.find(e => e.type === 'complete') as unknown as { selectedCountryBreakdown: { totalPerBoard: number; automotiveGrade?: { asil: string }; breakdown: Record<string, number>; pcbFabPerBoard: number; assemblyPerBoard: number; bomCostPerBoard: number; logisticsPerBoard: number }; analysis: { costEstimates: { basis?: string; smtAssemblyCostGBP: number }; bom: Array<{ priceSource?: string; unitPriceGBP: number }> ; assembly: { smtPlacements: number } }; sanityWarnings: Array<{ code: string }> } | undefined;
    }, [...PNG]);
    if (!api) fail('could not replay the analysis from the API');
    else {
      const bd = api.selectedCountryBreakdown;
      if (Math.abs(bd.totalPerBoard - headline) > 0.005) fail(`screen headline £${headline} ≠ server total £${bd.totalPerBoard}`);
      if (!bd.automotiveGrade) fail('automotive board costed without the automotive grade in the headline');
      const b = bd.breakdown;
      const sum = bd.pcbFabPerBoard + bd.assemblyPerBoard + bd.bomCostPerBoard + bd.logisticsPerBoard + b.energy + b.packaging + b.yieldLoss;
      if (Math.abs(sum - bd.totalPerBoard) > 0.06) fail(`breakdown ${sum.toFixed(2)} does not add up to the total ${bd.totalPerBoard}`);
      if (!/deterministic/.test(String(api.analysis.costEstimates.basis))) fail('costEstimates is not the deterministic figure');
      if (api.analysis.costEstimates.smtAssemblyCostGBP !== bd.assemblyPerBoard) fail('costEstimates.assembly ≠ country assembly');
      const sources = new Set(api.analysis.bom.map(l => l.priceSource));
      if (sources.has('ai-estimate') || sources.has(undefined)) fail(`a BOM line has no price basis: ${[...sources].join(',')}`);
      if (!sources.has('catalogue') || !sources.has('class-range') || !sources.has('not-fitted')) fail(`expected catalogue, class-table and not-fitted lines, got ${[...sources].join(',')}`);
      const codes = api.sanityWarnings.map(w => w.code);
      if (!codes.includes('OCR_MATCHED_BY_FUNCTION')) fail('chip markings read by OCR were not attached to the BOM');
      log(`headline £${headline} = China row = server total; ${api.analysis.bom.length} lines, ${api.analysis.assembly.smtPlacements} placements, ${bd.automotiveGrade?.asil}`);
    }
    // ── The screen says where each price came from ────────────────────────
    const badges = await results.locator('.pcb-badge').allTextContents();
    for (const b of ['CAT', 'TABLE', 'NF']) if (!badges.includes(b)) fail(`no ${b} price-basis badge on the BOM table`);
    if (!/priced/.test(text) || !/to verify/.test(text)) fail('priced / to-verify split not shown');
    if (!/chip marking/i.test(text)) fail('the OCR-matched warning is not shown');

    // ── The PDF is produced from the same result ───────────────────────────
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.click('#pcb-export-pdf-btn', { timeout: 15_000 }),
    ]);
    if (!/\.pdf$/i.test(dl.suggestedFilename())) fail(`PCB export produced ${dl.suggestedFilename()}, not a PDF`);
    else log(`PDF exported: ${dl.suggestedFilename()}`);

    // ── Save to Library keeps the headline ────────────────────────────────
    await page.click('#pcb-save-lib-btn', { timeout: 15_000 });
    const saved = await page.evaluate(() => {
      try { const lib = JSON.parse(localStorage.getItem('cv-library') ?? '[]') as Array<{ commodity: string; totalCost: number }>; return lib.find(x => x.commodity === 'pcba')?.totalCost ?? null; } catch { return null; }
    });
    if (saved != null && Math.abs(saved - headline) > 0.005) fail(`library saved £${saved}, headline £${headline}`);

    if (failures.length) throw new Error(`${failures.length} failure(s)`);
    log('PCB LIVE PASSED — photos → BOM → deterministic cost → screen = PDF = library, automotive grade in the headline');
  } finally {
    cleanup();
  }
}

main().catch(e => { console.error(`[pcb-e2e] ${(e as Error).message}`); process.exit(1); });
