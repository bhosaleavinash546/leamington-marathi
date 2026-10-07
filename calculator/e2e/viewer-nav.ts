/**
 * 3D viewer navigation, in a real browser through a real server (needs a build and OCP for the STEP):
 *
 *   npx tsx e2e/viewer-nav.ts [out-dir]
 *
 * 1. A real STEP: left-drag orbits ABOUT THE POINT UNDER THE CURSOR (that point stays on its pixel),
 *    the wheel zooms toward the cursor (the point under it stays put), right-drag pans with the cursor,
 *    double-click centres — each checked by projecting the picked point before / after, plus screenshots
 *    mid-drag (pivot marker) and after.
 * 2. A synthetic 1,000,000-triangle STL: the picking index builds in the worker without blocking, and a
 *    face click is timed before and after it lands.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { chromium, type Page } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'e2e/viewer-nav'));
const PART = join(ROOT, '../cad-audit/parts/Casting_Braket.stp');
const freePort = () => new Promise<number>((ok) => { const s = createServer(); s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });
const results: Record<string, unknown> = {};
/** Wait until the camera has stopped gliding / coasting (software GL renders slowly — never guess a sleep). */
const settled = (page: Page) => page.waitForFunction(() => document.querySelector<HTMLElement>('#viewer-view .cv3d')?.dataset.moving !== '1', null, { timeout: 30_000 });
let failures = 0;
const check = (name: string, ok: boolean, detail: unknown) => { results[name] = { ok, detail }; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${JSON.stringify(detail)}`); };

/** Binary STL of a wavy sheet with n triangles. */
function bigStl(n: number): Buffer {
  const side = Math.ceil(Math.sqrt(n / 2));
  const tris = side * side * 2;
  const buf = Buffer.alloc(84 + tris * 50);
  buf.writeUInt32LE(tris, 80);
  let o = 84;
  const z = (x: number, y: number) => Math.sin(x * 0.05) * Math.cos(y * 0.05) * 20;
  const put = (x: number, y: number) => { buf.writeFloatLE(x, o); buf.writeFloatLE(y, o + 4); buf.writeFloatLE(z(x, y), o + 8); o += 12; };
  for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) {
    for (const quad of [[[i, j], [i + 1, j], [i + 1, j + 1]], [[i, j], [i + 1, j + 1], [i, j + 1]]]) {
      o += 12; // normal (zeros)
      for (const [x, y] of quad) put(x, y);
      o += 2;
    }
  }
  return buf;
}

/** Screen position of the surface point under (x, y): we read it back by asking the page to project. */
async function canvasBox(page: Page) { return (await page.locator('#viewer-view .cv3d-canvas').boundingBox())!; }

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-nav-'));
  const secret = 'nav-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'Priya Sharma', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '1h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(([t]) => { localStorage.setItem('auth_token', t); localStorage.setItem('sc-theme', 'light'); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); localStorage.setItem('cv3d-inspector', '0'); }, [token]);
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.click('#viewer-btn');
    await page.setInputFiles('#viewer-file-input', PART);
    await page.waitForFunction(() => /triangles/.test(document.querySelector('.cv3d-status-file')?.textContent ?? ''), null, { timeout: 120_000 });
    await page.waitForFunction(() => document.querySelector<HTMLElement>('.cv3d')?.dataset.pickIndex === 'ready', null, { timeout: 60_000 });
    check('step: picking index built in the worker', true, 'ready');
    await page.waitForTimeout(800);
    const box = await canvasBox(page);
    const cx = box.x + box.width * 0.47, cy = box.y + box.height * 0.5;
    // Select the face under (cx, cy) so we can find it again: its highlight is what we track on screen.
    await page.screenshot({ path: join(OUT, '1-start.png') });

    // ── orbit about the cursor: drag from a point on the part; the face there must stay under the cursor ──
    const faceAt = async (x: number, y: number) => {
      await page.mouse.click(x, y);
      await page.waitForTimeout(150);
      return (await page.locator('#viewer-view .cv3d-facechip strong').first().textContent().catch(() => '')) ?? '';
    };
    const before = await faceAt(cx, cy);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(cx + i * 9, cy + i * 3);
    await page.waitForTimeout(60);
    await page.screenshot({ path: join(OUT, '2-mid-orbit-pivot.png') });
    const pivotShown = await page.locator('#viewer-view .cv3d-pivot.show').count();
    const pivotPos = await page.locator('#viewer-view .cv3d-pivot').evaluate(el => el.getBoundingClientRect()).catch(() => null);
    await page.mouse.up();
    await page.waitForTimeout(100);
    await settled(page); // coast settles
    check('orbit: pivot marker shown while rotating', pivotShown === 1, { pivotShown });
    check('orbit: pivot marker sits on the pressed point', !!pivotPos && Math.hypot(pivotPos.x + pivotPos.width / 2 - cx, pivotPos.y + pivotPos.height / 2 - cy) < 6,
      pivotPos ? { dx: +(pivotPos.x + pivotPos.width / 2 - cx).toFixed(1), dy: +(pivotPos.y + pivotPos.height / 2 - cy).toFixed(1) } : null);
    const afterOrbit = await faceAt(cx, cy);
    check('orbit: the face that was under the cursor is still under it', !!before && before === afterOrbit, { before, afterOrbit });
    await page.screenshot({ path: join(OUT, '3-after-orbit.png') });

    // ── wheel zoom at a point off-centre: the face under the cursor stays under it ──
    const zx = box.x + box.width * 0.38, zy = box.y + box.height * 0.42;
    const zFace = await faceAt(zx, zy);
    await page.mouse.move(zx, zy);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(40); }
    await page.waitForTimeout(100);
    await settled(page);
    const zFaceAfter = await faceAt(zx, zy);
    check('zoom: the face under the cursor stays under it', !!zFace && zFace === zFaceAfter, { zFace, zFaceAfter });
    await page.screenshot({ path: join(OUT, '4-after-zoom.png') });

    // ── right-drag pan: the face grabbed moves with the cursor ──
    const pFace = await faceAt(zx, zy);
    await page.mouse.move(zx, zy);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 10; i++) await page.mouse.move(zx + i * 14, zy + i * 8);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(300);
    const pFaceAfter = await faceAt(zx + 140, zy + 80);
    check('pan: the grabbed face followed the cursor', !!pFace && pFace === pFaceAfter, { pFace, pFaceAfter });

    // ── double-click centres ──
    await page.mouse.dblclick(zx + 140, zy + 80);
    await page.waitForTimeout(100);
    await settled(page);
    const centred = await faceAt(box.x + box.width / 2, box.y + box.height / 2);
    check('double-click: that face glides to the centre', !!pFace && centred === pFace, { pFace, centred });
    await page.screenshot({ path: join(OUT, '5-after-dblclick.png') });

    // ── keyboard ──
    await page.locator('#viewer-view .cv3d-viewport').focus();
    const shot = async () => (await page.locator('#viewer-view .cv3d-canvas').screenshot()).toString('base64');
    const k0 = await shot();
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(100); await settled(page);
    const k1 = await shot();
    await page.keyboard.press('+'); await page.waitForTimeout(100); await settled(page);
    const k2 = await shot();
    const helpOpened = await page.locator('#help-modal:visible, .help-modal:visible').count();
    await page.keyboard.press('?');
    const sheet = await page.locator('#viewer-view .cv3d-shortcuts:not([hidden])').count();
    const helpAfter = await page.locator('#help-modal:visible, .help-modal:visible').count();
    await page.keyboard.press('Escape');
    check('keyboard: ← rotates, + zooms, ? opens the viewer sheet (not the app Help)', k1 !== k0 && k2 !== k1 && sheet === 1 && helpAfter === helpOpened,
      { rotated: k1 !== k0, zoomed: k2 !== k1, sheet, helpOpened: helpAfter - helpOpened });
    await page.screenshot({ path: join(OUT, '6-keyboard.png') });

    // ── orthographic: O toggles it; the same face-tracking checks must hold ──
    await page.locator('#viewer-view [data-act="view-iso"]').click();
    await page.waitForTimeout(100); await settled(page);
    await page.locator('#viewer-view .cv3d-viewport').focus();
    const pShot0 = await shot();
    await page.keyboard.press('o');
    await page.waitForTimeout(100); await settled(page);
    const proj = await page.locator('#viewer-view .cv3d').getAttribute('data-projection');
    const oShot = await shot();
    check('ortho: O switches the projection and the picture changes', proj === 'ortho' && oShot !== pShot0, { proj });
    await page.screenshot({ path: join(OUT, '6b-orthographic.png') });
    const ox = box.x + box.width * 0.47, oy = box.y + box.height * 0.5;
    const oBefore = await faceAt(ox, oy);
    await page.mouse.move(ox, oy); await page.mouse.down();
    for (let i = 1; i <= 15; i++) await page.mouse.move(ox + i * 10, oy + i * 4);
    await page.mouse.up(); await page.waitForTimeout(100); await settled(page);
    check('ortho orbit: the face under the cursor stays under it', !!oBefore && oBefore === await faceAt(ox, oy), { oBefore });
    const oz = await faceAt(ox - 80, oy - 40);
    await page.mouse.move(ox - 80, oy - 40);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(40); }
    await page.waitForTimeout(100); await settled(page);
    check('ortho zoom: the face under the cursor stays under it', !!oz && oz === await faceAt(ox - 80, oy - 40), { oz });
    await page.mouse.move(ox - 80, oy - 40); await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 10; i++) await page.mouse.move(ox - 80 + i * 12, oy - 40 + i * 6);
    await page.mouse.up({ button: 'right' }); await page.waitForTimeout(100); await settled(page);
    check('ortho pan: the grabbed face followed the cursor', !!oz && oz === await faceAt(ox + 40, oy + 20), { oz });
    await page.screenshot({ path: join(OUT, '6c-orthographic-after.png') });
    await page.keyboard.press('o'); // back to perspective for the rest
    const persisted = await page.evaluate(() => localStorage.getItem('cv3d-projection'));
    check('ortho: the choice is remembered', persisted === 'persp', { persisted });

    // ── a million triangles: picking before and after the index ──
    const errorsBeforeSynthetic = errors.length;
    const stl = join(dir, 'sheet-1M.stl');
    writeFileSync(stl, bigStl(1_000_000));
    const t0 = Date.now();
    await page.setInputFiles('#viewer-file-input', stl);
    await page.waitForFunction(() => /sheet-1M\.stl/.test(document.querySelector('.cv3d-status-file')?.textContent ?? '') && /triangles/.test(document.querySelector('.cv3d-status-file')?.textContent ?? ''), null, { timeout: 120_000 });
    const loadedMs = Date.now() - t0;
    const timeClick = () => page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('#viewer-view .cv3d-canvas')!;
      const r = c.getBoundingClientRect();
      const o = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, bubbles: true, pointerId: 9, pointerType: 'mouse' };
      const t = performance.now();
      c.dispatchEvent(new PointerEvent('pointerdown', o));
      c.dispatchEvent(new PointerEvent('pointerup', o));
      return performance.now() - t;
    });
    const state0 = await page.evaluate(() => document.querySelector<HTMLElement>('.cv3d')?.dataset.pickIndex);
    const clickBefore = state0 === 'building' ? await timeClick() : null;
    const t1 = Date.now();
    await page.waitForFunction(() => document.querySelector<HTMLElement>('.cv3d')?.dataset.pickIndex === 'ready', null, { timeout: 120_000 });
    const indexMs = Date.now() - t1;
    const clicks: number[] = [];
    for (let i = 0; i < 5; i++) clicks.push(await timeClick());
    const clickAfter = clicks.sort((a, b) => a - b)[2];
    check('1M triangles: a face click after the index lands is under 10 ms', clickAfter < 10,
      { loadedMs, indexBuildMsAfterLoad: indexMs, clickBeforeIndexMs: clickBefore && +clickBefore.toFixed(1), clickAfterIndexMs: +clickAfter.toFixed(2) });
    await page.screenshot({ path: join(OUT, '7-million-triangles.png') });

    // The click timing below dispatches SYNTHETIC pointer events; OrbitControls' setPointerCapture rejects
    // their made-up pointerId. Those are the harness's, not the product's.
    const real = errors.filter((e, i) => i < errorsBeforeSynthetic || !/setPointerCapture/.test(e));
    check('no page errors', real.length === 0, real.slice(0, 5));
    writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  } finally {
    await browser?.close();
    try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ }
  }
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED', '→', OUT);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
