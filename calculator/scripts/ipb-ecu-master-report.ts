/**
 * Produce the MASTER COST REPORT for the Bosch IPB2.0 ECU — the report format
 * with PART A / PART B / PART C that the Radar PCB example uses.
 *
 * Why this exists separately from scripts/ipb-ecu-tool-run.ts: that script
 * exports `printPDF`, the standard should-cost PDF. It is a real export, but it
 * is NOT the one a PCB costing normally produces. The PCB flow's report is
 * `printMasterPDF` (#export-all-pdf-btn), and only that one carries:
 *
 *   §C1  Board Specification
 *   §C1b Functional Safety (ISO 26262) — the ASIL grade, rationale, safety functions
 *   §C5  Bill of Materials
 *   §C7  Uploaded Board Images (all slots)
 *
 * PART C exists only when the PCB Image-to-BOM vision analysis has actually
 * run, because ASIL comes from that analysis. So this script drives the real
 * pipeline: dev server + API server, upload the board photos, press Analyze
 * PCB, wait for the result, apply it, calculate, then export the master report.
 *
 *   TOOLRUN_PHOTO_DIR=/path/to/board/photos npx tsx scripts/ipb-ecu-master-report.ts
 *
 * Needs ANTHROPIC_API_KEY in calculator/.env — this makes a real vision call.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Browser } from 'playwright';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const UI_PORT = Number(process.env.MASTER_UI_PORT ?? 5178);
// vite.config.ts HARDCODES its /api proxy target to localhost:3002 and reads no
// env var for it, so the API must listen there. Pointing this at a free port
// and passing VITE_API_PROXY_TARGET (which nothing reads) silently sends every
// browser request somewhere else — that is how the first run "timed out".
const API_PORT = Number(process.env.MASTER_API_PORT ?? 3002);
const BASE = `http://localhost:${UI_PORT}/calculator/`;
const OUT = resolve(process.argv[2] ?? '../CostVision-IPB2.0-ECU-MASTER-REPORT.pdf');

const log = (m: string) => process.stdout.write(`[master] ${m}\n`);

async function waitFor(url: string, label: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${label} did not come up within ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  const env = { ...process.env, PORT: String(API_PORT) };
  const api: ChildProcess = spawn('npx', ['tsx', 'server/index.ts'], { stdio: 'ignore', env });
  const ui: ChildProcess = spawn(
    'npx', ['vite', '--port', String(UI_PORT), '--strictPort'],
    { stdio: 'ignore', env },
  );
  let browser: Browser | undefined;
  const cleanup = () => {
    try { void browser?.close(); } catch { /* */ }
    try { ui.kill('SIGKILL'); } catch { /* */ }
    try { api.kill('SIGKILL'); } catch { /* */ }
  };

  try {
    await waitFor(`http://localhost:${API_PORT}/api/health`, 'API server').catch(async () => {
      // Some builds have no /api/health — fall back to any response on the root.
      await waitFor(`http://localhost:${API_PORT}/`, 'API server');
    });
    log(`API up on :${API_PORT}`);
    await waitFor(BASE, 'Vite dev server');
    log(`UI up on ${BASE}`);

    // Preflight: without a usable key the analyze endpoint 400s in under a
    // second, and waiting on a success selector afterwards is a 10-minute lie.
    const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
    // NB the field is `apiKeyConfigured` — see server/index.ts's /api/health.
    const health = await fetch(`http://localhost:${API_PORT}/api/health`)
      .then(r => r.json() as Promise<{ apiKeyConfigured?: boolean }>).catch(() => ({}));
    log(`server key configured: ${health.apiKeyConfigured ?? 'unknown'}; env key supplied: ${apiKey ? 'yes' : 'no'}`);
    if (!apiKey && health.apiKeyConfigured === false) {
      throw new Error(
        'No usable ANTHROPIC_API_KEY. The PCB vision analysis needs one and will 400 without it.\n'
        + '  Set it in calculator/.env, or export ANTHROPIC_API_KEY before running this script.',
      );
    }

    const photoDir = process.env.TOOLRUN_PHOTO_DIR ?? '';
    const photos = (photoDir && existsSync(photoDir))
      ? readdirSync(photoDir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort()
          .map(f => join(photoDir, f)).slice(0, 8)
      : [];
    if (!photos.length) throw new Error('TOOLRUN_PHOTO_DIR must contain at least one board photo');
    log(`${photos.length} photo(s) to analyse`);

    const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH
      || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1100 } });
    const page = await ctx.newPage();

    if (apiKey) await ctx.setExtraHTTPHeaders({ 'x-api-key': apiKey });

    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));

    // Watch the analyze call itself. The first version of this script waited on
    // a success selector with no failure path, so a 400 that came back in 0.4 s
    // looked identical to a slow analysis and burned the full 10-minute timeout.
    let analyzeFailure: string | null = null;
    page.on('response', (res) => {
      if (!/\/api\/pcb\//.test(res.url())) return;
      log(`${new URL(res.url()).pathname} responded ${res.status()}`);
      if (res.status() >= 400) {
        void res.text()
          .then((body) => {
            let msg = body.slice(0, 300);
            try { msg = (JSON.parse(body) as { error?: string }).error ?? msg; } catch { /* raw */ }
            analyzeFailure = `HTTP ${res.status()} from ${new URL(res.url()).pathname}: ${msg}`;
          })
          .catch(() => { analyzeFailure = `HTTP ${res.status()} from ${new URL(res.url()).pathname}`; });
      }
    });

    await page.addInitScript(() => {
      const payload = btoa(JSON.stringify({ sub: 'master', exp: Math.floor(Date.now() / 1000) + 86_400 }));
      localStorage.setItem('auth_token', `eyJhbGciOiJIUzI1NiJ9.${payload}.master`);
      localStorage.setItem('auth_user', JSON.stringify({ name: 'Cost Engineering' }));
      localStorage.setItem('cv-tour-v41-seen', '1');
      localStorage.setItem('cv-wizard-off', '1');
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    await page.click('#new-costing-btn', { timeout: 20_000 });
    await page.click('.cpicker-tile[data-commodity="pcba"]', { timeout: 20_000 });
    await page.waitForSelector('#pcb-img-analyze-btn', { state: 'attached', timeout: 20_000 });
    log('PCBA panel open');

    // Region / volume BEFORE the analysis, so the vision call is priced for the
    // right country and quantity.
    await page.evaluate(`(() => {
      const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v;
        e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); } };
      set('mfg-region-selector', 'CN');
      set('currency-selector', 'GBP');
      set('pcb-mfg-country', 'cn');
      set('pcb-order-qty', '150000');
      set('annual-volume', '150000');
    })()`);

    for (let i = 0; i < photos.length; i++) {
      const input = await page.$(`#pcb-img-input-${i}`);
      if (!input) break;
      await input.setInputFiles(photos[i]);
      await page.waitForTimeout(300);
    }
    log('photos attached — running the vision analysis (this is a real API call)');

    await page.click('#pcb-img-analyze-btn', { timeout: 20_000 });

    // Race the success selector against an API failure, so a rejected request
    // ends the run immediately with the server's own message.
    const deadline = Date.now() + 600_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (analyzeFailure) throw new Error(`PCB analysis failed - ${analyzeFailure}`);
      ready = await page.locator('#pcb-apply-pcba-btn').isVisible().catch(() => false);
      if (ready) break;
      // A streamed analysis can fail with HTTP 200 and an SSE error frame, so
      // also watch the button falling back to its idle label and any toast.
      const uiState = await page.evaluate(`(() => {
        const b = document.getElementById('pcb-img-analyze-btn');
        const toast = document.querySelector('.toast--error, .toast-error, [data-toast="error"]');
        return { label: b ? b.textContent.trim() : '', busy: b ? b.disabled : false,
                 toast: toast ? toast.textContent.trim().slice(0, 200) : '' };
      })()`).catch(() => null) as { label: string; busy: boolean; toast: string } | null;
      if (uiState?.toast) throw new Error(`PCB analysis failed - UI reported: ${uiState.toast}`);
      if (uiState && !uiState.busy && !/Analyzing/i.test(uiState.label)) {
        throw new Error(`PCB analysis ended without a result (button back to "${uiState.label}")`);
      }
      await page.waitForTimeout(1000);
    }
    if (analyzeFailure) throw new Error(`PCB analysis failed - ${analyzeFailure}`);
    if (!ready) throw new Error('PCB analysis did not finish within 10 minutes and reported no error');
    log('analysis complete');

    const asil = await page.evaluate(
      `(() => { const w = window; return w.__pcbAsil ?? document.body.innerText.match(/ASIL-?[ABCD]/)?.[0] ?? '(none shown)'; })()`,
    ) as string;
    log(`ASIL on screen: ${asil}`);

    await page.click('#pcb-apply-pcba-btn', { timeout: 20_000 });
    await page.waitForTimeout(1500);

    await page.evaluate(`(() => {
      const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v;
        e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); } };
      set('annual-volume', '150000');
      set('pcba-amort', '150000');
      set('pcba-nre-amort', '150000');
      set('overhead-pct', '9');
      set('margin-pct', '8');
    })()`);

    await page.click('#calc-btn', { timeout: 20_000 });
    await page.waitForTimeout(3000);
    log('costing calculated');

    const dl = page.waitForEvent('download', { timeout: 120_000 });
    await page.click('#export-all-pdf-btn', { timeout: 20_000 });
    const download = await dl;
    mkdirSync(dirname(OUT), { recursive: true });
    await download.saveAs(OUT);
    log(`master report saved: ${OUT} ("${download.suggestedFilename()}")`);

    if (errors.length) { log(`${errors.length} page error(s):`); for (const e of errors.slice(0, 8)) log(`  ! ${e}`); }
  } finally {
    cleanup();
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
