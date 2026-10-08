/**
 * Design to Cost, live: a real STEP through a real server and browser, the background geometric-DFM job landing,
 * then the Design-to-Cost tab driven the way an engineer would — target set, a design lever switched on, a what-if
 * slider moved — with every figure checked against the screen's own headline.
 *
 *   npm run build && npx tsx e2e/dtc-live.ts            # default: the hydraulic manifold (machining)
 *   CV_LIVE_PART=../cad-audit/parts/IM_ECU_Cover.stp CV_LIVE_ANSWERS='{"commodity.route":"injection_moulding"}' npx tsx e2e/dtc-live.ts
 *
 * Writes dtc-live.json and dtc-live.png to CV_LIVE_OUT (default: the OS temp dir). Needs OCP for the STEP.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const PART = resolve(process.env.CV_LIVE_PART ?? '../cad-audit/parts/MACH_Hydraulic_Manifold.stp');
const OUT = process.env.CV_LIVE_OUT ?? tmpdir();
const ANSWERS: Record<string, string> = JSON.parse(process.env.CV_LIVE_ANSWERS ?? '{"commodity.route":"machining","material.family":"aluminium"}');
const TARGET_SHARE = Number(process.env.CV_LIVE_TARGET_SHARE ?? 0.85);
const log = (m: string) => process.stdout.write(`[dtc] ${m}\n`);
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
/** "£1,234.56" / "−£0.0031" → number (display currency; the run stays in GBP). */
const money = (t: string | null | undefined) => {
  const m = (t ?? '').replace(/,/g, '').match(/(−|-)?[^\d−-]*(\d+(?:\.\d+)?)/);
  return m ? (m[1] ? -1 : 1) * Number(m[2]) : NaN;
};

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-dtc-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout?.on('data', d => { serverLog += d.toString(); });
  server.stderr?.on('data', d => { serverLog += d.toString(); });
  const out: Record<string, unknown> = { part: PART, answers: ANSWERS };
  const failures: string[] = [];
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });

    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => { pageErrors.push(`dialog: ${d.message()}`); void d.dismiss(); });
    await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
    await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });

    // 1. Upload, answer, apply, calculate.
    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="cad_analysis"]:visible').first().click({ timeout: 15_000 });
    await page.setInputFiles('#cad-file-input', PART);
    await page.click('#cad-analyze-btn');
    for (let round = 0; round < 6; round++) {
      await page.waitForSelector('#cad-results #cad-apply-btn, #cad-results .cad-decision', { timeout: 300_000 });
      await page.waitForTimeout(400);
      const open = await page.$$eval('#cad-decisions-panel .cad-decision', ds => ds.map(d => ({ id: (d as HTMLElement).dataset.decisionId!,
        options: Array.from(d.querySelectorAll('input[type=radio]')).map(r => (r as HTMLInputElement).value) })));
      const toAnswer = open.filter(o => o.id in ANSWERS);
      log(`round ${round}: ${open.map(o => o.id).join(', ') || '(none)'}`);
      if (!toAnswer.length) break;
      for (const o of toAnswer) {
        const sel = `.cad-decision[data-decision-id="${o.id}"]`;
        if (o.options.length === 0) await page.fill(`${sel} input[data-decision-entry]`, ANSWERS[o.id]);
        else await page.check(`${sel} input[type=radio][value="${ANSWERS[o.id]}"]`);
      }
      const before = await page.evaluate(() => document.getElementById('cad-results')!.innerHTML.length);
      await page.click('#cad-decisions-apply');
      await page.waitForFunction(b => document.getElementById('cad-results')!.innerHTML.length !== b, before, { timeout: 300_000 });
    }
    const filledBefore = await page.evaluate(() => document.documentElement.dataset.cadFilled ?? '');
    await page.click('#cad-apply-btn');
    await page.waitForFunction(b => (document.documentElement.dataset.cadFilled ?? '') !== b, filledBefore, { timeout: 120_000 });
    await page.waitForTimeout(500);
    await page.click('#calc-btn');
    await page.waitForFunction(() => /\d/.test(document.querySelector('#cv-result-hero .crh-total')?.textContent ?? ''), null, { timeout: 60_000 });
    await page.waitForTimeout(4000);   // past the headline's count-up
    const headline = money(await page.evaluate(() => document.querySelector('#cv-result-hero .crh-total')?.textContent ?? ''));
    if (!Number.isFinite(headline) || headline <= 0) throw new Error(`no headline after Calculate (${headline})`);
    out.headline = headline;
    log(`costed: headline ${headline}`);

    // 2. The background DFM job (kernel with CV_EXTRACT_FEATURES=1) lands in the findings panel.
    await page.waitForSelector('#geometric-dfm-panel .dfm-geo-item', { state: 'attached', timeout: 600_000 });
    out.dfmFindings = await page.$$eval('#geometric-dfm-panel .dfm-geo-item', ns => ns.map(n => (n.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)));
    log(`DFM landed: ${(out.dfmFindings as string[]).length} finding group(s)`);

    // 2b. The 3D viewer's inspector prints the SAME £ as the findings panel — the costing's re-costed figure, not the
    // DFM job's reference-rate line (stub axle deep holes once read £2.85 in the viewer, £2.38 in the costing).
    await page.waitForTimeout(500);
    const panelMoney = await page.$$eval('#geometric-dfm-panel .dfm-geo-item', ns => ns.map(n => ({
      title: (n.querySelector('strong')?.textContent ?? '').trim(), amount: (n.querySelector('.dfm-geo-cost')?.textContent ?? '').trim() })));
    const insp = page.locator('.cv3d [data-act="inspector"]:visible').first();
    if (await insp.count()) {
      if (!(await page.locator('.cv3d-insp-body .cv3d-issue').count())) await insp.click();
      await page.waitForSelector('.cv3d-insp-body .cv3d-issue', { timeout: 15_000 });
      const viewerMoney = await page.$$eval('.cv3d-insp-body .cv3d-issue', ns => ns.map(n => ({
        title: (n.querySelector('.cv3d-row-title')?.textContent ?? '').replace(/\s+/g, ' ').trim(), amount: (n.querySelector('.cv3d-row-val')?.textContent ?? '').trim() })));
      out.viewerMoney = viewerMoney; out.panelMoney = panelMoney;
      const pricedPanel = panelMoney.filter(p => p.amount);
      const pricedViewer = viewerMoney.filter(v => v.amount);
      if (pricedPanel.length !== pricedViewer.length) failures.push(`viewer shows ${pricedViewer.length} priced finding(s), panel ${pricedPanel.length}`);
      for (const p of pricedPanel) {
        if (!pricedViewer.some(v => v.amount === p.amount)) failures.push(`panel ${p.title} ${p.amount} not in the viewer (${pricedViewer.map(v => v.amount).join(', ')})`);
        if (/reference rate/.test(p.amount)) failures.push(`${p.title} still at reference rate with a costing on screen`);
      }
      log(`viewer £ = panel £: ${pricedPanel.map(p => p.amount).join(', ') || '(none priced)'}`);
    } else {
      failures.push('no 3D viewer on the CAD-to-Cost screen to compare against');
    }

    // 3. Target, then the Design-to-Cost tab.
    const target = Math.round(headline * TARGET_SHARE * 100) / 100;
    await page.fill('#target-price', String(target));
    await page.click('.rtab[data-panel="dtc"]');
    await page.waitForSelector('#results-dtc [data-dtc-root]', { timeout: 30_000 });
    const read = () => page.evaluate(() => {
      const root = document.querySelector('#results-dtc [data-dtc-root]')!;
      const kpis = Array.from(root.querySelectorAll('.dtc-kpi')).map(k => ({ label: k.querySelector('span')?.textContent, value: k.querySelector('strong')?.textContent, note: k.querySelector('em')?.textContent }));
      const tables = Array.from(root.querySelectorAll('table.dtc-table')).map(t => Array.from(t.querySelectorAll('tbody tr')).map(r => Array.from(r.querySelectorAll('td')).map(td => (td.textContent ?? '').replace(/\s+/g, ' ').trim())));
      return { kpis, tables, empty: Array.from(root.querySelectorAll('.dtc-empty')).map(e => e.textContent), applied: Array.from(root.querySelectorAll('.dtc-applied li')).map(l => l.textContent) };
    });
    const first = await read();
    out.dtcInitial = first;
    const shouldCost = money(first.kpis.find(k => k.label === 'Should-cost')?.value);
    if (Math.abs(shouldCost - headline) > 0.011) failures.push(`DtC should-cost ${shouldCost} ≠ headline ${headline}`);
    if (!first.kpis.some(k => k.label === 'Gap')) failures.push('no gap shown with a target set');
    // drivers add up to the piece price
    const driverRows = first.tables[first.tables.length - 1] ?? [];
    const driverSum = driverRows.reduce((a, r) => a + money(r[1]), 0);
    out.driverSum = driverSum;
    if (Math.abs(driverSum - headline) > Math.max(0.02, driverRows.length * 0.006)) failures.push(`drivers sum ${driverSum.toFixed(2)} ≠ headline ${headline}`);

    // 4. Switch the biggest design lever on → projected falls by exactly its saving.
    const lever = page.locator('#results-dtc input[data-dtc-lever]').first();
    if (await lever.count()) {
      const saveText = await page.locator('#results-dtc table.dtc-table').first().locator('tbody tr').first().locator('td.num').textContent();
      await lever.check();
      await page.waitForTimeout(200);
      const proj = money(await page.locator('#results-dtc [data-dtc-projected]').textContent());
      out.leverOn = { saving: saveText, projected: proj };
      if (Math.abs((shouldCost - proj) - Math.abs(money(saveText))) > 0.011) failures.push(`lever saving ${saveText} but projected moved ${(shouldCost - proj).toFixed(4)}`);
      log(`lever on: saves ${saveText}, projected ${proj}`);
    } else {
      out.leverOn = 'no priced design lever on this part';
      log('no priced design lever on this part');
    }

    // 5. A what-if slider moves the projection live.
    const slider = page.locator('#results-dtc input[type=range]').first();
    if (await slider.count()) {
      const before = money(await page.locator('#results-dtc [data-dtc-projected]').textContent());
      await slider.evaluate((el: HTMLInputElement) => { el.value = String(Number(el.min) / 2); el.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForTimeout(200);
      const after = money(await page.locator('#results-dtc [data-dtc-projected]').textContent());
      out.slider = { id: await slider.getAttribute('id'), before, after };
      if (!(after < before)) failures.push(`slider ${await slider.getAttribute('id')} to its min/2 did not lower the projection (${before} → ${after})`);
      log(`slider ${await slider.getAttribute('id')}: ${before} → ${after}`);
    }
    out.dtcAfter = await read();
    // The results pane scrolls on its own (two-pane layout): a tall viewport shows the whole tab in one shot.
    await page.setViewportSize({ width: 1440, height: 3200 });
    await page.waitForTimeout(400);
    await page.locator('#results-dtc').screenshot({ path: join(OUT, 'dtc-live.png') });

    // 6. Accessibility of the tab (axe, WCAG 2.1 AA), scoped to it.
    const axeSrc = readFileSync(resolve('node_modules/axe-core/axe.min.js'), 'utf8');
    await page.addScriptTag({ content: axeSrc });
    const axe = await page.evaluate(async () => {
      const r = await (window as unknown as { axe: { run: (ctx: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }> } })
        .axe.run({ include: [['#results-dtc']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.map(v => ({ id: v.id, n: v.nodes.length }));
    });
    out.axe = axe;
    if (axe.length) failures.push(`axe: ${axe.map(v => `${v.id}×${v.n}`).join(', ')}`);
    out.pageErrors = pageErrors;
    if (pageErrors.length) failures.push(`page errors: ${pageErrors.join(' | ')}`);
  } finally {
    out.failures = failures;
    writeFileSync(join(OUT, 'dtc-live.json'), JSON.stringify(out, null, 2));
    try { await browser?.close(); } catch { /* closed */ }
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
  if (failures.length) {
    log(`FAIL\n  ${failures.join('\n  ')}\n--- server log tail ---\n${serverLog.slice(-1500)}`);
    process.exit(1);
  }
  log(`PASS — ${join(OUT, 'dtc-live.json')}`);
}

main().catch(e => { log(`ERROR ${(e as Error).message}`); process.exit(1); });
