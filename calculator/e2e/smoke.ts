/**
 * Headless smoke-launch — boots the BUILT app in a real browser, drives it into
 * the Automotive SW Should-Cost panel, runs a calculation, and fails on any
 * uncaught page error or missing result.
 *
 * This catches the class of bug unit tests cannot: a runtime error that only
 * surfaces when the panel renders in a live DOM (bad innerHTML, missing element,
 * a crash on load). Run via `npm run test:e2e`; CI runs it on every push.
 *
 * Uses the Playwright library directly (no @playwright/test dependency).
 * Chromium is provided by the environment (PLAYWRIGHT_BROWSERS_PATH).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Browser } from 'playwright';

const PORT = Number(process.env.SMOKE_PORT ?? 4180);
const BASE = `http://localhost:${PORT}/calculator/`;
const IS_CI = !!process.env.CI;

function log(msg: string) { process.stdout.write(`[smoke] ${msg}\n`); }

/**
 * In CI, `npx playwright install chromium` provides the bundled browser, so the
 * default launch (executablePath undefined) is correct. PLAYWRIGHT_CHROMIUM_PATH
 * lets a host point at a specific binary. We do NOT guess /usr/bin/chromium —
 * on some hosts that is a snap stub that fails to launch.
 */
function resolveExecutable(): string | undefined {
  return process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
}

/** Distinguish "no browser available" (skippable off-CI) from a real app failure. */
function isBrowserMissing(msg: string): boolean {
  return /Executable doesn't exist|requires the chromium snap|Target page, context or browser has been closed|Failed to launch|spawn .* ENOENT/i.test(msg);
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Preview server did not start within ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  // 1. Serve the production build via vite preview.
  const server: ChildProcess = spawn(
    'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: 'inherit', env: process.env },
  );
  let browser: Browser | undefined;

  const cleanup = () => { try { browser?.close(); } catch {} try { server.kill('SIGKILL'); } catch {} };

  try {
    await waitForServer(BASE);
    log('preview server up');

    const executablePath = resolveExecutable();
    log(executablePath ? `using browser ${executablePath}` : 'using Playwright bundled browser');
    try {
      browser = await chromium.launch({ executablePath });
    } catch (e) {
      const msg = (e as Error).message;
      if (isBrowserMissing(msg) && !IS_CI) {
        log(`SKIP — no launchable Chromium on this host (${msg.split('\n')[0]}). Runs in CI.`);
        return; // off-CI without a browser: skip, don't fail the dev's build
      }
      throw e; // in CI a missing browser is a real failure (install step is required)
    }
    // Service workers blocked so page.route can intercept API calls (a worker's
    // fetches bypass routing) — step 7 needs that.
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    // Fail the smoke on any uncaught exception in page context — that IS a crash.
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // The app's inline auth guard redirects to /auth.html without a valid token.
    // Seed a structurally-valid, non-expired JWT BEFORE any page script runs so
    // the guard passes and we land on the dashboard. (The guard only checks token
    // shape + exp, not signature; the SW panel is fully client-side.)
    await page.addInitScript(() => {
      const payload = btoa(JSON.stringify({ sub: 'smoke', exp: Math.floor(Date.now() / 1000) + 86_400 }));
      const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.smoke`;
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify({ name: 'Smoke' }));
      // Suppress the first-run product tour, whose overlay intercepts clicks.
      localStorage.setItem('cv-tour-v41-seen', '1');
      // Suppress the per-commodity guided-wizard overlay (also intercepts clicks).
      localStorage.setItem('cv-wizard-off', '1');
    });

    // Step 7 drives the PCB photo panel, which is hidden when the server says AI
    // is switched off. vite preview proxies /api to whatever runs on :3002, so
    // pin the answer rather than inherit a local air-gapped server's.
    await page.route('**/api/health', r => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', airGapped: false }),
    }));

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    log('page loaded');

    // 2. Drive into the SW panel via the New Costing picker.
    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.click('.cpicker-tile[data-commodity="automotive_software"]', { timeout: 15_000 });
    log('opened SW Should-Cost panel');

    // 3. The panel defaults to the Guided wizard — assert it rendered.
    await page.waitForSelector('.sw-wiz-card', { timeout: 15_000 });
    log('guided wizard rendered');

    // 4. Switch to Advanced mode and run the full calculation.
    await page.click('.sw-mode-btn[data-mode="advanced"]', { timeout: 15_000 });
    await page.click('#sw-calc-btn', { timeout: 15_000 });
    await page.waitForSelector('#sw-summary-cards .sw-summary-card', { timeout: 15_000 });
    const cardCount = await page.locator('#sw-summary-cards .sw-summary-card').count();
    if (cardCount < 1) throw new Error('No summary cards rendered after Calculate');
    log(`results rendered (${cardCount} summary cards)`);

    // 5. The provenance panel (Rec #1) must be present.
    const hasRateLib = await page.locator('details:has-text("Rate Library")').count();
    if (hasRateLib < 1) throw new Error('Rate Library provenance panel missing');

    // 6. Regression guard: the SW panel hides the Calculate button. Switching to
    // a standard commodity must restore it (switchCommodity used to leak the
    // hidden state, so the results tabs — Breakdown / AI Insights / DFM-DFA —
    // never appeared for any commodity after visiting SW / AI Agent).
    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.click('.cpicker-tile[data-commodity="machining"]', { timeout: 15_000 });
    await page.waitForSelector('#costing-view', { state: 'visible', timeout: 15_000 });
    if (!(await page.locator('#calc-btn').isVisible())) {
      throw new Error('Calculate button hidden after SW → machining switch (results tabs would never render)');
    }
    // Tooling amortisation defaults follow the stated volume (annual × programme
    // life, blank life = 1 year). Hard-coded per-form defaults used to fail the
    // tool's own self-audit on 18 of 20 forms.
    const [amort, annual] = await Promise.all([page.inputValue('#mach-amort'), page.inputValue('#annual-volume')]);
    if (amort !== annual) throw new Error(`Default amortisation ${amort} does not follow annual volume ${annual}`);
    await page.click('#load-ref-btn', { timeout: 15_000 });
    await page.waitForTimeout(300);
    await page.click('#calc-btn', { timeout: 15_000 });
    await page.waitForSelector('#results-tabs', { state: 'visible', timeout: 15_000 });
    const rtabCount = await page.locator('.rtab').count();
    if (rtabCount < 3) throw new Error(`Results tab bar missing after Calculate (got ${rtabCount} tabs)`);
    log(`results tabs render after commodity switch (${rtabCount} tabs)`);

    // The cost must be on screen after Calculate. The results used to sit in a
    // 32 px scroll box under the form, so the button looked like it did nothing.
    await page.waitForTimeout(1200);   // the smooth scroll
    const hero = await page.evaluate(() => {
      const r = document.getElementById('cv-result-hero')?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom, vh: innerHeight } : null;
    });
    if (!hero || hero.top < 0 || hero.bottom > hero.vh) {
      throw new Error(`Result not on screen after Calculate (${JSON.stringify(hero)})`);
    }
    log('result scrolled into view after Calculate');

    // 7. PCB image results must show AI-read text as text. A board photo whose
    // silkscreen or chip marking reads as markup used to reach innerHTML
    // unescaped — the BOM description, part number, insights, DFM lines. The
    // analysis is stubbed; this is about rendering, not the vision pipeline.
    // (vite preview sends no CSP, so on the old code the handler really fires.)
    const HOSTILE = '<img src=x onerror="window.__cvXss=(window.__cvXss||0)+1">';
    const analysis = {
      partName: `Board ${HOSTILE}`,
      boardSpec: { estimatedLayers: 4, widthMm: 80, heightMm: 60, surfaceFinish: `ENIG ${HOSTILE}`, solderMaskColour: 'green',
        silkscreenSides: 2, throughVias: 100, blindVias: 0, buriedVias: 0, microVias: 0, bgaDetected: false, minTraceSpaceMm: 0.15,
        technologyType: 'Standard', hdiStructure: 'none', impedanceControlRequired: false, copperWeightOz: 1,
        qualityGrade: 'IPC Class 2', panelUtilisation: 0.8 },
      bom: [
        { refDes: `U1${HOSTILE}`, componentType: 'IC', description: `MCU ${HOSTILE}`, pkg: `QFN'"${HOSTILE}`, value: HOSTILE,
          voltage: '3V3', qty: 1, unitPriceGBP: 2.5, moq: 1, automotive: true, highCost: true, partNumber: `STM32${HOSTILE}` },
        { refDes: 'R1', componentType: 'Resistor', description: '10k <1% "tol"', pkg: '0402', value: '10k', voltage: '',
          qty: 10, unitPriceGBP: 0.002, moq: 1, automotive: true, highCost: false },
      ],
      assembly: { smtPlacements: 11, throughHoleJoints: 0, manualJoints: 0, bgaCount: 0, complexity: 'Moderate',
        reflowSides: 1, aoiRequired: true, ictTimeSec: 30 },
      costEstimates: { pcbFabGBP: { min: 1, mid: 2, max: 3 }, totalBOMCostGBP: 2.52, smtAssemblyCostGBP: 1 },
      aiInsights: [`Insight ${HOSTILE}`], dfmIssues: [`DFM ${HOSTILE}`], highCostComponents: [`U1 ${HOSTILE}`],
      optimisationSuggestions: [`Opt ${HOSTILE}`], confidenceLevel: 'Medium', analysisLimitations: [`Lim ${HOSTILE}`],
    };
    await page.route('**/api/pcb/analyze-image-stream', r => r.fulfill({
      status: 200, headers: { 'content-type': 'text/event-stream' },
      body: `data: ${JSON.stringify({ type: 'complete', success: true, analysis })}\n\n`,
    }));
    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.click('.cpicker-tile[data-commodity="pcb_fab"]', { timeout: 15_000 });
    const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.setInputFiles('#pcb-img-input-0', { name: 'board.png', mimeType: 'image/png', buffer: onePixelPng });
    await page.click('#pcb-img-analyze-btn', { timeout: 15_000 });
    await page.waitForFunction(() => (document.getElementById('pcb-img-results')?.textContent ?? '').includes('Board '),
      null, { timeout: 15_000 });
    await page.waitForTimeout(500);   // give any injected onerror time to fire
    const pcb = await page.evaluate(() => {
      const r = document.getElementById('pcb-img-results')!;
      return {
        fired: (window as unknown as { __cvXss?: number }).__cvXss ?? 0,
        injected: r.querySelectorAll('[onerror]').length,
        literal: (r.textContent!.match(/<img src=x onerror=/g) ?? []).length,
        plain: r.textContent!.includes('10k <1% "tol"'),
        doubled: r.textContent!.includes('&lt;') || r.textContent!.includes('&#39;') || r.textContent!.includes('&amp;'),
      };
    });
    if (pcb.fired || pcb.injected) throw new Error(`PCB results rendered AI text as markup (${pcb.injected} injected elements, ${pcb.fired} handlers ran)`);
    if (pcb.literal < 5 || !pcb.plain) throw new Error(`PCB results lost AI text instead of showing it (${pcb.literal} literal, plain=${pcb.plain})`);
    if (pcb.doubled) throw new Error('PCB results show escaped entities — text was escaped twice');
    log(`PCB results show AI text as text (${pcb.literal} hostile strings shown literally, none ran)`);

    if (pageErrors.length) {
      throw new Error(`Uncaught page error(s):\n  - ${pageErrors.join('\n  - ')}`);
    }

    log('SMOKE PASSED — app boots, SW panel renders, calculation works, PCB text escaped, no page errors');
  } finally {
    cleanup();
  }
}

main().then(() => process.exit(0)).catch(err => {
  log(`FAILED: ${err.message}`);
  process.exit(1);
});
