/**
 * KPI dashboard, live: a real server (AI off, no key) + Chromium, three users.
 *
 *  1. Alice costs a part on the normal machining screen (Load example → Calculate) and saves it
 *     with "Save to KPI Dashboard" (the details step) — the costing tool still works and the
 *     record lands on the shared dashboard.
 *  2. More records are saved through the API in four currencies (Alice + Bob), including a
 *     revision and a second user's duplicate; the admin imports CSS System + CPSC II rows and
 *     loads an approved FX file, previews and applies a recalculation — all through the UI.
 *  3. Bob (a normal user) opens the dashboard: every KPI card is compared with the API summary,
 *     filters, chips, chart click, drill-down, sort, search, paging, the record drawer (no edit
 *     form for someone else's record), the Original-currency view, no Admin button.
 *  4. Exports: CSV, Excel and PDF downloaded; the workbook's records are re-added INDEPENDENTLY
 *     here (not by the tool) and must equal the dashboard's financial KPIs to the penny.
 *  5. axe WCAG 2.1 AA on the dashboard, dialogs open; screenshots light / dark / phone.
 *
 *   npm run build && PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx e2e/kpi-dashboard-live.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page, type Browser } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';

const ROOT = resolve('.');
const OUT = process.env.CV_LIVE_OUT ?? join(tmpdir(), 'kpi-dashboard-live');
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const log = (m: string) => process.stdout.write(`[kpi] ${m}\n`);
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const checks: { check: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => { checks.push({ check: name, ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const close = (a: number, b: number, tol = 0.005) => Math.abs(a - b) <= tol;
const MONTH = new Date().toISOString().slice(0, 7);

async function axeOn(page: Page, selector: string): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE);
  const v = await page.evaluate(sel => (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } })
    .axe.run({ include: [[sel]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }), selector);
  return v.violations.map(x => `${x.id} ×${x.nodes.length} (${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join('; ')})`);
}

async function main(): Promise<void> {
  if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('no dist/ — run npm run build first');
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-kpi-live-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '1', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout?.on('data', d => { serverLog = (serverLog + d.toString()).slice(-200_000); });
  server.stderr?.on('data', d => { serverLog = (serverLog + d.toString()).slice(-200_000); });
  const base = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    const now = new Date().toISOString();
    for (const [id, name, role] of [['alice', 'Alice Able', 'user'], ['bob', 'Bob Baker', 'user'], ['ada', 'Ada Admin', 'admin']]) {
      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, now);
    }
    db.close();
    const tok = (id: string) => jwt.sign({ userId: id, email: `${id}@test`, emailVerified: true }, secret, { expiresIn: '6h' });
    const api = async (user: string, method: string, path: string, body?: unknown) => {
      const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) as any };
    };

    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const open = async (user: string, name: string, opts: { width?: number; height?: number; theme?: string } = {}) => {
      const ctx = await browser!.newContext({ serviceWorkers: 'block', viewport: { width: opts.width ?? 1500, height: opts.height ?? 1000 }, acceptDownloads: true });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', d => { errors.push(`dialog: ${d.message()}`); void d.dismiss(); });
      await page.addInitScript('window.__name = (f) => f;');
      await page.addInitScript(([t, n, th]) => {
        localStorage.setItem('auth_token', t!); localStorage.setItem('auth_user', JSON.stringify({ fullName: n, email: 'x@test' }));
        localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1');
        if (th) localStorage.setItem('sc-theme', th);
      }, [tok(user), name, opts.theme ?? ''] as const);
      await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
      return { page, ctx, errors };
    };

    // ── 1. Alice costs a part on the normal screen and saves it ─────────────────
    {
      const { page, ctx, errors } = await open('alice', 'Alice Able');
      await page.evaluate(() => (document.getElementById('tile-machining') as HTMLElement)?.click());
      await page.waitForSelector('#load-ref-btn', { state: 'attached', timeout: 30_000 });
      await page.evaluate(() => (document.getElementById('load-ref-btn') as HTMLElement).click());
      await page.waitForFunction(() => getComputedStyle(document.getElementById('save-dashboard-btn')!).display !== 'none', null, { timeout: 30_000 });
      check('costing tool still costs a part and offers "Save to KPI Dashboard"', true);
      await page.evaluate(() => (document.getElementById('save-dashboard-btn') as HTMLElement).click());
      await page.waitForSelector('#kd-save-dialog[open]', { timeout: 15_000 });
      const shouldShown = await page.textContent('.kd-save-should strong');
      // submit without a part number → told, nothing saved
      await page.click('#kd-save-dialog button[type="submit"]');
      const err1 = await page.textContent('#kd-save-dialog .kd-form-err');
      check('save refuses a missing part number', /part number/i.test(err1 ?? ''), err1 ?? '');
      await page.fill('#kd-s-pn', 'LR-BRK-001');
      await page.selectOption('#kd-s-prog', 'L460');
      await page.fill('#kd-s-my', '2027');
      await page.selectOption('#kd-s-pt', 'BEV');
      await page.fill('#kd-s-cc', '14.2');
      await page.click('#kd-save-dialog button[type="submit"]');
      const err2 = await page.textContent('#kd-save-dialog .kd-form-err');
      check('save refuses a current cost without its currency', /currency/i.test(err2 ?? ''), err2 ?? '');
      await page.selectOption('#kd-s-ccy', 'EUR');
      await page.selectOption('#kd-s-terms', 'DAP');
      const saved = page.waitForResponse(r => r.url().endsWith('/api/kpi/records') && r.request().method() === 'POST');
      await page.click('#kd-save-dialog button[type="submit"]');
      const res = await saved;
      const body = await res.json() as any;
      check('the costing is saved to the dashboard (201)', res.status() === 201, `should-cost ${shouldShown}`);
      check('saved should-cost equals the costing result shown', `£${body.record?.shouldCost?.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` === shouldShown, `${body.record?.shouldCost} v ${shouldShown}`);
      check('the record carries a frozen FX snapshot for EUR (reference, not approved)', body.record?.fx?.current?.currency === 'EUR' && body.record?.fx?.current?.approved === false);
      check('Alice: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    // ── 2. Seed more records, admin imports + FX through the UI ────────────────
    const save = (user: string, sid: string, d: Record<string, unknown>, total: number, commodity = 'casting', region = 'UK') =>
      api(user, 'POST', '/api/kpi/records', { scenario: { id: sid, name: String(d.componentName ?? sid), commodity, region, input: { partName: d.componentName, deliveryTerms: 'DAP' }, result: { total } }, details: { status: 'completed', ...d } });
    const seeds = [
      await save('alice', 'sc-a2', { partNumber: 'LR-KNK-100', componentName: 'Front knuckle', programme: 'L460', modelYear: 2027, powertrain: 'BEV', currentCost: 31.5, currentCcy: 'GBP', currentTerms: 'DAP', annualVolume: 60000 }, 26.4),
      await save('alice', 'sc-a3', { partNumber: 'LR-KNK-100', componentName: 'Front knuckle', programme: 'L460', modelYear: 2027, powertrain: 'BEV', currentCost: 31.5, currentCcy: 'GBP', currentTerms: 'DAP' }, 25.9),
      await save('bob', 'sc-b1', { partNumber: 'LR-KNK-100', componentName: 'Front knuckle', programme: 'L460', modelYear: 2027, powertrain: 'BEV', currentCost: 31.5, currentCcy: 'GBP', currentTerms: 'DAP' }, 27.1),
      await save('bob', 'sc-b2', { partNumber: 'LR-HSG-220', componentName: 'Inverter housing', programme: 'EMA', modelYear: 2028, powertrain: 'BEV', currentCost: 420, currentCcy: 'CNY', currentTerms: 'EXW' }, 41.0, 'casting', 'CN'),
      await save('bob', 'sc-b3', { partNumber: 'LR-SHF-310', componentName: 'Output shaft', programme: 'L663', modelYear: 2026, powertrain: 'Petrol', currentCost: 18.4, currentCcy: 'USD', currentTerms: 'DAP' }, 15.2, 'forging'),
      await save('alice', 'sc-a4', { partNumber: 'LR-BKT-410', componentName: 'Bracket', programme: 'L461', modelYear: 2026, powertrain: 'Diesel PHEV' }, 6.1, 'sheet_metal'),
    ];
    check('API saves (incl. revision + other-user duplicate)', seeds.every(s => s.status === 201), seeds.map(s => s.status).join(','));
    const val = await api('ada', 'PATCH', `/api/kpi/records/${seeds[2].json.record.id}`, { annualVolume: 60000, volumeValidated: true });
    check('an admin validates an annual volume', val.status === 200 && val.json.record.volumeValidated === true);
    check('a normal user cannot validate a volume', (await api('bob', 'PATCH', `/api/kpi/records/${seeds[2].json.record.id}`, { volumeValidated: true })).status === 403);

    {
      const { page, ctx, errors } = await open('ada', 'Ada Admin');
      await page.click('#kpi-btn');
      await page.waitForSelector('.kd-cards', { timeout: 30_000 });
      check('admin sees the Admin button', await page.isVisible('#kd-admin-btn'));
      await page.click('#kd-admin-btn');
      await page.waitForSelector('#kd-admin[open] #kd-fx-file', { timeout: 15_000 });
      // an inverted rate is refused with row + column
      await page.setInputFiles('#kd-fx-file', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from(`currency,period,gbp_per_unit,source\nCNY,${MONTH},9.2,Treasury\n`) });
      await page.click('[data-act="fx-upload"]');
      await page.waitForSelector('#kd-fx-msg .kd-form-err');
      check('admin UI: inverted FX rate refused with row and column', /inverted/.test(await page.textContent('#kd-fx-msg') ?? ''));
      await page.setInputFiles('#kd-fx-file', { name: 'fx.csv', mimeType: 'text/csv', buffer: Buffer.from(`currency,period,units_per_gbp,source\nEUR,${MONTH},1.19,JLR Treasury approved ${MONTH}\nUSD,${MONTH},1.31,JLR Treasury approved ${MONTH}\nCNY,${MONTH},9.45,JLR Treasury approved ${MONTH}\nINR,${MONTH},111.2,JLR Treasury approved ${MONTH}\n`) });
      await page.click('[data-act="fx-upload"]');
      await page.waitForSelector('#kd-fx-msg .kd-ok', { timeout: 15_000 });
      check('admin UI: approved FX rates loaded', /4 rate/.test(await page.textContent('#kd-fx-msg') ?? ''));
      await page.click('[data-act="recalc-preview"]');
      await page.waitForSelector('#kd-recalc-msg p');
      const prev = await page.textContent('#kd-recalc-msg p');
      check('admin UI: recalculation preview lists the records that would change', /would change/.test(prev ?? ''), prev ?? '');
      await page.click('[data-act="recalc-apply"]');
      await page.waitForFunction(() => /Applied/.test(document.querySelector('#kd-recalc-msg p')?.textContent ?? ''), null, { timeout: 15_000 });
      check('admin UI: recalculation applied', true, await page.textContent('#kd-recalc-msg p') ?? '');
      await page.click('[data-admin-tab="import"]');
      await page.waitForSelector('#kd-imp-file');
      const head = 'source_tool,source_record_id,owner,part_number,component_name,commodity,programme,model_year,powertrain,country,status,costing_date,should_cost,should_currency,should_terms,current_cost,current_currency,current_terms';
      await page.setInputFiles('#kd-imp-file', { name: 'css.csv', mimeType: 'text/csv', buffer: Buffer.from(`${head}\nCSS System,CSS-100,R. Rao,LR-PCB-500,Camera board,PCBA,JEA,2028,BEV,IN,approved,${MONTH}-03,1450,INR,DAP,1690,INR,DAP\nCPSC II,CP-77,J. Lee,LR-SEAL-9,Door seal,Rubber,L461,2027,Petrol PHEV,PL,reviewed,${MONTH}-04,2.1,EUR,DAP,2.6,EUR,DAP\n`) });
      await page.click('[data-act="import"]');
      await page.waitForSelector('#kd-imp-msg p', { timeout: 15_000 });
      check('admin UI: CSS System + CPSC II rows imported', /2 record\(s\) added/.test(await page.textContent('#kd-imp-msg') ?? ''), await page.textContent('#kd-imp-msg') ?? '');
      await page.click('[data-admin-tab="audit"]');
      await page.waitForSelector('#kd-ap table', { timeout: 15_000 });
      check('admin UI: audit log lists the changes', (await page.locator('#kd-ap tbody tr').count()) >= 4);
      const ax = await axeOn(page, '#kd-admin');
      check('axe WCAG 2.1 AA — admin dialog', ax.length === 0, ax.join(' | ') || '0 violations');
      check('Admin: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    // ── 3. Bob opens the dashboard ──────────────────────────────────────────────
    const all = { datePreset: 'all' };
    const sumAll = (await api('bob', 'GET', `/api/kpi/summary?f=${encodeURIComponent(JSON.stringify(all))}`)).json;
    {
      const { page, ctx, errors } = await open('bob', 'Bob Baker');
      await page.click('#kpi-btn');
      await page.waitForSelector('.kd-cards', { timeout: 30_000 });
      await page.screenshot({ path: join(OUT, 'dashboard-dark.png'), fullPage: true });
      check('a normal user does not see the Admin button', !(await page.isVisible('#kd-admin-btn')));
      const def = (await api('bob', 'GET', `/api/kpi/summary?f=${encodeURIComponent(JSON.stringify({ datePreset: '12m' }))}`)).json;
      const card = async (id: string) => (await page.textContent(`[data-card="${id}"] .kd-card-v`))?.trim() ?? '';
      check('default period is the last 12 months', /Last 12 months/.test(await page.textContent('#kd-chips') ?? ''));
      check('card: total records = API', await card('records') === String(def.operational.totalRecords), `${await card('records')} v ${def.operational.totalRecords}`);
      check('card: unique components = API', await card('components') === String(def.operational.uniqueComponents), await card('components'));
      check('card: programmes covered = API', await card('programmes') === String(def.operational.programmes), await card('programmes'));
      const opp = await page.getAttribute('[data-card="opportunity"] .kd-card-v', 'title');
      check('card: potential unit opportunity = API (exact £)', opp === `£${def.financial.opportunity.gbp.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, `${opp} v ${def.financial.opportunity.gbp}`);
      check('card: validated savings shows "Not tracked" with no status data', await card('validated') === 'Not tracked');
      const ann = await page.getAttribute('[data-annualised] strong', 'title');
      check('annualised opportunity = gap × validated volume only', def.financial.annualised.n === 1 && ann === `£${def.financial.annualised.gbp.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, `${ann} (${def.financial.annualised.n} record)`);
      check('duplicate + revision counted in data quality', def.dataQuality.duplicateCandidates === 1 && def.dataQuality.supersededRevisions === 1, `dup ${def.dataQuality.duplicateCandidates}, rev ${def.dataQuality.supersededRevisions}`);

      // filter: programme L460 through the multi-select
      await page.click('[data-ms-toggle="programme"]');
      await page.fill('[data-ms-search="programme"]', 'L46');
      check('multi-select search narrows the options', (await page.locator('[data-ms-opt="programme"]').count()) === 2);
      await page.check('[data-ms-opt="programme"][value="L460"]');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => /Programme:/.test(document.querySelector('#kd-chips')?.textContent ?? ''));
      await page.waitForFunction(() => document.querySelector('#kd-body')?.getAttribute('aria-busy') === 'false');
      const f460 = (await api('bob', 'GET', `/api/kpi/summary?f=${encodeURIComponent(JSON.stringify({ datePreset: '12m', programme: ['L460'] }))}`)).json;
      check('filter chip appears and every card follows', await card('records') === String(f460.operational.totalRecords), `${await card('records')} v ${f460.operational.totalRecords}`);
      check('records table follows the filter', (await page.locator('#kd-records tbody tr').count()) === f460.operational.currentRecords);
      await page.click('[data-clear-all]');
      await page.waitForFunction(() => !/Programme:/.test(document.querySelector('#kd-chips')?.textContent ?? ''));

      // chart click → filter
      await page.waitForSelector('[data-heat-com]');
      await page.click('[data-heat-com="Casting"][data-heat-prog="L460"]');
      await page.waitForFunction(() => /Commodity:.*Casting/.test(document.querySelector('#kd-chips')?.textContent ?? '') && /Programme:.*L460/.test(document.querySelector('#kd-chips')?.textContent ?? ''));
      check('heatmap cell click filters commodity and programme', true);
      await page.click('[data-clear-all]');
      await page.waitForFunction(() => !/Commodity:/.test(document.querySelector('#kd-chips')?.textContent ?? ''));

      // drill-down
      await page.waitForSelector('[data-drill-key="Casting"]');
      await page.click('[data-drill-key="Casting"]');
      await page.waitForSelector('[data-drill-key="L460"]');
      await page.click('[data-drill-key="L460"]');
      await page.waitForSelector('[data-drill-key="BEV"]'); await page.click('[data-drill-key="BEV"]');
      await page.waitForSelector('[data-drill-key="2027"]'); await page.click('[data-drill-key="2027"]');
      await page.waitForSelector('[data-drill-key="LR-KNK-100"]');
      check('drill: commodity → programme → powertrain → model year → component', true, (await page.textContent('.kd-crumbs'))?.replace(/\s+/g, ' ') ?? '');
      await page.click('[data-drill-key="LR-KNK-100"]');
      await page.waitForFunction(() => document.querySelectorAll('#kd-records tbody tr').length === 1);
      check('drill to component lists its current costing record', true);
      await page.click('[data-drill-to="-1"]');

      // sort + search + open record drawer (someone else's → no edit form)
      await page.click('[data-sort="gapGbp"]');
      await page.waitForFunction(() => document.querySelector('th[aria-sort] [data-sort="gapGbp"]') !== null);
      await page.fill('#kd-search', 'LR-BRK');
      await page.waitForFunction(() => document.querySelectorAll('#kd-records tbody tr').length === 1, null, { timeout: 10_000 });
      check('search finds Alice\'s saved part by part number', /LR-BRK-001/.test(await page.textContent('#kd-records tbody') ?? ''));
      await page.click('#kd-records [data-open]');
      await page.waitForSelector('#kd-drawer[open] h2#kd-drawer-title');
      const drawer = await page.textContent('#kd-drawer');
      check('record drawer shows original + GBP + FX source', /EUR/.test(drawer ?? '') && /JLR Treasury approved/.test(drawer ?? ''));
      check('record drawer shows the original costing analysis', /Original costing analysis/.test(drawer ?? ''));
      check('another user\'s record has no edit form', !(await page.isVisible('#kd-edit-form')));
      const axd = await axeOn(page, '#kd-drawer');
      check('axe WCAG 2.1 AA — record drawer', axd.length === 0, axd.join(' | ') || '0 violations');
      await page.keyboard.press('Escape');
      await page.fill('#kd-search', '');

      // original-currency view
      await page.click('[data-ccy-mode="original"]');
      await page.waitForSelector('#kd-sec-ccy');
      const ccyTxt = await page.textContent('#kd-sec-ccy');
      check('original-currency view lists INR, CNY, EUR, USD and GBP separately', ['INR', 'CNY', 'EUR', 'USD', 'GBP'].every(c => ccyTxt?.includes(c)));
      await page.click('[data-ccy-mode="gbp"]');

      // empty state
      await page.selectOption('#kd-date-preset', 'custom');
      await page.fill('#kd-date-from', '2001-01-01'); await page.fill('#kd-date-to', '2001-01-31');
      await page.locator('#kd-date-to').dispatchEvent('change');
      await page.waitForSelector('.kd-empty', { timeout: 10_000 });
      check('empty state when no record matches', /No costing records match/.test(await page.textContent('.kd-empty') ?? ''));
      await page.click('[data-clear-all]');
      await page.waitForSelector('[data-card="records"]');

      // exports with the "all time" view
      await page.selectOption('#kd-date-preset', 'all');
      await page.waitForFunction(n => document.querySelector('[data-card="records"] .kd-card-v')?.textContent?.trim() === String(n), sumAll.operational.totalRecords);
      const dl = async (act: string) => {
        const p = page.waitForEvent('download', { timeout: 60_000 });
        await page.click('[data-act="export-menu"]'); await page.click(`[data-act="${act}"]`);
        const d = await p; const path = join(OUT, d.suggestedFilename()); await d.saveAs(path); return path;
      };
      const csvPath = await dl('export-csv');
      const csv = readFileSync(csvPath, 'utf8');
      check('CSV downloaded with every record of the view', csv.trim().split(/\r?\n/).length - 1 === sumAll.operational.totalRecords, `${csv.trim().split(/\r?\n/).length - 1} rows`);
      const xlsxPath = await dl('export-xlsx');
      const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xlsxPath);
      const names = wb.worksheets.map(w => w.name);
      check('Excel has the six required sheets', ['Executive summary', 'Commodity analysis', 'Programme analysis', 'Powertrain analysis', 'Costing records', 'Data quality'].every(n => names.includes(n)), names.join(', '));
      // Independent re-add from the exported records (this script, not the tool)
      const ws = wb.getWorksheet('Costing records')!;
      const hdr = (ws.getRow(1).values as string[]);
      const col = (h: string) => hdr.indexOf(h);
      let n = 0, cur = 0, sh = 0, gap = 0, opp2 = 0;
      ws.eachRow((row, i) => {
        if (i === 1) return;
        if (row.getCell(col('Financial eligibility')).value !== 'eligible') return;
        const c = Number(row.getCell(col('Current cost (original)')).value) * Number(row.getCell(col('FX current (GBP per unit)')).value || 1);
        const s = Number(row.getCell(col('Should-cost (original)')).value) * Number(row.getCell(col('FX should (GBP per unit)')).value || 1);
        n++; cur += c; sh += s; gap += c - s; if (c - s > 0) opp2 += c - s;
      });
      const F = sumAll.financial;
      check('independent re-add: eligible records', n === F.eligible, `${n} v ${F.eligible}`);
      check('independent re-add: Σ GBP current (original × frozen rate)', close(cur, F.sumCurrentGbp), `${cur.toFixed(4)} v ${F.sumCurrentGbp.toFixed(4)}`);
      check('independent re-add: Σ GBP should-cost', close(sh, F.sumShouldGbp), `${sh.toFixed(4)} v ${F.sumShouldGbp.toFixed(4)}`);
      check('independent re-add: potential unit opportunity', close(opp2, F.opportunity.gbp), `${opp2.toFixed(4)} v ${F.opportunity.gbp.toFixed(4)}`);
      check('independent re-add: weighted gap %', close((gap / cur) * 100, F.weightedGapPct, 1e-6), `${((gap / cur) * 100).toFixed(4)} v ${F.weightedGapPct.toFixed(4)}`);
      const rc = wb.getWorksheet('Reconciliation')!;
      check('Reconciliation sheet carries live formulas', typeof (rc.getCell('C3').value as { formula?: string })?.formula === 'string');
      const pdfPath = await dl('export-pdf');
      const pdf = readFileSync(pdfPath);
      check('PDF dashboard report downloaded', pdf.subarray(0, 4).toString() === '%PDF' && pdf.length > 20_000, `${Math.round(pdf.length / 1024)} KB`);

      const ax = await axeOn(page, '#kpi-view');
      check('axe WCAG 2.1 AA — dashboard', ax.length === 0, ax.join(' | ') || '0 violations');
      check('Bob: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    // light theme + phone
    for (const [label, opts] of [['dashboard-light', { theme: 'light' }], ['dashboard-phone', { width: 390, height: 844, theme: 'light' }]] as const) {
      const { page, ctx, errors } = await open('bob', 'Bob Baker', opts);
      await page.click('#kpi-btn').catch(async () => { await page.evaluate(() => (document.getElementById('kpi-btn') as HTMLElement).click()); });
      await page.waitForSelector('.kd-cards', { timeout: 30_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (label === 'dashboard-phone') check('phone width: no horizontal page scroll', overflow <= 1, `${overflow}px`);
      const ax = await axeOn(page, '#kpi-view');
      check(`axe WCAG 2.1 AA — ${label}`, ax.length === 0, ax.join(' | ') || '0 violations');
      check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    check('server log: no unhandled KPI error', !/\[kpi\]/.test(serverLog), serverLog.match(/\[kpi\][^\n]*/)?.[0] ?? 'none');
  } finally {
    writeFileSync(join(OUT, 'results.json'), JSON.stringify({ checks }, null, 1));
    writeFileSync(join(OUT, 'server.log'), serverLog);
    try { await browser?.close(); } catch { /* closed */ }
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
  }
  const failed = checks.filter(c => !c.ok);
  log(`${checks.length - failed.length}/${checks.length} PASS → ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
