/**
 * Drive the REAL CostVision app to a should-cost for the Bosch IPB2.0 ECU PCBA,
 * and export the tool's OWN PDF report.
 *
 * The earlier deliverable was a hand-built reportlab document. This is not that:
 * it boots the production build in Chromium, fills the PCBA form the way an
 * engineer would, presses Calculate, and clicks the tool's PDF export — so the
 * output is whatever `src/export/pdf.ts::printPDF` produces, with the tool's own
 * sections, charts, insights and traceability.
 *
 *   npm run build && npx tsx scripts/ipb-ecu-tool-run.ts
 *
 * Writes the captured PDF next to the repo root.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Browser } from 'playwright';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const PORT = Number(process.env.TOOLRUN_PORT ?? 4193);
const BASE = `http://localhost:${PORT}/calculator/`;
const OUT = resolve(process.argv[2] ?? '../CostVision-IPB2.0-ECU-TOOL-REPORT.pdf');

const log = (m: string) => process.stdout.write(`[tool-run] ${m}\n`);

// ─── Board + assembly inputs ─────────────────────────────────────────────────
// Same measured/inferred inputs as scripts/ipb-ecu-costing.ts, so the two runs
// are directly comparable. Prices are the REVISED set (see the pricing review).
const BOM: Array<[string, string, string, number, number]> = [
  // refDes, componentType, description, qty, unitPriceGBP
  ['U-MCU',   'ic_bga',       'Renesas R7F702300B RH850/U2A automotive MCU',   1,  15.00],
  ['U-ASIC1', 'ic_tqfp',      'Bosch 40342/01 motor-control ASIC (captive)',   1,  10.00],
  ['U-ASIC2', 'ic_tqfp',      'Bosch 40341/01 ASIC (captive)',                 1,   7.00],
  ['U-ASIC3', 'ic_tqfp',      'Bosch 2302701 ASIC (captive)',                  1,   4.00],
  ['U-SBC',   'ic_tqfp',      'ST L9369 multi-channel driver / SBC',           1,   5.00],
  ['U-BGA2',  'ic_bga',       'Secondary safety MCU / ASIC (BGA)',             1,   8.00],
  ['U-MEM',   'ic_bga',       'External memory (BGA)',                         1,   3.00],
  ['Q1-6',    'power_module', 'Q142E power stage / dual half-bridge',          6,   3.00],
  ['U-CAN',   'ic_soic',      'NXP TJA1463A CAN-FD SIC transceiver',           2,   1.20],
  ['U-71H',   'ic_soic',      'Bosch 71H740 driver / power-path (captive)',    3,   1.50],
  ['U-76E2',  'ic_soic',      'Bosch 76E240 device (captive)',                 1,   1.80],
  ['U-76E8',  'ic_soic',      'Bosch 76E840 device (captive)',                 1,   1.80],
  ['U-7S1R',  'ic_soic',      'Bosch 7S1R540H power device (captive)',         2,   1.60],
  ['C-BULK',  'passive_0805', 'Polymer alu cap 150 uF 35 V (351 150 EJV)',     6,   0.40],
  ['L-PWR',   'power_module', 'Shielded power inductor 0.47-10 uH',            8,   0.60],
  ['R/C-SMD', 'passive_0402', 'MLCC + thick-film resistors, AEC-Q200',       620,   0.009],
  ['D/Q-SML', 'ic_soic',      'Small-signal semis (SOT/SOD/QFN)',             90,   0.09],
  ['Y1',      'crystal_osc',  'Crystal / oscillator',                          1,   0.45],
  ['J1-2',    'through_hole', 'Automotive press-fit header (main + motor)',    2,   2.50],
  ['TIM',     'through_hole', 'Thermal interface pad (power stages)',          8,   0.12],
];

/** Fields set on the PCBA form. id → value. */
const FIELDS: Record<string, string> = {
  'part-name': 'Bosch IPB2.0 ECU PCBA',
  'annual-volume': '150000',
  'packaging': '0.73',
  'logistics': '0.57',
  'overhead-pct': '9',
  'margin-pct': '8',
  // Assembly
  'pcba-pcb-cost': '21.64',
  'pcba-smt-lines': '1',
  'pcba-smt-oee': '0.82',
  'pcba-smt-sides': '2',
  'pcba-th-count': '2',
  'pcba-man-count': '0',
  'pcba-th-time': '12',
  'pcba-man-time': '20',
  'pcba-complexity': 'high',
  'pcba-quality': 'auto_grade1',
  'pcba-bga-count': '3',
  'pcba-ict-time': '150',
  'pcba-xray-mode': 'offline_100pct',
  'pcba-axi-time': '45',
  'pcba-xray-sample': '0.1',
  'pcba-yield': '0.985',
  'pcba-rework-cost': '18',
  'pcba-coat-area': '187',
  'pcba-coat-price': '0.0035',
  'pcba-nre-cost': '46000',
  'pcba-nre-amort': '150000',
  'pcba-amort': '150000',
};

async function waitForServer(url: string, timeoutMs = 40_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Preview server did not start within ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  const server: ChildProcess = spawn(
    'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', env: process.env },
  );
  let browser: Browser | undefined;
  const cleanup = () => { try { void browser?.close(); } catch { /* */ } try { server.kill('SIGKILL'); } catch { /* */ } };

  try {
    await waitForServer(BASE);
    log(`preview up on ${BASE}`);

    // The environment ships a Chromium build that may not match what this
    // Playwright version expects to download. PLAYWRIGHT_CHROMIUM_PATH (or the
    // stable /opt/pw-browsers/chromium symlink) points at the one that exists.
    const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH
      || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1100 } });
    const page = await ctx.newPage();

    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    // The app's inline auth guard redirects to /auth.html without a token, and
    // the first-run tour/wizard overlays intercept clicks. Seed both before any
    // page script runs — the same approach e2e/smoke.ts uses.
    await page.addInitScript(() => {
      const payload = btoa(JSON.stringify({ sub: 'toolrun', exp: Math.floor(Date.now() / 1000) + 86_400 }));
      localStorage.setItem('auth_token', `eyJhbGciOiJIUzI1NiJ9.${payload}.toolrun`);
      localStorage.setItem('auth_user', JSON.stringify({ name: 'Cost Engineering' }));
      localStorage.setItem('cv-tour-v41-seen', '1');
      localStorage.setItem('cv-wizard-off', '1');
    });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    log(`app loaded — "${await page.title()}"`);

    // 0 · Board photographs to load into the PCB Image→BOM slots, so the report
    //     carries the evidence the BOM was read from. Any jpg/png in
    //     TOOLRUN_PHOTO_DIR is used, in filename order, against the slot labels.
    const photoDir = process.env.TOOLRUN_PHOTO_DIR ?? '';
    const photoFiles: string[] = (photoDir && existsSync(photoDir))
      ? readdirSync(photoDir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort()
          .map(f => join(photoDir, f)).slice(0, 8)
      : [];

    // 1 · Into the PCBA cost model, via the New Costing picker.
    await page.click('#new-costing-btn', { timeout: 15_000 });
    await page.click('.cpicker-tile[data-commodity="pcba"]', { timeout: 15_000 });
    await page.waitForSelector('#pcba-smt-mach', { state: 'attached', timeout: 15_000 });
    await page.waitForTimeout(800);
    log('PCBA panel open');

    // 1b · Attach the photographs to the slot file inputs.
    for (let i = 0; i < photoFiles.length; i++) {
      const input = await page.$(`#pcb-img-input-${i}`);
      if (!input) { log(`no slot input #pcb-img-input-${i} — stopped after ${i} photo(s)`); break; }
      await input.setInputFiles(photoFiles[i]);
      await page.waitForTimeout(300);   // let the FileReader settle
    }
    if (photoFiles.length) log(`attached ${photoFiles.length} photo(s) from ${photoDir}`);

    // NOTE: every page.evaluate below is passed as a SOURCE STRING, not a
    // closure. tsx compiles with esbuild's keepNames, which wraps every function
    // in a `__name(...)` helper that does not exist in page context — a closure
    // passed here dies with "__name is not defined". A string is compiled by the
    // browser, so the helper never appears.

    // 2 · Region + currency, so the report renders China rates in GBP.
    const selected = await page.evaluate(`(() => {
      const setSel = (id, re) => {
        const s = document.getElementById(id);
        if (!s) return id + ':MISSING';
        const opt = Array.from(s.options).find(o => re.test(o.value) || re.test(o.textContent || ''));
        if (!opt) return id + ':NO-MATCH';
        s.value = opt.value;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return id + '=' + opt.value;
      };
      return [
        setSel('mfg-region-selector', /^CN$/),
        setSel('currency-selector', /^GBP$/),
        setSel('pcba-smt-mach', /smt-high-speed/i),
        setSel('pcba-smt-lab', /cn-electronics/i),
        setSel('pcba-th-lab', /cn-electronics/i),
        setSel('pcba-xray-mach', /xray/i),
        setSel('pcba-ict-mach', /ict-auto/i),
      ];
    })()`) as string[];
    log(`selects: ${selected.join(', ')}`);

    // 3 · Scalar fields.
    const missing = await page.evaluate(`(() => {
      const fields = ${JSON.stringify(FIELDS)};
      const miss = [];
      for (const id of Object.keys(fields)) {
        const e = document.getElementById(id);
        if (!e) { miss.push(id); continue; }
        e.value = fields[id];
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return miss;
    })()`) as string[];
    if (missing.length) log(`WARNING missing fields: ${missing.join(', ')}`);

    // 4 · BOM — clear the seeded demo rows, then add ours through the real
    //     "Add row" button so the app's own row wiring is exercised.
    const seeded = await page.evaluate(
      `document.querySelectorAll('#bom-body tr[data-bom-id]').length`,
    ) as number;
    for (let i = 0; i < seeded; i++) {
      const btn = await page.$('#bom-body tr[data-bom-id] button');
      if (btn) await btn.click(); else break;
    }
    log(`cleared ${seeded} seeded BOM rows`);

    for (const [ref, type, desc, qty, price] of BOM) {
      await page.click('#add-bom-btn');
      await page.evaluate(`(() => {
        const line = ${JSON.stringify({ ref, type, desc, qty: String(qty), price: String(price) })};
        const rows = document.querySelectorAll('#bom-body tr[data-bom-id]');
        const id = rows[rows.length - 1].dataset.bomId;
        const put = (suffix, v) => {
          const e = document.getElementById(id + '-' + suffix);
          if (!e) return;
          e.value = v;
          e.dispatchEvent(new Event('input', { bubbles: true }));
          e.dispatchEvent(new Event('change', { bubbles: true }));
        };
        put('ref', line.ref); put('type', line.type); put('desc', line.desc);
        put('qty', line.qty); put('price', line.price); put('moq', '1');
      })()`);
    }
    const built = await page.evaluate(
      `document.querySelectorAll('#bom-body tr[data-bom-id]').length`,
    ) as number;
    log(`BOM built: ${built} lines`);
    if (built !== BOM.length) throw new Error(`BOM row count ${built} != ${BOM.length}`);

    // 5 · Calculate — the real button, the real engine.
    await page.click('#calc-btn');
    await page.waitForTimeout(2500);

    const headline = await page.evaluate(`(() => {
      const pick = ['#result-total', '.result-hero-value', '#hero-total', '.hero-total',
                    '#total-cost', '.kpi-total'];
      for (const sel of pick) {
        const e = document.querySelector(sel);
        if (e && (e.textContent || '').trim()) return sel + ' → ' + e.textContent.trim();
      }
      return '(no headline element matched)';
    })()`) as string;
    log(`on-screen headline: ${headline}`);

    // 6 · Export the tool's own PDF.
    const dl = page.waitForEvent('download', { timeout: 60_000 });
    await page.evaluate(`(() => {
      if (!window.__demoOpenPDF) throw new Error('__demoOpenPDF hook missing');
      return window.__demoOpenPDF();
    })()`);
    const download = await dl;
    mkdirSync(dirname(OUT), { recursive: true });
    await download.saveAs(OUT);
    log(`PDF saved: ${OUT} (suggested name "${download.suggestedFilename()}")`);

    if (errors.length) {
      log(`page reported ${errors.length} error(s):`);
      for (const e of errors.slice(0, 10)) log(`  ! ${e}`);
    } else {
      log('no page errors');
    }
  } finally {
    cleanup();
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
