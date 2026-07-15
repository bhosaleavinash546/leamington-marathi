// E2E smoke + accessibility gate. Boots the real server (fresh temp DB) serving
// the built dist/, signs up through the real API, then drives Chromium through
// the main pages asserting: page renders, zero uncaught console errors, and no
// SERIOUS/CRITICAL axe violations.
//
//   npm run build && npm run e2e
//
// CHROMIUM_PATH overrides the browser binary (defaults to the CI/container path).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 19000 + (process.pid % 100);
const BASE = `http://127.0.0.1:${PORT}`;
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.error('dist/ not built — run `npm run build` first.');
  process.exit(1);
}

const dataDir = mkdtempSync(join(tmpdir(), 'bs-e2e-'));
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, JWT_SECRET: 'e2e-secret', LOG_LEVEL: 'silent' },
  stdio: 'ignore',
});

const cleanup = (code) => {
  server.kill('SIGKILL');
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* */ }
  process.exit(code);
};

try {
  // wait for health
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* */ }
    if (i > 75) throw new Error('server never became healthy');
    await new Promise(r => setTimeout(r, 400));
  }

  // real signup through the API
  const su = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'E2E', email: 'e2e@test.local', password: 'e2e-pass-123' }),
  });
  const { token, user } = await su.json();
  if (!token) throw new Error('signup failed');

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  // authenticate the SPA the way the app expects
  await page.goto(BASE);
  await page.evaluate(([t, u]) => localStorage.setItem('brainspark_auth', JSON.stringify({ token: t, user: u })), [token, user]);

  const axeSource = readFileSync(join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
  const PAGES = ['/', '/marketplace', '/analyze', '/should-cost', '/legal/privacy'];
  let axeFailures = 0;

  for (const route of PAGES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);   // let lazy chunks + motion settle
    const rendered = await page.evaluate(() => (document.getElementById('root')?.children.length ?? 0) > 0);
    if (!rendered) throw new Error(`${route}: root did not render`);

    // Inject axe via CDP evaluate — the app's (correct) CSP blocks inline
    // <script> tags, but the DevTools protocol is not subject to page CSP.
    await page.evaluate(axeSource);
    const result = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(' ')?.slice(0, 90) }));
    });
    const serious = result.filter(v => v.impact === 'serious' || v.impact === 'critical');
    console.log(`${route}: rendered ✓ · axe serious/critical: ${serious.length}${serious.length ? ' → ' + serious.map(v => `${v.id}(${v.nodes}) @ ${v.sample}`).join(', ') : ''}`);
    axeFailures += serious.length;
  }

  await browser.close();

  const realErrors = consoleErrors.filter(e => !/favicon|manifest|sw\.js|Failed to load resource/i.test(e));
  if (realErrors.length) {
    console.error('Console errors:', realErrors.slice(0, 5));
    cleanup(1);
  }
  if (axeFailures > 0) {
    console.error(`FAIL: ${axeFailures} serious/critical axe violations`);
    cleanup(1);
  }
  console.log('E2E SMOKE PASS ✓');
  cleanup(0);
} catch (err) {
  console.error('E2E failed:', err.message);
  cleanup(1);
}
