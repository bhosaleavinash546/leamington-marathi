/**
 * The DFM review pack — findings a manufacturing engineer can actually judge.
 *
 * Nineteen rules, six packs, 1,675 tests, and not one finding checked by a
 * manufacturing engineer. The tests say the arithmetic is right; they say
 * nothing about whether the findings are TRUE.
 *
 * The markdown sheet had the right content and the wrong form. A finding read:
 *
 *   Faces: 1, 4, 9, 12, 18, 19, 22, 23, 31, 32, 33, 34, 46, 47, 48, ... (60 total)
 *
 * Nobody can judge that without opening the CAD, and a review that costs an
 * afternoon in CAD does not happen. One image per issue, with the offending
 * faces highlighted, is what turns it into a ten-minute job.
 *
 * The kernel already emits exactly what that needs: `tessellateToSTL(...,
 * { withMeta: true })` returns the mesh plus `triFace`, the source B-rep face
 * of every triangle — the same face ids a finding carries. That was the point
 * of building findings that way.
 *
 *   npx tsx scripts/dfm-review-pack.ts
 */
import { readFile, writeFile, mkdir, copyFile, rm, readdir, access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import XLSX from 'xlsx';
import { analyzeGeometry, tessellateToSTL } from '../server/utils/geometry-bridge.js';
import { analyseGeometricDFM } from '../src/engine/dfm-geometry/index.js';
import type { GroupedFinding } from '../src/engine/dfm-geometry/index.js';
import { REVIEW_PARTS, type ReviewPart } from './dfm-review-parts.js';

const OUT_DIR = process.env.CV_PACK_OUT ?? '/tmp/dfm-review-pack';
const RATES = { annualVolume: 50_000, machineRatePerHr: 60, labourRatePerHr: 25 };

interface IssueRow {
  part: string; commodity: string; manualCost: string;
  idx: number; ruleId: string; severity: string; title: string;
  count: number; measured: string; threshold: string;
  costGBP: number; costBasis: string;
  source: string; recommendation: string;
  faceIds: number[]; imageFile: string | null; imageNote: string;
}

const log = (m: string) => process.stdout.write(`[pack] ${m}\n`);

/** Serve a directory over loopback so the harness can fetch the mesh. */
function serveDir(dir: string): Promise<{ url: string; close: () => void }> {
  const types: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript',
    '.json': 'application/json', '.stl': 'application/octet-stream',
  };
  return new Promise(resolve => {
    const srv = createServer(async (req, res) => {
      const name = (req.url ?? '/').split('?')[0].replace(/^\/+/, '') || 'index.html';
      // Chromium always asks for one; logging it as a 404 makes a clean run look
      // broken, and a real missing asset then gets lost in the noise.
      if (name === 'favicon.ico') { res.writeHead(204); res.end(); return; }
      try {
        const body = await readFile(join(dir, name));
        res.writeHead(200, { 'Content-Type': types[extname(name)] ?? 'application/octet-stream' });
        res.end(body);
      } catch { log(`  404 ${name}`); res.writeHead(404); res.end('not found'); }
    });
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => srv.close() });
    });
  });
}

/**
 * Find a launchable Chromium.
 *
 * `PLAYWRIGHT_CHROMIUM_PATH` wins, as it does in `e2e/smoke.ts`. Otherwise scan
 * Playwright's own browser directory: this host ships a pre-installed Chromium
 * whose build number does not match the one the installed `playwright` package
 * expects, so the default launch looks for a revision that is not there. We do
 * NOT fall back to `/usr/bin/chromium` — on some hosts that is a snap stub that
 * fails to launch, which is a worse failure than an explicit one.
 */
async function resolveChromium(): Promise<string | undefined> {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root) return undefined;
  let entries: string[];
  try { entries = await readdir(root); } catch { return undefined; }
  const candidates = entries
    .filter(e => e.startsWith('chromium-'))               // full build, not headless_shell
    .sort()
    .reverse()
    .map(e => join(root, e, 'chrome-linux', 'chrome'));
  for (const c of candidates) {
    try { await access(c); return c; } catch { /* next */ }
  }
  return undefined;
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const executablePath = await resolveChromium();
  log(executablePath ? `browser ${executablePath}` : 'browser: Playwright bundled');
  const browser = await chromium.launch({
    executablePath,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const rows: IssueRow[] = [];
  const partMeta: Array<{ part: ReviewPart; issues: GroupedFinding[]; limitations: string[];
    total: number; features: number }> = [];

  // CV_PACK_ONLY=knuckle,bumper limits the run while iterating — a full pass is
  // six OCCT runs and takes several minutes.
  const only = (process.env.CV_PACK_ONLY ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const parts = only.length ? REVIEW_PARTS.filter(p => only.includes(p.slug)) : REVIEW_PARTS;

  for (const p of parts) {
    log(`${p.name} (${p.commodity})`);
    const buf = await readFile(p.file);

    const geo = await analyzeGeometry(buf, basename(p.file), 600_000, { CV_EXTRACT_FEATURES: '1' });
    if (geo.status !== 'success') { log(`  kernel error: ${geo.error}`); continue; }
    const mf = geo.manufacturingFeatures;

    const r = analyseGeometricDFM({
      commodity: p.commodity,
      featureSet: mf ?? { available: false, features: [], note: 'no feature set' },
      bboxMm: geo.boundingBox
        ? { x: geo.boundingBox.xMm, y: geo.boundingBox.yMm, z: geo.boundingBox.zMm } : undefined,
      medianWallMm: mf?.medianThicknessMm ?? null,
      materialFamily: p.materialFamily, process: p.process,
      cost: RATES,
    });
    partMeta.push({ part: p, issues: r.grouped, limitations: r.limitations,
      total: r.totalAddressableGBP ?? 0, features: mf?.features.length ?? 0 });

    // ── Render one image per grouped issue ──────────────────────────────────
    const tess = await tessellateToSTL(buf, basename(p.file), { withMeta: true, timeoutMs: 600_000 });
    let render: ((ids: number[], focus: number[]) => Promise<{
      dataUrl: string; highlightedTriangles: number;
      triCount: number; cutaway: boolean; visible: number[];
    }>) | null = null;
    let server: { url: string; close: () => void } | null = null;
    let page = null;

    if (tess.status === 'success' && tess.meta?.triFace?.length) {
      const work = join(tmpdir(), `cv-render-${randomBytes(6).toString('hex')}`);
      await mkdir(work, { recursive: true });
      await copyFile('scripts/dfm-render-harness.html', join(work, 'index.html'));
      // three.module.js re-exports from three.core.js — copying only the entry
      // point gives a 404 the page reports as a bare "resource failed to load".
      for (const f of ['three.module.js', 'three.core.js']) {
        await copyFile(`node_modules/three/build/${f}`, join(work, f));
      }
      await writeFile(join(work, 'mesh.stl'), tess.stl);
      await writeFile(join(work, 'payload.json'), JSON.stringify({ triFace: tess.meta.triFace }));
      server = await serveDir(work);
      page = await browser.newPage({ viewport: { width: 1280, height: 620 } });
      // A module-script failure in the harness is otherwise invisible: the page
      // loads, `__ready` never appears, and the wait dies with a bare timeout.
      page.on('pageerror', e => log(`  [harness] ${e.message}`));
      page.on('console', m => { if (m.type() === 'error') log(`  [harness] ${m.text()}`); });
      await page.goto(server.url, { waitUntil: 'load' });
      // waitForFunction's SECOND argument is the page-function's arg, not the
      // options bag — passing options there silently leaves the default 30 s.
      await page.waitForFunction('window.__ready === true', undefined, { timeout: 180_000 });
      render = (ids, focus) => page!.evaluate(
        `window.__render(${JSON.stringify(ids)}, ${JSON.stringify(focus)})`) as never;
      log(`  mesh ${tess.triangles} triangles — rendering ${r.grouped.length} issue(s)`);
    } else {
      log(`  no mesh/triFace — issues will be text-only`);
    }

    for (let i = 0; i < r.grouped.length; i++) {
      const g = r.grouped[i];
      let imageFile: string | null = null;
      let imageNote = '';
      if (!g.faceIds.length) {
        // The blow wall/sag findings are part-level and genuinely have no faces.
        // Say so, or a missing image reads as a rendering failure.
        imageNote = 'Part-level finding — applies to the whole part, not to specific faces.';
      } else if (!render) {
        imageNote = 'Mesh unavailable for this part, so no image could be rendered.';
      } else {
        const out = await render(g.faceIds, g.worst.faceIds);
        if (out.highlightedTriangles === 0) {
          // Refuse to ship a picture of an unmarked part next to a finding.
          imageNote = `The ${g.faceIds.length} face(s) produced no triangles in the mesh — the `
            + 'mesher skipped them, so they cannot be shown.';
        } else {
          const f = `${p.slug}-${i + 1}.png`;
          await writeFile(join(OUT_DIR, f),
            Buffer.from(out.dataUrl.split(',')[1], 'base64'));
          imageFile = f;
          log(`    #${i + 1} ${g.ruleId}: ${out.highlightedTriangles} tri red, `
            + `visible px [${out.visible.join(', ')}]${out.cutaway ? ' (cut-away)' : ''}`);
          const seen = out.visible.reduce((a, b) => a + b, 0);
          const cut = out.cutaway
            ? 'Right-hand view is a CUT-AWAY: the material between the camera and the feature is '
              + 'removed, because the feature is on an internal surface. '
            : '';
          if (seen < 40) {
            // The faces are real and meshed; the part hides them. Say so, or an
            // unmarked picture reads as "the tool found nothing here".
            imageNote = cut + 'The faces are inside the part and stayed hidden even so — nothing '
              + 'red is visible. Judge this one from the numbers, not the picture.';
          } else if (seen < 600) {
            // 43 red pixels on a 1.4 m bumper is a true picture of a tiny face,
            // and it still looks like a printing artefact unless we say why.
            imageNote = cut + `The feature is very small at part scale — ${out.highlightedTriangles} `
              + `of the mesh's ${out.triCount.toLocaleString()} triangles carry it, so it reads as a `
              + 'few red pixels even zoomed in.';
          } else if (cut) {
            imageNote = cut.trim();
          }
        }
      }

      rows.push({
        part: p.name, commodity: p.commodity, manualCost: p.manualCost,
        idx: i + 1, ruleId: g.ruleId, severity: g.severity, title: g.title,
        count: g.count,
        measured: g.count > 1
          ? `${g.worst.measured.field} ${g.range.min}–${g.range.max}${g.range.unit}`
          : `${g.worst.measured.field} ${g.range.min}${g.range.unit}`,
        threshold: `${g.threshold.comparator} ${g.threshold.value}${g.threshold.unit}`,
        costGBP: g.totalCostGBP ?? 0,
        costBasis: g.instances?.[0]?.costImpact?.basis
          ?? g.instances?.[0]?.costNotModelled ?? '',
        source: g.source.clause ? `${g.source.standard} — ${g.source.clause}` : g.source.standard,
        recommendation: g.recommendation,
        faceIds: g.faceIds, imageFile, imageNote,
      });
    }
    if (page) await page.close();
    server?.close();
  }
  await browser.close();

  // ── The marking sheet ────────────────────────────────────────────────────
  const header = ['Part', 'Commodity', '#', 'Severity', 'Issue', 'Instances', '£/part',
    'Measured', 'Threshold', 'Source', 'Suggested fix', 'MARK (T/F/N)', 'Comment',
    'What was MISSED on this part'];
  const aoa: (string | number)[][] = [header];
  for (const r of rows) {
    aoa.push([r.part, r.commodity, r.idx, r.severity, r.title, r.count,
      r.costGBP > 0 ? Number(r.costGBP.toFixed(4)) : '', r.measured, r.threshold,
      r.source, r.recommendation, '', '', '']);
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 4 }, { wch: 10 }, { wch: 44 }, { wch: 10 },
    { wch: 9 }, { wch: 26 }, { wch: 13 }, { wch: 46 }, { wch: 60 }, { wch: 13 }, { wch: 34 },
    { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Findings');

  const guide = XLSX.utils.aoa_to_sheet([
    ['How to mark'],
    [''],
    ['T', 'TRUE — a real issue, worth raising with the supplier or the designer.'],
    ['F', 'FALSE — wrong, or not a real issue on this part.'],
    ['N', 'NOISE — technically true but not worth an engineer\'s time.'],
    [''],
    ['A rule that collects an F is a candidate for DELETION, not tuning.'],
    ['A false positive costs more trust than a missed finding, so the F column is the one that matters.'],
    ['An N means the threshold is wrong, or the rule should drop to advisory.'],
    [''],
    ['Please also fill "What was MISSED" — anything the tool should have caught and did not.'],
    ['That column becomes the next rule backlog.'],
  ]);
  guide['!cols'] = [{ wch: 6 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, guide, 'How to mark');
  XLSX.writeFile(wb, join(OUT_DIR, 'CostVision-DFM-Review-Marks.xlsx'));

  // Data for the PDF builder — kept separate so the Python side does no logic.
  await writeFile(join(OUT_DIR, 'pack.json'), JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    parts: partMeta.map(m => ({
      name: m.part.name, commodity: m.part.commodity, process: m.part.process ?? '',
      manualCost: m.part.manualCost, file: basename(m.part.file),
      features: m.features, totalGBP: m.total, limitations: m.limitations,
      issues: rows.filter(r => r.part === m.part.name),
    })),
  }, null, 2));

  const withImg = rows.filter(r => r.imageFile).length;
  log(`\n${rows.length} issue(s) across ${partMeta.length} part(s); ${withImg} with an image`);
  log(`out: ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
