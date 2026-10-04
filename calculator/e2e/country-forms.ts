/**
 * Every commodity FORM, costed on its defaults in each country — the manual path, no CAD.
 * Captures, per commodity and country: every form input (id, label, value), the headline,
 * and the tool's own Excel export (operations and the full rate trace). A comparison across
 * countries then shows which inputs and which charged rates followed the country.
 *
 *   CV_FORMS_REGIONS=UK,IN CV_LIVE_OUT=/dir npx tsx e2e/country-forms.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';

const ROOT = resolve('.');
const REGIONS = (process.env.CV_FORMS_REGIONS ?? 'UK,IN').split(',');
const ONLY = process.env.CV_FORMS_ONLY?.split(',');
const OUT = process.env.CV_LIVE_OUT ?? tmpdir();
const log = (m: string) => process.stdout.write(`[forms] ${m}\n`);
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const sheet = (wb: XLSX.WorkBook, name: string) => wb.Sheets[name] ? XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true }) : [];

async function main(): Promise<void> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-forms-'));
  const secret = 'forms-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  let browser;
  const out: Record<string, Record<string, unknown>> = {};
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    for (const region of REGIONS) {
      out[region] = {};
      // A fresh context per country: nothing typed or remembered carries over.
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 }, acceptDownloads: true });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', d => { errors.push(`dialog: ${d.message()}`); void d.dismiss(); });
      await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
      await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
      await page.selectOption('#mfg-region-selector', region);
      await page.waitForTimeout(500);
      await page.click('#new-costing-btn');
      const commodities = (await page.$$eval('#commodity-picker-view .cpicker-tile[data-commodity]:not(.cpicker-tile--ai)',
        ts => [...new Set(ts.map(t => (t as HTMLElement).dataset.commodity!))]))
        .filter(c => !['cad_analysis', 'ai_agent', 'automotive_software'].includes(c) && (!ONLY || ONLY.includes(c)));
      await page.keyboard.press('Escape');
      for (const c of commodities) {
        const rec: Record<string, unknown> = {};
        try {
          await page.click('#new-costing-btn', { timeout: 15_000 });
          await page.locator(`#commodity-picker-view .cpicker-tile[data-commodity="${c}"]:visible`).first().click({ timeout: 15_000 });
          await page.waitForTimeout(800);
          rec.inputs = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('#commodity-form-area input[id], #commodity-form-area select[id]'))
            .filter(e => (e as HTMLInputElement).type !== 'file' && (e as HTMLInputElement).type !== 'checkbox')
            .map(e => ({ id: e.id, value: e.value,
              label: ((e.closest('.field-group')?.querySelector('label')?.textContent) ?? e.getAttribute('aria-label') ?? '').replace(/\s+/g, ' ').trim() })));
          await page.click('#calc-btn');
          await page.waitForTimeout(3500);
          rec.headline = await page.evaluate(() => (document.querySelector('#cv-result-hero .crh-total')?.textContent ?? '').trim());
          const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('#export-excel-btn')]);
          const p = join(OUT, `forms-${region}-${c}.xlsx`);
          await dl.saveAs(p);
          const wb = XLSX.read(readFileSync(p));
          rec.operations = sheet(wb, '3-Operations');
          rec.trace = sheet(wb, '6-Traceability');
          rec.summary = sheet(wb, '1-Summary');
        } catch (e) { rec.error = (e as Error).message.split('\n')[0]; }
        out[region][c] = rec;
        log(`${region} ${c}: ${rec.error ?? rec.headline}`);
      }
      out[region]._errors = errors as unknown as Record<string, unknown>;
      await context.close();
    }
    writeFileSync(join(OUT, 'forms.json'), JSON.stringify(out, null, 1));
  } finally {
    try { await browser?.close(); } catch { /* closing */ }
    try { if (server.pid) process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
main();
