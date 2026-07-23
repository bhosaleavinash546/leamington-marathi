/**
 * Visual-regression harness — catches unintended UI changes that unit tests and
 * the smoke test can't see (a broken layout, a colour regression, a class
 * collision like the .cv-hero one). Boots the BUILT app under `vite preview`,
 * drives it into a set of deterministic scenes, screenshots each, and diffs
 * against committed baselines with pixelmatch.
 *
 *   npm run test:visual            compare against baselines (fails on drift)
 *   npm run test:visual -- --update  (re)write baselines
 *
 * Determinism: animations/transitions/carets are disabled, fonts are awaited,
 * and there is no backend under `vite preview` — so the price ticker resolves to
 * its static "unavailable" state and no live timestamps leak in. Inter is
 * self-hosted, so text renders consistently across Linux/Chromium.
 *
 * Baselines are Linux + Playwright-Chromium renders. If CI's renderer drifts
 * from the committed baselines, regenerate them in CI and commit the result.
 * Uses the Playwright library directly (no @playwright/test), matching smoke.ts.
 */
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dir = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dir, '..', 'dist');
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.wasm': 'application/wasm', '.map': 'application/json',
};

/** Minimal static server for the built app, serving dist/** under the /calculator/ base. */
function startStaticServer(): Server {
  const srv = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p.startsWith('/calculator/')) p = p.slice('/calculator'.length);
      else if (p === '/calculator') p = '/';
      if (p === '/' || p === '') p = '/index.html';
      const rel = normalize(p).replace(/^(\.\.[/\\])+/, '');
      const file = join(DIST, rel);
      if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  srv.on('error', (e) => log(`static server error: ${(e as Error).message}`));
  srv.listen(PORT, '127.0.0.1', () => log(`static server listening on ${PORT}`));
  return srv;
}
const BASELINE_DIR = join(__dir, 'baselines');
const DIFF_DIR = join(__dir, 'visual-diffs');
const UPDATE = process.argv.includes('--update');
const PORT = Number(process.env.VISUAL_PORT ?? 4190);
const BASE = `http://127.0.0.1:${PORT}/calculator/`;
const IS_CI = !!process.env.CI;
const MAX_DIFF_RATIO = 0.02; // >2% of pixels differing = a real regression

function log(m: string) { process.stdout.write(`[visual] ${m}\n`); }
function isBrowserMissing(msg: string): boolean {
  return /Executable doesn't exist|requires the chromium snap|Target page, context or browser has been closed|Failed to launch|spawn .* ENOENT/i.test(msg);
}
async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Preview server did not start within ${timeoutMs}ms`);
}

const ANTI_FLICKER = `*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}`;

async function newPage(browser: Browser, theme: 'dark' | 'light', width: number, height: number): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => {
    const payload = btoa(JSON.stringify({ sub: 'visual', exp: Math.floor(Date.now() / 1000) + 86_400 }));
    localStorage.setItem('auth_token', `eyJhbGciOiJIUzI1NiJ9.${payload}.visual`);
    localStorage.setItem('auth_user', JSON.stringify({ fullName: 'Visual Test' }));
    localStorage.setItem('sc-theme', t as string);
    localStorage.setItem('cv-tour-v41-seen', '1');
  }, theme);
  const page = await ctx.newPage();
  return { ctx, page };
}

async function settle(page: Page): Promise<void> {
  await page.addStyleTag({ content: ANTI_FLICKER }).catch(() => {});
  await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
  await page.waitForTimeout(700);
}

async function openMachiningAndCalc(page: Page, calc: boolean): Promise<void> {
  await page.evaluate(() => document.getElementById('wizard-overlay')?.remove());
  await page.click('button[data-commodity="machining"]', { timeout: 15_000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('wizard-overlay')?.remove());
  if (calc) { await page.click('#calc-btn', { timeout: 15_000 }); await page.waitForTimeout(1400); }
}

/** Pin a single element to the viewport (fixed) and clip to it — scroll-independent. */
async function clipPinned(page: Page, selector: string, width: number): Promise<Buffer | null> {
  const box = await page.evaluate(({ sel, w }) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    Object.assign(el.style, { position: 'fixed', top: '20px', left: '20px', width: `${w}px`, zIndex: '2147483647', margin: '0' });
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }, { sel: selector, w: width });
  if (!box) return null;
  await page.waitForTimeout(150);
  return page.screenshot({ clip: { x: 0, y: 0, width: box.w + 40, height: box.h + 40 } });
}

type Scene = { name: string; shot: (browser: Browser) => Promise<Buffer | null> };

const SCENES: Scene[] = [
  { name: 'auth', shot: async (b) => {
    const { page } = await newPage(b, 'dark', 1440, 900);
    await page.goto(`${BASE}auth.html`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    return page.screenshot();
  } },
  ...(['dark', 'light'] as const).map((theme) => ({ name: `home-${theme}`, shot: async (b: Browser) => {
    const { page } = await newPage(b, theme, 1360, 1000);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await settle(page);
    return page.screenshot();
  } })),
  ...(['dark', 'light'] as const).map((theme) => ({ name: `hero-${theme}`, shot: async (b: Browser) => {
    const { page } = await newPage(b, theme, 1400, 1000);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await openMachiningAndCalc(page, true);
    return clipPinned(page, '.cv-rhero', 900);
  } })),
  { name: 'empty-dark', shot: async (b) => {
    const { page } = await newPage(b, 'dark', 1400, 1000);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await openMachiningAndCalc(page, false);
    return clipPinned(page, '#results-empty', 820);
  } },
];

function compare(name: string, current: Buffer): { ok: boolean; msg: string } {
  const baselinePath = join(BASELINE_DIR, `${name}.png`);
  if (UPDATE || !existsSync(baselinePath)) {
    writeFileSync(baselinePath, current);
    return { ok: true, msg: existsSync(baselinePath) && !UPDATE ? 'created baseline' : 'updated baseline' };
  }
  const base = PNG.sync.read(readFileSync(baselinePath));
  const cur = PNG.sync.read(current);
  if (base.width !== cur.width || base.height !== cur.height) {
    writeFileSync(join(DIFF_DIR, `${name}.actual.png`), current);
    return { ok: false, msg: `size changed ${base.width}x${base.height} → ${cur.width}x${cur.height} (see visual-diffs/${name}.actual.png)` };
  }
  const diff = new PNG({ width: base.width, height: base.height });
  const changed = pixelmatch(base.data, cur.data, diff.data, base.width, base.height, { threshold: 0.1 });
  const ratio = changed / (base.width * base.height);
  if (ratio > MAX_DIFF_RATIO) {
    writeFileSync(join(DIFF_DIR, `${name}.diff.png`), PNG.sync.write(diff));
    writeFileSync(join(DIFF_DIR, `${name}.actual.png`), current);
    return { ok: false, msg: `${(ratio * 100).toFixed(2)}% pixels changed (> ${MAX_DIFF_RATIO * 100}%) — see visual-diffs/${name}.diff.png` };
  }
  return { ok: true, msg: `${(ratio * 100).toFixed(2)}% diff — ok` };
}

async function main(): Promise<void> {
  mkdirSync(BASELINE_DIR, { recursive: true });
  rmSync(DIFF_DIR, { recursive: true, force: true });
  mkdirSync(DIFF_DIR, { recursive: true });

  const server = startStaticServer();
  let browser: Browser | undefined;
  const cleanup = () => { try { browser?.close(); } catch {} try { server.close(); } catch {} };

  try {
    await waitForServer(BASE);
    log('preview server up');
    try {
      browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    } catch (e) {
      const msg = (e as Error).message;
      if (isBrowserMissing(msg) && !IS_CI) { log(`SKIP — no launchable Chromium (${msg.split('\n')[0]}). Runs in CI.`); return; }
      throw e;
    }

    const failures: string[] = [];
    for (const scene of SCENES) {
      const buf = await scene.shot(browser);
      if (!buf) { failures.push(`${scene.name}: element not found`); log(`✗ ${scene.name} — element not found`); continue; }
      const { ok, msg } = compare(scene.name, buf);
      log(`${ok ? '✓' : '✗'} ${scene.name} — ${msg}`);
      if (!ok) failures.push(`${scene.name}: ${msg}`);
    }

    if (failures.length) {
      log(`\n${failures.length} scene(s) drifted:\n  ${failures.join('\n  ')}`);
      log(UPDATE ? '' : 'If the change is intentional, run: npm run test:visual -- --update  (and commit e2e/baselines).');
      process.exitCode = 1;
    } else {
      log(`\nAll ${SCENES.length} scenes match baseline.`);
    }
  } finally {
    cleanup();
  }
}

main().catch(e => { log(`FATAL ${(e as Error).message}`); process.exitCode = 1; });
