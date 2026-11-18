/**
 * Phase 2 · Block 3 evidence (not part of the app): screenshots + measurements for F-19, F-21, F-22, F-23, F-24, F-25,
 * F-26, F-28, A-27, A-28 (b) and A-29, in both themes at the widths where each showed. Throwaway server + temp SQLite
 * (AI off), synthetic records only. Run from calculator/ after a build:
 *   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx docs/dashboard-audit/phase2-evidence/block3/b3-screens.ts <outDir>
 * Writes <outDir>/*.png, <outDir>/exports/*, <outDir>/b3-results.json.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page, type Browser } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const OUT = resolve(process.argv[2] ?? 'b3-out'); mkdirSync(join(OUT, 'exports'), { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const MONTH = new Date().toISOString().slice(0, 7);
const log = (m: string) => process.stdout.write(`[b3] ${m}\n`);
const ALL = encodeURIComponent(JSON.stringify({ datePreset: 'all' }));

async function main() {
  const port = await freePort(); const dir = mkdtempSync(join(tmpdir(), 'cv-phase2-b3-'));
  const secret = 'b3-' + Math.random().toString(36).slice(2);
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '1', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir }, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const R: Record<string, unknown> = { dbDir: dir };
  let browser: Browser | undefined;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('no server'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    for (const [id, name, role] of [['alice', 'Alice Able', 'user'], ['bob', 'Bob Baker', 'user'], ['ada', 'Ada Admin', 'admin']]) {
      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, new Date().toISOString());
    }
    db.close();
    const tok = (id: string) => jwt.sign({ userId: id, email: `${id}@test`, emailVerified: true }, secret, { expiresIn: '2h' });
    const api = async (user: string, method: string, path: string, body?: unknown) => {
      const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) as any };
    };
    const save = (user: string, sid: string, d: Record<string, unknown>, total: number, commodity = 'casting', region = 'UK', breakdown?: Record<string, number>) =>
      api(user, 'POST', '/api/kpi/records', { scenario: { id: sid, name: String(d.componentName ?? sid), commodity, region, input: { partName: d.componentName, deliveryTerms: 'DAP' }, result: breakdown ? { total, breakdown } : { total } }, details: { status: 'completed', ...d } });
    // The live e2e's API saves (total only), plus: one with an 8-bucket breakdown, one with a large negative gap.
    const seeds = [
      await save('alice', 'sc-a2', { partNumber: 'LR-KNK-100', componentName: 'Front knuckle', programme: 'L460', modelYear: 2027, powertrain: 'BEV', currentCost: 31.5, currentCcy: 'GBP', currentTerms: 'DAP', annualVolume: 60000 }, 26.4),
      await save('bob', 'sc-b1', { partNumber: 'LR-KNK-100', componentName: 'Front knuckle', programme: 'L460', modelYear: 2027, powertrain: 'BEV', currentCost: 31.5, currentCcy: 'GBP', currentTerms: 'DAP' }, 27.1),
      await save('bob', 'sc-b2', { partNumber: 'LR-HSG-220', componentName: 'Inverter housing', programme: 'EMA', modelYear: 2028, powertrain: 'BEV', currentCost: 420, currentCcy: 'CNY', currentTerms: 'EXW' }, 41.0, 'casting', 'CN'),
      await save('bob', 'sc-b3', { partNumber: 'LR-SHF-310', componentName: 'Output shaft', programme: 'L663', modelYear: 2026, powertrain: 'Petrol', currentCost: 18.4, currentCcy: 'USD', currentTerms: 'DAP' }, 15.2, 'forging'),
      await save('alice', 'sc-a4', { partNumber: 'LR-BKT-410', componentName: 'Bracket', programme: 'L461', modelYear: 2026, powertrain: 'Diesel PHEV' }, 6.1, 'sheet_metal'),
      await save('alice', 'sc-a5', { partNumber: 'LR-LNK-520', componentName: 'Rear link', programme: 'L460', modelYear: 2027, powertrain: 'MHEV', currentCost: 12.0, currentCcy: 'GBP', currentTerms: 'DAP', annualVolume: 40000 }, 10.0, 'forging', 'UK',
        { rawMaterial: 4, process: 2, labour: 1, tooling: 0.5, packaging: 0.25, logistics: 0.25, overhead: 1, margin: 1 }),
      await save('bob', 'sc-b6', { partNumber: 'LR-CLP-050', componentName: 'Harness clip', programme: 'L461', modelYear: 2027, powertrain: 'PHEV', currentCost: 2.0, currentCcy: 'GBP', currentTerms: 'DAP' }, 3.0, 'injection_moulding'),
    ];
    R.seedStatuses = seeds.map(s => s.status);
    const id = (i: number) => seeds[i].json.record.id as string;
    R.adminPatches = [
      (await api('ada', 'PATCH', `/api/kpi/records/${id(1)}`, { annualVolume: 60000, volumeValidated: true })).status,
      (await api('ada', 'PATCH', `/api/kpi/records/${id(5)}`, { volumeValidated: true })).status,
      (await api('ada', 'PATCH', `/api/kpi/records/${id(5)}`, { savingStatus: 'validated', savingPerPiece: 0.8, savingCcy: 'GBP' })).status,
      (await api('ada', 'PATCH', `/api/kpi/records/${id(3)}`, { savingStatus: 'implemented', savingPerPiece: 1.5, savingCcy: 'USD' })).status,
    ];
    const b64 = (s: string) => Buffer.from(s).toString('base64');
    R.fx = (await api('ada', 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`currency,period,units_per_gbp,source\nEUR,${MONTH},1.19,Synthetic test rate\nUSD,${MONTH},1.31,Synthetic test rate\nCNY,${MONTH},9.45,Synthetic test rate\nINR,${MONTH},111.2,Synthetic test rate\n`) })).status;
    await api('ada', 'POST', '/api/kpi/fx/recalculate', { apply: true });
    const head = 'source_tool,source_record_id,owner,part_number,component_name,commodity,programme,model_year,powertrain,country,status,costing_date,should_cost,should_currency,should_terms,current_cost,current_currency,current_terms';
    R.import = (await api('ada', 'POST', '/api/kpi/import', { fileBase64: b64(`${head}\nCSS System,CSS-100,R. Rao,LR-PCB-500,Camera board,PCBA,JEA,2028,BEV,IN,approved,${daysAgo(5)},1450,INR,DAP,1690,INR,DAP\nCPSC II,CP-77,J. Lee,LR-SEAL-9,Door seal,Rubber,L461,2027,Petrol PHEV,PL,reviewed,${daysAgo(4)},2.1,EUR,DAP,2.6,EUR,DAP\n`) })).status;
    const sum = (await api('bob', 'GET', `/api/kpi/summary?f=${ALL}`)).json;
    R.financial = sum.financial;
    R.insights = sum.insights.map((i: { title: string; detail: string }) => `${i.title} — ${i.detail}`);
    const recs = (await api('bob', 'GET', `/api/kpi/records?scope=all&all=1&f=${ALL}`)).json.rows as { id: string; sourceRef: string }[];
    const recId = (ref: string) => recs.find(r => r.sourceRef === ref)!.id;

    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const open = async (w: number, h: number, theme: string, reducedMotion: 'reduce' | 'no-preference' = 'reduce') => {
      const ctx = await browser!.newContext({ serviceWorkers: 'block', viewport: { width: w, height: h }, reducedMotion, acceptDownloads: true });
      const page = await ctx.newPage();
      const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
      await page.addInitScript('window.__name = (f) => f;');
      await page.addInitScript(([t, th]) => {
        localStorage.setItem('auth_token', t!); localStorage.setItem('auth_user', JSON.stringify({ fullName: 'Bob Baker', email: 'x@test' }));
        localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); localStorage.setItem('sc-theme', th!);
        localStorage.setItem('cv-kpi-dashboard', JSON.stringify({ filters: { datePreset: 'all' } }));
      }, [tok('bob'), theme] as const);
      await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
      await page.evaluate(() => (document.getElementById('kpi-btn') as HTMLElement).click());
      await page.waitForSelector('.kd-cards', { timeout: 30_000 });
      await page.waitForFunction(() => document.querySelector('#kd-body')?.getAttribute('aria-busy') === 'false');
      await page.waitForTimeout(500);
      return { page, ctx, errors };
    };
    const axe = async (page: Page) => {
      if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE);
      return page.evaluate(() => (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string }[] }> } }).axe.run({ include: [['#kpi-view']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then(r => r.violations.map(v => v.id)));
    };
    const shotEl = async (page: Page, sel: string, file: string) => { const el = await page.$(sel); if (el) { await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: join(OUT, file) }); } return !!el; };

    const views: Record<string, unknown> = {};
    for (const theme of ['dark', 'light']) {
      for (const [w, h] of [[1920, 1080], [1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844]] as const) {
        const label = `${theme}-${w}`;
        const { page, ctx, errors } = await open(w, h, theme);
        const v: Record<string, unknown> = {};
        // F-23: scroll past the top and measure the sticky filter bar against the app header
        await page.evaluate(() => document.getElementById('kd-sec-charts')?.scrollIntoView({ block: 'start' }));
        await page.waitForTimeout(250);
        v.sticky = await page.evaluate(() => {
          const hdr = document.querySelector<HTMLElement>('header.header, .header'); const bar = document.querySelector<HTMLElement>('.kd-filters');
          if (!hdr || !bar) return null;
          const hb = hdr.getBoundingClientRect().bottom, bt = bar.getBoundingClientRect().top;
          return { headerBottom: Math.round(hb * 10) / 10, filterBarTop: Math.round(bt * 10) / 10, seamPx: Math.round((bt - hb) * 10) / 10, barTopCss: getComputedStyle(bar).top, barPosition: getComputedStyle(bar).position, scrollY };
        });
        if ([1440, 1024, 390].includes(w)) await page.screenshot({ path: join(OUT, `f23-sticky-${label}.png`), clip: { x: 0, y: 0, width: w, height: 200 } });
        await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150);
        if (w === 1440 || w === 390) {
          await shotEl(page, '.kd-head', `f28-head-${label}.png`);
          await shotEl(page, '.kd-band', `f21-a29-financial-${label}.png`);
          await shotEl(page, '#kd-sec-insights', `a27-insights-${label}.png`);
          await shotEl(page, '#kd-sec-act', `f19-act-${label}.png`);
          await shotEl(page, '#kd-sec-charts', `f19-charts-${label}.png`);
          for (const cid of ['activity', 'commodity', 'cost', 'opportunity', 'programme', 'modelyear', 'tool', 'opp-powertrain']) {
            await page.evaluate(c => { const e = document.querySelector(`[data-chart="${c}"]`); if (e) window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 260); }, cid);
            await page.waitForTimeout(120);
            const el = await page.$(`[data-chart="${cid}"]`); if (el) await el.screenshot({ path: join(OUT, `f19-chart-${cid}-${label}.png`) });
          }
          await shotEl(page, '#kd-sec-records', `f24-records-${label}.png`);
        }
        // F-21 text, F-24 column, F-28 class, A-27 insight text
        v.opportunitySub = await page.textContent('[data-card="opportunity"] .kd-card-s').then(t => t?.replace(/\s+/g, ' ').trim());
        v.gapSub = await page.textContent('[data-card="gap-pct"] .kd-card-s').then(t => t?.replace(/\s+/g, ' ').trim());
        v.recordsHeaders = await page.$$eval('#kd-records thead th', ths => ths.map(t => (t.textContent ?? '').replace(/[▲▼]/g, '').trim()));
        v.exportButtonClass = await page.getAttribute('[data-act="export-menu"]', 'class');
        v.refreshButtonClass = await page.getAttribute('[data-act="refresh"]', 'class');
        v.headerButtonStyles = await page.evaluate(() => ['[data-act="refresh"]', '[data-act="export-menu"]', '#kd-admin-btn'].map(s => { const e = document.querySelector<HTMLElement>(s); if (!e || e.hidden) return null; const cs = getComputedStyle(e); return { s, bg: cs.backgroundColor, color: cs.color, border: cs.borderColor, h: Math.round(e.getBoundingClientRect().height) }; }));
        v.insightText = await page.$$eval('.kd-insight', els => els.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(t => /£/.test(t)));
        // A-29: hit area of each "i" button — box and a hit test at the corners of a 24 × 24 square on its centre
        v.tips = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.kd-tip')].slice(0, 11).map(b => {
          b.scrollIntoView({ block: 'center' });
          const r = b.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const pts = [[-11.5, -11.5], [11.5, -11.5], [-11.5, 11.5], [11.5, 11.5], [0, -11.5], [0, 11.5], [-11.5, 0], [11.5, 0]];
          const hits = pts.filter(([dx, dy]) => { const e = document.elementFromPoint(cx + dx, cy + dy); return !!e && (e === b || b.contains(e)); }).length;
          return { label: b.getAttribute('aria-label'), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, hitCorners24: `${hits}/8` };
        }));
        await page.evaluate(() => window.scrollTo(0, 0));
        v.overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        v.axe = await axe(page);
        // F-25: the record panel for a total-only API save (sheet_metal), a save with a breakdown, and an import
        if (w === 1440 || w === 390) {
          for (const [ref, tag] of [['sc-a4', 'api-total-only'], ['sc-a5', 'api-breakdown'], ['CSS-100', 'import']] as const) {
            await page.evaluate(i => (document.querySelector(`#kd-records [data-open="${i}"]`) as HTMLElement).click(), recId(ref));
            await page.waitForSelector('#kd-drawer[open] h2', { timeout: 20_000 });
            await page.waitForTimeout(250);
            const panel = await page.evaluate(() => {
              const d = document.querySelector('#kd-drawer')!;
              const hs = [...d.querySelectorAll('h3')].map(h => h.textContent?.trim());
              const target = [...d.querySelectorAll('h3')].find(h => /Original costing/.test(h.textContent ?? '')) ?? d.querySelector('[data-costing-note]') ?? d.querySelector('.kd-notes') ?? d.querySelector('h3:last-of-type');
              target?.scrollIntoView({ block: 'center' });
              const costing = [...d.querySelectorAll('h3, p')].map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(t => /costing|CostVision|breakdown|imported/i.test(t));
              return { headings: hs, costingLines: costing };
            });
            await page.waitForTimeout(150);
            await page.screenshot({ path: join(OUT, `f25-panel-${tag}-${label}.png`) });
            (v as Record<string, unknown>)[`panel-${tag}`] = panel;
            if (w === 1440 && tag === 'api-total-only') {
              // F-22: the dialog shadow (whole dialog at the top)
              await page.evaluate(() => document.querySelector('#kd-drawer .kd-dialog-in')?.scrollTo(0, 0));
              await page.evaluate(() => document.querySelector('#kd-drawer')?.scrollTo(0, 0));
              await page.screenshot({ path: join(OUT, `f22-dialog-${label}.png`) });
              v.dialogShadow = await page.evaluate(() => getComputedStyle(document.querySelector('#kd-drawer')!).boxShadow);
              v.dialogBackdrop = await page.evaluate(() => getComputedStyle(document.querySelector('#kd-drawer')!, '::backdrop').backgroundColor);
            }
            await page.keyboard.press('Escape'); await page.waitForTimeout(150);
          }
        }
        // F-22: shadows of the export menu, filter popover, tip and card hover (1440 only)
        if (w === 1440) {
          await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100);
          await page.click('[data-act="export-menu"]'); await page.waitForTimeout(150);
          await page.screenshot({ path: join(OUT, `f22-export-menu-${label}.png`), clip: { x: 640, y: 0, width: 800, height: 360 } });
          const menuShadow = await page.evaluate(() => getComputedStyle(document.querySelector('#kd-export-menu')!).boxShadow);
          await page.keyboard.press('Escape'); await page.waitForTimeout(100);
          await page.click('[data-ms-toggle="commodity"]'); await page.waitForSelector('.kd-ms-pop');
          const msShadow = await page.evaluate(() => getComputedStyle(document.querySelector('.kd-ms-pop')!).boxShadow);
          await page.screenshot({ path: join(OUT, `f22-filter-popover-${label}.png`), clip: { x: 200, y: 0, width: 900, height: 560 } });
          await page.keyboard.press('Escape'); await page.mouse.click(1300, 120); await page.waitForTimeout(150);
          await page.evaluate(() => window.scrollTo(0, 0));
          const tip = page.locator('[data-card="gap-pct"] .kd-tip');
          await tip.click(); await page.waitForTimeout(150);
          const tipShadow = await page.evaluate(() => getComputedStyle(document.querySelector('[data-card="gap-pct"] .kd-tip-pop')!).boxShadow);
          const band = await page.$('.kd-band'); const bb = await band!.boundingBox();
          await page.screenshot({ path: join(OUT, `f22-a29-tip-open-${label}.png`), clip: { x: bb!.x, y: bb!.y, width: bb!.width, height: Math.min(420, bb!.height + 240) } });
          await tip.click(); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
          const card = page.locator('[data-card="records"]'); await card.hover(); await page.waitForTimeout(250);
          const cardShadow = await page.evaluate(() => getComputedStyle(document.querySelector('[data-card="records"]')!).boxShadow);
          const cb = await card.boundingBox();
          await page.screenshot({ path: join(OUT, `f22-card-hover-${label}.png`), clip: { x: Math.max(0, cb!.x - 16), y: Math.max(0, cb!.y - 16), width: cb!.width + 32, height: cb!.height + 32 } });
          v.shadows = { menuShadow, msShadow, tipShadow, cardShadow };
          v.tokens = await page.evaluate(() => ({ md: getComputedStyle(document.documentElement).getPropertyValue('--shadow-md').trim(), lg: getComputedStyle(document.documentElement).getPropertyValue('--shadow-lg').trim() }));
        }
        v.errors = errors;
        views[label] = v;
        log(`${label}: seam ${(v.sticky as { seamPx?: number } | null)?.seamPx}px, overflow ${v.overflowPx}px, axe ${(v.axe as string[]).length}`);
        await ctx.close();
      }
    }
    R.views = views;

    // F-26: the "Details" link (data quality) scrolls instantly under reduced motion; smoothly otherwise.
    const f26: Record<string, unknown> = {};
    for (const rm of ['reduce', 'no-preference'] as const) {
      const { page, ctx } = await open(1440, 900, 'dark', rm);
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100);
      const target = await page.evaluate(() => Math.round(document.getElementById('kd-sec-dq')!.getBoundingClientRect().top + scrollY));
      await page.evaluate(() => (document.querySelector('[data-goto="dq"]') as HTMLElement).click());
      const at40ms = await page.evaluate(() => new Promise<number>(r => setTimeout(() => r(Math.round(scrollY)), 40)));
      await page.waitForTimeout(1500);
      const settled = await page.evaluate(() => Math.round(scrollY));
      f26[rm] = { sectionTop: target, scrollYAfter40ms: at40ms, scrollYSettled: settled, instant: at40ms === settled };
      await ctx.close();
    }
    R.f26 = f26;

    // Exports (A-27, A-28 b): Excel + PDF + CSV from the screen, light theme, all-time view
    {
      const { page, ctx } = await open(1440, 900, 'light');
      const dl = async (act: string) => {
        const p = page.waitForEvent('download', { timeout: 90_000 });
        await page.click('[data-act="export-menu"]'); await page.click(`[data-act="${act}"]`);
        const d = await p; const path = join(OUT, 'exports', d.suggestedFilename().replace(/-\d{4}-\d{2}-\d{2}-\d{4}/, '')); await d.saveAs(path); return path;
      };
      R.exports = { xlsx: await dl('export-xlsx'), pdf: await dl('export-pdf'), csv: await dl('export-csv') };
      await ctx.close();
    }
  } finally {
    writeFileSync(join(OUT, 'b3-results.json'), JSON.stringify(R, null, 1));
    try { await browser?.close(); } catch { /* closed */ }
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
  }
  log(`done → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
