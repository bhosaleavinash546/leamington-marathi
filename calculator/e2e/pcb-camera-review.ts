/**
 * PCB 360 review (12 Oct 2026): the 360° camera board through a real server and a real browser with EIGHT realistic
 * photos (4032×3024 JPEGs, distinct content) and a BOM picture, China, 250,000 a year. The stand-in replays the model's
 * recorded reading of that board (fixtures/pcb-camera-replies.json) and LOGS every request the server sends it — which
 * stage, which model, and every image attached — so the review can prove what reaches the model. Writes to CV_OUT:
 * request-log.jsonl, analysis.json (the screen's own response), screen.png, report.pdf (should-cost), pcb-report.pdf,
 * pcb-report.xlsx. Needs a build first.
 *
 *   npm run build && PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium CV_OUT=out npx tsx e2e/pcb-camera-review.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { chromium, type Browser } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.env.CV_OUT ?? join(tmpdir(), 'pcb-camera-review'));
const PHOTOS = Number(process.env.CV_PHOTOS ?? 8);
// Real photos instead of generated ones: CV_PHOTO_FILES=top.jpg,bottom.jpg,… (slot order); CV_BOM_FILE=bom.jpg.
const PHOTO_FILES = (process.env.CV_PHOTO_FILES ?? '').split(',').map(x => x.trim()).filter(Boolean);
const BOM_FILE = process.env.CV_BOM_FILE ?? '';
// After the first exports: fields an engineer types from the board data sheet, then Calculate re-prices (/reprice).
const EDITS = JSON.parse(process.env.CV_EDITS ?? '{}') as Record<string, string>;
const log = (m: string) => console.log(`[pcb-review] ${m}`);

function freePort(): Promise<number> {
  return new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => (typeof a === 'object' && a ? res(a.port) : rej(new Error('no port')))); }); });
}
async function waitHealth(base: string): Promise<void> {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ }
    if (i > 160) throw new Error(`no server at ${base}`);
    await new Promise(r => setTimeout(r, 250));
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const reqLog = join(OUT, 'request-log.jsonl');
  if (existsSync(reqLog)) rmSync(reqLog);
  const standInPort = await freePort(), port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-pcb-review-'));
  // the live run's classifier output (6 Oct 2026), as e2e/pcb-camera-live.ts replays it
  const replies = JSON.parse(readFileSync(join(ROOT, 'e2e/fixtures/pcb-camera-replies.json'), 'utf8'));
  replies.stage1 = { domain: 'automotive_adas', conf: 0.82, hints: ['automotive camera module', 'FPD-Link serializer'] };
  replies.asil = { asilLevel: 'ASIL-C',
    asilRationale: 'Automotive radar transceiver module with RF signal processing and power conditioning. RF signal integrity critical for radar object detection and collision avoidance.',
    safetyFunctions: ['Radar target detection and range measurement', 'Velocity estimation via Doppler processing'] };
  const repliesPath = join(dir, 'replies.json');
  writeFileSync(repliesPath, JSON.stringify(replies));
  const secret = 'e2e-' + Math.random().toString(36).slice(2);
  const standIn: ChildProcess = spawn(process.execPath, [join(ROOT, 'e2e/pcb-stand-in.mjs')],
    { cwd: ROOT, env: { ...process.env, PORT: String(standInPort), REPLIES: repliesPath, REQUEST_LOG: reqLog }, stdio: 'ignore', detached: true });
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0',
      ANTHROPIC_API_KEY: 'sk-ant-stand-in-not-a-real-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${standInPort}`, CV_DATA_DIR: dir },
  });
  const serverLog: string[] = [];
  server.stdout?.on('data', d => serverLog.push(String(d))); server.stderr?.on('data', d => serverLog.push(String(d)));
  let browser: Browser | undefined;
  try {
    const base = `http://127.0.0.1:${port}`;
    await waitHealth(base);
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, viewport: { width: 1440, height: 900 } });

    // 1. Eight realistic photos: 4032×3024 JPEGs with distinct content (a phone camera's size).
    const gen = await context.newPage();
    const photos: Buffer[] = PHOTO_FILES.map(f => readFileSync(f));
    for (let i = 1; i <= (PHOTO_FILES.length ? 0 : PHOTOS); i++) {
      // a string, not a function: the TS transpiler's __name helper does not exist in the page
      const b64 = await gen.evaluate(`(() => {
        const n = ${i}; const c = document.createElement('canvas'); c.width = 4032; c.height = 3024;
        const x = c.getContext('2d');
        x.fillStyle = 'hsl(' + n * 40 + ',40%,30%)'; x.fillRect(0, 0, c.width, c.height);
        let seed = n * 7919; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
        for (let k = 0; k < 9000; k++) { x.fillStyle = 'hsl(' + Math.floor(rnd() * 360) + ',50%,' + (20 + rnd() * 60) + '%)'; x.fillRect(rnd() * 4032, rnd() * 3024, 8 + rnd() * 60, 8 + rnd() * 40); }
        x.fillStyle = '#fff'; x.font = 'bold 300px sans-serif'; x.fillText('PHOTO ' + n, 400, 1600);
        return c.toDataURL('image/jpeg', 0.92).split(',')[1];
      })()`) as string;
      photos.push(Buffer.from(b64, 'base64'));
    }
    await gen.close();
    log(`photos: ${photos.map(p => `${(p.length / 1e6).toFixed(2)} MB`).join(', ')}`);

    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => { pageErrors.push(`dialog: ${d.message()}`); void d.dismiss(); });
    await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
    await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.click('.cpicker-tile[data-commodity="pcb_fab"]', { timeout: 15_000 });
    await page.waitForSelector('#pcb-img-input-0', { state: 'attached', timeout: 15_000 });
    const slots = await page.locator('input[id^="pcb-img-input-"]').count();
    log(`photo slots on the screen: ${slots}`);
    for (let i = 0; i < Math.min(photos.length, slots); i++) {
      await page.setInputFiles(`#pcb-img-input-${i}`, { name: PHOTO_FILES[i] ? PHOTO_FILES[i].split('/').pop()! : `camera-photo-${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: photos[i] });
    }
    await page.setInputFiles('#pcb-bom-input', BOM_FILE
      ? { name: BOM_FILE.split('/').pop()!, mimeType: 'image/jpeg', buffer: readFileSync(BOM_FILE) }
      : { name: 'BOM.jpg', mimeType: 'image/jpeg', buffer: photos[0] });
    await page.fill('#pcb-order-qty', '250000');
    await page.selectOption('#pcb-mfg-country', 'cn');

    // 2. Analyze — capture the screen's OWN request and response.
    const reqP = page.waitForRequest(r => r.url().includes('/api/pcb/analyze-image'), { timeout: 60_000 });
    const respP = page.waitForResponse(r => r.url().includes('/api/pcb/analyze-image'), { timeout: 300_000 });
    await page.click('#pcb-img-analyze-btn', { timeout: 15_000 });
    const req = await reqP;
    const body = req.postDataBuffer();
    const sent = { url: req.url(), bytes: body?.length ?? 0,
      parts: body ? [...body.toString('latin1').matchAll(/name="([^"]+)"(?:; filename="([^"]+)")?/g)].map(m => m[2] ? `${m[1]}=${m[2]}` : m[1]) : [] };
    log(`browser sent ${sent.bytes} bytes to ${sent.url}: ${sent.parts.join(', ')}`);
    const resp = await respP;
    const text = await resp.text();
    const events = text.split('\n').filter(l => l.startsWith('data: ')).map(l => { try { return JSON.parse(l.slice(6)); } catch { return null; } }).filter(Boolean);
    const complete = events.find((e: { type?: string }) => e.type === 'complete') ?? null;
    writeFileSync(join(OUT, 'analysis.json'), JSON.stringify({ sent, status: resp.status(), events: events.filter((e: { type?: string }) => e.type !== 'complete'), complete }, null, 1));
    await page.waitForSelector('#pcb-headline-total', { timeout: 120_000 });
    const headline = Number(await page.getAttribute('#pcb-headline-total', 'data-total'));
    const resultsText = (await page.locator('#pcb-img-results').textContent()) ?? '';
    writeFileSync(join(OUT, 'screen-text.txt'), resultsText.replace(/\s+/g, ' '));
    await page.screenshot({ path: join(OUT, 'screen.png'), fullPage: true });
    log(`headline £${headline}`);

    // 3. Exports from the photo results, then Calculate and the should-cost PDF.
    const save = async (btn: string, name: string) => {
      const dl = page.waitForEvent('download', { timeout: 90_000 });
      await page.evaluate((id: string) => (document.getElementById(id) as HTMLButtonElement).click(), btn);
      await (await dl).saveAs(join(OUT, name));
    };
    await save('pcb-export-excel-btn', 'pcb-report.xlsx');
    await save('pcb-export-report-pdf-btn', 'pcb-report.pdf');
    await page.click('#calc-btn', { timeout: 15_000 });
    await page.waitForSelector('.total-row', { timeout: 60_000 });
    const calcTotal = ((await page.locator('.total-row td').nth(1).textContent()) ?? '').trim();
    await save('export-pdf-btn', 'report.pdf');
    // 4. The engineer enters the board data sheet's figures; Calculate re-prices the analysis with them (/reprice).
    let editedTotal = '', repriced: unknown = null;
    if (Object.keys(EDITS).length) {
      for (const [id, v] of Object.entries(EDITS)) {
        await page.evaluate(([fid, val]) => { const f = document.getElementById(fid) as HTMLInputElement | HTMLSelectElement | null;
          if (f) { f.value = val; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); } }, [id, v]);
      }
      const rp = page.waitForResponse(r => r.url().includes('/api/pcb/reprice'), { timeout: 60_000 });
      await page.click('#calc-btn', { timeout: 15_000 });
      const rr = await rp;
      repriced = await rr.json();
      writeFileSync(join(OUT, 'reprice.json'), JSON.stringify(repriced, null, 1));
      await page.waitForFunction(() => !!document.querySelector('.total-row td:nth-child(2)'), null, { timeout: 60_000 });
      await page.waitForTimeout(1500);
      editedTotal = ((await page.locator('.total-row td').nth(1).textContent()) ?? '').trim();
      await save('export-pdf-btn', 'report-edited.pdf');
      await save('pcb-export-excel-btn', 'pcb-report-edited.xlsx').catch(() => undefined);
      log(`after the data-sheet edits: Calculate ${editedTotal}`);
    }
    writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ photos: photos.map(p => p.length), slots, headline, calcTotal, editedTotal, edits: EDITS, pageErrors,
      requests: readFileSync(reqLog, 'utf8').trim().split('\n').length }, null, 1));
    writeFileSync(join(OUT, 'server.log'), serverLog.join(''));
    log(`Calculate ${calcTotal}; page errors ${pageErrors.length}; done → ${OUT}`);
  } finally {
    try { await browser?.close(); } catch { /* closing */ }
    for (const p of [server, standIn]) { try { if (p.pid) process.kill(-p.pid, 'SIGKILL'); } catch { /* gone */ } }
    rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exit(1); });
