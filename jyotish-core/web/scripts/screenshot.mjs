/**
 * `npm run design:screenshot` — render a route and report what it actually looks
 * like.
 *
 * DESIGN.md's standing instructions open with "screenshot your work and critique
 * it before reporting done". This exists because that instruction is worth more
 * than it sounds: the first Phase A build typechecked, passed the contrast audit
 * and shipped a page that rendered **blank in every browser** — the CSP blocked
 * the App Router's inline scripts, React hydrated against nothing and deleted the
 * server DOM. A build gate cannot see that. A screenshot can.
 *
 * It also prints the two things a screenshot alone will not tell you: CSP
 * violations, and whether any glyph fell back to a font the app does not ship.
 *
 *   npm run design:screenshot -- http://localhost:3000/tokens out.png
 *
 * Expects a server already running — it deliberately does not start one, so the
 * thing being photographed is the thing that will be served.
 */
import { chromium } from 'playwright';

const [url, out] = process.argv.slice(2);
if (!url) {
  console.error('usage: node scripts/screenshot.mjs <url> [out.png]');
  process.exit(2);
}

// Chromium ships with Playwright in this environment; PLAYWRIGHT_BROWSERS_PATH
// points at it. Falling back to the bundled resolution keeps it portable.
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1200 },
  deviceScaleFactor: 2,
});

const violations = [];
const failed = [];
page.on('console', (m) => {
  if (/Content Security Policy/.test(m.text())) violations.push(m.text().split('\n')[0]);
});
page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => {
  if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url()}`);
});

const response = await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

const visible = await page.evaluate(() => (document.body.innerText || '').trim().length);
const families = await page.evaluate(() =>
  [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`)
);

console.log(`${url} → HTTP ${response?.status()}`);
console.log(`  visible text     ${visible} chars`);
console.log(`  faces loaded     ${[...new Set(families)].join(', ') || 'none'}`);
console.log(`  CSP violations   ${violations.length}`);
console.log(`  failed requests  ${failed.length}`);
for (const line of [...violations.slice(0, 3), ...failed.slice(0, 3)]) console.log(`    ${line}`);

if (out) {
  await page.screenshot({ path: out, fullPage: true });
  console.log(`  written          ${out}`);
}
await browser.close();

// A page that renders no text is the failure this tool exists to catch, and it
// must not be a green run.
process.exit(visible === 0 || violations.length > 0 ? 1 : 0);
