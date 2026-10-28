/**
 * STL DFM against the kernel, on the same real parts.
 *
 * Each STEP in the list is measured by the geometry kernel with the DFM feature pass (the truth the STEP path uses),
 * exported to STL at two tessellations (the viewer's 17° and a coarser 29° CAD export) and read by
 * `extractMeshFeatures`. Then, side by side: holes and bosses (matched on axis line and diameter — through / blind and
 * depth compared), concave fillets (corner radii), the draw direction, undercut faces — and the DFM FINDINGS each
 * feature set produces through the same rule pack, which is what an engineer sees. Needs OCP.
 *
 *   npx tsx scripts/stl-dfm-validate.ts [out.json]
 *   npx tsx scripts/stl-dfm-validate.ts --fixtures tests/fixtures/stl-dfm
 *     writes the viewer-tessellation STL of the FIXTURE_PARTS and the kernel's features for each (holes, bosses,
 *     undercut count, findings by rule) — what tests/stl-dfm.test.ts holds the mesh pass to, with no kernel.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, isAbsolute, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeGeometry, applyShellWallCorrectionToFeatures } from '../server/utils/geometry-bridge.js';
import { geometryPool } from '../server/utils/geometry-pool.js';
import { readStlTriangles, extractMeshFeatures } from '../server/utils/mesh-features.js';
import { analyseGeometricDFM } from '../src/engine/dfm-geometry/index.js';
import type { ManufacturingFeature, ManufacturingFeatureSet } from '../src/engine/ai-analysis.js';
import type { CommodityType } from '../src/engine/types.js';

const PARTS = resolve(import.meta.dirname, '..', '..', 'cad-audit', 'parts');
const CASES: Array<{ file: string; commodity: CommodityType; family: string }> = [
  { file: 'MACH_Hydraulic_Manifold.stp', commodity: 'machining', family: 'aluminium' },
  { file: 'Part1.stp', commodity: 'machining', family: 'aluminium' },
  { file: 'MACH_Stepped_Shaft.stp', commodity: 'machining', family: 'steel' },
  { file: 'Casting_Braket.stp', commodity: 'cast_and_machine', family: 'steel' },
  { file: 'PRCR002.stp', commodity: 'cast_and_machine', family: 'cast iron' },
  { file: 'steering_knuckle_RH.stp', commodity: 'forging', family: 'steel' },
  { file: 'FORGE_Hub_Flange.stp', commodity: 'forging', family: 'steel' },
  { file: 'IM_ECU_Cover.stp', commodity: 'injection_moulding', family: 'plastic' },
  { file: 'IM_Cable_Clip.stp', commodity: 'injection_moulding', family: 'plastic' },
  { file: 'Seat_Locking_Bracket.stp', commodity: 'sheet_metal', family: 'steel' },
  // more parts, e.g. the sprocket from scripts/sprocket-fixture.py: CV_STL_EXTRA="/abs/a.step:machining:steel,…"
  ...(process.env.CV_STL_EXTRA ?? '').split(',').filter(Boolean).map(e => {
    const [file, commodity, family] = e.split(':');
    return { file, commodity: commodity as CommodityType, family };
  }),
];
const MESHES: Array<[string, string, string]> = [['viewer 17°', 'diag/500', '0.3'], ['coarse 29°', 'diag/500', '0.5']];

const cyl = (fs: ManufacturingFeatureSet, kind: ManufacturingFeature['kind']) => fs.features.filter(f => f.kind === kind);
/** Same feature: parallel axes, the axis lines within 5 % of the diameter (min 0.1 mm), same diameter within 1 % (min 0.05 mm). */
function sameCyl(a: ManufacturingFeature, b: ManufacturingFeature): boolean {
  const da = a.diaMm ?? 2 * (a.radiusMm ?? 0), db = b.diaMm ?? 2 * (b.radiusMm ?? 0);
  if (!(da > 0 && db > 0) || Math.abs(da - db) > Math.max(0.01 * da, 0.05)) return false;
  const ax = a.axis!, bx = b.axis!;
  if (Math.abs(ax[0] * bx[0] + ax[1] * bx[1] + ax[2] * bx[2]) < 0.999) return false;
  const d = [b.positionMm![0] - a.positionMm![0], b.positionMm![1] - a.positionMm![1], b.positionMm![2] - a.positionMm![2]];
  const along = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2];
  const perp = Math.sqrt(Math.max(0, d[0] ** 2 + d[1] ** 2 + d[2] ** 2 - along * along));
  return perp <= Math.max(0.05 * da, 0.1);
}
function match(ref: ManufacturingFeature[], got: ManufacturingFeature[]) {
  const used = new Set<number>();
  const pairs: Array<[ManufacturingFeature, ManufacturingFeature]> = [];
  const missed: ManufacturingFeature[] = [];
  for (const r of ref) {
    const i = got.findIndex((g, k) => !used.has(k) && sameCyl(r, g));
    if (i >= 0) { used.add(i); pairs.push([r, got[i]]); } else missed.push(r);
  }
  return { pairs, missed, extra: got.filter((_, k) => !used.has(k)) };
}
const findingsByRule = (fs: ManufacturingFeatureSet, c: CommodityType, family: string) => {
  const r = analyseGeometricDFM({ commodity: c, featureSet: fs, materialFamily: family, medianWallMm: fs.medianThicknessMm ?? null });
  const by: Record<string, number> = {};
  for (const f of r.findings ?? []) by[f.ruleId] = (by[f.ruleId] ?? 0) + 1;
  return by;
};

/** Small parts (≤ 160 kB of STL each) whose mesh features match the kernel's: the fixtures the unit test pins. */
/** The sprocket (tooth seats = concave cylinders of less than a turn) comes from scripts/sprocket-fixture.py via CV_STL_EXTRA. */
const FIXTURE_PARTS = ['MACH_Hydraulic_Manifold.stp', 'FORGE_Hub_Flange.stp', 'IM_ECU_Cover.stp', 'Sprocket_ANSI40_18T.step'];

async function writeFixtures(dir: string) {
  mkdirSync(dir, { recursive: true });
  for (const c of CASES.filter(k => FIXTURE_PARTS.includes(basename(k.file)))) {
    const step = isAbsolute(c.file) ? c.file : join(PARTS, c.file);
    const geo = await analyzeGeometry(readFileSync(step), basename(c.file), undefined, { CV_EXTRACT_FEATURES: '1' });
    const ref = geo.manufacturingFeatures!;
    const stem = basename(c.file).replace(/\.ste?p$/i, '');
    const [, lin, ang] = MESHES[0];
    execFileSync('python3', [join(import.meta.dirname, 'stl-export.py'), step, join(dir, `${stem}.stl`), lin, ang], { stdio: 'pipe' });
    const pick = (f: ManufacturingFeature) => ({ diaMm: f.diaMm, axis: f.axis, positionMm: f.positionMm, depthMm: f.depthMm, openEnds: f.openEnds });
    const pickFillet = (f: ManufacturingFeature) => ({ radiusMm: f.radiusMm, sweepDeg: f.sweepDeg, axis: f.axis, positionMm: f.positionMm });
    writeFileSync(join(dir, `${stem}.kernel.json`), JSON.stringify({
      source: `${basename(c.file)}: geometry kernel with CV_EXTRACT_FEATURES=1, ${new Date().toISOString().slice(0, 10)}; STL ${lin} / ${ang} rad (scripts/stl-export.py)`,
      commodity: c.commodity, family: c.family,
      holes: cyl(ref, 'hole').map(pick), bosses: cyl(ref, 'boss').map(pick),
      concaveFillets: cyl(ref, 'fillet').filter(f => f.concave).map(pickFillet),
      undercuts: ref.features.filter(f => f.draftClass === 'undercut').length,
      drawDirectionXYZ: ref.drawDirectionXYZ,
      findingsByRule: findingsByRule(ref, c.commodity, c.family),
    }, null, 1) + '\n');
    console.log(`  ${stem}: ${cyl(ref, 'hole').length} holes, ${cyl(ref, 'boss').length} bosses`);
  }
  geometryPool().shutdown();
}

async function main() {
  const fx = process.argv.indexOf('--fixtures');
  if (fx > 0) return writeFixtures(process.argv[fx + 1]);
  const tmp = mkdtempSync(join(tmpdir(), 'stl-dfm-'));
  const report: Array<Record<string, unknown>> = [];
  for (const c of CASES) {
    if (process.env.CV_STL_ONLY && !c.file.includes(process.env.CV_STL_ONLY)) continue;
    const step = isAbsolute(c.file) ? c.file : join(PARTS, c.file);
    const geo = await analyzeGeometry(readFileSync(step), basename(c.file), undefined, { CV_EXTRACT_FEATURES: '1' });
    const ref = geo.manufacturingFeatures;
    if (!ref?.available) { console.log(`${c.file}: kernel gave no features (${ref?.note ?? geo.error})`); continue; }
    const refRules = findingsByRule(ref, c.commodity, c.family);
    console.log(`\n## ${c.file} (${c.commodity}) — kernel: ${cyl(ref, 'hole').length} holes, ${cyl(ref, 'boss').length} bosses, `
      + `${cyl(ref, 'fillet').filter(f => f.concave).length} concave fillets, ${cyl(ref, 'planar_face').length} planes, draw ${JSON.stringify(ref.drawDirectionXYZ)}`);
    for (const [label, lin, ang] of MESHES) {
      const stl = join(tmp, `${basename(c.file)}.${ang}.stl`);
      execFileSync('python3', [join(import.meta.dirname, 'stl-export.py'), step, stl, lin, ang], { stdio: 'pipe' });
      const res = extractMeshFeatures(readStlTriangles(readFileSync(stl)));
      const fs = res.featureSet;
      // the STEP path's own thickness clean-up (0.3–3 × 2·V/S), as the DFM job applies it
      applyShellWallCorrectionToFeatures({ status: 'success', manufacturingFeatures: fs, volume: { mm3: res.volumeMm3, cm3: res.volumeMm3 / 1000 },
        surfaceArea: { mm2: res.surfaceMm2, cm2: res.surfaceMm2 / 100 } } as never, null);
      const holes = match(cyl(ref, 'hole'), cyl(fs, 'hole'));
      const bosses = match(cyl(ref, 'boss'), cyl(fs, 'boss'));
      const fil = match(cyl(ref, 'fillet').filter(f => f.concave), cyl(fs, 'fillet').filter(f => f.concave));
      const thru = holes.pairs.filter(([a, b]) => a.openEnds !== undefined && b.openEnds !== undefined);
      const thruAgree = thru.filter(([a, b]) => a.openEnds === b.openEnds).length;
      const depthErr = holes.pairs.map(([a, b]) => Math.abs((a.depthMm ?? 0) - (b.depthMm ?? 0)));
      const uc = (s: ManufacturingFeatureSet) => s.features.filter(f => f.draftClass === 'undercut').length;
      const rules = findingsByRule(fs, c.commodity, c.family);
      const ruleIds = [...new Set([...Object.keys(refRules), ...Object.keys(rules)])].sort();
      const ruleDiff = ruleIds.filter(r => (refRules[r] ?? 0) !== (rules[r] ?? 0)).map(r => `${r} ${refRules[r] ?? 0}→${rules[r] ?? 0}`);
      const row = {
        part: c.file, mesh: label, triangles: res.stats.triangles, ms: res.stats.ms,
        holes: `${holes.pairs.length}/${cyl(ref, 'hole').length} matched, ${holes.extra.length} extra`,
        bosses: `${bosses.pairs.length}/${cyl(ref, 'boss').length}, ${bosses.extra.length} extra`,
        concaveFillets: `${fil.pairs.length}/${cyl(ref, 'fillet').filter(f => f.concave).length}, ${fil.extra.length} extra`,
        throughBlind: `${thruAgree}/${thru.length} agree`,
        maxDepthErrMm: depthErr.length ? Math.max(...depthErr).toFixed(2) : '—',
        draw: JSON.stringify(fs.drawDirectionXYZ) === JSON.stringify(ref.drawDirectionXYZ) ? 'same' : `${JSON.stringify(fs.drawDirectionXYZ)} v ${JSON.stringify(ref.drawDirectionXYZ)}`,
        undercuts: `${uc(fs)} v ${uc(ref)}`,
        planes: `${cyl(fs, 'planar_face').length} v ${cyl(ref, 'planar_face').length}`,
        findings: `${Object.values(rules).reduce((a, b) => a + b, 0)} v ${Object.values(refRules).reduce((a, b) => a + b, 0)}`,
        ruleDiff,
        missedHoles: holes.missed.map(h => `Ø${h.diaMm}×${h.depthMm}`),
        extraHoles: holes.extra.map(h => `Ø${h.diaMm}×${h.depthMm}`),
      };
      report.push(row);
      console.log(`  ${label.padEnd(11)} ${String(res.stats.triangles).padStart(7)} tris ${String(res.stats.ms).padStart(5)} ms | holes ${row.holes} | bosses ${row.bosses} | fillets ${row.concaveFillets} | thru ${row.throughBlind} | Δdepth ${row.maxDepthErrMm} | draw ${row.draw} | planes ${row.planes} | undercuts ${row.undercuts} | findings ${row.findings}${ruleDiff.length ? ` | Δ ${ruleDiff.join(', ')}` : ''}`);
      if (row.missedHoles.length || row.extraHoles.length) console.log(`             missed ${row.missedHoles.join(' ')} | extra ${row.extraHoles.join(' ')}`);
      const hist = (fs2: ManufacturingFeatureSet) => { const h: Record<string, number> = {}; for (const f of cyl(fs2, 'fillet').filter(f => f.concave)) { const k = `r${(f.radiusMm ?? 0).toFixed(1)}`; h[k] = (h[k] ?? 0) + 1; } return Object.entries(h).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' '); };
      if (process.env.CV_STL_SWEEPS) for (const [a, b] of fil.pairs) console.log(`             fillet r${a.radiusMm}: sweep ${a.sweepDeg}° (STEP) v ${b.sweepDeg}° (STL)`);
      if (fil.extra.length > 5) console.log(`             concave fillet radii — STL: ${hist(fs)} | STEP: ${hist(ref)}`);
    }
  }
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 1));
  geometryPool().shutdown();
}
main().catch(e => { console.error(e); geometryPool().shutdown(); process.exit(1); });
