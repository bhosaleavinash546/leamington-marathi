/**
 * KPI dashboard — feature tour screenshots for the dashboard report (docs/dashboard-report/).
 *
 * Real server (AI off) + Chromium on a throw-away database seeded with the SAME fixture as
 * e2e/kpi-dashboard-live.ts / kpi-dashboard-audit.ts (demo data — not JLR data). Every picture is the
 * running application; nothing is mocked except the loading delay and the error response used for
 * the two state pictures.
 *
 *   npm run build && PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx e2e/kpi-dashboard-tour.ts docs/dashboard-report
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page, type Browser, type Locator } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const OUT = resolve(process.argv[2] ?? 'docs/dashboard-report');
const SHOTS = join(OUT, 'shots'); const FILES = join(OUT, 'exports');
mkdirSync(SHOTS, { recursive: true }); mkdirSync(FILES, { recursive: true });
const log = (m: string) => process.stdout.write(`[tour] ${m}\n`);
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const MONTH = new Date().toISOString().slice(0, 7);
const manifest: Record<string, string> = {};
const JPG = { type: 'jpeg' as const, quality: 88 };

async function shot(target: Page | Locator, name: string, caption: string, opts: Record<string, unknown> = {}): Promise<void> {
  await (target as Page).screenshot({ path: join(SHOTS, `${name}.jpg`), ...JPG, ...opts } as never);
  manifest[name] = caption; log(name);
}

async function main(): Promise<void> {
  if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('no dist/ — run npm run build first');
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-kpi-tour-'));
  const secret = 'tour-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '1', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    for (const [id, name, role] of [['alice', 'Alice Able', 'user'], ['bob', 'Bob Baker', 'user'], ['ada', 'Ada Admin', 'admin']]) {
      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, new Date().toISOString());
    }
    db.close();
    const tok = (id: string) => jwt.sign({ userId: id, email: `${id}@test`, emailVerified: true }, secret, { expiresIn: '6h' });
    const api = async (user: string, method: string, path: string, body?: unknown) => {
      const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) as any };
    };
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const open = async (user: string, name: string, theme: string, w = 1440, h = 900) => {
      const ctx = await browser!.newContext({ serviceWorkers: 'block', viewport: { width: w, height: h }, deviceScaleFactor: 2, acceptDownloads: true, reducedMotion: 'reduce' });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
      const page = await ctx.newPage();
      await page.addInitScript('window.__name = (f) => f;');
      await page.addInitScript(([t, n, th]) => {
        try {
          localStorage.setItem('auth_token', t!); localStorage.setItem('auth_user', JSON.stringify({ fullName: n, email: 'x@test' }));
          localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); localStorage.setItem('sc-theme', th!);
        } catch { /* about:blank */ }
      }, [tok(user), name, theme] as const);
      await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
      return { page, ctx };
    };
    const openDash = async (page: Page) => {
      await page.evaluate(() => (document.getElementById('kpi-btn') as HTMLElement).click());
      await page.waitForSelector('.kd-cards', { timeout: 30_000 });
      await page.waitForFunction(() => document.querySelector('#kd-body')?.getAttribute('aria-busy') === 'false');
      await page.waitForTimeout(500);
    };
    const settle = (page: Page) => page.waitForFunction(() => document.querySelector('#kd-body')?.getAttribute('aria-busy') === 'false').then(() => page.waitForTimeout(500));

    // ── 0. Empty state, then a costing saved from the machining screen (Alice) ─────────────
    {
      const { page, ctx } = await open('alice', 'Alice Able', 'light');
      await openDash(page).catch(() => undefined);
      await page.waitForSelector('#kd-body .kd-empty', { timeout: 20_000 });
      await shot(page, '90-empty', 'No costing saved yet: the empty state tells the user how records arrive.');
      await page.evaluate(() => (document.getElementById('tile-machining') as HTMLElement).click());
      await page.waitForSelector('#load-ref-btn', { state: 'attached', timeout: 30_000 });
      await page.evaluate(() => (document.getElementById('load-ref-btn') as HTMLElement).click());
      await page.waitForFunction(() => getComputedStyle(document.getElementById('save-dashboard-btn')!).display !== 'none', null, { timeout: 30_000 });
      await page.click('#cv-more-btn'); await page.waitForTimeout(300);
      const menu = await page.$('#cv-more-menu');
      const mb = await menu!.boundingBox();
      await shot(page, '70-save-entry', 'Costing results → More → Save → "Save to KPI Dashboard".', { clip: { x: Math.max(0, mb!.x - 300), y: Math.max(0, mb!.y - 40), width: Math.min(760, mb!.width + 420), height: mb!.height + 80 } });
      await page.click('#save-dashboard-btn');
      await page.waitForSelector('#kd-save-dialog[open]'); await page.waitForTimeout(250);
      await page.fill('#kd-s-pn', 'LR-BRK-001'); await page.selectOption('#kd-s-prog', 'L460'); await page.fill('#kd-s-my', '2027');
      await page.selectOption('#kd-s-pt', 'BEV'); await page.fill('#kd-s-cc', '14.2'); await page.selectOption('#kd-s-ccy', 'EUR'); await page.selectOption('#kd-s-terms', 'DAP');
      await shot(page.locator('#kd-save-dialog'), '71-save-dialog', 'The details step: should-cost from the costing (read-only), part number, programme, model year, powertrain, status and the current cost in its own currency and delivery terms.');
      const saved = page.waitForResponse(r => r.url().endsWith('/api/kpi/records') && r.request().method() === 'POST');
      await page.click('#kd-save-dialog button[type="submit"]'); await saved;
      await ctx.close();
    }
    // ── Seed the rest of the fixture ───────────────────────────────────────────────────────
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
    await api('ada', 'PATCH', `/api/kpi/records/${seeds[2].json.record.id}`, { annualVolume: 60000, volumeValidated: true });
    const b64 = (s: string) => Buffer.from(s).toString('base64');
    const head = 'source_tool,source_record_id,owner,part_number,component_name,commodity,programme,model_year,powertrain,country,status,costing_date,should_cost,should_currency,should_terms,current_cost,current_currency,current_terms';
    const importCsv = `${head}\nCSS System,CSS-100,R. Rao,LR-PCB-500,Camera board,PCBA,JEA,2028,BEV,IN,approved,${MONTH}-03,1450,INR,DAP,1690,INR,DAP\nCPSC II,CP-77,J. Lee,LR-SEAL-9,Door seal,Rubber,L461,2027,Petrol PHEV,PL,reviewed,${MONTH}-04,2.1,EUR,DAP,2.6,EUR,DAP\n`;
    const fxCsv = `currency,period,units_per_gbp,source\nEUR,${MONTH},1.19,JLR Treasury approved ${MONTH}\nUSD,${MONTH},1.31,JLR Treasury approved ${MONTH}\nCNY,${MONTH},9.45,JLR Treasury approved ${MONTH}\nINR,${MONTH},111.2,JLR Treasury approved ${MONTH}\n`;

    // ── Admin: FX load + preview + apply, import, audit (through the screen) ─────────────────
    {
      const { page, ctx } = await open('ada', 'Ada Admin', 'light');
      await openDash(page);
      await page.click('#kd-admin-btn'); await page.waitForSelector('#kd-admin[open] #kd-fx-file'); await page.waitForTimeout(250);
      await page.setInputFiles('#kd-fx-file', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from(`currency,period,gbp_per_unit,source\nCNY,${MONTH},9.2,Treasury\n`) });
      await page.click('[data-act="fx-upload"]'); await page.waitForSelector('#kd-fx-msg .kd-form-err');
      await shot(page.locator('#kd-admin .kd-dialog-in'), '80-admin-fx-refused', 'Admin → FX rates: a file with an inverted rate is refused, naming the row and the column.');
      await page.setInputFiles('#kd-fx-file', { name: 'fx.csv', mimeType: 'text/csv', buffer: Buffer.from(fxCsv) });
      await page.click('[data-act="fx-upload"]'); await page.waitForSelector('#kd-fx-msg .kd-ok', { timeout: 15_000 });
      await page.click('[data-act="recalc-preview"]'); await page.waitForSelector('#kd-recalc-msg p'); await page.waitForTimeout(300);
      await shot(page.locator('#kd-admin .kd-dialog-in'), '81-admin-fx-preview', 'Approved rates loaded (units per £1 converted to GBP per unit) and a recalculation PREVIEW: what would change, before anything is applied.');
      await page.click('[data-act="recalc-apply"]');
      await page.waitForFunction(() => /Applied/.test(document.querySelector('#kd-recalc-msg p')?.textContent ?? ''), null, { timeout: 15_000 });
      await page.click('[data-admin-tab="import"]'); await page.waitForSelector('#kd-imp-file');
      await page.setInputFiles('#kd-imp-file', { name: 'css-cpsc.csv', mimeType: 'text/csv', buffer: Buffer.from(importCsv) });
      await page.click('[data-act="import"]'); await page.waitForSelector('#kd-imp-msg p', { timeout: 15_000 }); await page.waitForTimeout(250);
      await shot(page.locator('#kd-admin .kd-dialog-in'), '82-admin-import', 'Admin → Import records: CSS System and CPSC II rows loaded from the template (re-importing the same id updates it).');
      await page.click('[data-admin-tab="audit"]'); await page.waitForSelector('#kd-ap table'); await page.waitForTimeout(250);
      await shot(page.locator('#kd-admin .kd-dialog-in'), '83-admin-audit', 'Admin → Audit log: every save, edit, FX load, recalculation and import with who and when.');
      await ctx.close();
    }

    // ── Bob: the dashboard, light ─────────────────────────────────────────────────────────
    const recs = (await api('bob', 'GET', `/api/kpi/records?scope=all&all=1&f=${encodeURIComponent(JSON.stringify({ datePreset: 'all' }))}`)).json.rows as { id: string; partNumber: string; role: string; ownerId: string }[];
    {
      const { page, ctx } = await open('bob', 'Bob Baker', 'light');
      await openDash(page);
      await shot(page, '01-overview-light', 'The dashboard as it opens (light theme, 1440 × 900): header, filters, data-quality line, financial position, coverage and the start of "Where to act".');
      await shot(page, '02-full-page-light', 'The whole page, top to bottom.', { fullPage: true });
      const top = page.locator('.kd-head');
      await shot(top, '10-header', 'Header: refresh time, Refresh, the currency switch (consolidated GBP / original currency) and Export.');
      await shot(page.locator('.kd-band').first(), '20-financial-band', 'Financial position: potential unit opportunity (with the annualised line), weighted cost gap, unfavourable gaps, validated and implemented savings.');
      await shot(page.locator('.kd-band').nth(1), '21-coverage-tiles', 'Coverage and workflow: records (with revisions), unique components, completed costings, commodities, programmes, awaiting review / approval.');
      await page.click('[data-card="opportunity"] [data-tip]'); await page.waitForTimeout(200);
      await shot(page, '22-card-explanation', 'Every card has an "i" button that explains exactly what the figure is and is not.', { clip: { x: 0, y: 330, width: 1100, height: 440 } });
      await page.click('[data-card="opportunity"] [data-tip]');
      // filters
      await page.click('[data-ms-toggle="commodity"]'); await page.fill('[data-ms-search="commodity"]', 'c');
      await page.waitForTimeout(200);
      await shot(page, '11-filter-popover', 'A searchable multi-select: options come from the data, each with the number of records it would leave.', { clip: { x: 200, y: 180, width: 900, height: 420 } });
      await page.click('.kd-ms-opt:has([value="Casting"])'); await settle(page);
      await page.keyboard.press('Escape');
      await page.click('[data-ms-toggle="programme"]'); await page.click('.kd-ms-opt:has([value="L460"])'); await settle(page); await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await shot(page, '12-filters-applied', 'Two filters applied: chips show each one with its own ×, "Clear all" resets; every card, chart, table and export follows.', { clip: { x: 200, y: 56, width: 1240, height: 720 } });
      await page.evaluate(() => (document.querySelector('[data-clear-all]') as HTMLElement).click()); await settle(page);
      await page.selectOption('#kd-date-preset', 'custom'); await page.waitForTimeout(200);
      await page.fill('#kd-date-from', `${new Date().getFullYear()}-01-01`); await page.locator('#kd-date-from').dispatchEvent('change'); await settle(page);
      await shot(page.locator('.kd-filters'), '13-date-custom', 'Reporting period: 7 / 30 / 90 days, 12 months (default), year to date, all time or a custom range.');
      await page.evaluate(() => (document.querySelector('[data-clear-all]') as HTMLElement).click()); await settle(page);
      // Section crops: switch off the sticky app header and filter bar FOR THE CAPTURE ONLY, so they are not drawn over
      // tall sections (a screenshot of a long element scrolls the page under them).
      await page.addStyleTag({ content: 'header{position:relative!important} .kd-filters{position:static!important}' });
      // where to act + insights + charts
      await shot(page.locator('#kd-sec-act'), '30-where-to-act', '"Where to act": potential opportunity by commodity (ranked) and current coverage by commodity × programme.');
      await shot(page.locator('#kd-sec-insights'), '31-insights', 'Management insights — only what the data shows, each with "Filter to this".');
      await shot(page.locator('#kd-sec-charts'), '40-analysis-charts', 'Analysis: activity over time, records by commodity, current v should-cost, programme, powertrain, model year, costing tool, opportunity by powertrain and status.');
      const cost = page.locator('#kd-c-cost');
      await cost.scrollIntoViewIfNeeded(); const cb = await cost.boundingBox();
      if (cb) { await page.mouse.move(cb.x + cb.width * 0.115, cb.y + cb.height * 0.72); await page.waitForTimeout(400); await shot(page, '41-chart-tooltip', 'Hover: exact GBP values, the record count and the commodity\'s weighted gap %.', { clip: { x: cb.x - 16, y: cb.y - 70, width: cb.width + 32, height: cb.height + 90 } }); }
      await page.click('[data-chart-table="cost"]'); await page.waitForTimeout(250);
      await shot(page.locator('[data-chart="cost"]'), '42-chart-table', 'Every chart has a "Table" view with the same figures (keyboard and screen-reader friendly).');
      await page.click('[data-chart-table="cost"]');
      // drill-down
      await page.locator('#kd-sec-drill').scrollIntoViewIfNeeded();
      await shot(page.locator('#kd-sec-drill'), '50-drill-commodity', 'Drill-down, level 1: commodity — current records, eligible records, GBP current / should-cost / gap and opportunity.');
      await page.click('[data-drill-key="Casting"]'); await page.waitForSelector('[data-drill-key="L460"]');
      await page.click('[data-drill-key="L460"]'); await page.waitForSelector('[data-drill-key="BEV"]');
      await page.click('[data-drill-key="BEV"]'); await page.waitForSelector('[data-drill-key="2027"]');
      await page.click('[data-drill-key="2027"]'); await page.waitForSelector('[data-drill-key="LR-KNK-100"]'); await page.waitForTimeout(300);
      await shot(page.locator('#kd-sec-drill'), '51-drill-component', 'Commodity › Programme › Powertrain › Model year › Component — breadcrumbs step back up; the records table follows the path.');
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250);
      await shot(page.locator('.kd-filters'), '52-drill-chip', 'The drill path is also a chip ("Drill-down (table and exports)") with its own ×.');
      await page.evaluate(() => (document.querySelector('#kd-chips [data-drill-to="-1"]') as HTMLElement).click()); await page.waitForTimeout(500);
      // records
      await page.locator('#kd-sec-records').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
      await shot(page.locator('#kd-sec-records'), '60-records-current', 'Costing records — current records (one per part × programme × model year × powertrain), most-used columns first, part number pinned.');
      await page.selectOption('#kd-scope', 'all'); await page.waitForTimeout(600);
      await shot(page.locator('#kd-sec-records'), '61-records-all', '"All saves, revisions included": older revisions and other users\' duplicate costings are labelled and kept out of the money KPIs.');
      await page.selectOption('#kd-scope', 'current'); await page.waitForTimeout(400);
      await page.fill('#kd-search', 'KNK'); await page.waitForTimeout(700);
      await page.click('[data-sort="gapGbp"]'); await page.waitForTimeout(500);
      await shot(page.locator('#kd-sec-records'), '62-records-search-sort', 'Search (part number, component, owner, ID) and sort on any column heading; paging and rows per page below.');
      await page.fill('#kd-search', ''); await page.waitForTimeout(600);
      // record panel
      const knk = recs.find(r => r.partNumber === 'LR-KNK-100' && r.role === 'current')!;
      await page.evaluate(id => (document.querySelector(`[data-open="${id}"]`) as HTMLElement)?.click(), knk.id);
      await page.waitForSelector('#kd-drawer[open] h2'); await page.waitForTimeout(300);
      await shot(page.locator('#kd-drawer'), '63-record-panel', 'The record panel: classification, owner and dates, original v GBP values with the frozen FX snapshot, the gap, other costings of the same part, notes.');
      await page.click('[data-act="copy-link"]'); await page.waitForTimeout(400);
      await shot(page.locator('#kd-drawer .kd-dialog-h'), '64-copy-link', '"Copy link" copies a link that opens this record directly (…/calculator/#kpi-record=<id>).');
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      // original currency
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.click('[data-ccy-mode="original"]'); await page.waitForTimeout(500);
      await shot(page.locator('#kd-sec-ccy'), '24-original-currency', 'Original-currency mode: one row per currency, never added together.');
      await page.click('[data-ccy-mode="gbp"]'); await page.waitForTimeout(400);
      await shot(page.locator('#kd-sec-dq'), '25-data-quality', 'Data quality: what the KPIs are built on and what was left out — never treated as zero.');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.click('[data-act="export-menu"]'); await page.waitForTimeout(200);
      await shot(page, '73-export-menu', 'Export: PDF dashboard report, Excel report, CSV of the records table — all follow the active filters.', { clip: { x: 900, y: 120, width: 540, height: 260 } });
      // downloads
      for (const [act, name] of [['export-pdf', 'dashboard.pdf'], ['export-xlsx', 'dashboard.xlsx'], ['export-csv', 'records.csv']] as const) {
        if (!(await page.isVisible('#kd-export-menu'))) await page.click('[data-act="export-menu"]');
        const d = page.waitForEvent('download', { timeout: 60_000 });
        await page.click(`[data-act="${act}"]`);
        await (await d).saveAs(join(FILES, name)); log(name);
      }
      await ctx.close();
    }
    // admin edit form on the record panel
    {
      const { page, ctx } = await open('ada', 'Ada Admin', 'light');
      await openDash(page);
      const knk = recs.find(r => r.partNumber === 'LR-KNK-100' && r.role === 'current')!;
      await page.evaluate(id => (document.querySelector(`[data-open="${id}"]`) as HTMLElement)?.click(), knk.id);
      await page.waitForSelector('#kd-drawer[open] #kd-edit-form');
      await page.evaluate(() => document.querySelector('#kd-edit-form')?.scrollIntoView());
      await page.waitForTimeout(250);
      await shot(page.locator('#kd-edit-form'), '65-edit-admin', 'Editing (owner or admin): status, part, programme, current cost; admins also set reviewed / approved, validated volume, saving status and the test flag. Changing money re-freezes only that value\'s FX.');
      await ctx.close();
    }
    // dark theme
    {
      const { page, ctx } = await open('bob', 'Bob Baker', 'dark');
      await openDash(page);
      await shot(page, '03-overview-dark', 'The same view in CostVision\'s dark theme (black + green).');
      await page.locator('#kd-sec-act').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      await shot(page.locator('#kd-sec-act'), '32-where-to-act-dark', '"Where to act" in the dark theme.');
      await ctx.close();
    }
    // tablet + phone
    {
      const { page, ctx } = await open('bob', 'Bob Baker', 'light', 768, 1024);
      await openDash(page); await shot(page, '93-tablet', 'Tablet (768 px).');
      await ctx.close();
      const p2 = await open('bob', 'Bob Baker', 'light', 390, 844);
      await openDash(p2.page); await shot(p2.page, '94-phone', 'Phone (390 px): filters fold behind one button, money cards two to a row.');
      await p2.page.click('[data-act="filters-toggle"]'); await p2.page.waitForTimeout(250);
      await shot(p2.page, '95-phone-filters', 'Phone: "Filters" opened.');
      await p2.ctx.close();
    }
    // loading + error + pasted link
    {
      const { page, ctx } = await open('bob', 'Bob Baker', 'light');
      await page.route('**/api/kpi/summary**', async r => { await new Promise(res => setTimeout(res, 3000)); await r.continue(); });
      await page.evaluate(() => (document.getElementById('kpi-btn') as HTMLElement).click());
      await page.waitForSelector('.kd-skel'); await page.waitForTimeout(200);
      await shot(page, '91-loading', 'Loading: a placeholder in the page\'s own shape.');
      await ctx.close();
      const e = await open('bob', 'Bob Baker', 'light');
      await e.page.route('**/api/kpi/summary**', r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The dashboard could not be built. The error is in the server log.' }) }));
      await e.page.evaluate(() => (document.getElementById('kpi-btn') as HTMLElement).click());
      await e.page.waitForSelector('#kd-body .is-error'); await shot(e.page, '92-error', 'Error: a plain message and "Try again" — no half-drawn figures.');
      await e.ctx.close();
      const l = await open('bob', 'Bob Baker', 'light');
      const rid = recs.find(r => r.role === 'current')!.id;
      await l.page.goto('about:blank'); await l.page.goto(`${base}/calculator/#kpi-record=${rid}`, { waitUntil: 'networkidle' });
      await l.page.waitForSelector('#kd-drawer[open] h2', { timeout: 20_000 }); await l.page.waitForTimeout(300);
      await shot(l.page, '66-pasted-link', 'A pasted record link opens CostVision straight on the dashboard with that record open.');
      await l.ctx.close();
    }
  } finally {
    writeFileSync(join(OUT, 'shots', 'manifest.json'), JSON.stringify(manifest, null, 1));
    try { await browser?.close(); } catch { /* closed */ }
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
  }
  log(`done → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
