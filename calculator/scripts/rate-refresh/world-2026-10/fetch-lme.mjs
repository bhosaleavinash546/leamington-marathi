/**
 * LME official settlement prices (cash and 3-month), latest day, as Westmetall publishes them — the one metal reference
 * every region's book prices aluminium, copper, zinc, nickel and tin against (world round, 30 Oct 2026).
 *   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/rate-refresh/world-2026-10/fetch-lme.mjs
 * The page needs a browser (a plain fetch is redirected); its table is read as text and stored with the URL and time.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const PAGE = 'https://www.westmetall.com/en/markdaten.php';
const b = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const p = await b.newPage();
await p.goto(PAGE, { timeout: 60_000 });
const text = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
await b.close();
const day = /Official LME-Prices in US Dollar\s+(\d{1,2}\. \w+ \d{4})/.exec(text)?.[1];
const metals = {};
for (const m of ['Copper', 'Tin', 'Lead', 'Zinc', 'Aluminium', 'Nickel']) {
  const r = new RegExp(`${m} ([0-9,.]+) ([0-9,.]+)`).exec(text);
  if (r) metals[m.toLowerCase()] = { cashUsdPerT: Number(r[1].replace(/,/g, '')), threeMonthUsdPerT: Number(r[2].replace(/,/g, '')) };
}
const out = { source: PAGE, publisher: 'London Metal Exchange official prices, as published by Westmetall', day, read: new Date().toISOString(), metals };
writeFileSync(new URL('./official/lme.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
