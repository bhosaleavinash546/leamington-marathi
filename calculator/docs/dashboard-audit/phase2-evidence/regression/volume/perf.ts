/**
 * Phase 2 COPY of phase1-evidence/perf.ts (Step 5 volume regression). Changes, and nothing else:
 *  (1) argv[3] = output JSON path; downloads go to /tmp/cv-phase2-perf-dl/<label>/ (not the evidence folder);
 *  (2) CV_ROOT = the calculator/ tree whose server, dist and kpi-store are used (default: cwd) — so the same harness
 *      measures the fixed branch and the pre-fix tree (5f385ef5, extracted with git archive);
 *  (3) SEED_COSTINGS=1 also writes a linked `scenarios` row (~16 KB JSON: input, 8-bucket breakdown that re-adds,
 *      20 operations, a trace) for every CostVision record, BEFORE the server reads the data — A-04 makes the list read
 *      join the linked costing, and Phase 1's harness wrote no costings, so it could not see that cost;
 *  (4) temp dirs are /tmp/cv-phase2-perf-*.
 * Phase 1 header follows.
 * Phase 1 audit — performance at volume, END TO END (server + SQLite + browser + exports), on a
 * THROWAWAY database in a fresh /tmp directory (CV_DATA_DIR). The schema is created by the real
 * server on start; synthetic records are written through the store's own insertRecord (no code,
 * config, migration or dependency change). The directory is deleted at the end.
 * Writes only phase1-evidence/30-perf-<n>.json and phase1-evidence/perf-downloads/.
 *   npx tsx docs/dashboard-audit/phase1-evidence/perf.ts 20000
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { chromium } from 'playwright';
import type { RecordInput } from '../../../../server/data/kpi-store';

const N = Number(process.argv[2] ?? 20000);
const ROOT = resolve(process.env.CV_ROOT ?? '.');
const OUTFILE = resolve(process.argv[3] ?? `perf-${N}.json`);
const SEED = process.env.SEED_COSTINGS === '1';
const DL = join('/tmp/cv-phase2-perf-dl', OUTFILE.split('/').pop()!.replace(/\.json$/, '')); mkdirSync(DL, { recursive: true });
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const COMS = ['Casting', 'Machining', 'Forging', 'Injection moulding', 'PCBA', 'Pressed sheet metal', 'Rubber', 'Composites'];
const PROGS = ['L460', 'L461', 'L663', 'EMA', 'JEA'];
const PTS = ['MHEV', 'Petrol PHEV', 'Diesel PHEV', 'Petrol', 'BEV'];
const CCY = ['GBP', 'EUR', 'USD', 'INR', 'CNY'];
const RATE: Record<string, number> = { GBP: 1, EUR: 0.84, USD: 0.75, INR: 0.0091, CNY: 0.105 };
const out: Record<string, unknown> = { records: N };

async function startServer(dir: string, port: number, secret: string): Promise<ChildProcess> {
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '1', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const s = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
  for (let i = 0; ; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return s; } catch { /* starting */ } if (i > 240) throw new Error('no start'); await new Promise(r => setTimeout(r, 250)); }
}
const stop = (s: ChildProcess) => { try { process.kill(-s.pid!, 'SIGKILL'); } catch { /* gone */ } };

async function main() {
  const { insertRecord, fxContext } = await import(join(ROOT, 'server/data/kpi-store.ts')) as typeof import('../../../../server/data/kpi-store');
  out.codeTree = ROOT; out.seededCostings = SEED;
  const dir = mkdtempSync(join(tmpdir(), 'cv-phase2-perf-'));
  out.database = `throwaway SQLite at ${dir}/should-cost.db (created by the real server, filled via insertRecord, deleted after the run)`;
  const secret = 'perf-' + Math.random().toString(36).slice(2);
  let port = await freePort();
  let server = await startServer(dir, port, secret); stop(server); await new Promise(r => setTimeout(r, 800));
  // ── fill ──
  {
    const db = new Database(join(dir, 'should-cost.db'));
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES ('ada','ada@test','x','Ada Admin',1,'admin',?)`).run(now);
    for (let u = 0; u < 40; u++) db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?,?,?,?,1,'user',?)`).run(`u${u}`, `u${u}@test`, 'x', `User ${u}`, now);
    const ctx = fxContext(db);
    const t0 = performance.now();
    db.transaction(() => {
      for (let i = 0; i < N; i++) {
        const c = CCY[i % 5]; const should = 5 + (i % 97); const cur = should * (0.9 + (i % 7) * 0.05);
        const day = new Date(Date.now() - (i % 360) * 86400000).toISOString().slice(0, 10);
        const input: RecordInput = {
          sourceTool: i % 3 ? 'CostVision' : 'CSS System', sourceRef: `s${i}`, ownerId: `u${i % 40}`, ownerLabel: `User ${i % 40}`,
          partNumber: `LR${i % Math.round(N * 0.6)}`, componentName: `Part ${i}`, commodity: COMS[i % 8], programme: PROGS[i % 5], modelYear: 2025 + (i % 4),
          powertrain: PTS[i % 5], country: 'UK', status: (['draft', 'completed', 'reviewed', 'approved'] as const)[i % 4], costingDate: day,
          shouldCost: should, shouldCcy: 'GBP', shouldTerms: 'DAP', currentCost: +(cur / RATE[c]).toFixed(4), currentCcy: c, currentTerms: 'DAP', currentSource: 'quote',
          annualVolume: 10000, volumeValidated: i % 2 === 0, savingStatus: null, savingPerPiece: null, savingCcy: null, isTest: false, notes: '',
        };
        insertRecord(db, input, ctx, `perf-${i}`);
        if (SEED && input.sourceTool === 'CostVision') {
          const b = { rawMaterial: +(should * 0.4).toFixed(4), process: +(should * 0.2).toFixed(4), labour: +(should * 0.1).toFixed(4), tooling: +(should * 0.05).toFixed(4), packaging: +(should * 0.03).toFixed(4), logistics: +(should * 0.04).toFixed(4), overhead: +(should * 0.1).toFixed(4), margin: 0 };
          b.margin = +(should - Object.values(b).reduce((a, x) => a + x, 0)).toFixed(4);
          const data = JSON.stringify({ input: Object.fromEntries(Array.from({ length: 120 }, (_, k) => [`field${k}`, k % 3 ? `value-${k}-${i}` : k * 1.5])), result: { total: should, breakdown: b, operationDetails: Array.from({ length: 20 }, (_, k) => ({ name: `Op ${k * 10}`, cost: 0.1 * k, cycleTimeSec: 30 + k, machineId: `mach-${k}`, notes: 'x'.repeat(200) })), trace: 'y'.repeat(6000) }, region: 'UK', commodity: 'casting' });
          db.prepare(`INSERT INTO scenarios (id, name, description, data, created_at, created_by) VALUES (?, ?, '', ?, ?, ?)`).run(`s${i}`, `Part ${i}`, data, now, `u${i % 40}`);
        }
      }
    })();
    out.insertMs = Math.round(performance.now() - t0);
    db.close();
    out.dbBytes = statSync(join(dir, 'should-cost.db')).size;
  }
  port = await freePort();
  server = await startServer(dir, port, secret);
  const base = `http://127.0.0.1:${port}`;
  const token = jwt.sign({ userId: 'ada', email: 'ada@test', emailVerified: true }, secret, { expiresIn: '2h' });
  const f = (o: object) => `f=${encodeURIComponent(JSON.stringify(o))}`;
  const time = async (path: string) => { const t = performance.now(); const r = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } }); const b = await r.arrayBuffer(); return { status: r.status, ms: Math.round(performance.now() - t), bytes: b.byteLength }; };
  const api: Record<string, unknown> = {};
  try {
    api.summary_cold_default12m = await time(`/api/kpi/summary?${f({ datePreset: '12m' })}`);
    api.summary_warm_default12m = await time(`/api/kpi/summary?${f({ datePreset: '12m' })}`);
    api.summary_new_filter_commodity = await time(`/api/kpi/summary?${f({ datePreset: 'all', commodity: ['Casting', 'PCBA'] })}`);
    api.summary_all_time = await time(`/api/kpi/summary?${f({ datePreset: 'all' })}`);
    api.records_page1_sorted_gap = await time(`/api/kpi/records?scope=current&page=1&pageSize=50&sort=gapGbp&${f({ datePreset: 'all' })}`);
    api.records_search = await time(`/api/kpi/records?scope=current&page=1&pageSize=50&search=LR12&${f({ datePreset: 'all' })}`);
    api.drill_commodity = await time(`/api/kpi/drill?drill=commodity&${f({ datePreset: 'all' })}`);
    api.records_csv = await time(`/api/kpi/records.csv?scope=current&${f({ datePreset: 'all' })}`);
    api.records_all_json = await time(`/api/kpi/records?scope=all&all=1&${f({ datePreset: 'all' })}`);
    api.record_detail = await time(`/api/kpi/records/perf-7`);
    // a write invalidates the cache — the next read pays the full re-classification
    await fetch(base + '/api/kpi/records/perf-7', { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: 'perf' }) });
    api.summary_after_write = await time(`/api/kpi/summary?${f({ datePreset: '12m' })}`);
    out.api = api;
    // ── browser ──
    const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
    const bctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await bctx.newPage();
    await page.addInitScript('window.__name = (f) => f;');
    await page.addInitScript((t: string) => { localStorage.setItem('auth_token', t); localStorage.setItem('auth_user', JSON.stringify({ fullName: 'Ada Admin', email: 'x@test' })); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
    const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${base}/calculator/`, { waitUntil: 'load' });
    await page.waitForSelector('#kpi-btn', { state: 'attached', timeout: 60_000 });
    const tOpen = performance.now();
    await page.click('#kpi-btn');
    await page.waitForSelector('.kd-cards', { timeout: 120_000 });
    await page.waitForSelector('.kd-records tbody tr', { timeout: 120_000 }).catch(() => null);
    const browserRes: Record<string, unknown> = { openDashboardToCardsAndTableMs: Math.round(performance.now() - tOpen) };
    const cdp = await bctx.newCDPSession(page); await cdp.send('Performance.enable');
    const m = (await cdp.send('Performance.getMetrics')).metrics as { name: string; value: number }[];
    browserRes.jsHeapUsedMB = +(m.find(x => x.name === 'JSHeapUsedSize')!.value / 1048576).toFixed(1);
    browserRes.domNodes = m.find(x => x.name === 'Nodes')?.value;
    const tAll = performance.now();
    await page.selectOption('#kd-date-preset', 'all');
    await page.waitForFunction(() => !document.querySelector('.kd-busy, [aria-busy="true"]'), undefined, { timeout: 120_000 }).catch(() => null);
    await page.waitForTimeout(50);
    browserRes.changeDateToAllTimeMs = Math.round(performance.now() - tAll);
    const dl = async (act: string) => {
      const t = performance.now();
      const p = page.waitForEvent('download', { timeout: 300_000 });
      await page.click('[data-act="export-menu"]'); await page.click(`[data-act="${act}"]`);
      const d = await p; const path = join(DL, d.suggestedFilename()); await d.saveAs(path);
      return { ms: Math.round(performance.now() - t), bytes: statSync(path).size, file: path.replace(ROOT + '/', '') };
    };
    browserRes.exportCsv = await dl('export-csv');
    browserRes.exportXlsx = await dl('export-xlsx');
    browserRes.exportPdf = await dl('export-pdf');
    const m2 = (await cdp.send('Performance.getMetrics')).metrics as { name: string; value: number }[];
    browserRes.jsHeapUsedAfterExportsMB = +(m2.find(x => x.name === 'JSHeapUsedSize')!.value / 1048576).toFixed(1);
    browserRes.pageErrors = errors;
    out.browser = browserRes;
    // ── UX extras on the same data: touch targets (phone), reduced motion, heading / landmark structure ──
    if (process.env.UX !== '0') {
      const ux: Record<string, unknown> = {};
      for (const [w, h, rm] of [[390, 844, 'reduce'], [1440, 900, 'no-preference']] as const) {
        const c2 = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: rm });
        const p2 = await c2.newPage();
        await p2.addInitScript('window.__name = (f) => f;');
        await p2.addInitScript((t: string) => { localStorage.setItem('auth_token', t); localStorage.setItem('auth_user', JSON.stringify({ fullName: 'Ada Admin', email: 'x@test' })); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
        await p2.goto(`${base}/calculator/`, { waitUntil: 'load' });
        await p2.waitForSelector('#kpi-btn', { state: 'attached', timeout: 60_000 });
        await p2.evaluate(() => (document.getElementById('kpi-btn') as HTMLElement).click()); await p2.waitForSelector('.kd-cards', { timeout: 120_000 }); await p2.waitForTimeout(600);
        ux[`w${w}`] = await p2.evaluate(() => {
          const root = document.getElementById('kpi-view')!;
          const els = [...root.querySelectorAll<HTMLElement>('button, a[href], select, input, [role="button"], [tabindex="0"], summary')].filter(e => e.offsetParent && getComputedStyle(e).visibility !== 'hidden');
          const small24 = els.filter(e => { const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24; });
          const small44 = els.filter(e => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; });
          const label = (e: HTMLElement) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.dataset.act ? '[' + e.dataset.act + ']' : ''} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`;
          const running = document.getAnimations().filter(a => a.playState === 'running').length;
          const headings = [...root.querySelectorAll('h1,h2,h3,h4')].map(hh => `${hh.tagName}:${(hh.textContent ?? '').trim().slice(0, 40)}`);
          const landmarks = [...root.querySelectorAll('main,nav,section[aria-label],section[aria-labelledby],[role="region"],[role="navigation"],[role="main"]')].length;
          const unnamed = els.filter(e => !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.textContent ?? '').trim() || (e as HTMLInputElement).labels?.length || e.getAttribute('title'))).map(label);
          const transitions = [...root.querySelectorAll<HTMLElement>('*')].filter(e => parseFloat(getComputedStyle(e).transitionDuration) > 0.01).length;
          return { interactive: els.length, under24px: small24.length, under24Examples: small24.slice(0, 12).map(label), under44px: small44.length, runningAnimations: running, elementsWithTransitions: transitions, headings: headings.slice(0, 30), landmarkRegions: landmarks, unnamedControls: unnamed.slice(0, 10) };
        });
        (ux[`w${w}`] as Record<string, unknown>).reducedMotion = rm;
        await c2.close();
      }
      out.ux = ux;
    }
    await browser.close();
  } finally {
    stop(server);
    writeFileSync(OUTFILE, JSON.stringify({ generated: new Date().toISOString(), ...out }, null, 1));
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(JSON.stringify(out, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
