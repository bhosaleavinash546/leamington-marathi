/**
 * The 360° surround-view camera board (live trial, 6 Oct 2026), end to end in a browser: two photos +
 * a PICTURE of the BOM, China, 250,000 a year → Analyze → Calculate → edit a field → Calculate.
 * The stand-in model replays the reading of that board (fixtures/pcb-camera-replies.json); every
 * figure after it is the tool's own arithmetic. Each check is a gap the trial found.
 *
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
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { chromium, type Browser, type Page } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IS_CI = !!process.env.CI;
const log = (m: string) => console.log(`[pcb-camera-e2e] ${m}`);
const failures: string[] = [];
const fail = (m: string) => { failures.push(m); console.error(`[pcb-camera-e2e] FAIL: ${m}`); };

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

/** The text a jsPDF file draws (uncompressed content streams: each string is a "(…) Tj"). */
function pdfText(buf: Buffer): string {
  const raw = buf.toString('latin1');
  return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(m => m[1].replace(/\\([()\\])/g, '$1')).join('\n');
}

async function main(): Promise<void> {
  const standInPort = await freePort();
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-pcb-camera-e2e-'));
  // The live run's classifier (6 Oct 2026): "automotive_adas" and ASIL-C with a RADAR description
  // of this camera board. The tool must cost what the parts list supports and say so.
  const replies = JSON.parse(readFileSync(join(ROOT, 'e2e/fixtures/pcb-camera-replies.json'), 'utf8'));
  replies.stage1 = { domain: 'automotive_adas', conf: 0.82, hints: ['automotive camera module', 'FPD-Link serializer'] };
  replies.asil = { asilLevel: 'ASIL-C',
    asilRationale: 'Automotive radar transceiver module with RF signal processing and power conditioning. RF signal integrity critical for radar object detection and collision avoidance.',
    safetyFunctions: ['Radar target detection and range measurement', 'Velocity estimation via Doppler processing'] };
  const repliesPath = join(dir, 'camera-live-replies.json');
  writeFileSync(repliesPath, JSON.stringify(replies));
  const secret = 'e2e-' + Math.random().toString(36).slice(2);
  const standIn: ChildProcess = spawn(process.execPath, [join(ROOT, 'e2e/pcb-stand-in.mjs')],
    { cwd: ROOT, env: { ...process.env, PORT: String(standInPort), REPLIES: repliesPath }, stdio: 'ignore', detached: true });
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

    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.click('.cpicker-tile[data-commodity="pcb_fab"]', { timeout: 15_000 });
    await page.waitForSelector('#pcb-img-input-0', { state: 'attached', timeout: 15_000 });
    await page.setInputFiles('#pcb-img-input-0', { name: 'camera-top.png', mimeType: 'image/png', buffer: PNG });
    await page.setInputFiles('#pcb-img-input-1', { name: 'camera-bottom.png', mimeType: 'image/png', buffer: PNG });
    await page.setInputFiles('#pcb-bom-input', { name: 'BOM.jpg', mimeType: 'image/jpeg', buffer: PNG });
    await page.fill('#pcb-order-qty', '250000');
    await page.selectOption('#pcb-mfg-country', 'cn');
    await page.click('#pcb-img-analyze-btn', { timeout: 15_000 });
    await page.waitForSelector('#pcb-headline-total', { timeout: 120_000 });
    const text = await page.locator('#pcb-img-results').textContent() ?? '';
    const headline = Number(await page.getAttribute('#pcb-headline-total', 'data-total'));
    const cnRow = Number((await page.textContent('[data-country-total="cn"]') ?? '').replace(/[^0-9.]/g, ''));
    if (Math.abs(headline - cnRow) > 0.005) fail(`headline £${headline} ≠ China row £${cnRow}`);

    // The analysis as the server computed it (same request, replayed from the cache).
    const api = await page.evaluate(async (bytes: number[]) => {
      const fd = new FormData();
      const png = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      fd.append('pcbImages', png, 'camera-top.png'); fd.append('pcbImages', png, 'camera-bottom.png');
      fd.append('bomFile', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'BOM.jpg');
      fd.append('orderQty', '250000'); fd.append('country', 'cn');
      const r = await fetch('/api/pcb/analyze-image-stream', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }, body: fd });
      const ev = (await r.text()).split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)) as { type: string });
      return ev.find(e => e.type === 'complete') as unknown as {
        analysis: { boardSpec: { widthMm: number; heightMm: number }; bom: Array<{ refDes: string; partNumber?: string; priceSource: string; unitPriceGBP: number; qty: number; description: string }>; assembly: { smtPlacements: number } };
        selectedCountryBreakdown: { totalPerBoard: number; pcbFabPerBoard: number; assemblyPerBoard: number; bomCostPerBoard: number; logisticsPerBoard: number; breakdown: Record<string, number> };
        sanityWarnings: Array<{ code: string; message: string }>; bomCompleteness: { estimatedMissingPassiveCount: number }; boardDomain: string;
        asilLevel?: string; asilClaimed?: string; asilRationale?: string; automotiveAssemblyCost?: { burnInGBP: number } };
    }, [...PNG]);
    const a = api.analysis, bd = api.selectedCountryBreakdown, codes = api.sanityWarnings.map(w => w.code);
    // 1. The board is the size on its data sheet (20×20 mm), not 59×59.
    if (a.boardSpec.widthMm !== 20 || a.boardSpec.heightMm !== 20) fail(`board ${a.boardSpec.widthMm}×${a.boardSpec.heightMm} mm, not 20×20`);
    // 2. The BOM is the picture's 11 rows, 80 parts; the level-5 summary rows are not parts.
    const parts = a.bom.reduce((t, l) => t + l.qty, 0);
    if (a.bom.length !== 11 || parts !== 80) fail(`BOM ${a.bom.length} lines / ${parts} parts, expected 11 / 80`);
    // 3. Named parts are priced from the catalogue; nothing is in the SOIC "unknown" range.
    const by = (re: RegExp) => a.bom.find(l => re.test(`${l.partNumber ?? ''} ${l.description}`))!;
    for (const pn of ['DS90UB935', 'LM53600', 'TPS62422', 'TLV70233', 'BQ24025']) if (by(new RegExp(pn)).priceSource !== 'catalogue') fail(`${pn} not catalogue-priced (${by(new RegExp(pn)).priceSource})`);
    const sensor = by(/Image sensor/), ferrite = by(/^ Ferrite|Ferrite/), cap = by(/Ceramic Capacitor/);
    if (sensor.unitPriceGBP < 4) fail(`image sensor priced £${sensor.unitPriceGBP} — an automotive imager is not a £0.45 part`);
    if (ferrite.unitPriceGBP > 0.1) fail(`ferrite bead priced £${ferrite.unitPriceGBP}`);
    if (cap.unitPriceGBP > 0.04) fail(`"<= 1206" MLCC priced £${cap.unitPriceGBP} as a 1206 part`);
    // 4. No false "parts not in your BOM" (the BOM has no designators) and no "missing passives".
    if (codes.includes('AI_PARTS_NOT_IN_BOM_FILE')) fail('designator diff run against a BOM with no designators');
    if (api.bomCompleteness?.estimatedMissingPassiveCount) fail(`"${api.bomCompleteness.estimatedMissingPassiveCount} missing passives" against a supplied BOM`);
    // 5. Automotive (the classifier and 4 of 5 -Q1 ICs agree; the BOM-only path is in tests/pcba-report.test.ts).
    if (api.boardDomain !== 'automotive_adas') fail(`board costed as "${api.boardDomain}"`);
    // 5b. The classifier's ASIL-C rests on a radar description of a camera: costed ASIL-B, no burn-in, text withheld.
    if (api.asilLevel !== 'ASIL-B' || api.asilClaimed !== 'ASIL-C') fail(`ASIL costed ${api.asilLevel} (claimed ${api.asilClaimed}), expected ASIL-B from a claimed ASIL-C`);
    if ((api.automotiveAssemblyCost?.burnInGBP ?? 0) > 0) fail(`burn-in £${api.automotiveAssemblyCost!.burnInGBP} charged on an ASIL-B camera board`);
    if (/radar|doppler/i.test(api.asilRationale ?? '')) fail('the radar rationale reached the response');
    if (!codes.includes('ASIL_CHECKED_AGAINST_BOM')) fail('no ASIL_CHECKED_AGAINST_BOM note');
    // 6. ICT at 250k is the test time + fixture share, not the small-batch £2.64.
    log(`breakdown ${JSON.stringify(bd.breakdown)}`);
    log(`analysis: £${headline}/board — fab £${bd.pcbFabPerBoard}, assembly £${bd.assemblyPerBoard}, BOM £${bd.bomCostPerBoard}, logistics £${bd.logisticsPerBoard}; ${a.bom.length} lines, ${parts} parts, ${a.boardSpec.widthMm}×${a.boardSpec.heightMm} mm`);
    log(`lines ${JSON.stringify(a.bom.map(l => [l.partNumber || l.description, l.qty, Math.round(l.unitPriceGBP * 10000) / 10000, l.priceSource]))}`);

    // ── Calculate with nothing edited = the analysis ──
    const formW = await page.inputValue('#pcbf-board-w'), formL = await page.inputValue('#pcbf-layers');
    if (formW !== '20' || formL !== '8') fail(`form not filled from the analysis (width ${formW}, layers ${formL})`);
    await page.click('#calc-btn', { timeout: 15_000 });
    await page.waitForSelector('.total-row', { timeout: 30_000 });
    const calcTotal = Number(((await page.locator('.total-row td').nth(1).textContent()) ?? '').replace(/[^0-9.]/g, ''));
    if (Math.abs(calcTotal - headline) > 0.005) fail(`Calculate gave £${calcTotal}, the analysis £${headline}`);
    else log(`Calculate with nothing edited: £${calcTotal} = the analysis headline`);
    if (process.env.CV_SHOT_DIR) await page.screenshot({ path: join(process.env.CV_SHOT_DIR, 'pcb-camera-calculate.png') });

    // ── The should-cost report of that costing: a PCBA report, not a machined-part one ──
    const dl = page.waitForEvent('download', { timeout: 30_000 });
    await page.evaluate(() => (document.getElementById('export-pdf-btn') as HTMLButtonElement).click());
    const pdfPath = join(dir, 'camera-report.pdf');
    await (await dl).saveAs(pdfPath);
    if (process.env.CV_SHOT_DIR) writeFileSync(join(process.env.CV_SHOT_DIR, 'camera-report.pdf'), readFileSync(pdfPath));
    const pdf = pdfText(readFileSync(pdfPath));
    for (const must of ['Built in: China', 'Delivered: UK, duty paid', 'Cost Breakdown per Board', 'UK import duty', 'Bill of Materials',
      'Build-Country Comparison', 'Costed as ASIL-B (the photo classifier said ASIL-C)', `£${headline.toFixed(2)}`]) {
      if (!pdf.includes(must)) fail(`report lacks "${must}"`);
    }
    for (const never of ['Pass-through', 'mat-virtual', 'Net weight', 'traced operations', 'Machine Rate', 'Indexation', 'Embodied Carbon',
      'Regional Cost Comparison', 'excludes import duty', 'Doppler', 'Radar target', 'PCB FAB', 'Region: UK', 'press Calculate']) {
      if (pdf.includes(never)) fail(`report still prints "${never}"`);
    }
    log(`report: ${pdf.length} chars of text, PCBA body, headline £${headline.toFixed(2)}`);

    // ── Edit a field → Calculate re-prices the analysis with it ──
    await page.selectOption('#pcbf-layers', '6');
    await page.click('#calc-btn', { timeout: 15_000 });
    await page.waitForFunction((h: number) => {
      const t = Number(document.getElementById('pcb-headline-total')?.getAttribute('data-total'));
      return t > 0 && Math.abs(t - h) > 0.005;
    }, headline, { timeout: 60_000 }).catch(() => fail('editing layers did not re-price the analysis'));
    await page.waitForTimeout(1500);
    const headline6 = Number(await page.getAttribute('#pcb-headline-total', 'data-total'));
    const calc6 = Number(((await page.locator('.total-row td').nth(1).textContent()) ?? '').replace(/[^0-9.]/g, ''));
    if (!(headline6 < headline)) fail(`6 layers (£${headline6}) not cheaper than 8 (£${headline})`);
    if (Math.abs(calc6 - headline6) > 0.005) fail(`after the edit Calculate gave £${calc6}, the re-priced analysis £${headline6}`);
    else log(`edited to 6 layers: analysis re-priced £${headline} → £${headline6}, Calculate £${calc6}`);
    if (!/BOM taken from your BOM image/.test(text)) fail('BOM picture not used');

    if (failures.length) throw new Error(`${failures.length} failure(s)`);
    log('CAMERA BOARD PASSED — photos + BOM picture → analysis → Calculate = analysis → edit → re-priced');
  } finally {
    cleanup();
  }
}

main().catch(e => { console.error(`[pcb-camera-e2e] ${(e as Error).message}`); process.exit(1); });
