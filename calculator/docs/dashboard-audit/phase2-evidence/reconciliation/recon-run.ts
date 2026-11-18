/**
 * Phase 2 · Step 3 financial reconciliation — the test set (evidence script, not part of the app).
 *
 * Starts the server of ONE code tree (argv[2] = its calculator/ directory: the fixed branch, or the pre-fix tree
 * extracted from 5f385ef5 with `git archive`) on a THROWAWAY SQLite database in /tmp (CV_DATA_DIR, AI off), builds the
 * same synthetic test set through the API in the same order, records every request's status / error, and reads back the
 * all-time summary, every record (scope=all, admin), the server CSV and the excluded list. With --browser it also opens
 * the dashboard (that tree's dist) as the admin, all-time, and saves the KPI cards, the records table and the PDF /
 * Excel / CSV exports taken from the screen.
 *
 * Run from /home/user/cv-phase2/calculator:
 *   npx tsx docs/dashboard-audit/phase2-evidence/reconciliation/recon-run.ts <calculatorRoot> <outDir> [--browser]
 * Writes <outDir>/run.json, <outDir>/records.csv, <outDir>/db-path.txt (+ <outDir>/screen.json, <outDir>/exports/*).
 * The database directory is KEPT (its path is in db-path.txt) so hand.py and the A-11 dry run can read it.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve(process.argv[2] ?? '.');
const OUT = resolve(process.argv[3] ?? 'recon-out'); mkdirSync(OUT, { recursive: true });
const BROWSER = process.argv.includes('--browser');
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const ALL = encodeURIComponent(JSON.stringify({ datePreset: 'all' }));
const b64 = (s: string) => Buffer.from(s).toString('base64');
const HEAD = 'source_tool,source_record_id,owner,part_number,component_name,commodity,programme,model_year,powertrain,country,status,costing_date,should_cost,should_currency,should_terms,current_cost,current_currency,current_terms';
const BD8 = (t: [number, number, number, number, number, number, number, number]) => ({ rawMaterial: t[0], process: t[1], labour: t[2], tooling: t[3], packaging: t[4], logistics: t[5], overhead: t[6], margin: t[7] });

async function main() {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-phase2-recon-'));
  writeFileSync(join(OUT, 'db-path.txt'), join(dir, 'should-cost.db') + '\n');
  const secret = 'recon-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '1', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let slog = ''; server.stdout?.on('data', d => { slog += d; }); server.stderr?.on('data', d => { slog += d; });
  const base = `http://127.0.0.1:${port}`;
  const R: Record<string, unknown> = { codeTree: ROOT, database: `${dir}/should-cost.db (throwaway, synthetic data only)`, today: new Date().toISOString().slice(0, 10) };
  const actions: { step: string; method: string; path: string; status: number; error?: string; record?: unknown }[] = [];
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    for (const [id, name, role] of [['alice', 'Alice Able', 'user'], ['bob', 'Bob Baker', 'user'], ['ada', 'Ada Admin', 'admin']]) {
      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, new Date().toISOString());
    }
    db.close();
    const tok = (id: string) => jwt.sign({ userId: id, email: `${id}@test`, emailVerified: true }, secret, { expiresIn: '2h' });
    const api = async (step: string, user: string, method: string, path: string, body?: unknown) => {
      const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tok(user)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* csv */ }
      if (step) actions.push({ step, method, path: path.replace(/f=[^&]+/, 'f=…'), status: r.status, ...(json?.error ? { error: json.error } : {}), ...(json?.record ? { record: { id: json.record.id, status: json.record.status, volumeValidated: json.record.volumeValidated, annualVolume: json.record.annualVolume, isTest: json.record.isTest, commodity: json.record.commodity, country: json.record.country, partNumber: json.record.partNumber, fx: json.record.fx } } : {}) });
      return { status: r.status, json, text };
    };
    const save = (step: string, user: string, sid: string, d: Record<string, unknown>, total: number, breakdown?: Record<string, number>, commodity = 'casting') =>
      api(step, user, 'POST', '/api/kpi/records', { scenario: { id: sid, name: String(d.componentName), commodity, region: 'UK', input: { partName: d.componentName, deliveryTerms: 'DAP' }, result: breakdown ? { total, breakdown } : { total } }, details: { status: 'completed', currentCcy: 'GBP', currentTerms: 'DAP', ...d } });
    const idOf = (r: { json: any }) => r.json?.record?.id as string;
    const pause = (ms = 25) => new Promise(r => setTimeout(r, ms));

    // FX: a synthetic approved table (units per GBP) for the months used — loaded first so every record freezes at it.
    await api('FX table (synthetic: EUR 1.19, USD 1.31 units per GBP; Sep–Nov 2026)', 'ada', 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`currency,period,units_per_gbp,source\n${['2026-09', '2026-10', '2026-11'].flatMap(m => [`EUR,${m},1.19,Synthetic reconciliation rate`, `USD,${m},1.31,Synthetic reconciliation rate`]).join('\n')}\n`) });

    // R1 GBP, 8-bucket breakdown that re-adds; volume validated by the admin; a validated saving (not changed by any fix)
    const r1 = await save('R1 save (GBP, 8-line breakdown = 10.00)', 'alice', 'rc-r1', { partNumber: 'REC-GBP-01', componentName: 'R1 GBP bracket', programme: 'L460', modelYear: 2027, powertrain: 'BEV', currentCost: 12, annualVolume: 10000 }, 10, BD8([4, 2, 1.5, 0.5, 0.25, 0.25, 0.8, 0.7]));
    await api('R1 admin validates volume 10,000', 'ada', 'PATCH', `/api/kpi/records/${idOf(r1)}`, { volumeValidated: true });
    await api('R1 admin validated saving £0.50', 'ada', 'PATCH', `/api/kpi/records/${idOf(r1)}`, { savingStatus: 'validated', savingPerPiece: 0.5, savingCcy: 'GBP' });
    // R2–R6 imports: non-GBP (EUR/EUR), mixed currencies (GBP should / USD current), a part with three revisions
    await api('R2–R6 import (CSS System + CPSC II)', 'ada', 'POST', '/api/kpi/import', { fileBase64: b64(`${HEAD}
CSS System,RC-EUR,R. Rao,REC-EUR-02,R2 EUR casting,Casting,L460,2027,BEV,DE,completed,2026-10-15,20,EUR,DAP,25,EUR,DAP
CPSC II,RC-MIX,J. Lee,REC-MIX-03,R3 mixed-currency forging,Forging,L461,2027,BEV,US,completed,2026-10-20,30,GBP,DAP,40,USD,DAP
CSS System,RC-REV-1,R. Rao,REC-REV-04,R4 three revisions,Machining,L663,2026,Petrol,GB,approved,2026-09-10,50,GBP,DAP,60,GBP,DAP
CSS System,RC-REV-2,R. Rao,REC-REV-04,R4 three revisions,Machining,L663,2026,Petrol,GB,completed,2026-10-10,52,GBP,DAP,60,GBP,DAP
CSS System,RC-REV-3,R. Rao,REC-REV-04,R4 three revisions,Machining,L663,2026,Petrol,GB,completed,2026-11-10,55,GBP,DAP,60,GBP,DAP
`) });
    // R7 / R8 (A-06): two costings of one part, same owner, same day; then a note on the FIRST
    const r7 = await save('R7 save first same-day costing (should 15)', 'alice', 'rc-r7', { partNumber: 'REC-TIE-07', componentName: 'R7 same-day tie', programme: 'L460', modelYear: 2028, powertrain: 'MHEV', currentCost: 20 }, 15, { rawMaterial: 7.5, process: 7.5 });
    await pause();
    await save('R8 save second same-day costing (should 17)', 'alice', 'rc-r8', { partNumber: 'REC-TIE-07', componentName: 'R7 same-day tie', programme: 'L460', modelYear: 2028, powertrain: 'MHEV', currentCost: 20 }, 17, { rawMaterial: 8.5, process: 8.5 });
    await pause();
    await api('R7 owner adds a note to the FIRST costing', 'alice', 'PATCH', `/api/kpi/records/${idOf(r7)}`, { notes: 'a note on the older costing' });
    // R9 (A-03 / A-05): admin validates volume 60,000 and approves; the OWNER then changes the volume to 600,000
    const r9 = await save('R9 save (volume 50,000)', 'bob', 'rc-r9', { partNumber: 'REC-VOL-09', componentName: 'R9 validated volume', programme: 'L461', modelYear: 2027, powertrain: 'BEV', currentCost: 12, annualVolume: 50000 }, 10, { rawMaterial: 5, process: 5 });
    await api('R9 admin: volume 60,000 validated + approved', 'ada', 'PATCH', `/api/kpi/records/${idOf(r9)}`, { annualVolume: 60000, volumeValidated: true, status: 'approved' });
    await api('R9 OWNER changes volume 60,000 → 600,000', 'bob', 'PATCH', `/api/kpi/records/${idOf(r9)}`, { annualVolume: 600000 });
    // R10 (A-05): approved; the owner sets the test flag (would exclude it)
    const r10 = await save('R10 save', 'bob', 'rc-r10', { partNumber: 'REC-TST-10', componentName: 'R10 owner test flag', programme: 'EMA', modelYear: 2028, powertrain: 'BEV', currentCost: 50 }, 40, { rawMaterial: 20, process: 20 });
    await api('R10 admin approves', 'ada', 'PATCH', `/api/kpi/records/${idOf(r10)}`, { status: 'approved' });
    await api('R10 OWNER sets isTest', 'bob', 'PATCH', `/api/kpi/records/${idOf(r10)}`, { isTest: true });
    // R11 (A-05): approved; the owner changes commodity and country
    const r11 = await save('R11 save (casting)', 'bob', 'rc-r11', { partNumber: 'REC-COM-11', componentName: 'R11 owner commodity', programme: 'JEA', modelYear: 2028, powertrain: 'BEV', currentCost: 33 }, 30, { rawMaterial: 15, process: 15 });
    await api('R11 admin approves', 'ada', 'PATCH', `/api/kpi/records/${idOf(r11)}`, { status: 'approved' });
    await api('R11 OWNER changes commodity → Forging', 'bob', 'PATCH', `/api/kpi/records/${idOf(r11)}`, { commodity: 'Forging' });
    await api('R11 OWNER changes country → CN', 'bob', 'PATCH', `/api/kpi/records/${idOf(r11)}`, { country: 'CN' });
    // R12 (A-05): approved; the owner changes the part number
    const r12 = await save('R12 save', 'alice', 'rc-r12', { partNumber: 'REC-PN-12', componentName: 'R12 owner part number', programme: 'L460', modelYear: 2027, powertrain: 'Petrol PHEV', currentCost: 9 }, 8, { rawMaterial: 4, process: 4 });
    await api('R12 admin approves', 'ada', 'PATCH', `/api/kpi/records/${idOf(r12)}`, { status: 'approved' });
    await api('R12 OWNER changes part number → REC-PN-12B', 'alice', 'PATCH', `/api/kpi/records/${idOf(r12)}`, { partNumber: 'REC-PN-12B' });
    // R13 (A-05): approved; the owner downgrades it to draft
    const r13 = await save('R13 save', 'bob', 'rc-r13', { partNumber: 'REC-DRF-13', componentName: 'R13 owner downgrade', programme: 'L663', modelYear: 2027, powertrain: 'BEV', currentCost: 6 }, 5, { rawMaterial: 2.5, process: 2.5 });
    await api('R13 admin approves', 'ada', 'PATCH', `/api/kpi/records/${idOf(r13)}`, { status: 'approved' });
    await api('R13 OWNER sets status draft', 'bob', 'PATCH', `/api/kpi/records/${idOf(r13)}`, { status: 'draft' });
    // R14 (A-04): a total that does not re-add (0.01 v 1,998); R15: off only by rounding (13.04 v 13.00 over 8 lines)
    await save('R14 save total 0.01 with breakdown 999 + 999', 'bob', 'rc-r14', { partNumber: 'REC-FAKE-14', componentName: 'R14 forged total', programme: 'EMA', modelYear: 2027, powertrain: 'BEV', currentCost: 12 }, 0.01, { rawMaterial: 999, process: 999 });
    await save('R15 save total 13.04, 8 lines sum 13.00', 'bob', 'rc-r15', { partNumber: 'REC-RND-15', componentName: 'R15 rounding only', programme: 'L461', modelYear: 2028, powertrain: 'MHEV', currentCost: 14 }, 13.04, BD8([4, 3, 2, 1.5, 0.3, 0.4, 1, 0.8]));
    // R16: below should-cost (unfavourable, never netted)
    await save('R16 save (current below should)', 'alice', 'rc-r16', { partNumber: 'REC-NEG-16', componentName: 'R16 unfavourable', programme: 'L663', modelYear: 2028, powertrain: 'Petrol', currentCost: 18 }, 20, { rawMaterial: 10, process: 10 });
    // R17 (A-11): part numbers that differ only by case or punctuation (imports); R18: programme case variants (saves)
    await api('R17 import part-number variants', 'ada', 'POST', '/api/kpi/import', { fileBase64: b64(`${HEAD}
CSS System,RC-V1,R. Rao,LR-REC-200,R17 variant,Casting,L460,2027,BEV,GB,completed,2026-10-01,5,GBP,DAP,6,GBP,DAP
CSS System,RC-V2,R. Rao,lr-rec-200,R17 variant,Casting,L460,2027,BEV,GB,completed,2026-10-02,5,GBP,DAP,6,GBP,DAP
CSS System,RC-V3,R. Rao,LRREC200,R17 variant,Casting,L460,2027,BEV,GB,completed,2026-10-03,5,GBP,DAP,6,GBP,DAP
CSS System,RC-V4,R. Rao,LR_REC_200,R17 variant,Casting,L460,2027,BEV,GB,completed,2026-10-04,5,GBP,DAP,6,GBP,DAP
`) });
    await save('R18 save programme Q901 (alice)', 'alice', 'rc-r18a', { partNumber: 'REC-CASE-18', componentName: 'R18 programme case', programme: 'Q901', modelYear: 2028, powertrain: 'BEV', currentCost: 9 }, 7, { rawMaterial: 3.5, process: 3.5 });
    await save('R18 save programme q901 (bob)', 'bob', 'rc-r18b', { partNumber: 'REC-CASE-18', componentName: 'R18 programme case', programme: 'q901', modelYear: 2028, powertrain: 'BEV', currentCost: 9 }, 7, { rawMaterial: 3.5, process: 3.5 });

    R.actions = actions;
    const summary = (await api('', 'ada', 'GET', `/api/kpi/summary?f=${ALL}`)).json;
    R.summary = { operational: summary.operational, financial: summary.financial, currencyTotals: summary.currencyTotals, dataQuality: summary.dataQuality, costByCommodity: summary.charts.costByCommodity, byStatus: summary.charts.byStatus, insights: summary.insights };
    R.summaryAsUser = (await api('', 'bob', 'GET', `/api/kpi/summary?f=${ALL}`)).json?.financial;
    R.rows = (await api('', 'ada', 'GET', `/api/kpi/records?scope=all&all=1&f=${ALL}`)).json.rows;
    R.excludedRows = (await api('', 'ada', 'GET', `/api/kpi/records?scope=excluded&all=1&f=${ALL}`)).json.rows;
    const csv = await api('', 'ada', 'GET', `/api/kpi/records.csv?scope=current&f=${ALL}`);
    writeFileSync(join(OUT, 'records-server.csv'), csv.text);
    R.serverErrors = slog.match(/\[kpi\][^\n]*/g) ?? [];

    if (BROWSER) {
      const { chromium } = await import('playwright');
      mkdirSync(join(OUT, 'exports'), { recursive: true });
      const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
      try {
        const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
        const page = await ctx.newPage();
        const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
        await page.addInitScript('window.__name = (f) => f;');
        await page.addInitScript((t: string) => {
          localStorage.setItem('auth_token', t); localStorage.setItem('auth_user', JSON.stringify({ fullName: 'Ada Admin', email: 'x@test' }));
          localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); localStorage.setItem('sc-theme', 'light');
          localStorage.setItem('cv-kpi-dashboard', JSON.stringify({ filters: { datePreset: 'all' } }));
        }, tok('ada'));
        await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
        await page.evaluate(() => (document.getElementById('kpi-btn') as HTMLElement).click());
        await page.waitForSelector('.kd-cards', { timeout: 30_000 });
        await page.waitForFunction(() => document.querySelector('#kd-body')?.getAttribute('aria-busy') === 'false');
        await page.waitForTimeout(500);
        const cards = await page.$$eval('[data-card]', els => els.map(e => ({
          id: e.getAttribute('data-card'), value: (e.querySelector('.kd-card-v')?.textContent ?? '').trim(), exact: e.querySelector('.kd-card-v')?.getAttribute('title') ?? null,
          sub: (e.querySelector('.kd-card-s')?.textContent ?? '').replace(/\s+/g, ' ').trim(), annualisedExact: e.querySelector('[data-annualised] strong')?.getAttribute('title') ?? null,
        })));
        // records table (current scope, the screen's default) — every page
        const table: Record<string, string>[] = [];
        for (let pg = 0; pg < 20; pg++) {
          const rows = await page.evaluate(() => {
            const heads = [...document.querySelectorAll('#kd-records thead th')].map(t => (t.textContent ?? '').replace(/[▲▼]/g, '').trim());
            return [...document.querySelectorAll('#kd-records tbody tr')].map(tr => Object.fromEntries([...tr.querySelectorAll('td,th')].map((td, i) => [heads[i] ?? `c${i}`, (td.textContent ?? '').replace(/\s+/g, ' ').trim()])));
          });
          table.push(...rows);
          const next = await page.$('#kd-sec-records button[aria-label="Next page"]:not([disabled])');
          if (!next) break;
          await next.click(); await page.waitForTimeout(400);
        }
        const pager = await page.evaluate(() => (document.querySelector('#kd-page-size')?.parentElement?.textContent ?? '').replace(/\s+/g, ' ').trim());
        await page.screenshot({ path: join(OUT, 'dashboard-1440-light.png'), fullPage: false });
        const dl = async (act: string) => {
          const p = page.waitForEvent('download', { timeout: 90_000 });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.click('[data-act="export-menu"]'); await page.click(`[data-act="${act}"]`);
          const d = await p; const path = join(OUT, 'exports', d.suggestedFilename().replace(/-\d{4}-\d{2}-\d{2}(-\d{4})?/, '')); await d.saveAs(path); return path;
        };
        const exportsDone = { xlsx: await dl('export-xlsx'), pdf: await dl('export-pdf'), csv: await dl('export-csv') };
        writeFileSync(join(OUT, 'screen.json'), JSON.stringify({ cards, table, pager, exports: exportsDone, errors }, null, 1));
        await ctx.close();
      } finally { await browser.close(); }
    }
  } finally {
    writeFileSync(join(OUT, 'run.json'), JSON.stringify({ generated: new Date().toISOString(), ...R }, null, 1));
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
  }
  console.log(`done → ${OUT} (db ${dir})`);
}
main().catch(e => { console.error(e); process.exit(1); });
