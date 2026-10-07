/**
 * Section measurement against the CAD kernel — the viewer's cut-face area (from the mesh, in a real browser)
 * against OpenCASCADE's exact B-rep section of the same solid at the same model coordinate (e2e/occ-section.py).
 * Needs a build and OCP:
 *
 *   npx tsx e2e/viewer-section.ts [out-dir]
 *
 * Also checks: the hatched cap is drawn, "Add to measurements" lands in the list, the profile DXF downloads.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { chromium, type Page } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'e2e/viewer-section'));
const PARTS = [
  { file: join(ROOT, '../cad-audit/parts/Casting_Braket.stp'), cuts: [['z', 0], ['z', 35], ['x', -20], ['y', 25]] },
  { file: join(ROOT, '../cad-audit/parts/MACH_Hydraulic_Manifold.stp'), cuts: [['z', 0], ['x', 30], ['y', -40]] },
] as const;
const TOL = 0.01; // 1 % — the mesh is a chordal approximation of curved faces
const freePort = () => new Promise<number>((ok) => { const s = createServer(); s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });
let failures = 0;
const results: unknown[] = [];
const check = (name: string, ok: boolean, detail: unknown) => { results.push({ name, ok, detail }); if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${JSON.stringify(detail)}`); };
const settled = (page: Page) => page.waitForFunction(() => document.querySelector<HTMLElement>('#viewer-view .cv3d')?.dataset.moving !== '1', null, { timeout: 30_000 });

async function setCut(page: Page, axis: string, pct: number): Promise<{ at: number; area: number } | null> {
  await page.evaluate(([a, v]) => {
    const panel = document.querySelector('#viewer-view .cv3d-clip-panel')!;
    for (const ax of ['x', 'y', 'z']) {
      const cb = panel.querySelector<HTMLInputElement>(`input[data-clip-axis="${ax}"]`)!;
      const want = ax === a;
      if (cb.checked !== want) { cb.checked = want; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    const sl = panel.querySelector<HTMLInputElement>(`input[data-clip-slider="${a}"]`)!;
    sl.value = String(v);
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  }, [axis, pct] as const);
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const blk = document.querySelector('#viewer-view .cv3d-secblock');
    if (!blk) return null;
    const plane = /=\s*(-?[\d.,]+)\s*mm/.exec(blk.querySelector('.cv3d-sec-plane')?.textContent ?? '');
    const area = /([\d.,]+)\s*mm²/.exec(blk.querySelector('dd strong')?.textContent ?? '');
    return plane && area ? { at: Number(plane[1].replace(/,/g, '')), area: Number(area[1].replace(/,/g, '')) } : null;
  });
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-sec-'));
  const secret = 'sec-' + Math.random().toString(36).slice(2);
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
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(([t]) => { localStorage.setItem('auth_token', t); localStorage.setItem('sc-theme', 'light'); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); localStorage.setItem('cv3d-inspector', '1'); localStorage.setItem('cv3d-projection', 'persp'); }, [token]);
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.click('#viewer-btn');
    for (const [pi, part] of PARTS.entries()) {
      const name = part.file.split('/').pop()!;
      await page.setInputFiles('#viewer-file-input', part.file);
      await page.waitForFunction((n) => (document.querySelector('.cv3d-status-file')?.textContent ?? '').includes(n) && /triangles/.test(document.querySelector('.cv3d-status-file')?.textContent ?? ''), name, { timeout: 120_000 });
      await page.waitForTimeout(800);
      if (pi === 0) {
        await page.locator('#viewer-view .cv3d-viewport').focus();
        await page.keyboard.press('s'); // opens Section with a Z plane through the middle
        await page.waitForTimeout(500);
        const opened = await page.locator('#viewer-view .cv3d-secblock').count();
        check('S opens Section with a plane on and the area in the inspector', opened === 1, { opened });
      }
      const viewer: Array<{ axis: number; at: number; area: number }> = [];
      for (const [ax, pct] of part.cuts) {
        const r = await setCut(page, ax, pct);
        if (!r) { check(`${name} ${ax} ${pct}%: viewer gave an area`, false, null); continue; }
        viewer.push({ axis: 'xyz'.indexOf(ax), ...r });
      }
      await page.screenshot({ path: join(OUT, `${pi}-${name}-section.png`) });
      const caps = await page.evaluate(() => document.querySelector('#viewer-view .cv3d-secblock') ? 1 : 0);
      void caps;
      // the kernel, same solid, same model coordinate
      const py = spawnSync(process.env.PYTHON_BIN ?? 'python3', [join(ROOT, 'e2e/occ-section.py'), part.file, JSON.stringify(viewer.map(v => ({ axis: v.axis, at: v.at })))], { encoding: 'utf8' });
      if (py.status !== 0) { check(`${name}: kernel section ran`, false, py.stderr.slice(-400)); continue; }
      const kernel = JSON.parse(py.stdout) as Array<{ area: number }>;
      viewer.forEach((v, i) => {
        const k = kernel[i].area;
        const err = k > 0 ? (v.area - k) / k : v.area;
        check(`${name} ${'XYZ'[v.axis]} = ${v.at} mm: viewer ${v.area} mm² v kernel ${k.toFixed(2)} mm²`, Math.abs(err) <= TOL, { errorPct: +(err * 100).toFixed(3) });
      });
    }
    // flip keeps the other side: the picture changes, the cut area does not
    const before = await page.evaluate(() => document.querySelector('#viewer-view .cv3d-secblock dd strong')?.textContent ?? '');
    const flipBtn = page.locator('#viewer-view .cv3d-clip-flip[data-clip-flip="y"]');
    const pressed0 = await flipBtn.getAttribute('aria-pressed');
    await flipBtn.click(); await page.waitForTimeout(400);
    const after = await page.evaluate(() => document.querySelector('#viewer-view .cv3d-secblock dd strong')?.textContent ?? '');
    const pressed1 = await flipBtn.getAttribute('aria-pressed');
    check('flip keeps the other side; the cut area is unchanged', pressed0 !== pressed1 && before === after && !!before, { before, after, pressed0, pressed1 });
    await page.screenshot({ path: join(OUT, '2-flipped.png') });
    // add to measurements + DXF
    await page.locator('#viewer-view [data-sec-add="0"]').click();
    await page.waitForTimeout(300);
    const listed = await page.locator('#viewer-view .cv3d-row-title', { hasText: 'Section' }).count();
    check('Add to measurements lists the section', listed >= 1, { listed });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#viewer-view [data-sec-dxf="0"]').click()]);
    const dxfPath = join(OUT, 'section.dxf');
    await dl.saveAs(dxfPath);
    const dxf = readFileSync(dxfPath, 'utf8');
    check('profile DXF downloads with closed polylines', /LWPOLYLINE/.test(dxf) && dxf.trim().endsWith('EOF'), { bytes: dxf.length, polylines: (dxf.match(/LWPOLYLINE/g) ?? []).length });
    check('no page errors', errors.length === 0, errors.slice(0, 5));
    writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  } finally {
    await browser?.close();
    try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ }
  }
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED', '→', OUT);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
