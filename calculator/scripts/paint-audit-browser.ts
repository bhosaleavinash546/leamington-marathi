/**
 * Drive the REAL painting form in Chromium and export the PDF.
 *
 * Painting is not a CAD-driven commodity — there is no upload step and no
 * decision gate — so this goes straight at the form the way an estimator does:
 * pick the commodity tile, set region and volume, choose a route, fill the
 * rack-density fields, Calculate, then export via the app's own button. The
 * point is the same as arm A of the CAD audit: the browser path
 * (DOM → collectPaintingInput → engine → report) has wiring the unit tests do
 * not exercise, so testing only the engine tests the wrong thing.
 *
 *   npx tsx scripts/paint-audit-browser.ts <outdir> [--route zinc_plate]
 *        [--deposit 12] [--rack 6] [--racks 20] [--region China] [--label name]
 *
 * Needs Vite dev on :5174. No API key needed — nothing here calls the LLM.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const positional = argv.filter(a => !a.startsWith('--'));
const outdir = positional[0];
const flag = (name: string): string | undefined => {
  const i = argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
};

if (!outdir) {
  console.error('usage: tsx scripts/paint-audit-browser.ts <outdir> [--route X] [--deposit N] '
    + '[--rack N] [--racks N] [--region X] [--label name]');
  process.exit(2);
}

const BASE = process.env.CV_UI_BASE ?? 'http://localhost:5174/calculator/';
const route = flag('route') ?? 'standard_paint';
const deposit = flag('deposit') ?? '0';
const rack = flag('rack') ?? '6';
const racks = flag('racks') ?? '20';
const region = flag('region') ?? 'UK';
const label = flag('label') ?? `${route}-${region}`;
const log = (m: string) => process.stderr.write(`[paint:${label}] ${m}\n`);

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
    // An error the app CATCHES never reaches 'pageerror', so a silent failure
    // looks like a clean run. Console errors are the only trace it leaves.
    page.on('console', m => {
      if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
    });

    await page.addInitScript(() => {
      const payload = btoa(JSON.stringify({ sub: 'audit', exp: Math.floor(Date.now() / 1000) + 86_400 }));
      localStorage.setItem('auth_token', `eyJhbGciOiJIUzI1NiJ9.${payload}.audit`);
      localStorage.setItem('auth_user', JSON.stringify({ name: 'Audit' }));
      localStorage.setItem('cv-tour-v41-seen', '1');
      localStorage.setItem('cv-wizard-off', '1');
    });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mfg-region-selector', { timeout: 20_000 });
    await page.selectOption('#mfg-region-selector', { label: region });
    log(`app loaded, region ${region}`);

    // Straight to the painting form — no CAD upload on this commodity. The app
    // opens on the dashboard, so the commodity picker is behind "New Costing".
    const tile = page.locator('.cpicker-tile[data-commodity="painting"]');
    if (!await tile.isVisible().catch(() => false)) {
      await page.click('#new-costing-btn');
      await page.waitForTimeout(400);
    }
    await tile.click();
    await page.waitForSelector('#paint-stages', { timeout: 20_000 });
    log('painting form open');

    await page.selectOption('#paint-stages', route);      // also auto-picks the line
    await page.waitForTimeout(200);
    await page.fill('#paint-deposit-um', deposit);
    await page.fill('#paint-parts-per-rack', rack);
    await page.fill('#paint-racks-per-hr', racks);
    // Annual volume is disabled on some views (a scenario selector owns it);
    // leave it at whatever the app decided rather than forcing it.
    const vol = page.locator('#annual-volume');
    if (await vol.count() > 0 && await vol.isEditable().catch(() => false)) {
      await vol.fill('200000');
    }

    const chosenLine = await page.locator('#paint-line').inputValue();
    log(`route ${route} → machine ${chosenLine}`);

    await page.click('#calc-btn');
    await page.waitForTimeout(2500);
    log('calculated');

    const state = await page.evaluate(`(() => {
      const el = (id) => { const n = document.getElementById(id); return n ? n.value : null; };
      const txt = (sel) => { const n = document.querySelector(sel); return n ? n.innerText : null; };
      const all = (sel) => Array.from(document.querySelectorAll(sel)).map(n => n.innerText.trim());
      return {
        region: el('mfg-region-selector'),
        route: el('paint-stages'),
        line: el('paint-line'),
        partsPerRack: el('paint-parts-per-rack'),
        racksPerHour: el('paint-racks-per-hr'),
        depositUm: el('paint-deposit-um'),
        resultsText: txt('#results-view') || txt('#results') || txt('#costing-view'),
        warnings: all('.warning-item, .warn-item, .result-warning, .warning-box li'),
      };
    })()`);
    writeFileSync(join(outdir, `paint-${label}.json`), JSON.stringify(
      { _audit: { route, region, deposit, rack, racks, label, pageErrors }, state }, null, 2));
    log('page state captured');

    const dl = page.waitForEvent('download', { timeout: 60_000 });
    await page.click('#export-pdf-btn');
    const d = await dl;
    const pdf = join(outdir, `paint-${label}.pdf`);
    await d.saveAs(pdf);
    log(`PDF exported → ${pdf}`);

    if (pageErrors.length) log(`PAGE ERRORS: ${pageErrors.join(' | ')}`);
    else log('no page errors');
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
