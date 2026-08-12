/**
 * Arm A of the CAD-to-Cost audit: drive the REAL product, not a reimplementation.
 *
 * The browser path (applyCADToForm → DOM form → collect<X>Input → engine) has
 * guards the headless mapper does not, so auditing only the API would audit the
 * wrong thing. This script runs the actual UI in Chromium: upload the STEP,
 * region China, volume 200k, "Analyze & Calculate", then export BOTH PDFs via
 * the app's own buttons and capture the engine result from the page.
 *
 *   npx tsx scripts/cad-audit-browser.ts <part.step> <outdir> \
 *        [--commodity casting] [--mode both] [--label name]
 *
 * Needs: API on :3002 (with key in .env) and Vite dev on :5174 (proxies /api).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const positional = argv.filter(a => !a.startsWith('--'));
const [file, outdir] = positional;
const flag = (name: string): string | undefined => {
  const i = argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
};

if (!file || !existsSync(file) || !outdir) {
  console.error('usage: tsx scripts/cad-audit-browser.ts <part.step> <outdir> [--commodity X] [--mode both] [--label name]');
  process.exit(2);
}

const BASE = process.env.CV_UI_BASE ?? 'http://localhost:5174/calculator/';
const commodity = flag('commodity') ?? '';
const mode = flag('mode') ?? 'both';
const label = flag('label') ?? `${basename(file).replace(/\.[^.]+$/, '')}${commodity ? '-' + commodity : '-auto'}`;
const log = (m: string) => process.stderr.write(`[armA:${label}] ${m}\n`);

async function main(): Promise<void> {
  mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--use-gl=swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.addInitScript(() => {
      const payload = btoa(JSON.stringify({ sub: 'audit', exp: Math.floor(Date.now() / 1000) + 86_400 }));
      localStorage.setItem('auth_token', `eyJhbGciOiJIUzI1NiJ9.${payload}.audit`);
      localStorage.setItem('auth_user', JSON.stringify({ name: 'Audit' }));
      localStorage.setItem('cv-tour-v41-seen', '1');
      localStorage.setItem('cv-wizard-off', '1');
    });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    log('app loaded');

    // Region: China, BEFORE any costing so the regional library is active.
    await page.waitForSelector('#mfg-region-selector', { timeout: 20_000 });
    await page.selectOption('#mfg-region-selector', { label: 'China' });
    log('region = China');

    // Into the CAD panel.
    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.click('.cpicker-tile[data-commodity="cad_analysis"]', { timeout: 15_000 });
    await page.waitForSelector('#cad-file-input', { state: 'attached', timeout: 15_000 });
    log('CAD panel open');

    await page.setInputFiles('#cad-file-input', resolve(file));
    await page.fill('#cad-annual-volume', '200000');
    await page.selectOption('#cad-analysis-mode', mode);
    if (commodity) await page.selectOption('#cad-commodity-override', commodity);
    log(`file set, vol=200000, mode=${mode}, commodity=${commodity || 'auto'}`);

    // Blocking-sanity acknowledgements arrive as window.confirm — accept and
    // record, so the trail shows an acknowledgement was demanded.
    const dialogs: string[] = [];
    page.on('dialog', d => { dialogs.push(d.message().slice(0, 160)); void d.accept(); });

    const answers = new Map<string, string>();
    argv.forEach((a, i) => {
      if (!a.startsWith('--answer')) return;
      const kv = a.includes('=') && !a.startsWith('--answer=') ? a.slice(a.indexOf('=') + 1) : argv[i + 1];
      const eq = kv?.indexOf('=') ?? -1;
      if (kv && eq > 0) answers.set(kv.slice(0, eq), kv.slice(eq + 1));
    });
    const answered: Array<{ id: string; value: string; how: string }> = [];

    // Analyze FIRST (not Analyze & Calculate): the post-fix engine raises a
    // blocking material-confirm decision, and "& Calculate" would switch to the
    // costing form and sweep the decision panel off-screen before it can be
    // answered. Analyze-only keeps the panel on the CAD view — the exact flow
    // the gate's banner tells the engineer to follow.
    await page.click('#cad-analyze-btn', { timeout: 15_000 });
    await page.waitForSelector('#cad-results .panel-title, #cad-decisions-panel, #cad-apply-calc-btn',
      { state: 'attached', timeout: 200_000 });
    log('analysed');

    const panel = page.locator('#cad-decisions-panel');
    if (await panel.count() > 0) {
      for (const block of await page.locator('.cad-decision').all()) {
        const id = await block.getAttribute('data-decision-id') ?? '';
        const wanted = answers.get(id);
        if (wanted) {
          await block.locator(`input[type=radio][value="${wanted}"]`).check();
          answered.push({ id, value: wanted, how: 'engineer answer (flag)' });
        } else {
          const leaning = block.locator('label:has-text("(likely)") input[type=radio]');
          if (await leaning.count() > 0) {
            await leaning.first().check();
            answered.push({ id, value: await leaning.first().getAttribute('value') ?? '', how: 'confirmed the leaning' });
          }
        }
      }
      if (answered.length) {
        log(`answering ${answered.length} blocking decision(s): ${answered.map(a => `${a.id}=${a.value}`).join(', ')}`);
        // Wait for the re-analysis network round-trip to COMPLETE before costing
        // — clicking Apply&Calc while /reanalyze is still in flight costs the
        // stale first analysis (which still carries the AI's material).
        const reanalyzed = page.waitForResponse(
          resp => resp.url().includes('/api/cad/reanalyze') && resp.status() === 200,
          { timeout: 180_000 });
        await page.click('#cad-decisions-apply');
        await reanalyzed;
        await page.waitForTimeout(1500);   // let the re-render settle
        log('re-analysed with the answer folded in');
      }
    }

    // Apply the analysed inputs to the form AND calculate — the engineer's
    // "Apply & Calculate" after reviewing.
    await page.locator('#cad-apply-calc-btn').first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.click('#cad-apply-calc-btn');

    // Big parts measure for minutes; the UI's own analysis timeout is 150 s.
    await page.waitForSelector('#results-tabs', { state: 'visible', timeout: 200_000 });
    log('calculated — results rendered'
      + (dialogs.length ? ` (acknowledged ${dialogs.length} blocking sanity dialog(s))` : ''));

    // Capture what the product actually computed, from the page itself.
    // String-form evaluate: tsx's esbuild transform injects a __name helper
    // into function arguments that does not exist in the page, so a function
    // reference here throws ReferenceError. A string is passed through verbatim.
    const state = await page.evaluate(`(() => {
      const el = (id) => { const n = document.getElementById(id); return n ? n.value : null; };
      const form = {};
      document.querySelectorAll('#costing-view input[id], #costing-view select[id]').forEach((i) => {
        if (i.id && i.value !== undefined && i.offsetParent !== null) form[i.id] = i.value;
      });
      const grab = (sel) => { const n = document.querySelector(sel); return n ? n.textContent : null; };
      return {
        region: el('mfg-region-selector'),
        annualVolume: el('annual-volume'),
        form,
        totalText: grab('.result-total') || grab('#result-total') || grab('.total-cost'),
        breakdownText: grab('#results-tabs') ? (document.querySelector('#breakdown-table') || {}).innerText || null : null,
      };
    })()`);
    writeFileSync(join(outdir, `armA-${label}.json`), JSON.stringify({
      _audit: { part: basename(file), commodity: commodity || null, mode, label,
                capturedAt: new Date().toISOString(), pageErrors,
                decisionsAnswered: answered, sanityDialogs: dialogs },
      state,
    }, null, 2));
    log('page state captured');

    // Export the engine-backed should-cost PDF via the app's own button.
    const dl1 = page.waitForEvent('download', { timeout: 60_000 });
    await page.click('#export-pdf-btn');
    const d1 = await dl1;
    await d1.saveAs(join(outdir, `armA-${label}-shouldcost.pdf`));
    log('should-cost PDF exported');

    // Export the CAD analysis PDF (the AI-report one) if its button is present.
    // The download promise is only created once the button is known to exist —
    // an orphaned waitForEvent survives browser.close() and kills the process.
    // Auto-calculate navigates to the costing form; the CAD analysis report
    // button stays in the CAD panel, so go back there first.
    await page.click('#new-costing-btn');
    await page.click('.cpicker-tile[data-commodity="cad_analysis"]');
    await page.waitForTimeout(500);
    const cadBtn = page.locator('#cad-export-pdf-btn');
    if (await cadBtn.count() > 0 && await cadBtn.isVisible()) {
      const dl2 = page.waitForEvent('download', { timeout: 30_000 });
      await cadBtn.click();
      const d2 = await dl2;
      await d2.saveAs(join(outdir, `armA-${label}-cadanalysis.pdf`));
      log('CAD analysis PDF exported');
    } else {
      log('CAD analysis PDF button not present/visible — skipped');
    }

    if (pageErrors.length) log(`PAGE ERRORS: ${pageErrors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

main().then(() => { log('done'); process.exit(0); })
  .catch(e => { log(`FAILED: ${e.message}`); process.exit(1); });
