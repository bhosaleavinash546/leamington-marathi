/**
 * KPI dashboard design audit — screenshots + measurements (no assertions; evidence only).
 *
 * Data: the SAME fixture as e2e/kpi-dashboard-live.ts (a machining costing saved through the
 * screen, six API saves incl. a revision + another user's duplicate, two CSS System / CPSC II
 * import rows, an approved FX file + recalculation, one admin-validated volume). A throwaway
 * SQLite database in a temp dir — nothing else is touched.
 *
 *   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx e2e/kpi-dashboard-audit.ts <outDir> [before|after]
 *
 * Writes <outDir>/<phase>/*.png and <outDir>/evidence/<phase>-metrics.json.
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

const ROOT = resolve('.');
const OUT = resolve(process.argv[2] ?? 'docs/dashboard-audit');
const PHASE = process.argv[3] ?? 'before';
const SHOTS = join(OUT, PHASE);
mkdirSync(SHOTS, { recursive: true }); mkdirSync(join(OUT, 'evidence'), { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const log = (m: string) => process.stdout.write(`[audit] ${m}\n`);
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const MONTH = new Date().toISOString().slice(0, 7);
const WIDTHS: [number, number, string][] = [[1920, 1080, 'desktop'], [1440, 900, 'desktop'], [1366, 768, 'laptop'], [1024, 768, 'small-laptop'], [768, 1024, 'tablet'], [390, 844, 'mobile']];
const metrics: Record<string, unknown> = { phase: PHASE, generated: new Date().toISOString(), data: 'e2e/kpi-dashboard-live.ts fixture (see header)' };

async function axeOn(page: Page, selector: string): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE);
  const v = await page.evaluate(sel => (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } })
    .axe.run({ include: [[sel]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }), selector);
  return v.violations.map(x => `${x.id} ×${x.nodes.length} (${x.nodes.slice(0, 3).map(n => n.target.join(' ')).join('; ')})`);
}

async function main(): Promise<void> {
  if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('no dist/ — run npm run build first');
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-kpi-audit-'));
  const secret = 'audit-' + Math.random().toString(36).slice(2);
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
    for (const [id, name, role] of [['alice', 'Alice Able', 'user'], ['bob', 'Bob Baker', 'user'], ['ada', 'Ada Admin', 'admin'], ['nora', 'Nora New', 'user']]) {
      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, new Date().toISOString());
    }
    db.close();
    const tok = (id: string) => jwt.sign({ userId: id, email: `${id}@test`, emailVerified: true }, secret, { expiresIn: '6h' });
    const api = async (user: string, method: string, path: string, body?: unknown) => {
      const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) as any };
    };
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const open = async (user: string, name: string, w: number, h: number, theme: string) => {
      const ctx = await browser!.newContext({ serviceWorkers: 'block', viewport: { width: w, height: h }, acceptDownloads: true, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const errors: string[] = []; const failed: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
      page.on('requestfailed', r => failed.push(`${r.method()} ${r.url().replace(base, '')} ${r.failure()?.errorText ?? ''}`));
      page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(`${r.status()} ${r.url().replace(base, '')}`); });
      await page.addInitScript('window.__name = (f) => f;');
      await page.addInitScript(([t, n, th]) => {
        localStorage.setItem('auth_token', t!); localStorage.setItem('auth_user', JSON.stringify({ fullName: n, email: 'x@test' }));
        localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1');
        if (!localStorage.getItem('sc-theme')) localStorage.setItem('sc-theme', th!);
      }, [tok(user), name, theme] as const);
      await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
      return { page, ctx, errors, failed };
    };
    const openDash = async (page: Page) => {
      await page.evaluate(() => (document.getElementById('kpi-btn') as HTMLElement).click());
      await page.waitForSelector('.kd-cards', { timeout: 30_000 });
      await page.waitForFunction(() => document.querySelector('#kd-body')?.getAttribute('aria-busy') === 'false');
      await page.waitForTimeout(350);
    };

    // ── Seed (the live e2e fixture) ──────────────────────────────────────────
    {
      const { page, ctx } = await open('alice', 'Alice Able', 1500, 1000, 'dark');
      // Empty state first (nothing saved yet), then the costing save through the screen.
      await openDash(page).catch(() => undefined);
      await page.waitForSelector('#kd-body .kd-empty', { timeout: 20_000 });
      await page.screenshot({ path: join(SHOTS, 'state-empty-no-records-dark-1500.png') });
      await page.evaluate(() => (document.getElementById('tile-machining') as HTMLElement)?.click());
      await page.waitForSelector('#load-ref-btn', { state: 'attached', timeout: 30_000 });
      await page.evaluate(() => (document.getElementById('load-ref-btn') as HTMLElement).click());
      await page.waitForFunction(() => getComputedStyle(document.getElementById('save-dashboard-btn')!).display !== 'none', null, { timeout: 30_000 });
      await page.evaluate(() => (document.getElementById('save-dashboard-btn') as HTMLElement).click());
      await page.waitForSelector('#kd-save-dialog[open]');
      await page.screenshot({ path: join(SHOTS, 'state-save-dialog-dark-1500.png') });
      await page.fill('#kd-s-pn', 'LR-BRK-001'); await page.selectOption('#kd-s-prog', 'L460'); await page.fill('#kd-s-my', '2027');
      await page.selectOption('#kd-s-pt', 'BEV'); await page.fill('#kd-s-cc', '14.2'); await page.selectOption('#kd-s-ccy', 'EUR'); await page.selectOption('#kd-s-terms', 'DAP');
      const saved = page.waitForResponse(r => r.url().endsWith('/api/kpi/records') && r.request().method() === 'POST');
      await page.click('#kd-save-dialog button[type="submit"]'); await saved;
      await ctx.close();
    }
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
    await api('ada', 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`currency,period,units_per_gbp,source\nEUR,${MONTH},1.19,JLR Treasury approved ${MONTH}\nUSD,${MONTH},1.31,JLR Treasury approved ${MONTH}\nCNY,${MONTH},9.45,JLR Treasury approved ${MONTH}\nINR,${MONTH},111.2,JLR Treasury approved ${MONTH}\n`) });
    await api('ada', 'POST', '/api/kpi/fx/recalculate', { apply: true });
    const head = 'source_tool,source_record_id,owner,part_number,component_name,commodity,programme,model_year,powertrain,country,status,costing_date,should_cost,should_currency,should_terms,current_cost,current_currency,current_terms';
    await api('ada', 'POST', '/api/kpi/import', { fileBase64: b64(`${head}\nCSS System,CSS-100,R. Rao,LR-PCB-500,Camera board,PCBA,JEA,2028,BEV,IN,approved,${MONTH}-03,1450,INR,DAP,1690,INR,DAP\nCPSC II,CP-77,J. Lee,LR-SEAL-9,Door seal,Rubber,L461,2027,Petrol PHEV,PL,reviewed,${MONTH}-04,2.1,EUR,DAP,2.6,EUR,DAP\n`) });
    metrics.summaryAllTime = (await api('bob', 'GET', `/api/kpi/summary?f=${encodeURIComponent(JSON.stringify({ datePreset: 'all' }))}`)).json;
    metrics.recordsAllTime = (await api('bob', 'GET', `/api/kpi/records?scope=all&all=1&f=${encodeURIComponent(JSON.stringify({ datePreset: 'all' }))}`)).json;

    // ── Six widths × two themes ──────────────────────────────────────────────
    const perView: Record<string, unknown> = {};
    for (const theme of ['dark', 'light']) {
      for (const [w, h, device] of WIDTHS) {
        const label = `${theme}-${w}`;
        const { page, ctx, errors, failed } = await open('bob', 'Bob Baker', w, h, theme);
        await openDash(page);
        await page.screenshot({ path: join(SHOTS, `${label}-fold.png`) });
        await page.screenshot({ path: join(SHOTS, `${label}-full.png`), fullPage: true });
        const m = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth, vh = window.innerHeight;
          const root = document.getElementById('kpi-view')!;
          const clipped: string[] = []; const offRight: string[] = [];
          root.querySelectorAll<HTMLElement>('*').forEach(el => {
            const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
            if (r.width === 0 || cs.display === 'none' || el.closest('.kd-table-wrap,.kd-ms-pop,.kd-menu-pop,dialog,canvas')) return;
            if (r.right > vw + 1) offRight.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} right=${Math.round(r.right)}`);
            const clips = ['hidden', 'clip'].includes(cs.overflowX) || cs.textOverflow === 'ellipsis';
            if (clips && el.scrollWidth > el.clientWidth + 1 && el.childElementCount === 0) clipped.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} "${(el.textContent ?? '').trim().slice(0, 40)}"`);
          });
          const secTop = (id: string) => { const e = document.getElementById(id); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
          const cardTop = (id: string) => { const e = document.querySelector(`[data-card="${id}"]`); return e ? Math.round(e.getBoundingClientRect().bottom + scrollY) : null; };
          const wrap = document.querySelector<HTMLElement>('#kd-records .kd-table-wrap');
          const visibleCols: string[] = [];
          if (wrap) { const wr = wrap.getBoundingClientRect(); wrap.querySelectorAll('thead th').forEach(th => { const r = th.getBoundingClientRect(); if (r.right <= wr.right + 1) visibleCols.push((th.textContent ?? '').trim()); }); }
          const filterRow = document.getElementById('kd-filter-row')?.getBoundingClientRect();
          return {
            viewport: [vw, vh], pageHeight: document.documentElement.scrollHeight, horizontalOverflowPx: document.documentElement.scrollWidth - vw,
            offRight: offRight.slice(0, 15), clippedText: clipped.slice(0, 15),
            foldPx: vh, sectionTops: { insights: secTop('kd-sec-insights'), dq: secTop('kd-sec-dq'), charts: secTop('kd-sec-charts'), drill: secTop('kd-sec-drill'), records: secTop('kd-sec-records') },
            cardBottoms: { opportunity: cardTop('opportunity'), gap: cardTop('gap-pct'), review: cardTop('review') },
            filterRowHeight: filterRow ? Math.round(filterRow.height) : null,
            recordsColumnsVisibleWithoutScroll: visibleCols,
            recordsTableScrollWidth: wrap ? [wrap.clientWidth, wrap.scrollWidth] : null,
          };
        });
        const ax = await axeOn(page, '#kpi-view');
        perView[label] = { device, ...m, axe: ax, errors, failed };
        log(`${label}: overflow ${m.horizontalOverflowPx}px, page ${m.pageHeight}px, charts top ${m.sectionTops.charts}, axe ${ax.length}`);
        await ctx.close();
      }
    }
    metrics.views = perView;

    // ── States, interactions and measurements at 1440 ────────────────────────
    for (const theme of ['dark', 'light']) {
      const { page, ctx, errors } = await open('bob', 'Bob Baker', 1440, 900, theme);
      await openDash(page);
      const t = theme;
      // filter popover
      await page.click('[data-ms-toggle="commodity"]');
      await page.waitForSelector('.kd-ms-pop');
      await page.screenshot({ path: join(SHOTS, `state-filter-popover-${t}-1440.png`) });
      // API calls for ONE checkbox change
      const calls: string[] = [];
      const onReq = (r: { url: () => string }) => { if (r.url().includes('/api/kpi/')) calls.push(r.url().replace(base, '').split('?')[0]); };
      page.on('request', onReq);
      // NOTE (finding): page.check on the input fails — the label text covers the checkbox; click the label as a user does.
      metrics.checkboxDirectlyClickable = await page.locator('[data-ms-opt="commodity"][value="Casting"]').check({ timeout: 1500 }).then(() => true).catch(() => false);
      if (!metrics.checkboxDirectlyClickable) await page.click('.kd-ms-opt:has([value="Casting"])');
      await page.waitForTimeout(1500);
      page.off('request', onReq);
      if (t === 'dark') metrics.apiCallsForOneFilterChange = calls;
      const focusAfterPick = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''} ${a.getAttribute('data-ms-opt') ?? ''}` : 'none'; });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const popoverOpenAfterEscape = await page.isVisible('.kd-ms-pop');
      if (t === 'dark') metrics.filterPopover = { focusAfterPick, popoverOpenAfterEscape };
      await page.screenshot({ path: join(SHOTS, `state-filtered-casting-${t}-1440-fold.png`) });
      await page.mouse.click(1300, 120); await page.waitForTimeout(200);   // click outside closes it
      await page.evaluate(() => (document.querySelector('[data-clear-all]') as HTMLElement)?.click()); await page.waitForTimeout(900);
      // export menu
      await page.click('[data-act="export-menu"]'); await page.waitForTimeout(150);
      await page.screenshot({ path: join(SHOTS, `state-export-menu-${t}-1440.png`), clip: { x: 0, y: 0, width: 1440, height: 400 } });
      await page.keyboard.press('Escape');
      // chart tooltip (hover first bar of commodity chart)
      const c = await page.$('#kd-c-commodity');
      if (c) { await c.scrollIntoViewIfNeeded(); const b = await c.boundingBox(); if (b) { await page.mouse.move(b.x + b.width * 0.35, b.y + 22); await page.waitForTimeout(250); await page.screenshot({ path: join(SHOTS, `state-chart-tooltip-${t}-1440.png`), clip: { x: Math.max(0, b.x - 20), y: Math.max(0, b.y - 60), width: Math.min(800, b.width + 40), height: b.height + 80 } }); } }
      // records table + sticky header test
      await page.evaluate(() => document.getElementById('kd-sec-records')?.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(SHOTS, `state-records-${t}-1440.png`) });
      const sticky = await page.evaluate(() => {
        const th = document.querySelector('#kd-records thead th'); const tbl = document.querySelector('#kd-records table');
        if (!th || !tbl) return null;
        window.scrollBy(0, (tbl.getBoundingClientRect().top) + 60);
        return { tableTop: Math.round(tbl.getBoundingClientRect().top), headerTop: Math.round(th.getBoundingClientRect().top) };
      });
      if (t === 'dark') metrics.stickyHeaderAfterScroll = sticky;
      // drawer
      await page.click('#kd-records [data-open]');
      await page.waitForSelector('#kd-drawer[open] h2');
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(SHOTS, `state-record-drawer-${t}-1440.png`) });
      await page.keyboard.press('Escape');
      // keyboard: tab through the dashboard, record focus indicators
      if (t === 'dark') {
        await page.evaluate(() => { window.scrollTo(0, 0); (document.querySelector('#kpi-view') as HTMLElement).setAttribute('tabindex', '-1'); (document.querySelector('#kpi-view') as HTMLElement).focus(); });
        const stops: { el: string; visible: boolean }[] = [];
        for (let i = 0; i < 60; i++) {
          await page.keyboard.press('Tab');
          const s = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            if (!a || !a.closest('#kpi-view')) return null;
            const cs = getComputedStyle(a);
            const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
            return { el: `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}.${(a.className || '').toString().split(' ')[0]} ${(a.getAttribute('aria-label') ?? a.textContent ?? '').trim().slice(0, 30)}`, visible };
          });
          if (s) stops.push(s);
        }
        metrics.keyboardTabStops = stops;
        await page.evaluate(() => (document.querySelector('#kpi-view') as HTMLElement).removeAttribute('tabindex'));
      }
      // theme persistence after reload (toggle then reload)
      if (t === 'light') {
        await page.click('#theme-toggle-btn');
        const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        await page.reload({ waitUntil: 'networkidle' });
        const reloaded = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        metrics.themePersistence = { toggledTo: after, afterReload: reloaded };
      }
      if (t === 'dark') metrics.pageErrors1440 = errors;
      await ctx.close();
    }

    // loading + error states (route interception, no data change)
    {
      const { page, ctx } = await open('bob', 'Bob Baker', 1440, 900, 'dark');
      await page.route('**/api/kpi/summary**', async r => { await new Promise(res => setTimeout(res, 2500)); await r.continue(); });
      await page.evaluate(() => (document.getElementById('kpi-btn') as HTMLElement).click());
      await page.waitForSelector('.kd-skel', { timeout: 10_000 });
      await page.screenshot({ path: join(SHOTS, 'state-loading-dark-1440.png') });
      await ctx.close();
    }
    {
      const { page, ctx } = await open('bob', 'Bob Baker', 1440, 900, 'light');
      await page.route('**/api/kpi/summary**', r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The dashboard could not be built. The error is in the server log.' }) }));
      await page.evaluate(() => (document.getElementById('kpi-btn') as HTMLElement).click());
      await page.waitForSelector('#kd-body .is-error', { timeout: 10_000 });
      await page.screenshot({ path: join(SHOTS, 'state-error-light-1440.png') });
      await ctx.close();
    }
    // admin dialog, and a normal user's view of an admin-only action
    {
      const { page, ctx } = await open('ada', 'Ada Admin', 1440, 900, 'light');
      await openDash(page);
      await page.click('#kd-admin-btn'); await page.waitForSelector('#kd-admin[open] #kd-fx-file'); await page.waitForTimeout(200);
      await page.screenshot({ path: join(SHOTS, 'state-admin-dialog-light-1440.png') });
      await ctx.close();
      metrics.noPermission = {
        excludedListAsUser: (await api('bob', 'GET', `/api/kpi/records?scope=excluded&f=${encodeURIComponent(JSON.stringify({ datePreset: 'all' }))}`)).status,
        fxUploadAsUser: (await api('bob', 'POST', '/api/kpi/fx/rates', { fileBase64: 'eA==' })).status,
        noToken: (await fetch(`${base}/api/kpi/summary`)).status,
      };
    }
    // a brand-new user with nothing filtered sees the same shared data
    metrics.newUserSeesShared = (await api('nora', 'GET', `/api/kpi/summary?f=${encodeURIComponent(JSON.stringify({ datePreset: 'all' }))}`)).json?.operational?.totalRecords;
    metrics.serverKpiErrors = serverLog.match(/\[kpi\][^\n]*/g) ?? [];
  } finally {
    writeFileSync(join(OUT, 'evidence', `${PHASE}-metrics.json`), JSON.stringify(metrics, null, 1));
    try { await browser?.close(); } catch { /* closed */ }
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
  }
  log(`done → ${SHOTS}`);
}
main().catch(e => { console.error(e); process.exit(1); });
