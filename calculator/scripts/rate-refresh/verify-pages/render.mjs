/**
 * Second pass of the page check: open, in a real browser, the pages a plain fetch could not read (refused, or the
 * figure rendered by JavaScript), and save the rendered text beside the fetch cache (<hash>.render.txt).
 *   node scripts/rate-refresh/verify-pages/render.mjs <cacheDir> [page-check.json]
 * Only the URLs of figures the configs USE whose status is page-failed / page-no-figure are opened.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const CACHE = process.argv[2];
const PC = process.argv[3] ?? join(dirname(fileURLToPath(import.meta.url)), 'page-check.json');
const pc = JSON.parse(readFileSync(PC, 'utf8'));
const urls = [...new Set(pc.items.filter(r => r.used && /page-(failed|no-figure)/.test(r.status)).flatMap(r => r.urls))]
  .filter(u => !/\.pdf(\?|$)/i.test(u));
console.log(`${urls.length} pages to render`);
// the session's outbound proxy (its CA is in the browser trust store); a bare launch reached nothing
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
});
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', locale: 'en-GB' });
let done = 0;
async function one(u) {
  const h = createHash('sha1').update(u).digest('hex').slice(0, 16);
  const out = join(CACHE, `${h}.render.txt`);
  if (existsSync(out)) return;
  const page = await ctx.newPage();
  let text = '';
  try {
    await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(3500);
    text = await page.evaluate(() => document.body ? document.body.innerText : '');
  } catch { /* refused or timed out */ }
  await page.close();
  writeFileSync(out, text.replace(/\s+/g, ' '));
  if (++done % 25 === 0) console.log(`  ${done}/${urls.length}`);
}
const queue = [...urls];
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await one(queue.shift()); }));
await browser.close();
