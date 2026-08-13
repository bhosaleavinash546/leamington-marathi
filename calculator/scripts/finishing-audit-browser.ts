/**
 * Drive the REAL sheet-metal / casting / forging forms with a finishing route.
 *
 * Same reason as the paint audit: the browser path (DOM -> collect<X>Input ->
 * engine -> report) has wiring the unit tests do not exercise. The masked paint
 * route passed every engine test and was still completely un-calculable in the
 * product, because the validator rejected it — that is the class of defect this
 * catches.
 *
 *   npx tsx scripts/finishing-audit-browser.ts <outdir> --commodity sheet_metal \
 *        [--route powder_coat] [--mask 2] [--mpa 0] [--region UK]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const outdir = argv.filter(a => !a.startsWith('--'))[0];
const flag = (n: string): string | undefined => {
  const i = argv.findIndex(a => a === `--${n}` || a.startsWith(`--${n}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
};
if (!outdir) { console.error('usage: tsx scripts/finishing-audit-browser.ts <outdir> --commodity X'); process.exit(2); }

const commodity = flag('commodity') ?? 'sheet_metal';
const PREFIX: Record<string, string> = { sheet_metal: 'sm', casting: 'cast', forging: 'forge' };
const prefix = PREFIX[commodity] ?? 'sm';
const route = flag('route') ?? 'powder_coat';
const mask = flag('mask') ?? '0';
const mpa = flag('mpa') ?? '0';
const region = flag('region') ?? 'UK';
const label = flag('label') ?? `${commodity}-${route}`;
const log = (m: string) => process.stderr.write(`[finish:${label}] ${m}\n`);

async function main(): Promise<void> {
  mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--use-gl=swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errs: string[] = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

    await page.addInitScript(() => {
      const payload = btoa(JSON.stringify({ sub: 'audit', exp: Math.floor(Date.now() / 1000) + 86400 }));
      localStorage.setItem('auth_token', `eyJhbGciOiJIUzI1NiJ9.${payload}.audit`);
      localStorage.setItem('auth_user', JSON.stringify({ name: 'Audit' }));
      localStorage.setItem('cv-tour-v41-seen', '1');
      localStorage.setItem('cv-wizard-off', '1');
    });
    await page.goto(process.env.CV_UI_BASE ?? 'http://localhost:5174/calculator/',
      { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mfg-region-selector', { timeout: 20_000 });
    await page.selectOption('#mfg-region-selector', { label: region === 'CN' ? 'China (Tier 1)' : 'United Kingdom' })
      .catch(() => undefined);

    const tile = page.locator(`.cpicker-tile[data-commodity="${commodity}"]`);
    if (!await tile.isVisible().catch(() => false)) {
      await page.click('#new-costing-btn');
      await page.waitForTimeout(400);
    }
    await tile.click();
    await page.waitForSelector(`#${prefix}-sf-route`, { timeout: 20_000 });
    log(`${commodity} form open, surface section present`);

    await page.selectOption(`#${prefix}-sf-route`, route);
    await page.fill(`#${prefix}-sf-mask`, mask);
    await page.fill(`#${prefix}-sf-mpa`, mpa);
    await page.waitForTimeout(200);

    await page.click('#calc-btn');
    await page.waitForTimeout(2500);

    const state = await page.evaluate(`(() => {
      const el = (id) => { const n = document.getElementById(id); return n ? n.value : null; };
      const vis = (sel) => { const n = document.querySelector(sel); return n && n.offsetParent !== null ? n.innerText : null; };
      return {
        route: el('${prefix}-sf-route'),
        form: el('${prefix}-sf-form'),
        errorBox: vis('#error-box, .error-box, #validation-errors'),
        warnBox: vis('#warn-box, .warn-box, #validation-warnings'),
        hasTotal: /Total Should-Cost|8-Bucket|TOTAL SHOULD-COST/.test(document.body.innerText),
        exportVisible: (() => { const b = document.getElementById('export-pdf-btn'); return !!b && b.offsetParent !== null; })(),
      };
    })()`);
    writeFileSync(join(outdir, `finish-${label}.json`),
      JSON.stringify({ _audit: { commodity, route, mask, mpa, region, errs }, state }, null, 2));
    log(`calculated: total=${(state as { hasTotal: boolean }).hasTotal}`);
    if ((state as { errorBox: string | null }).errorBox) {
      log(`VALIDATION ERROR: ${(state as { errorBox: string }).errorBox}`);
    }

    const dl = page.waitForEvent('download', { timeout: 60_000 });
    await page.click('#export-pdf-btn');
    const d = await dl;
    await d.saveAs(join(outdir, `finish-${label}.pdf`));
    log(`PDF exported -> finish-${label}.pdf`);
    if (errs.length) log(`ERRORS: ${errs.slice(0, 3).join(' | ')}`);
  } finally {
    await browser.close();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
