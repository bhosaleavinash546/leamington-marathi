/**
 * 3D viewer screenshots — the standalone viewer with a real STEP, in both themes, through a real
 * server (needs OCP for STEP tessellation, and a build: `npm run build` first).
 *
 *   npx tsx e2e/viewer-shots.ts [out-dir] [part.stp]
 *
 * Shoots: empty state, loaded (default view), face-type colouring, wall thickness. Used to prove
 * viewer UI changes before / after (docs/ui/3d-viewer-plan-2026-10.md).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
/** axe WCAG 2.1 AA violations inside the viewer (the rest of the page is ui-audit's job). */
async function axeViewer(page: Page, label: string): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE);
  const v = await page.evaluate(() => (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: string[] }> }> }> } })
    .axe.run({ include: [['.cv3d']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    .then(r => r.violations.map(x => `${x.impact} ${x.id} ×${x.nodes.length} (${x.nodes[0]?.target.join(' ')})`)));
  console.log(`axe ${label}: ${v.length ? v.join(' | ') : '0 violations'}`);
  return v;
}

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'e2e/viewer-shots'));
const PART = resolve(process.argv[3] ?? join(ROOT, '../cad-audit/parts/Casting_Braket.stp'));
const CAD_PART = resolve(process.env.CV_VIEWER_CAD_PART ?? join(ROOT, '../cad-audit/parts/MACH_Hydraulic_Manifold.stp'));

const freePort = () => new Promise<number>((ok) => { const s = createServer(); s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-viewer-'));
  const secret = 'vw-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'Priya Sharma', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.addInitScript(([t, th]) => {
        localStorage.setItem('auth_token', t); localStorage.setItem('sc-theme', th);
        localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1');
      }, [token, theme]);
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.click('#viewer-btn');
      await page.mouse.move(800, 600);
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(OUT, `${theme}-empty.png`) });
      await page.setInputFiles('#viewer-file-input', PART);
      // Loaded = the status bar names the file with its triangle count, or an error shows.
      await page.waitForFunction(() => /triangles|Cannot/i.test(document.querySelector('.cv3d-status-file')?.textContent ?? ''), null, { timeout: 120_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(OUT, `${theme}-loaded.png`) });
      await axeViewer(page, `${theme} loaded`);
      const colour = async (act: string, label: string) => {
        await page.click('#viewer-view [data-menu="color"]');
        await page.waitForTimeout(250);
        if (label === 'colour-menu') { await page.screenshot({ path: join(OUT, `${theme}-${label}.png`) }); await page.keyboard.press('Escape'); return; }
        const btn = page.locator(`#viewer-view [data-act="${act}"]`);
        if (await btn.isEnabled()) { await btn.click(); await page.waitForTimeout(1500); await page.screenshot({ path: join(OUT, `${theme}-${label}.png`) }); }
      };
      await page.click('#viewer-view [data-menu="color"]');
      await axeViewer(page, `${theme} colour menu open`);
      await page.keyboard.press('Escape');
      await colour('', 'colour-menu');
      await colour('facecolors', 'faces');
      await colour('thickness', 'thickness');
      await colour('color-none', 'plain');
      // Select a face near the canvas centre → selection in the inspector.
      const box = await page.locator('#viewer-view .cv3d-canvas').boundingBox();
      if (box) { await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45); await page.waitForTimeout(1200); }
      await page.screenshot({ path: join(OUT, `${theme}-selected.png`) });
      // First manufacturability row → fly to it.
      const issue = page.locator('#viewer-view [data-issue-idx]').first();
      if (await issue.count()) { await issue.click(); await page.waitForTimeout(1200); await page.screenshot({ path: join(OUT, `${theme}-issue.png`) }); }
      // View cube: hover the TOP face, then click it.
      if (box) { await page.mouse.move(box.x + box.width - 12 - 48, box.y + 12 + 30); await page.waitForTimeout(300); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(900); }
      await page.screenshot({ path: join(OUT, `${theme}-cube-top.png`) });
      await page.keyboard.press('?');
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUT, `${theme}-shortcuts.png`) });
      await page.keyboard.press('Escape');
      if (errors.length) console.log(`${theme}: page errors`, errors);
      await page.close();
    }
    // CAD-to-Cost: a machined part costed end to end, then the money on the model in the inline viewer.
    if (process.env.CV_VIEWER_CAD !== '0') {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      page.on('pageerror', e => console.log('cad: page error', String(e)));
      await page.addInitScript(([t]) => {
        localStorage.setItem('auth_token', t); localStorage.setItem('sc-theme', 'light');
        localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1');
      }, [token]);
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.click('#new-costing-btn');
      await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="cad_analysis"]:visible').first().click();
      await page.waitForTimeout(300);
      await page.setInputFiles('#cad-file-input', CAD_PART);
      await page.click('#cad-analyze-btn');
      for (let round = 0; round < 6; round++) {
        await page.waitForSelector('#cad-results #cad-apply-btn, #cad-results .cad-decision', { timeout: 300_000 });
        await page.waitForTimeout(400);
        // Take each open question's pre-selected answer (or its first option) — the tool's own leaning.
        const open = await page.$$eval('#cad-decisions-panel .cad-decision', ds => ds.map(d => ({ id: (d as HTMLElement).dataset.decisionId!,
          checked: !!d.querySelector('input[type=radio]:checked'), first: (d.querySelector('input[type=radio]') as HTMLInputElement | null)?.value ?? null })));
        const todo = open.filter(o => !o.checked && o.first);
        if (!open.length || (await page.$('#cad-results #cad-apply-btn:not([disabled])') && !todo.length)) break;
        for (const o of todo) await page.check(`.cad-decision[data-decision-id="${o.id}"] input[type=radio][value="${o.first}"]`);
        const before = await page.evaluate(() => document.getElementById('cad-results')!.innerHTML.length);
        await page.click('#cad-decisions-apply');
        await page.waitForFunction(b => document.getElementById('cad-results')!.innerHTML.length !== b, before, { timeout: 300_000 });
      }
      await page.screenshot({ path: join(OUT, 'cad-analysed.png') });
      const filledBefore = await page.evaluate(() => document.documentElement.dataset.cadFilled ?? '');
      await page.click('#cad-apply-btn');
      await page.waitForFunction(b => (document.documentElement.dataset.cadFilled ?? '') !== b, filledBefore, { timeout: 120_000 });
      await page.waitForTimeout(500);
      await page.click('#calc-btn');
      await page.waitForTimeout(5000);
      const viewer = page.locator('.cv3d').first();
      await viewer.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(OUT, 'cad-costed.png') });
      await viewer.screenshot({ path: join(OUT, 'cad-viewer-cost.png') });
      const insp = viewer.locator('[data-act="inspector"]');
      if (await insp.isVisible()) {
        await insp.click(); await page.waitForTimeout(600);
        await viewer.screenshot({ path: join(OUT, 'cad-viewer-inspector.png') });
        await axeViewer(page, 'cad inspector open');
        const row = viewer.locator('[data-cost-idx]').first();
        if (await row.count()) { await row.click(); await page.waitForTimeout(1200); await viewer.screenshot({ path: join(OUT, 'cad-viewer-flyto.png') }); }
      }
      console.log('cad: viewers', await page.locator('.cv3d').count(), 'cost rows', await page.locator('[data-cost-idx]').count());
      await page.close();
    }
    console.log(`shots in ${OUT}`);
  } finally {
    await browser?.close();
    try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
