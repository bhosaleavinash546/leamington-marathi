/**
 * Geometric DFM on an STL (server/utils/mesh-features.ts): the faces a mesh hides are recovered and the kernel's feature
 * definitions run on them, so a part uploaded as STL gets the same rule pack as a STEP.
 *
 *  - synthetic solids whose answer is known by construction (a tube, a straight fillet, a revolved root round, a tube
 *    too coarse to read);
 *  - three real parts and a modelled sprocket tessellated as the viewer does, against the KERNEL's own features for the same STEP, recorded by
 *    `npx tsx scripts/stl-dfm-validate.ts --fixtures tests/fixtures/stl-dfm` (no kernel needed here);
 *  - the DFM job end to end on an STL: findings, and the faces the viewer needs to show them.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStlTriangles, extractMeshFeatures, MAX_TRIANGLES } from '../server/utils/mesh-features.js';
import { extractStlFeaturesOffThread } from '../server/utils/mesh-features-worker.js';
import { analyseGeometricDFM } from '../src/engine/dfm-geometry/index.js';
import { applyShellWallCorrectionToFeatures, type OCCTGeometry } from '../server/utils/geometry-bridge.js';
import { decodeMeshFaces } from '../src/ui/mesh-faces.js';
import type { ManufacturingFeature, ManufacturingFeatureSet } from '../src/engine/ai-analysis.js';
import type { CommodityType } from '../src/engine/types.js';

type P2 = [number, number];
type P3 = [number, number, number];

// ── mesh builders ────────────────────────────────────────────────────────────
function soupOf(tris: P3[][]): Float32Array {
  const out = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((p, j) => out.set(p, i * 9 + j * 3)));
  return out;
}
/** A closed profile (r > 0 everywhere, counter-clockwise in r–z) revolved about z in `n` steps — a watertight solid. */
function revolve(profile: P2[], n: number): Float32Array {
  const tris: P3[][] = [];
  const at = (k: number, [r, z]: P2): P3 => [r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n), z];
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < profile.length; i++) {
      const a = profile[i], b = profile[(i + 1) % profile.length];
      const a0 = at(k, a), b0 = at(k, b), a1 = at(k + 1, a), b1 = at(k + 1, b);
      tris.push([a0, a1, b1], [a0, b1, b0]);
    }
  }
  return soupOf(tris);
}
/** A closed polygon (counter-clockwise, star-shaped about its first vertex) extruded `h` along z. */
function extrude(poly: P2[], h: number): Float32Array {
  const tris: P3[][] = [];
  const lo = (p: P2): P3 => [p[0], p[1], 0], hi = (p: P2): P3 => [p[0], p[1], h];
  for (let i = 1; i + 1 < poly.length; i++) {
    tris.push([hi(poly[0]), hi(poly[i]), hi(poly[i + 1])]);
    tris.push([lo(poly[0]), lo(poly[i + 1]), lo(poly[i])]);
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    tris.push([lo(a), lo(b), hi(b)], [lo(a), hi(b), hi(a)]);
  }
  return soupOf(tris);
}
const binaryStl = (soup: Float32Array): Buffer => {
  const n = soup.length / 9, buf = Buffer.alloc(84 + n * 50);
  buf.writeUInt32LE(n, 80);
  for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) buf.writeFloatLE(soup[t * 9 + k], 84 + t * 50 + 12 + k * 4);
  return buf;
};
const asciiStl = (soup: Float32Array): Buffer => {
  const lines = ['solid test'];
  for (let t = 0; t < soup.length / 9; t++) {
    lines.push(' facet normal 0 0 0', '  outer loop');
    for (let j = 0; j < 3; j++) lines.push(`   vertex ${soup[t * 9 + j * 3]} ${soup[t * 9 + j * 3 + 1]} ${soup[t * 9 + j * 3 + 2]}`);
    lines.push('  endloop', ' endfacet');
  }
  lines.push('endsolid test');
  return Buffer.from(lines.join('\n'));
};
const of = (fs: ManufacturingFeatureSet, kind: ManufacturingFeature['kind']) => fs.features.filter(f => f.kind === kind);

// ── synthetic solids ─────────────────────────────────────────────────────────
describe('mesh features — synthetic solids (answer known by construction)', () => {
  const tube = revolve([[10, 0], [25, 0], [25, 30], [10, 30]], 72);   // Ø20 bore, Ø50 outside, 30 long, 5° facets

  it('a tube: one through hole Ø20 × 30 and one boss Ø50, on the z axis', () => {
    const { featureSet: fs, triFace, stats } = extractMeshFeatures(tube);
    const holes = of(fs, 'hole'), bosses = of(fs, 'boss');
    expect(holes).toHaveLength(1);
    expect(holes[0].diaMm).toBeCloseTo(20, 1);
    expect(holes[0].depthMm).toBeCloseTo(30, 1);
    expect(holes[0].openEnds).toBe(2);
    expect(Math.abs(holes[0].axis![2])).toBeCloseTo(1, 3);
    expect(bosses).toHaveLength(1);
    expect(bosses[0].diaMm).toBeCloseTo(50, 1);
    // every triangle belongs to a face, and the ids the features name are faces
    expect(triFace.length).toBe(stats.triangles);
    expect([...triFace].every(id => id >= 1 && id <= stats.faces)).toBe(true);
  });

  it('reads binary and ASCII STL to the same triangles', () => {
    const b = readStlTriangles(binaryStl(tube)), a = readStlTriangles(asciiStl(tube));
    expect(a.length).toBe(tube.length);
    expect(b.length).toBe(tube.length);
    for (let i = 0; i < tube.length; i += 97) { expect(a[i]).toBeCloseTo(tube[i], 4); expect(b[i]).toBeCloseTo(tube[i], 4); }
  });

  it('a hole tessellated coarser than 36° a facet is not a hole (stated in the note)', () => {
    const coarse = revolve([[10, 0], [25, 0], [25, 30], [10, 30]], 8);   // 45° facets
    const { featureSet: fs } = extractMeshFeatures(coarse);
    expect(of(fs, 'hole')).toHaveLength(0);
    expect(fs.note).toMatch(/coarser than 36°/);
  });

  it('a straight concave fillet: radius 3, a quarter turn', () => {
    const arc: P2[] = [];
    for (let k = 0; k <= 12; k++) { const a = (270 - 7.5 * k) * Math.PI / 180; arc.push([8 + 3 * Math.cos(a), 8 + 3 * Math.sin(a)]); }
    const L = extrude([[0, 0], [40, 0], [40, 5], ...arc, [5, 40], [0, 40]], 20);
    const fillets = of(extractMeshFeatures(L).featureSet, 'fillet').filter(f => f.concave);
    expect(fillets).toHaveLength(1);
    expect(fillets[0].radiusMm).toBeCloseTo(3, 1);
    expect(fillets[0].sweepDeg).toBeGreaterThan(80);
    expect(fillets[0].sweepDeg).toBeLessThan(100);
  });

  it('a revolved root round is a torus, not a ring of fillets (the kernel types it as a torus too)', () => {
    // plate Ø120 × 8 with a Ø40 boss to 30, a Ø20 bore, and an r6 round where the boss meets the plate
    const round: P2[] = [];
    for (let k = 0; k <= 8; k++) { const a = (270 - 11.25 * k) * Math.PI / 180; round.push([26 + 6 * Math.cos(a), 14 + 6 * Math.sin(a)]); }
    const flange = revolve([[10, 0], [60, 0], [60, 8], ...round, [20, 30], [10, 30]], 72);
    const fs = extractMeshFeatures(flange).featureSet;
    expect(of(fs, 'fillet').filter(f => f.concave && Math.abs((f.radiusMm ?? 0) - 6) < 1)).toHaveLength(0);
    expect(of(fs, 'hole').map(h => Math.round(h.diaMm!))).toEqual([20]);
    expect(of(fs, 'boss').map(h => Math.round(h.diaMm!)).sort((a, b) => a - b)).toEqual([40, 120]);
  });

  it('refuses a mesh above the triangle cap, saying so', () => {
    const r = extractMeshFeatures(tube, { maxTriangles: 100 });
    expect(r.featureSet.available).toBe(false);
    expect(r.featureSet.note).toMatch(/exceeds the cap/);
    expect(MAX_TRIANGLES).toBe(300_000);
  });
});

// ── real parts against the kernel ────────────────────────────────────────────
interface KernelTruth {
  commodity: CommodityType; family: string;
  holes: ManufacturingFeature[]; bosses: ManufacturingFeature[]; concaveFillets: ManufacturingFeature[];
  undercuts: number; findingsByRule: Record<string, number>;
}
const FX = join(import.meta.dirname, 'fixtures', 'stl-dfm');
/** Same feature: parallel axes, axis lines within 5 % of the diameter (min 0.1 mm), diameter within 1 % (min 0.05 mm). */
function sameCyl(a: ManufacturingFeature, b: ManufacturingFeature): boolean {
  const da = a.diaMm ?? 2 * a.radiusMm!, db = b.diaMm ?? 2 * b.radiusMm!;
  if (Math.abs(da - db) > Math.max(0.01 * da, 0.05)) return false;
  const ax = a.axis!, bx = b.axis!;
  if (Math.abs(ax[0] * bx[0] + ax[1] * bx[1] + ax[2] * bx[2]) < 0.999) return false;
  const d = [0, 1, 2].map(k => b.positionMm![k] - a.positionMm![k]);
  const along = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2];
  return Math.sqrt(Math.max(0, d[0] ** 2 + d[1] ** 2 + d[2] ** 2 - along * along)) <= Math.max(0.05 * da, 0.1);
}
function matched(ref: ManufacturingFeature[], got: ManufacturingFeature[]) {
  const used = new Set<number>();
  return ref.filter(r => { const i = got.findIndex((g, k) => !used.has(k) && sameCyl(r, g)); if (i >= 0) used.add(i); return i >= 0; }).length;
}
const findings = (fs: ManufacturingFeatureSet, t: KernelTruth) => {
  const by: Record<string, number> = {};
  for (const f of analyseGeometricDFM({ commodity: t.commodity, featureSet: fs, materialFamily: t.family, medianWallMm: fs.medianThicknessMm ?? null }).findings)
    by[f.ruleId] = (by[f.ruleId] ?? 0) + 1;
  return by;
};

describe('mesh features — real parts against the kernel (viewer tessellation)', () => {
  const load = (stem: string) => {
    const m = extractMeshFeatures(readStlTriangles(readFileSync(join(FX, `${stem}.stl`))));
    // the STEP path's thickness clean-up (readings outside 0.3–3 × 2·V/S), as the DFM job applies it to a mesh too
    applyShellWallCorrectionToFeatures({ status: 'success', manufacturingFeatures: m.featureSet,
      volume: { mm3: m.volumeMm3, cm3: m.volumeMm3 / 1000 }, surfaceArea: { mm2: m.surfaceMm2, cm2: m.surfaceMm2 / 100 } } as OCCTGeometry, null);
    return { fs: m.featureSet, truth: JSON.parse(readFileSync(join(FX, `${stem}.kernel.json`), 'utf8')) as KernelTruth };
  };

  it('hydraulic manifold: every one of the kernel’s 13 holes, none extra, through / blind and depth as the kernel', () => {
    const { fs, truth } = load('MACH_Hydraulic_Manifold');
    const holes = of(fs, 'hole');
    expect(truth.holes).toHaveLength(13);
    expect(matched(truth.holes, holes)).toBe(13);
    expect(holes).toHaveLength(13);
    for (const r of truth.holes) {
      const g = holes.find(h => sameCyl(r, h))!;
      expect(g.openEnds).toBe(r.openEnds);
      expect(Math.abs(g.depthMm! - r.depthMm!)).toBeLessThan(0.5);
    }
  });

  it('hub flange: 7 holes and 2 bosses as the kernel, the same (zero) findings', () => {
    const { fs, truth } = load('FORGE_Hub_Flange');
    expect(matched(truth.holes, of(fs, 'hole'))).toBe(7);
    expect(matched(truth.bosses, of(fs, 'boss'))).toBe(2);
    expect(findings(fs, truth)).toEqual(truth.findingsByRule);
  });

  it('ECU cover (moulding): holes, bosses, the 8 undercut faces and every finding as the kernel', () => {
    const { fs, truth } = load('IM_ECU_Cover');
    expect(matched(truth.holes, of(fs, 'hole'))).toBe(truth.holes.length);
    expect(matched(truth.bosses, of(fs, 'boss'))).toBe(truth.bosses.length);
    expect(fs.features.filter(f => f.draftClass === 'undercut').length).toBe(truth.undercuts);
    expect(findings(fs, truth)).toEqual(truth.findingsByRule);
  });
});

describe('a sprocket\u2019s tooth form (scripts/sprocket-fixture.py: ANSI #40, 18 teeth)', () => {
  it('reads every roller seat as the kernel does: a concave cylinder of 284.6\u00b0, r 4.02, not a hole', () => {
    const m = extractMeshFeatures(readStlTriangles(readFileSync(join(FX, 'Sprocket_ANSI40_18T.stl'))));
    const truth = JSON.parse(readFileSync(join(FX, 'Sprocket_ANSI40_18T.kernel.json'), 'utf8')) as KernelTruth;
    const seats = of(m.featureSet, 'fillet').filter(f => f.concave);
    expect(truth.concaveFillets).toHaveLength(18);
    expect(seats).toHaveLength(18);
    expect(matched(truth.concaveFillets, seats)).toBe(18);
    for (const f of seats) expect(Math.abs(f.sweepDeg! - truth.concaveFillets[0].sweepDeg!)).toBeLessThan(1);
    expect(matched(truth.holes, of(m.featureSet, 'hole'))).toBe(1);
    expect(of(m.featureSet, 'hole')).toHaveLength(1);   // the seats are not holes
    expect(findings(m.featureSet, truth)).toEqual(truth.findingsByRule);
  });
});

// ── the job and the viewer ───────────────────────────────────────────────────
describe('STL DFM job', () => {
  const ids: string[] = [];
  afterAll(async () => {
    const { default: db } = await import('../server/db.js');
    for (const id of ids) db.prepare('DELETE FROM dfm_jobs WHERE id = ?').run(id);
  });

  it('runs off the main thread and gives the same features as inline', async () => {
    const buf = readFileSync(join(FX, 'FORGE_Hub_Flange.stl'));
    const off = await extractStlFeaturesOffThread(buf);
    const inline = extractMeshFeatures(readStlTriangles(buf));
    expect(off.featureSet.features.length).toBe(inline.featureSet.features.length);
    expect([...off.triFace]).toEqual([...inline.triFace]);
    expect(off.faces).toHaveLength(inline.faces.length);
  });

  it('an STL upload gets a DFM report, and its faces for the viewer — kept out of the report', async () => {
    const { queueDFMJobFromBuffer, drain, getDFMJob } = await import('../server/utils/dfm-job-runner.js');
    const buf = readFileSync(join(FX, 'IM_ECU_Cover.stl'));
    const id = await queueDFMJobFromBuffer(buf, 'IM_ECU_Cover.stl', { commodity: 'injection_moulding', materialFamily: 'plastic', annualVolume: 100_000 });
    ids.push(id);
    await drain();
    const job = getDFMJob(id)!;
    expect(job.error).toBeNull();
    expect(job.status).toBe('done');
    const truth = JSON.parse(readFileSync(join(FX, 'IM_ECU_Cover.kernel.json'), 'utf8')) as KernelTruth;
    expect(job.result!.findings.length).toBe(Object.values(truth.findingsByRule).reduce((a, b) => a + b, 0));
    // the faces decode to one id per triangle, and every face a finding names is among them
    const mf = decodeMeshFaces(job.result!.meshFaces!)!;
    expect(mf.triFace.length).toBe(buf.readUInt32LE(80));
    const faceIds = new Set(mf.faces.map(f => f.id));
    for (const f of job.result!.findings) for (const id of f.faceIds ?? []) expect(faceIds.has(id)).toBe(true);
  }, 60_000);
});
