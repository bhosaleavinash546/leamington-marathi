/**
 * 360 software report, live (real server + browser; plan docs/plans/sw-report-360-plan-2026-10-14.md §7.4):
 *   1. Range Rover L460 PHEV, 200,000 / yr × 6 yr: every report type (vehicle, executive, domain, module, supplier, hubs)
 *      exported as PDF and Excel through the Report tab's options, with typed metadata;
 *   2. Porsche Cayenne Electric (BEV) in EUR, vehicle report;
 *   3. Porsche Cayenne V8 (ICE), saloon body, vehicle report;
 *   4. a user programme: the L460 with supplier quotes and a module of its own, vehicle report;
 *   5. axe (WCAG 2.1 AA) on the Report tab with the options open.
 * Each PDF's text must carry the rail's own total; each workbook is recalculated in LibreOffice (0 errors, all ✓) by
 * scripts/sw-report/xlsx-recalc-check.py when `soffice` is installed. Writes <CV_OUT>/sw-report-live.json (PASS / FAIL).
 *   npm run build && PLAYWRIGHT_CHROMIUM_PATH=… CV_OUT=<dir> npx tsx e2e/sw-report-live.ts
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { chromium, type Page } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const OUT = process.env.CV_OUT ?? tmpdir();
const req = createRequire(import.meta.url);
const AXE = readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const soffice = (() => { try { execFileSync('which', ['soffice'], { stdio: 'pipe' }); return true; } catch { return false; } })();
const pdfText = (f: string) => execFileSync('python3', ['-I', '-c', 'import sys,pymupdf; d=pymupdf.open(sys.argv[1]); print(len(d)); print("\\n".join(p.get_text() for p in d))', f], { maxBuffer: 64 << 20 }).toString();

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-swr-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const out: Record<string, unknown> = { checks: {}, files: [] as string[] };
  const check = (name: string, ok: boolean, detail: unknown = '') => { (out.checks as Record<string, unknown>)[name] = ok ? 'PASS' : { FAIL: detail }; };
  let browser;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const page: Page = await (await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, viewport: { width: 1440, height: 1000 } })).newPage();
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
    const settle = () => page.waitForTimeout(800);
    const fill = async (sel: string, v: string) => { await show(sel); await page.fill(sel, v); await page.dispatchEvent(sel, 'change'); };
    const demo = async (id: string) => { await show(`.sw-vehicle-btn[data-vehicle="${id}"]`);
      await page.evaluate(i => { const b = document.querySelector(`.sw-vehicle-btn[data-vehicle="${i}"]`); const d = b?.closest('details'); if (d) (d as HTMLDetailsElement).open = true; }, id);
      await page.click(`.sw-vehicle-btn[data-vehicle="${id}"]`); await settle();
      await fill('#sw-vol', '200000'); await fill('#sw-prog-life', '6'); await show('#sw-calc-btn'); await page.click('#sw-calc-btn'); await settle(); };
    const options = async (o: { profile: string; body?: string; domains?: string[]; modules?: string[] }) => {
      await show('#sw-rep-profile');
      await page.selectOption('#sw-rep-profile', o.profile);
      await page.selectOption('#sw-rep-body', o.body ?? 'suv');
      if (o.domains) for (const d of o.domains) await page.check(`#sw-rep-domain-list input[value="${d}"]`);
      if (o.modules) await page.selectOption('#sw-rep-modules', o.modules);
    };
    const exportBoth = async (slug: string, railTotal: string) => {
      const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click('#sw-pdf-btn')]);
      const pdfPath = join(OUT, `${slug}.pdf`); await pdf.saveAs(pdfPath);
      const [xl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click('#sw-excel-btn')]);
      const xlPath = join(OUT, `${slug}.xlsx`); await xl.saveAs(xlPath);
      (out.files as string[]).push(pdfPath, xlPath);
      const txt = pdfText(pdfPath), pages = Number(txt.split('\n')[0]);
      check(`${slug}: PDF has pages and no garbage`, pages > 4 && !/undefined|NaN|\[object|Tier1_Supplier|OEM_Internal/.test(txt), { pages, bad: txt.match(/undefined|NaN|\[object|Tier1_Supplier|OEM_Internal/)?.[0] });
      if (railTotal) check(`${slug}: PDF carries the screen's total ${railTotal}`, txt.includes(railTotal), railTotal);
      check(`${slug}: PDF carries the typed metadata`, txt.includes('E2E Review Board') && txt.includes('SW-E2E-001'), '');
      if (soffice) {
        try { const r = execFileSync('python3', ['-I', 'scripts/sw-report/xlsx-recalc-check.py', xlPath, join(dir, `lo-${slug}`)], { timeout: 300_000 }).toString().trim(); check(`${slug}: workbook recalculates clean`, true); (out as Record<string, unknown>)[`recalc-${slug}`] = r; }
        catch (e) { check(`${slug}: workbook recalculates clean`, false, String((e as { stdout?: Buffer }).stdout ?? e).slice(0, 600)); }
      }
      return { pages };
    };

    // Metadata the user types (printed as typed).
    await demo('rr_l460');
    await show('#sw-rep-by'); await page.fill('#sw-rep-by', 'E2E Review Board'); await page.fill('#sw-rep-for', 'Programme director');
    await page.fill('#sw-rep-ref', 'SW-E2E-001'); await page.fill('#sw-rep-conf', 'Confidential');
    const rr = await total();
    out.l460Total = rr;
    // 1. Every report type for the L460.
    const pages: Record<string, number> = {};
    pages.vehicle = (await (async () => { await options({ profile: 'vehicle' }); return exportBoth('l460-vehicle', rr); })()).pages;
    for (const [p, o] of [['executive', {}], ['domain', { domains: ['B', 'C'] }], ['module', { modules: ['bms_core', 'navigation'] }], ['supplier', {}], ['hubs', {}]] as Array<[string, Record<string, string[]>]>) {
      await options({ profile: p, ...o });
      pages[p] = (await exportBoth(`l460-${p}`, p === 'domain' || p === 'module' ? '' : rr)).pages;
    }
    out.pages = pages;
    check('executive is the short form', pages.executive < pages.vehicle / 4, pages);
    // A domain report without a domain is refused, not exported.
    await options({ profile: 'domain' });
    await page.evaluate(() => document.querySelectorAll<HTMLInputElement>('#sw-rep-domain-list input').forEach(i => { i.checked = false; }));
    await page.click('#sw-pdf-btn'); await page.waitForTimeout(600);
    check('a domain report with no domain is refused', /Tick at least one domain/.test(await page.evaluate(() => document.getElementById('sw-panel')?.textContent ?? '')), '');

    // 2. BEV in EUR.
    await page.selectOption('#currency-selector', 'EUR'); await page.waitForTimeout(600);
    await demo('porsche_cayenne');
    await options({ profile: 'vehicle' });
    const bev = await total(); out.bevTotal = bev;
    await exportBoth('cayenne-bev-vehicle-eur', bev);
    await page.selectOption('#currency-selector', 'GBP'); await page.waitForTimeout(600);

    // 3. ICE, saloon body.
    await demo('porsche_cayenne_ice');
    await options({ profile: 'vehicle', body: 'saloon' });
    const ice = await total(); out.iceTotal = ice;
    await exportBoth('cayenne-ice-vehicle-saloon', ice);

    // 4. A user programme: quotes + a module of its own.
    await demo('rr_l460');
    await fill('#swq-cloud-v', '6'); await fill('#swq-cloud-s', 'AWS proposal 2026-09, ref A12');
    await fill('#swq-tcu_software\\~built-v', '10'); await fill('#swq-tcu_software\\~built-s', 'TCU supplier quote Q3 2026'); await settle();
    await show('#swc-new-name'); await page.fill('#swc-new-name', 'Occupant restraint (airbag) control');
    await page.selectOption('#swc-new-cat', 'D'); await page.click('#swc-add'); await settle();
    await page.fill('#swc-0-pm', '120'); await page.dispatchEvent('#swc-0-pm', 'change');
    await page.fill('#swc-0-src', 'Our 2024 restraint ECU programme, 120 PM booked'); await page.dispatchEvent('#swc-0-src', 'change'); await settle();
    await options({ profile: 'vehicle' });
    const user = await total(); out.userTotal = user;
    await exportBoth('l460-user-quotes-own-module', user);
    const ut = pdfText(join(OUT, 'l460-user-quotes-own-module.pdf'));
    check('user report: your module appears with its source', ut.includes('Occupant restraint (airbag) control') && ut.includes('Our 2024 restraint ECU programme'), '');
    check('user report: your module\'s unchosen ASIL is flagged, its effort labelled yours', ut.includes('not set for your module') && ut.includes('your figure — Our 2024 restraint ECU programme'), '');
    check('user report: the quotes appear with their sources', ut.includes('AWS proposal 2026-09') && ut.includes('TCU supplier quote Q3 2026'), '');

    // 5. axe on the Report tab with the options open.
    await options({ profile: 'domain' });
    await page.addScriptTag({ content: AXE });
    out.axe = await page.evaluate(async () => {
      const r = await (window as unknown as { axe: { run: (n: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }> } }).axe.run(document.getElementById('sw-export-card'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.map(v => `${v.id} (${v.nodes.length})`);
    });
    check('axe: Report options clean', (out.axe as string[]).length === 0, out.axe);
    await page.locator('#sw-export-card').screenshot({ path: join(OUT, 'report-options.png') });
    out.pageErrors = errors;
    check('no page errors', errors.length === 0, errors);
  } finally {
    writeFileSync(join(OUT, 'sw-report-live.json'), JSON.stringify(out, null, 1));
    console.log(JSON.stringify({ ...out, files: (out.files as string[]).length }, null, 1));
    await browser?.close();
    try { process.kill(-server.pid!); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exit(1); });
