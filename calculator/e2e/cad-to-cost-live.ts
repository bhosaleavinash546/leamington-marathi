/**
 * CAD to COST, live — the three-step flow and its phase 2 checks, as an engineer drives them.
 *
 * A real server (the built bundle) and browser. Each part: programme life typed, STEP uploaded, Calculate pressed, the
 * questions answered on the panel as given (route, material, service, finish), Get cost. Then, on the Step 3 card:
 *   - the part is costed;
 *   - an answered finish is on the form with its load sized from the part (not the form's 6 a rack);
 *   - Compare routes opens and its reference row EQUALS the headline (the row is the headless chain, so this is the
 *     screen = headless check, with no "typed change" note);
 *   - optionally "Cost this route": the part re-costed on another route equals that route's row;
 *   - axe WCAG 2.1 AA on the cost card with every section open: 0 violations;
 *   - the PDF and Excel the export buttons produce are opened and read: each carries the card's reproducibility stamp
 *     word for word, and the PDF the headline (PDF text read from its content streams; Excel with SheetJS).
 * Prints PASS / FAIL per check and exits 1 on any FAIL. Proof run for docs/ui/cad-to-cost-redesign-2026-10.md §6.
 *
 *   npm run build && npm run test:e2e:cad-to-cost            # the three parts below (needs OCP for STEP)
 *   CV_PARTS=parts.json CV_LIVE_OUT=/tmp/out npx tsx e2e/cad-to-cost-live.ts
 *
 * parts.json: [{ "label": "hub", "file": "…/FORGE_Hub_Flange.stp", "answers": { "commodity.route": "forging", … },
 *               "costRoute": "casting", "costRouteAnswers": { … } }]
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';

interface PartSpec {
  label: string; file: string; answers: Record<string, string>;
  programmeYears?: number; costRoute?: string; costRouteAnswers?: Record<string, string>;
}
const ROOT = resolve('.');
const PARTS_DIR = resolve(ROOT, '../cad-audit/parts');
const DEFAULT_PARTS: PartSpec[] = [
  { label: 'knuckle-cam-ecoat', file: join(PARTS_DIR, 'steering_knuckle_RH.stp'),
    answers: { 'commodity.route': 'cast_and_machine', 'material.family': 'steel', 'service.pressureTight': 'no',
      'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes', 'service.finish': 'e_coat' } },
  { label: 'bracket-zinc', file: join(PARTS_DIR, 'Seat_Locking_Bracket.stp'),
    answers: { 'material.family': 'steel', 'service.finish': 'zinc_plate' } },
  { label: 'hub-zinc-then-casting', file: join(PARTS_DIR, 'FORGE_Hub_Flange.stp'),
    answers: { 'commodity.route': 'forging', 'material.family': 'steel', 'service.safetyCritical': 'no',
      'service.toleranceClass': 'standard', 'service.finish': 'zinc_plate' },
    costRoute: 'casting', costRouteAnswers: { 'service.pressureTight': 'no' } },
];
const PARTS: PartSpec[] = process.env.CV_PARTS ? JSON.parse(readFileSync(process.env.CV_PARTS, 'utf8')) : DEFAULT_PARTS;
const OUT = process.env.CV_LIVE_OUT ?? join(tmpdir(), 'cad-to-cost-live');
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const log = (m: string) => process.stdout.write(`[cad2cost] ${m}\n`);
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const money = (t: string) => (t.match(/[£€$¥₹]\s?[\d,]+\.\d{2}/)?.[0] ?? '').replace(/\s/g, '');

const checks: Array<{ part: string; check: string; ok: boolean; detail: string }> = [];
const check = (part: string, name: string, ok: boolean, detail: string) => {
  checks.push({ part, check: name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'} ${part}: ${name} — ${detail}`);
};

/** Answer what the panel asks (as given), let each answer's re-run land, press Get cost until the headline shows. */
async function answerAndCost(page: Page, answers: Record<string, string>, label: string): Promise<string> {
  for (let round = 0; round < 14; round++) {
    const st = await page.waitForFunction(() => {
      const hero = document.querySelector('#cv-result-hero .crh-total')?.textContent ?? '';
      const btn = document.getElementById('cad-get-cost-btn') as HTMLButtonElement | null;
      const qs = document.querySelectorAll('#cad-decisions-panel .cad-decision').length;
      if (/\d/.test(hero) && document.getElementById('cad-cost-card')) return { hero };
      if (qs && btn && !btn.disabled && btn.getAttribute('aria-busy') !== 'true') return { hero: '' };
      return false;
    }, null, { timeout: 900_000, polling: 500 }).then(h => h.jsonValue());
    if (st.hero) return st.hero;
    const open = await page.$$eval('#cad-decisions-panel .cad-decision', ds => ds.map(d => ({
      id: (d as HTMLElement).dataset.decisionId!,
      radios: Array.from(d.querySelectorAll('input[type=radio]')).map(r => (r as HTMLInputElement).value),
      select: Array.from(d.querySelectorAll('select[data-decision-select] option')).map(o => (o as HTMLOptionElement).value).filter(Boolean),
      picked: (d.querySelector('input[type=radio]:checked, select[data-decision-select]') as HTMLInputElement | null)?.value ?? null,
    })));
    const todo = open.find(o => answers[o.id] && o.picked !== answers[o.id] && (o.radios.includes(answers[o.id]) || o.select.includes(answers[o.id])));
    if (todo) {
      const sel = `.cad-decision[data-decision-id="${todo.id}"]`;
      const rerun = page.waitForResponse(r => r.url().includes('/api/cad/reanalyze'), { timeout: 600_000 }).catch(() => null);
      if (todo.radios.includes(answers[todo.id])) await page.check(`${sel} input[type=radio][value="${answers[todo.id]}"]`);
      else await page.selectOption(`${sel} select[data-decision-select]`, answers[todo.id]);
      log(`${label}: answered ${todo.id} = ${answers[todo.id]}`);
      await rerun;
      await page.waitForTimeout(800);
      continue;
    }
    log(`${label}: Get cost (${open.map(o => `${o.id}=${o.picked ?? '∅'}`).join(', ')})`);
    await page.click('#cad-get-cost-btn');
    await page.waitForTimeout(1500);
  }
  throw new Error('not costed after 14 rounds');
}

/**
 * The text a PDF shows, from its uncompressed content streams (the report is jsPDF output: WinAnsi strings in
 * `( … ) Tj`, which for these characters — £ · € — read the same as Latin-1). A compressed PDF yields no text and the
 * checks below fail loudly, never silently.
 */
function pdfText(buf: Buffer): string {
  const out: string[] = [];
  for (const m of buf.toString('latin1').matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    out.push(m[1].replace(/\\([()\\])/g, '$1').replace(/\\(\d{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8))));
  }
  return out.join('\n');
}

/** The exports as a person gets them: click the buttons, open the files, find the card's stamp in both. */
async function checkExports(page: Page, label: string, hero: string): Promise<Record<string, unknown>> {
  const stamp = ((await page.textContent('#cad-cost-card .cad-stamp').catch(() => null)) ?? '').trim();
  check(label, 'stamp on the cost card', /rate book .+ · rules v\S+ · kernel \S+ · \d/.test(stamp), stamp || 'no stamp');
  const xl = join(OUT, `${label}.xlsx`), pdf = join(OUT, `${label}.pdf`);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.evaluate(() => document.getElementById('export-excel-btn')!.click())]);
  await dl.saveAs(xl);
  const wb = XLSX.read(readFileSync(xl));
  const cells = wb.SheetNames.flatMap(n => (XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false }) as unknown[][]).map(r => ({ sheet: n, row: r.map(c => String(c ?? '')) })));
  const xlStamp = cells.find(c => c.row[0] === 'Reproducibility');
  check(label, 'Excel opened: the stamp, word for word', !!xlStamp && xlStamp.row[1] === stamp,
    xlStamp ? `${xlStamp.sheet}: "${xlStamp.row[1]}"` : `no Reproducibility row in ${wb.SheetNames.length} sheets`);
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.evaluate(() => document.getElementById('export-pdf-btn')!.click())]);
  await dl2.saveAs(pdf);
  const text = pdfText(readFileSync(pdf));
  const flat = text.replace(/\s+/g, ' ');
  const pdfStamp = flat.match(/Reproducibility: (.*?kernel \S+ · \d{1,2} \w{3} \d{4})/)?.[1] ?? null;
  check(label, 'PDF opened: the stamp, word for word', pdfStamp === stamp, pdfStamp ? `"${pdfStamp}"` : 'no "Reproducibility:" line in the PDF text');
  const head = money(hero);
  check(label, 'PDF opened: the headline', !!head && flat.includes(head), `${head} ${flat.includes(head) ? 'found' : 'not found'} in ${text.length} characters`);
  return { stamp, excel: xl, pdf };
}

async function axeCostCard(page: Page): Promise<string[]> {
  await page.evaluate(() => { document.querySelectorAll<HTMLDetailsElement>('#cad-cost-card details').forEach(d => { d.open = true; }); });
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE);
  const v = await page.evaluate(() => (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }> } })
    .axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  return v.violations.map(x => `${x.id} ×${x.nodes.length}`);
}

async function runPart(page: Page, base: string, p: PartSpec): Promise<Record<string, unknown>> {
  const rec: Record<string, unknown> = { label: p.label, file: p.file };
  await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });
  await page.click('#new-costing-btn', { timeout: 15_000 });
  await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="cad_analysis"]:visible').first().click({ timeout: 15_000 });
  await page.fill('#cad-programme-years', String(p.programmeYears ?? 5));
  await page.setInputFiles('#cad-file-input', p.file);
  await page.waitForTimeout(1500);
  await page.click('#calc-btn');
  const hero = await answerAndCost(page, p.answers, p.label);
  rec.headline = hero;
  check(p.label, 'costed', /\d/.test(hero), hero);
  await page.screenshot({ path: join(OUT, `${p.label}-cost.png`) });

  // The finish on the form: route as answered, load sized from the part.
  const finish = p.answers['service.finish'];
  if (finish && finish !== 'none') {
    const f = await page.evaluate(() => {
      const r = Array.from(document.querySelectorAll<HTMLSelectElement>('[id$="-sf-route"]')).find(e => e.value);
      const pre = r?.id.replace(/-sf-route$/, '');
      const v = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
      return r ? { route: r.value, rack: v(`${pre}-sf-rack`), racks: v(`${pre}-sf-racks`), area: v(`${pre}-sf-area`) } : null;
    });
    rec.finish = f;
    check(p.label, 'finish on the form', f?.route === finish, JSON.stringify(f));
    check(p.label, 'finish load sized from the part', !!f && Number(f.rack) !== 6 && Number(f.area) > 0, `rack ${f?.rack} × ${f?.racks}/h, area ${f?.area} m²`);
  }

  // Compare routes: the reference row is the headless chain; it must equal the headline.
  await page.click('#cad-compare > summary');
  await page.waitForSelector('#cad-compare-host table, #cad-compare-host p', { timeout: 120_000 });
  await page.waitForSelector('#cad-compare-host table', { timeout: 120_000 }).catch(() => null);
  const rows = await page.$$eval('#cad-compare-host tbody tr', trs => trs.map(tr => ({
    route: (tr.querySelector('th')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    cost: (tr.querySelectorAll('td')[0]?.textContent ?? '').trim(),
    ref: tr.classList.contains('cad-compare-ref'),
    why: (tr.querySelector('td:last-child')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    action: (tr.querySelector('[data-cost-route]') as HTMLElement | null)?.dataset.costRoute ?? null,
  })));
  rec.compare = rows;
  const ref = rows.find(r => r.ref);
  check(p.label, 'compare: reference row = headline (screen = headless)',
    !!ref && money(ref.cost) === money(hero) && !/typed change/.test(ref.why), `row ${ref?.cost ?? '—'} v headline ${money(hero)}`);
  const violations = await axeCostCard(page);
  check(p.label, 'axe on the cost card', violations.length === 0, violations.join(', ') || '0 violations');
  rec.exports = await checkExports(page, p.label, hero);

  // Cost this route: re-costed on the chosen route, it must equal that route's row.
  if (p.costRoute) {
    const row = rows.find(r => r.action === p.costRoute);
    if (!row) { check(p.label, `cost this route: ${p.costRoute}`, false, 'no costed row for that route'); return rec; }
    await page.click(`#cad-compare-host [data-cost-route="${p.costRoute}"]`);
    await page.waitForFunction(() => !document.getElementById('cad-cost-card') || !!document.getElementById('cad-steps'), null, { timeout: 60_000 });
    const notice = await page.waitForFunction(() => (document.getElementById('cad-flow-notice')?.textContent ?? '').trim() || null, null, { timeout: 120_000 })
      .then(h => h.jsonValue() as Promise<string>).catch(() => '');
    check(p.label, `cost this route: ${p.costRoute} opens its questions`, /Costing as/i.test(notice) || /question/i.test(notice), notice);
    const hero2 = await answerAndCost(page, { ...p.answers, 'commodity.route': p.costRoute, ...(p.costRouteAnswers ?? {}) }, `${p.label}→${p.costRoute}`);
    rec.costRoute = { route: p.costRoute, row: row.cost, headline: hero2 };
    check(p.label, `cost this route: ${p.costRoute} = its row`, money(hero2) === money(row.cost), `${money(hero2)} v row ${row.cost}`);
    await page.screenshot({ path: join(OUT, `${p.label}-${p.costRoute}.png`) });
  }
  return rec;
}

async function main(): Promise<void> {
  if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('no dist/ — run npm run build first');
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-cad2cost-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout?.on('data', d => { serverLog = (serverLog + d.toString()).slice(-200_000); });
  server.stderr?.on('data', d => { serverLog = (serverLog + d.toString()).slice(-200_000); });
  let browser;
  const results: Array<Record<string, unknown>> = [];
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '6h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    for (const p of PARTS) {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', e => pageErrors.push(e.message));
      page.on('dialog', d => { pageErrors.push(`dialog: ${d.message()}`); void d.dismiss(); });
      await page.addInitScript('window.__name = (f) => f;');
      await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
      const t0 = Date.now();
      let rec: Record<string, unknown>;
      try { rec = await runPart(page, base, p); }
      catch (e) {
        rec = { label: p.label, error: (e as Error).message.split('\n')[0] };
        check(p.label, 'ran to the end', false, String(rec.error));
        try { await page.screenshot({ path: join(OUT, `${p.label}-error.png`) }); } catch { /* closed */ }
      }
      rec.seconds = Math.round((Date.now() - t0) / 1000);
      rec.pageErrors = pageErrors;
      check(p.label, 'no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'none');
      results.push(rec);
      await context.close();
    }
  } finally {
    writeFileSync(join(OUT, 'results.json'), JSON.stringify({ checks, results }, null, 1));
    writeFileSync(join(OUT, 'server.log'), serverLog);
    try { await browser?.close(); } catch { /* closed */ }
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
  const failed = checks.filter(c => !c.ok);
  log(`${checks.length - failed.length} / ${checks.length} checks passed — ${OUT}/results.json`);
  if (failed.length) process.exit(1);
}

main().catch(e => { log(`ERROR ${(e as Error).message}`); process.exit(1); });
