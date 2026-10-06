/**
 * Theme screenshots: the same app states in light and dark, for a theme change to be checked
 * pixel by pixel. The dark theme's green retheme (Oct 2026) was proven NOT to move the light
 * theme with this: shoot before, shoot after, diff the light scenes (`--diff <before> <after>`).
 *
 *   npm run build && npx tsx e2e/theme-shots.ts <out-dir>
 *   npx tsx e2e/theme-shots.ts --diff <before-dir> <after-dir>
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { chromium, type Page } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function diff(a: string, b: string): void {
  let bad = 0;
  for (const f of readdirSync(a).filter(n => n.endsWith('.png'))) {
    const x = PNG.sync.read(readFileSync(join(a, f))), y = PNG.sync.read(readFileSync(join(b, f)));
    if (x.width !== y.width || x.height !== y.height) { console.log(`✗ ${f}: size ${x.width}x${x.height} → ${y.width}x${y.height}`); bad++; continue; }
    const n = pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0.05 });
    const pct = (n / (x.width * x.height) * 100);
    console.log(`${n === 0 ? '✓' : '·'} ${f}: ${n} px (${pct.toFixed(3)}%) changed`);
  }
  if (bad) process.exitCode = 1;
}

const port = (): Promise<number> => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => (typeof a === 'object' && a ? res(a.port) : rej(new Error('no port')))); }); });

/** The app frozen for a stable picture: no animation, no caret, no live clock. */
async function settle(page: Page): Promise<void> {
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function shoot(out: string): Promise<void> {
  mkdirSync(out, { recursive: true });
  const dir = mkdtempSync(join(tmpdir(), 'cv-theme-')); const p = await port(); const secret = 'theme-' + Date.now();
  const server = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, stdio: 'ignore', detached: true,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(p), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0',
      ANTHROPIC_API_KEY: 'sk-ant-stand-in-not-a-real-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', CV_DATA_DIR: dir } });
  try {
    const base = `http://127.0.0.1:${p}`;
    for (let i = 0; i < 160; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('t','t@t','x','Theme Check',1,?)`).run('2026-10-06T00:00:00.000Z'); db.close();
    const token = jwt.sign({ userId: 't', email: 't@t', emailVerified: true }, secret, { expiresIn: '1h' });
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.addInitScript(([t, th]) => {
        localStorage.setItem('auth_token', t); localStorage.setItem('sc-theme', th);
        localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1');
      }, [token, theme]);
      await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
      await settle(page); await page.screenshot({ path: join(out, `${theme}-1-home.png`) });
      await page.click('#new-costing-btn'); await settle(page);
      await page.screenshot({ path: join(out, `${theme}-2-picker.png`) });
      await page.click('.cpicker-tile[data-commodity="machining"]'); await settle(page);
      await page.evaluate(() => (document.getElementById('load-ref-btn') as HTMLButtonElement | null)?.click());
      await page.waitForTimeout(600);
      await page.click('#calc-btn'); await page.waitForSelector('.total-row', { timeout: 30_000 }); await settle(page);
      await page.screenshot({ path: join(out, `${theme}-3-result.png`) });
      await page.evaluate(() => (document.getElementById('cv-more-btn') as HTMLButtonElement | null)?.click()); await settle(page);
      await page.screenshot({ path: join(out, `${theme}-4-more-menu.png`) });
      await page.keyboard.press('Escape');
      await page.evaluate(() => (document.querySelector('.ctab[data-commodity="pcb_fab"]') as HTMLElement | null)?.click());
      await page.waitForSelector('#pcb-img-input-0', { state: 'attached', timeout: 15_000 });
      await page.evaluate(() => document.querySelector('.pcb-slots')?.scrollIntoView({ block: 'center' })); await settle(page);
      await page.screenshot({ path: join(out, `${theme}-5-pcb.png`) });
      await ctx.close();
    }
    await browser.close();
  } finally {
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args[0] === '--diff') diff(args[1], args[2]);
else await shoot(args[0] ?? 'theme-shots');
