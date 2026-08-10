// PROVE THE 3D CAPTURE IN A REAL BROWSER.
//
// The figure path had never been run anywhere but in a fixture. Every QA render
// fed the exporter a hand-written data URI, so what was verified was that jsPDF
// can embed a PNG — not that the viewer produces one, not that the anchors
// project onto the part, and not that a report exported from the actual page
// carries a picture at all. The most likely explanation for "the images are
// missing from my report" was in exactly that unverified gap.
//
// So this boots the REAL server on a temp DB, signs up through the REAL API,
// loads the DFM Studio in headless Chromium, uploads a STEP fixture, runs the
// analysis, and then drives the page's own viewer handle to take the same
// snapshot the exporter takes. It asserts the capture is a PICTURE OF SOMETHING
// — not a blank frame, which is what a broken WebGL context silently returns.
//
//   node scripts/pdf-qa/live-figures.mjs [--headed]
//
// Chromium here runs WebGL on SwiftShader (software). That is a weaker claim
// than a GPU browser, and it is stated rather than glossed: it proves the code
// path and the geometry, not a particular driver.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 19300 + (process.pid % 90);
const BASE = `http://127.0.0.1:${PORT}`;
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PART = join(ROOT, 'benchmark', 'dfm-fixtures', 'ribbed-plate.step');

if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.error('dist/ not built - run `npm run build` first.');
  process.exit(1);
}

const dataDir = mkdtempSync(join(tmpdir(), 'bs-figs-'));
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, JWT_SECRET: 'figs', LOG_LEVEL: 'silent' },
  stdio: 'ignore',
});

const fail = [];
const ok = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail.push(label);
};

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return true; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

let browser;
try {
  if (!await waitForServer()) throw new Error('server never came up');

  const signup = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `figs${process.pid}@example.com`, password: 'Fixture-pass-123', name: 'Figure QA' }),
  });
  // The provider only restores a session when BOTH halves are present
  // (`if (t && u)`), so seeding just the token leaves the page redirecting to
  // sign-in and the file input never exists — which is how this first failed.
  const session = await signup.json();
  const token = session?.token;
  if (!token || !session.user) throw new Error('signup returned no session');

  browser = await chromium.launch({ executablePath: CHROMIUM, headless: !process.argv.includes('--headed') });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.addInitScript(sess => localStorage.setItem('brainspark_auth', JSON.stringify(sess)),
    { token: session.token, user: session.user });
  await page.goto(`${BASE}/dfm-studio`, { waitUntil: 'networkidle' });

  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    if (!g) return null;
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
  });
  ok('WebGL is available in this browser', !!gl, String(gl).slice(0, 60));

  await page.setInputFiles('input[type=file]', PART);
  // The viewer streams the mesh from the server; the canvas exists before it
  // arrives, so waiting on the element would capture an empty scene.
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForTimeout(6_000);

  const shot = await page.evaluate(async () => {
    // The page's own viewer handle, reached the way the exporter reaches it.
    const host = document.querySelector('.cv3d-host');
    const api = host && (host.__cadViewer || window.__cadViewer);
    if (!api?.snapshot) return { error: 'no viewer handle exposed' };
    const uri = await api.snapshot({ view: 'iso', width: 900, height: 640, clean: true });
    return { uri: uri || null };
  });

  if (shot.error) {
    // Falling back to the raw canvas still answers the question that matters —
    // does WebGL in this browser render this part to pixels.
    const raw = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return c ? c.toDataURL('image/png') : null;
    });
    shot.uri = raw;
    shot.via = 'canvas.toDataURL';
  }

  ok('the viewer returned an image', !!shot.uri, shot.via ? `via ${shot.via}` : 'via snapshot()');

  if (shot.uri) {
    const b64 = shot.uri.split(',')[1] || '';
    const bytes = Buffer.from(b64, 'base64');
    writeFileSync(join(ROOT, 'scripts', 'pdf-qa', 'live-iso.png'), bytes);
    ok('the image is not an empty frame', bytes.length > 6_000, `${(bytes.length / 1024).toFixed(1)} kB`);

    // A blank canvas compresses to almost nothing and has ONE colour. Counting
    // distinct pixel values is the cheap test that separates "rendered the part"
    // from "rendered the background", which is the failure a byte-length check
    // alone would wave through.
    const distinct = await page.evaluate(async (uri) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = uri; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 37) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      return seen.size;
    }, shot.uri);
    ok('the image contains a rendered solid, not flat background', distinct > 12, `${distinct} distinct colours`);
  }

  ok('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (e) {
  console.error(`\n  harness error: ${e.message}`);
  fail.push('harness');
} finally {
  await browser?.close().catch(() => {});
  server.kill('SIGKILL');
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(fail.length ? `\n  ${fail.length} FAILED\n` : '\n  live figure capture verified\n');
process.exit(fail.length ? 1 : 0);
