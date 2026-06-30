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
    const page = await browser.newPage();

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
    });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    log('page loaded');

    // 2. Drive into the SW panel via the New Costing picker.
    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.click('.cpicker-tile[data-commodity="automotive_software"]', { timeout: 15_000 });
    log('opened SW Should-Cost panel');

    // 3. Run a calculation and assert results render.
    await page.click('#sw-calc-btn', { timeout: 15_000 });
    await page.waitForSelector('#sw-summary-cards .sw-summary-card', { timeout: 15_000 });
    const cardCount = await page.locator('#sw-summary-cards .sw-summary-card').count();
    if (cardCount < 1) throw new Error('No summary cards rendered after Calculate');
    log(`results rendered (${cardCount} summary cards)`);

    // 4. The provenance panel (Rec #1) must be present.
    const hasRateLib = await page.locator('details:has-text("Rate Library")').count();
    if (hasRateLib < 1) throw new Error('Rate Library provenance panel missing');

    if (pageErrors.length) {
      throw new Error(`Uncaught page error(s):\n  - ${pageErrors.join('\n  - ')}`);
    }

    log('SMOKE PASSED — app boots, SW panel renders, calculation works, no page errors');
  } finally {
    cleanup();
  }
}

main().then(() => process.exit(0)).catch(err => {
  log(`FAILED: ${err.message}`);
  process.exit(1);
});
