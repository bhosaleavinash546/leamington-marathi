/**
 * Improvement round, live (real server + browser): the Range Rover L460 PHEV at 200,000 / yr × 6 yr, then
 *   1. supplier quotes on Setup (cloud £ / connected vehicle-year, the TCU royalty) — the rail must equal the engine's
 *      total for the same inputs; a quote without a source is refused on the rail;
 *   2. a module the catalogue lacks (airbag control) added on Scope with its own effort and source;
 *   3. the quotes saved as a licence register and applied again after a fresh demo load;
 *   4. the actuals template downloaded, two rows filled, imported back;
 *   5. PDF + Excel exported — the PDF lists "Your figures" with their sources, the Excel has the parity sheets;
 *   6. axe (WCAG 2.1 AA) on Setup, Scope and Rates.
 * Writes <CV_OUT>/sw-improvements.json (checks PASS / FAIL), the PDF and the workbook.
 *   npm run build && CV_OUT=<dir> npx tsx e2e/sw-improvements-live.ts
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
import { computeSWProgram } from '../src/engine/sw-should-cost.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../src/ui/panels/sw-should-cost-ui.js';

const ROOT = resolve('.');
const OUT = process.env.CV_OUT ?? tmpdir();
const req = createRequire(import.meta.url);
const XLSX = req('xlsx') as typeof import('xlsx');
const AXE = readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const M = (n: number) => `£${(n / 1e6).toFixed(1)}M`;

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-swi-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const out: Record<string, unknown> = { checks: {} };
  const check = (name: string, ok: boolean, detail: unknown = '') => { (out.checks as Record<string, unknown>)[name] = ok ? 'PASS' : { FAIL: detail }; };
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
    const total = () => page.evaluate(() => document.querySelector('#swk-rail [data-fig="total"] .swk-v')?.textContent?.trim() ?? '');
    const railText = () => page.evaluate(() => document.getElementById('swk-rail')?.textContent?.replace(/\s+/g, ' ').trim() ?? '');
    const settle = () => page.waitForTimeout(700);
    const fill = async (sel: string, v: string) => { await show(sel); await page.fill(sel, v); await page.dispatchEvent(sel, 'change'); };

    const demo = SW_VEHICLE_DEMOS.find(d => d.id === 'rr_l460')!;
    const prog = { ...buildVehicleInputs(demo), annualProductionVolume: 200_000, programLifeYears: 6 };
    await show('.sw-vehicle-btn[data-vehicle="rr_l460"]'); await page.click('.sw-vehicle-btn[data-vehicle="rr_l460"]'); await settle();
    await fill('#sw-vol', '200000'); await fill('#sw-prog-life', '6');
    await show('#sw-calc-btn'); await page.click('#sw-calc-btn'); await settle();
    const t0 = await total();
    check('base total equals the engine', t0 === M(computeSWProgram(prog).summary.grandTotal), { screen: t0, engine: M(computeSWProgram(prog).summary.grandTotal) });

    // 1. Quotes
    await fill('#swq-cloud-v', '6'); await settle();
    check('a quote without a source is refused on the rail', /say where the quote comes from/.test(await railText()), (await railText()).slice(0, 200));
    await fill('#swq-cloud-s', 'AWS proposal 2026-09, ref A12');
    await fill('#swq-tcu_software\\~built-v', '10');
    await fill('#swq-tcu_software\\~built-s', 'TCU supplier quote Q3 2026');
    await settle();
    const quotes = { cloudPerVehicleYear: { value: 6, source: 'AWS proposal 2026-09, ref A12' }, modules: { tcu_software: { perVehicleBuilt: { value: 10, source: 'TCU supplier quote Q3 2026' } } } };
    const t1 = await total(), e1 = computeSWProgram({ ...prog, quotes }).summary.grandTotal;
    check('quoted total equals the engine with the same quotes', t1 === M(e1), { screen: t1, engine: M(e1) });

    // 2. Your module
    await show('#swc-new-name'); await page.fill('#swc-new-name', 'Occupant restraint (airbag) control');
    await page.selectOption('#swc-new-cat', 'D'); await page.click('#swc-add'); await settle();
    const tEmpty = await total();
    check('an added module with no figure costs nothing', tEmpty === t1, { before: t1, after: tEmpty });
    await page.fill('#swc-0-pm', '120'); await page.dispatchEvent('#swc-0-pm', 'change'); await settle();
    check('a figure without a source is refused', /say where its effort figure comes from/.test(await railText()));
    await page.selectOption('#swc-0-asil', 'D'); await page.selectOption('#swc-0-cx', 'High');
    await page.fill('#swc-0-src', 'Our 2024 restraint ECU programme, 120 PM booked'); await page.dispatchEvent('#swc-0-src', 'change'); await settle();
    const custom = [{ id: 'custom-occupant-restraint-airbag-control', name: 'Occupant restraint (airbag) control', category: 'D' as const, nominalPersonMonths: 120, defaultAsil: 'D' as const, defaultComplexity: 'High' as const, defaultCal: 'none' as const, source: 'Our 2024 restraint ECU programme, 120 PM booked' }];
    const e2 = computeSWProgram({ ...prog, quotes, customModules: custom, modules: [...prog.modules, { moduleId: custom[0].id, enabled: true, asil: 'D', complexity: 'High', reuse: 'Fresh', cal: 'none', customPersonMonths: null }] }).summary.grandTotal;
    const t2 = await total();
    check('with your module the total equals the engine', t2 === M(e2), { screen: t2, engine: M(e2) });

    // 3. Licence register
    await fill('#swq-reg-name', 'E2E licence register');
    await page.click('#swq-reg-save'); await page.waitForTimeout(800);
    const regMsg = await page.textContent('#swq-reg-msg');
    check('register saved to the account', /to your account/.test(regMsg ?? ''), regMsg);
    await show('.sw-vehicle-btn[data-vehicle="rr_l460"]'); await page.click('.sw-vehicle-btn[data-vehicle="rr_l460"]'); await settle();
    await fill('#sw-vol', '200000'); await fill('#sw-prog-life', '6'); await settle();
    await page.waitForFunction(() => (document.querySelector('#swq-reg-pick') as HTMLSelectElement | null)?.options.length! > 1, null, { timeout: 10_000 });
    const regId = await page.$eval('#swq-reg-pick', s => (s as HTMLSelectElement).options[1].value);
    await page.selectOption('#swq-reg-pick', regId); await page.click('#swq-reg-apply'); await settle();
    const t3 = await total();
    check('applying the register reproduces the quoted total', t3 === M(e1), { screen: t3, engine: M(e1) });

    // 4. Actuals template
    await show('#sw-actuals-card > summary'); await page.click('#sw-actuals-card > summary');
    const [tpl] = await Promise.all([page.waitForEvent('download'), page.click('#swa-template')]);
    const csvPath = join(OUT, 'actuals-template.csv'); await tpl.saveAs(csvPath);
    const lines = readFileSync(csvPath, 'utf8').trim().split('\n');
    check('template has one row per module in scope', lines.length - 1 === prog.modules.filter(m => m.enabled).length, lines.length - 1);
    const filled = [lines[0], lines[1].replace(/,,,$/, ',,140,E2E project'), lines[2].replace(/,,,$/, ',,60,E2E project'), ...lines.slice(3)].join('\n');
    const filledPath = join(OUT, 'actuals-filled.csv'); writeFileSync(filledPath, filled);
    await page.setInputFiles('#swa-import', filledPath); await page.waitForTimeout(800);
    const amsg = await page.textContent('#swa-msg');
    check('two filled rows imported, the rest reported not filled', /Imported 2 modules; \d+ rows not filled in/.test(amsg ?? ''), amsg);

    // 5. Exports
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), show('#sw-pdf-btn').then(() => page.click('#sw-pdf-btn'))]);
    const pdfPath = join(OUT, 'rr-phev-with-quotes.pdf'); await pdf.saveAs(pdfPath);
    // The actuals card's buttons share the preset class; clicking them used to retire the vehicle demo (and its title).
    check('the report keeps the vehicle after using the actuals card', /range-rover-l460/.test(pdf.suggestedFilename()), pdf.suggestedFilename());
    const [xl] = await Promise.all([page.waitForEvent('download'), show('#sw-excel-btn').then(() => page.click('#sw-excel-btn'))]);
    const xlPath = join(OUT, 'rr-phev-with-quotes.xlsx'); await xl.saveAs(xlPath);
    const wb = XLSX.read(readFileSync(xlPath));
    // The 360 workbook (sw-report-xlsx.ts): your figures and calibration are on Assumptions; exclusions on Scope.
    check('Excel has the parity sheets', ['Hubs', 'Countries', 'Assumptions', 'Scope', 'Evidence', 'Checks'].every(n => wb.SheetNames.includes(n)), wb.SheetNames);
    const yours = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Assumptions'], { header: 1 }).map(r => r.join(' | '));
    check('Excel lists the quotes with their sources', yours.some(r => /AWS proposal 2026-09/.test(r)) && yours.some(r => /TCU supplier quote Q3 2026/.test(r)), yours.filter(r => /quote|proposal/i.test(r)).slice(0, 6));
    const hubs = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Hubs'], { header: 1 });
    const hubRows = hubs.filter(r => typeof r[5] === 'number').length;   // data rows (title rows are text)
    check('Excel "Hubs" has 23 hubs', hubRows === 23, hubRows);
    out.pdf = pdfPath;

    // 6. axe
    const axeOn = async (tab: string) => {
      await page.click(`[data-swk-tab="${tab}"]`); await page.waitForTimeout(300);
      await page.addScriptTag({ content: AXE });
      return page.evaluate(async () => {
        const r = await (window as unknown as { axe: { run: (n: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }> } }).axe.run(document.getElementById('sw-panel'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return r.violations.map(v => `${v.id} (${v.nodes.length})`);
      });
    };
    out.axe = { setup: await axeOn('setup'), scope: await axeOn('scope'), rates: await axeOn('rates') };
    out.pageErrors = errors;
  } finally {
    await browser?.close();
    try { process.kill(-server.pid!); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
  writeFileSync(join(OUT, 'sw-improvements.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

main().catch(e => { console.error(e); process.exit(1); });
