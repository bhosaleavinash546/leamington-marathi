/**
 * Range Rover L460 PHEV — the whole-vehicle software costing run LIVE through the product (real server + browser):
 * load the demo, set the programme (CV_VOLUME, default 200,000 / yr; CV_LIFE, default 6 years), then
 *   1. capture the rail, the context line, the seven costing steps and the Excel workbook (UK hub);
 *   2. cost the programme in EVERY software hub on the hub picker and download each hub's PDF report;
 *   3. pick EVERY manufacturing country on the page's country picker and record the hub the software follows.
 * Writes <CV_OUT>/rr-phev-live.json, pdf/<hub>.pdf, rr-phev-UK.xlsx and screenshots.
 *   npm run build && CV_OUT=<dir> npx tsx e2e/sw-rr-phev-live.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const OUT = process.env.CV_OUT ?? tmpdir();
const VOLUME = Number(process.env.CV_VOLUME ?? 200_000);
const LIFE = Number(process.env.CV_LIFE ?? 6);
const XLSX = createRequire(import.meta.url)('xlsx') as typeof import('xlsx');
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

async function main(): Promise<void> {
  mkdirSync(join(OUT, 'pdf'), { recursive: true });
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-rr-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const out: Record<string, unknown> = { volume: VOLUME, life: LIFE, ranAt: new Date().toISOString() };
  let browser;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const page = await (await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, viewport: { width: 1440, height: 1000 } })).newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript('window.__name = (f) => f;');
    await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
    await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });
    await page.click('#new-costing-btn');
    await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="automotive_software"]:visible').first().click();
    await page.waitForSelector('#sw-panel');
    const show = (sel: string) => page.evaluate(s => {
      const p = document.querySelector(s)?.closest('.swk-panel[role="tabpanel"]') as HTMLElement | null;
      const t = p?.id.replace('swk-p-', '');
      if (t && p!.hidden) (document.querySelector(`[data-swk-tab="${t}"]`) as HTMLElement | null)?.click();
    }, sel);
    const text = (sel: string) => page.evaluate(s => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? '', sel);
    const fig = (k: string) => text(`#swk-rail [data-fig="${k}"] .swk-v`);
    const rail = async () => ({ perVehicle: await fig('pv'), nre: await fig('nre'), royalty: await fig('built'), running: await fig('run'), total: await fig('total'),
      railText: await text('#swk-rail'), context: await text('#swk-context') });

    // 1. The demo, then the programme the review asked for.
    await show('.sw-vehicle-btn[data-vehicle="rr_l460"]');
    await page.click('.sw-vehicle-btn[data-vehicle="rr_l460"]');
    await page.waitForTimeout(800);
    out.demoTitle = await page.getAttribute('.sw-vehicle-btn[data-vehicle="rr_l460"]', 'title');
    await show('#sw-vol'); await page.fill('#sw-vol', String(VOLUME)); await page.dispatchEvent('#sw-vol', 'change');
    await show('#sw-prog-life'); await page.fill('#sw-prog-life', String(LIFE)); await page.dispatchEvent('#sw-prog-life', 'change');
    await show('#sw-calc-btn'); await page.click('#sw-calc-btn');
    await page.waitForTimeout(900);
    out.inputsOnScreen = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('#sw-panel input[id], #sw-panel select[id]'))
      .filter(e => e.id.startsWith('sw-') && !e.id.startsWith('sw-mod') && e.type !== 'file').map(e => [e.id, e instanceof HTMLInputElement && e.type === 'checkbox' ? e.checked : (e.value || `(blank; placeholder ${('placeholder' in e && e.placeholder) || '—'})`)])));
    out.railUK = await rail();
    await page.click('[data-swk-tab="overview"]'); await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, 'uk-overview.png'), fullPage: false });
    await page.click('[data-swk-tab="vehicle"]');
    await page.waitForSelector('#sw-studio .swp-studio', { timeout: 20_000 });
    out.steps = await page.$$eval('#sw-studio .swp-step', ls => ls.map(l => l.textContent?.replace(/\s+/g, ' ').trim()));
    const stepDetail: string[] = [];
    for (let i = 0; i < 8; i++) {
      const sel = `#sw-studio [data-swp-step="${i}"]`;
      if (!(await page.$(sel))) continue;
      await page.click(sel); await page.waitForTimeout(250);
      stepDetail.push(await text('#sw-studio .swp-now'));
    }
    out.stepDetail = stepDetail;
    await page.screenshot({ path: join(OUT, 'uk-vehicle.png'), fullPage: false });

    // Excel (UK) — the module table is the full scope the tool costed.
    const [xl] = await Promise.all([page.waitForEvent('download'), show('#sw-excel-btn').then(() => page.click('#sw-excel-btn'))]);
    const xlPath = join(OUT, 'rr-phev-UK.xlsx'); await xl.saveAs(xlPath);
    const wb = XLSX.read(readFileSync(xlPath));
    out.excelSheets = wb.SheetNames;
    const md = wb.Sheets['Module detail'] ? XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Module detail'], { header: 1 }) : [];
    out.excelModuleRows = md.filter(r => typeof r[4] === 'number').length;   // one row per module (nominal PM is numeric)

    // 2. Every hub on the picker: cost, then the PDF.
    const hubs = await page.$$eval('#sw-region option', os => os.map(o => ({ value: (o as HTMLOptionElement).value, label: o.textContent?.trim() ?? '' })));
    const perHub: Array<Record<string, unknown>> = [];
    for (const h of hubs) {
      await show('#sw-region'); await page.selectOption('#sw-region', h.value);
      await show('#sw-calc-btn'); await page.click('#sw-calc-btn');
      await page.waitForTimeout(700);
      const r = await rail();
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), show('#sw-pdf-btn').then(() => page.click('#sw-pdf-btn'))]);
      const file = join(OUT, 'pdf', `rr-phev-${h.value}.pdf`); await dl.saveAs(file);
      perHub.push({ hub: h.value, label: h.label, ...r, railText: undefined, pdf: file });
    }
    out.perHub = perHub;

    // 3. Every manufacturing country: the software hub the page follows.
    const countries = await page.$$eval('#mfg-region-selector option', os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean));
    const perCountry: Array<{ country: string; hub: string; basis: string }> = [];
    for (const c of countries) {
      await page.selectOption('#mfg-region-selector', c);
      await page.waitForTimeout(250);
      perCountry.push({ country: c, hub: await page.inputValue('#sw-region'), basis: await text('#sw-hub-basis') });
    }
    out.perCountry = perCountry;
    out.pageErrors = errors;
  } finally {
    await browser?.close();
    try { process.kill(-server.pid!); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
  writeFileSync(join(OUT, 'rr-phev-live.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ ...out, perHub: (out.perHub as unknown[])?.length, perCountry: (out.perCountry as unknown[])?.length }, null, 1).slice(0, 4000));
}

main().catch(e => { console.error(e); process.exit(1); });
