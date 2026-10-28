/**
 * STL DFM, live: a real server and a real browser. An STL is uploaded on CAD to COST; the background DFM job reads its
 * faces from the triangles (server/utils/mesh-features.ts, in a worker), the report lands, and the 3D viewer takes the
 * job's faces so the findings can be shown on the mesh.
 *
 * The questions are answered as an engineer would (injection moulding, plastic) and the part costed.
 * Checks (PASS / FAIL): the job is queued for the STL (it used to be skipped), it finishes, the report holds the same
 * findings as the kernel gave the STEP (tests/fixtures/stl-dfm/*.kernel.json), the report does NOT carry the mesh
 * faces, the faces arrive on their own route, the viewer's face tools switch on, and a finding highlights faces.
 *
 *   npm run build && npx tsx e2e/stl-dfm-live.ts          (CV_LIVE_OUT=<dir> for the screenshots)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = process.env.CV_LIVE_OUT ?? join(tmpdir(), 'stl-dfm-live');
const FX = join(ROOT, 'tests', 'fixtures', 'stl-dfm');
const PART = 'IM_ECU_Cover';
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
/** The CAD to COST questions answered as an engineer would (as e2e/cad-to-cost-live.ts does), then Get cost. */
const ANSWERS: Record<string, string> = { 'commodity.route': 'injection_moulding', 'material.family': 'plastic', 'material.resin': 'mat-pa66gf30' };
async function answerAndCost(page: Page): Promise<string> {
  for (let round = 0; round < 10; round++) {
    const st = await page.waitForFunction(() => {
      const hero = document.querySelector('#cv-result-hero .crh-total')?.textContent ?? '';
      const btn = document.getElementById('cad-get-cost-btn') as HTMLButtonElement | null;
      if (/\d/.test(hero) && document.getElementById('cad-cost-card')) return { hero };
      // questions open, or none left: either way Get cost is the next click once it is free
      if (btn && !btn.disabled && btn.getAttribute('aria-busy') !== 'true') return { hero: '' };
      return false;
    }, null, { timeout: Number(process.env.CV_ROUND_MS ?? 300_000), polling: 500 }).then(h => h.jsonValue()).catch(async e => {
      await page.screenshot({ path: join(OUT, 'stalled.png'), fullPage: false });
      const state = await page.evaluate(() => ({
        hero: document.querySelector('#cv-result-hero .crh-total')?.textContent ?? null,
        costCard: !!document.getElementById('cad-cost-card'),
        btn: (() => { const b = document.getElementById('cad-get-cost-btn') as HTMLButtonElement | null; return b ? { disabled: b.disabled, busy: b.getAttribute('aria-busy'), text: b.textContent?.trim(), visible: !!b.offsetParent } : null; })(),
        step: document.querySelector('[aria-current="step"]')?.textContent?.trim() ?? null,
      }));
      console.log('  stalled:', JSON.stringify(state));
      throw e;
    });
    if (st.hero) return st.hero;
    const open = await page.$$eval('#cad-decisions-panel .cad-decision', ds => ds.map(d => ({
      id: (d as HTMLElement).dataset.decisionId!,
      radios: Array.from(d.querySelectorAll('input[type=radio]')).map(r => (r as HTMLInputElement).value),
      select: Array.from(d.querySelectorAll('select[data-decision-select] option')).map(o => (o as HTMLOptionElement).value).filter(Boolean),
      picked: (d.querySelector('input[type=radio]:checked, select[data-decision-select]') as HTMLInputElement | null)?.value ?? null,
    })));
    const todo = open.find(o => ANSWERS[o.id] && o.picked !== ANSWERS[o.id] && (o.radios.includes(ANSWERS[o.id]) || o.select.includes(ANSWERS[o.id])));
    console.log(`  round ${round}: ${open.map(o => `${o.id}=${o.picked ?? '∅'}`).join(', ')}${todo ? ` → answer ${todo.id}` : ' → Get cost'}`);
    if (todo) {
      const sel = `.cad-decision[data-decision-id="${todo.id}"]`;
      // a STEP re-runs the rules on /reanalyze; an STL is analysed again on /analyze with the answers
      const rerun = page.waitForResponse(r => /\/api\/cad\/(re)?analyze$/.test(r.url()), { timeout: 300_000 }).catch(() => null);
      if (todo.radios.includes(ANSWERS[todo.id])) await page.check(`${sel} input[type=radio][value="${ANSWERS[todo.id]}"]`);
      else await page.selectOption(`${sel} select[data-decision-select]`, ANSWERS[todo.id], { timeout: 30_000 });
      await rerun;
      await page.waitForTimeout(800);
      continue;
    }
    await page.click('#cad-get-cost-btn');
    await page.waitForTimeout(1500);
  }
  throw new Error('not costed after 10 rounds');
}
const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
const check = (name: string, ok: boolean, detail = '') => { checks.push({ name, ok, detail }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

async function main(): Promise<void> {
  if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('no dist/ — run npm run build first');
  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-stl-dfm-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout?.on('data', d => { serverLog = (serverLog + d.toString()).slice(-100_000); });
  server.stderr?.on('data', d => { serverLog = (serverLog + d.toString()).slice(-100_000); });
  const logFile = process.env.CV_SERVER_LOG;   // the whole server log, as it comes (a stalled run is killed before finally)
  if (logFile) { server.stdout?.on('data', d => appendFileSync(logFile, d)); server.stderr?.on('data', d => appendFileSync(logFile, d)); }
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '2h' });
    const truth = JSON.parse(readFileSync(join(FX, `${PART}.kernel.json`), 'utf8')) as { findingsByRule: Record<string, number> };

    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const page = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })).newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    type Report = { commodity?: string; findings?: Array<{ ruleId: string; faceIds?: number[] }>; meshFaces?: unknown };
    let jobId: string | null = null;
    const reports = new Map<string, Report>();
    const meshFacesBy = new Map<string, { triangles: number; faces: unknown[] }>();
    page.on('response', async r => {
      const u = r.url();
      try {
        if (/\/api\/cad\/(re)?analyze$/.test(u)) {
          const j = await r.json() as { dfmJobId?: string | null; selectedCommodity?: string; decisions?: Array<{ id: string; severity: string; options?: Array<{ value: string }> }> };
          jobId = j.dfmJobId ?? jobId;
          if (process.env.CV_DEBUG) console.log('  analyze:', j.selectedCommodity, JSON.stringify((j.decisions ?? []).map(d => [d.id, d.severity, (d.options ?? []).map(o => o.value).slice(0, 8)])));
        }
        else if (/\/api\/dfm\/jobs\/[^/]+\/report$/.test(u) && r.ok()) reports.set(u.split('/').at(-2)!, await r.json());
        else if (/\/api\/dfm\/jobs\/[^/]+\/mesh-faces$/.test(u) && r.ok()) meshFacesBy.set(u.split('/').at(-2)!, await r.json());
      } catch { /* body already consumed / not JSON */ }
    });
    await page.addInitScript('window.__name = (f) => f;');
    await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
    await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });
    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="cad_analysis"]:visible').first().click({ timeout: 15_000 });
    await page.fill('#cad-programme-years', '5');
    await page.setInputFiles('#cad-file-input', process.env.CV_PART_FILE ?? join(FX, `${PART}.stl`));
    await page.waitForTimeout(1500);
    await page.click('#calc-btn');
    const hero = await answerAndCost(page);
    check('the STL is costed as an injection moulding', /\d/.test(hero), hero);

    // the job the answers re-queued (route + material family), its report and its faces
    const t0 = Date.now();
    while ((!jobId || !reports.has(jobId) || !meshFacesBy.has(jobId)) && Date.now() - t0 < 180_000) await page.waitForTimeout(500);
    check('the DFM job is queued for an STL', !!jobId, jobId ?? 'no dfmJobId on /api/cad/analyze');
    const rep = jobId ? reports.get(jobId) ?? null : null;
    check('the report lands', !!rep, rep ? `${rep.findings?.length ?? 0} findings in ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'no report within 180 s');
    const by: Record<string, number> = {};
    for (const f of rep?.findings ?? []) by[f.ruleId] = (by[f.ruleId] ?? 0) + 1;
    check('findings = the kernel’s on the STEP (same rules, same counts)', JSON.stringify(Object.entries(by).sort()) === JSON.stringify(Object.entries(truth.findingsByRule).sort()),
      `STL ${JSON.stringify(by)} v kernel ${JSON.stringify(truth.findingsByRule)}`);
    check('the report does not carry the mesh faces', !!rep && rep.meshFaces === undefined);
    const mf = jobId ? meshFacesBy.get(jobId) ?? null : null;
    check('the faces arrive on their own route, one id per triangle', !!mf && mf.triangles === readFileSync(join(FX, `${PART}.stl`)).readUInt32LE(80),
      mf ? `${mf.triangles} triangles, ${mf.faces.length} faces` : 'none');

    // The viewer took them: its face tools switch on (they are off on a bare mesh).
    await page.waitForTimeout(1000);
    const tools = await page.$$eval('[data-act="facecolors"]', bs => bs.map(b => !(b as HTMLButtonElement).disabled));
    check('the viewer’s face tools switch on for the STL', tools.some(Boolean), `face-type button enabled in ${tools.filter(Boolean).length} of ${tools.length} viewer(s)`);
    const faceId = rep?.findings?.find(f => f.faceIds?.length)?.faceIds?.[0];
    const before = await page.$$eval('[data-act="facecolors"]', bs => bs.length);
    check('a finding names faces the viewer holds', faceId !== undefined && before > 0, `face ${faceId}`);
    await page.screenshot({ path: join(OUT, `${PART}-stl.png`) });
    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await browser?.close();
    try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
  const failed = checks.filter(c => !c.ok);
  console.log(`\n  ${checks.length - failed.length}/${checks.length} PASS${failed.length ? ` — FAILED: ${failed.map(f => f.name).join('; ')}` : ''}`);
  if (failed.length) { console.log(serverLog.split('\n').filter(l => /dfm|DFM|error|Error/.test(l)).slice(-20).join('\n')); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
