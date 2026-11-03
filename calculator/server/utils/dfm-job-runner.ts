/**
 * Background geometric-DFM job runner.
 *
 * Manufacturing asked for the deep CAD analysis to "run in background" and
 * produce a detailed report. The per-face ray casting and adjacency build the
 * rules need is far too slow to sit inside a costing request, so a CAD upload
 * queues a job here and the costing returns immediately.
 *
 * Deliberately small: a SQLite-backed queue and an in-process worker with the
 * same single-flight discipline `geometry-bridge.ts` already uses for the
 * Python spawn. There is no external broker, because adding one would be the
 * largest operational change in the repo for a workload of one job per upload.
 */
import { regionOf, rateBookForRegion } from '../services/rate-book.js';
import { randomUUID } from 'node:crypto';
import db from '../db.js';
import { analyzeGeometry, applyShellWallCorrectionToFeatures } from './geometry-bridge.js';
import { extractStlFeaturesOffThread, type MeshFaceMeta } from './mesh-features-worker.js';
import type { OCCTGeometry } from './geometry-bridge.js';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  analyseGeometricDFM, GEOMETRIC_DFM_COMMODITIES, machinedFaceSet, sheetBlankFromFlat,
  type GeometricAnalysis, type PartContext, type CostContext, type SheetBlankFacts,
} from '../../src/engine/dfm-geometry/index.js';
import { extractSkinMesh } from './geometry-bridge.js';
import { unfoldSkin, DEVELOPABLE_STRAIN_PCT, type SkinMeshFile } from './blank-unfold.js';
import { DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';
import { partWeightKgFor, timeFactorFor } from '../../src/engine/dfm-geometry/cost-impact.js';
import { withRates } from '../../src/engine/rate-context.js';
import type { CommodityType } from '../../src/engine/types.js';

export type DFMJobStatus = 'queued' | 'running' | 'done' | 'error';

/** An STL's recovered faces, stored with its report: the 1-based face id of every triangle in file order (Uint32,
 *  little-endian, base64) and the faces the findings name. Served on its own (`/jobs/:id/mesh-faces`), never in the
 *  report, which travels with costings and exports. */
export interface MeshFaces { triangles: number; triFaceB64: string; faces: MeshFaceMeta[] }

export interface DFMJobRequest {
  /**
   * Path to the CAD file on disk.
   *
   * The upload route uses multer memoryStorage, so an uploaded part never
   * touches the filesystem — queueing one therefore has to persist the buffer
   * first (see `queueDFMJobFromBuffer`). This field is the path that was
   * persisted, and the runner deletes it when the job finishes.
   */
  filePath: string;
  /** True when `filePath` is a temp file this queue owns and must clean up. */
  ownsFile?: boolean;
  commodity: CommodityType;
  partName?: string;
  /** Engineer-confirmed. Absent means the rules that need it will not run. */
  materialFamily?: string;
  process?: string;
  /** Needed to amortise tooling findings. Absent → they stay unpriced, stated. */
  annualVolume?: number;
  /** 2-letter region for rate selection, e.g. 'GB', 'CN'. Defaults to the library. */
  region?: string;
  /**
   * Library ids of the machines the costing's rules routed the part on (`mach-hmc-400` …). Setup and off-axis findings
   * are judged against them; absent = not known, and the findings say so.
   */
  machineIds?: string[];
  createdBy?: string;
}

export interface DFMJobRow {
  id: string;
  status: DFMJobStatus;
  commodity: string;
  partName: string;
  result: (GeometricAnalysis & { meshFaces?: MeshFaces }) | null;
  error: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** Concurrency 1: the kernel spawn is already semaphore-capped, and a deep scan
 *  is CPU-bound. Two in flight would slow both without finishing sooner. */
const MAX_CONCURRENT = 1;
let running = 0;

/**
 * The in-flight drain, so concurrent callers AWAIT it rather than skipping.
 *
 * The first version used a boolean and returned early when it was set. Because
 * `queueDFMJob` kicks a fire-and-forget `drain()`, a caller's own `await
 * drain()` then returned instantly with the job still queued — so nothing could
 * reliably wait for a job to finish, and the end-to-end check failed with the
 * job stuck in `running`. Sharing the promise makes "wait for the queue to
 * settle" actually mean that.
 */
let drainPromise: Promise<void> | null = null;

/**
 * Queue a job for an in-memory upload.
 *
 * Persists the buffer to a temp file first — the analysis needs a path for the
 * Python kernel, and the upload route holds only a Buffer. The runner unlinks
 * it on completion, including on failure, so a rejected file cannot leak.
 */
export async function queueDFMJobFromBuffer(
  buffer: Buffer, filename: string, req: Omit<DFMJobRequest, 'filePath' | 'ownsFile'>,
): Promise<string> {
  const ext = (filename.toLowerCase().split('.').pop() ?? 'step').replace(/[^a-z0-9]/g, '');
  const path = join(tmpdir(), `cv-dfm-${randomUUID()}.${ext}`);
  await writeFile(path, buffer);
  return queueDFMJob({ ...req, filePath: path, ownsFile: true, partName: req.partName ?? filename });
}

/**
 * A job for a commodity with no rule pack: it reads no file and runs no kernel — its result is the truthful "no pack"
 * report with the checks a design engineer should make. Queued so an answered route REPLACES the upload's job (a roto
 * tank answered after upload kept the blow-moulding job its leaning route had queued, and printed blow-moulding
 * limitations — report standard, Nov 2026).
 */
export function queueNoPackDFMJob(req: Omit<DFMJobRequest, 'filePath' | 'ownsFile'>): string {
  return queueDFMJob({ ...req, filePath: '', ownsFile: false });
}

export function queueDFMJob(req: DFMJobRequest): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO dfm_jobs (id, status, commodity, part_name, file_path, request, created_by, queued_at)
     VALUES (?, 'queued', ?, ?, ?, ?, ?, ?)`,
  ).run(id, req.commodity, req.partName ?? '', req.filePath,
        JSON.stringify(req), req.createdBy ?? '', new Date().toISOString());
  void drain();
  return id;
}

export function getDFMJob(id: string): DFMJobRow | null {
  const r = db.prepare('SELECT * FROM dfm_jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    status: String(r.status) as DFMJobStatus,
    commodity: String(r.commodity ?? ''),
    partName: String(r.part_name ?? ''),
    result: r.result ? safeParse(String(r.result)) : null,
    error: r.error ? String(r.error) : null,
    queuedAt: String(r.queued_at),
    startedAt: r.started_at ? String(r.started_at) : null,
    finishedAt: r.finished_at ? String(r.finished_at) : null,
  };
}

function safeParse(s: string): (GeometricAnalysis & { meshFaces?: MeshFaces }) | null {
  try { return JSON.parse(s) as GeometricAnalysis & { meshFaces?: MeshFaces }; } catch { return null; }
}

/**
 * Pull queued jobs until the queue is empty.
 *
 * Safe to call repeatedly and safe to await: concurrent callers all receive the
 * same in-flight promise, so awaiting it genuinely means "the queue has
 * settled". A job queued after the loop exits starts a fresh drain.
 */
export function drain(): Promise<void> {
  if (drainPromise) return drainPromise;
  drainPromise = (async () => {
    for (;;) {
      if (running >= MAX_CONCURRENT) return;
      const row = db.prepare(
        "SELECT id, request FROM dfm_jobs WHERE status = 'queued' ORDER BY queued_at LIMIT 1",
      ).get() as { id: string; request: string } | undefined;
      if (!row) return;
      running++;
      try {
        await execute(row.id, JSON.parse(row.request) as DFMJobRequest);
      } finally {
        running--;
      }
    }
  })().finally(() => { drainPromise = null; });
  return drainPromise;
}

async function execute(id: string, req: DFMJobRequest): Promise<void> {
  db.prepare("UPDATE dfm_jobs SET status = 'running', started_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
  try {
    if (!GEOMETRIC_DFM_COMMODITIES.has(req.commodity)) {
      // Not an error — a truthful "no pack for this commodity" result, so the
      // report can say so rather than the job failing mysteriously.
      finish(id, analyseGeometricDFM({
        commodity: req.commodity,
        featureSet: { available: false, features: [],
          note: `No geometric rule pack exists for ${req.commodity} yet.` },
      }));
      return;
    }

    const buf = await readFile(req.filePath);
    const { part, meshFaces } = /\.stl$/i.test(req.filePath) ? await stlPart(buf, req) : { part: await kernelPart(buf, req), meshFaces: undefined };
    // Priced in the requested country's book — toolroom, fixtures and the mould estimator read the ACTIVE book, and
    // the job used to leave it on the UK while the machine and labour rates were the country's.
    finish(id, { ...withRates(costBook(req), () => analyseGeometricDFM(part)), ...(meshFaces ? { meshFaces } : {}) });
  } catch (e) {
    db.prepare("UPDATE dfm_jobs SET status = 'error', error = ?, finished_at = ? WHERE id = ?")
      .run(String((e as Error).message ?? e).slice(0, 500), new Date().toISOString(), id);
  } finally {
    // Temp uploads are ours to clean up, on the success and the failure path.
    if (req.ownsFile) await unlink(req.filePath).catch(() => {});
  }
}

/** A STEP / IGES part: the kernel measures it with the per-face scan on. */
async function kernelPart(buf: Buffer, req: DFMJobRequest): Promise<PartContext> {
  // CV_EXTRACT_FEATURES turns on the per-face scan. Passed explicitly to the
  // kernel spawn rather than by mutating process.env around an await — the
  // costing path never sets it, so a normal run pays nothing for this.
  const geo = await analyzeGeometry(buf, basename(req.filePath), undefined,
                                    { CV_EXTRACT_FEATURES: '1' });

  if (!geo || geo.status !== 'success') {
    throw new Error(geo?.error || 'geometry engine did not return a successful measurement');
  }
  const part = partFromKernelGeometry(geo, req);
  // A sheet part: the bend-line checks run on its developed blank (sheet-blank.ts). Soft: without it they are listed as
  // not run, and the rest of the report stands.
  if ((req.commodity === 'sheet_metal' || req.commodity === 'sheet_metal_fab') && sheetCandidate(geo)) {
    const sb = await developedBlankFacts(buf, basename(req.filePath)).catch(() => null);
    if (sb) return { ...part, sheetBlank: sb };
  }
  return part;
}

/** The unfold runs only on a part the kernel measured as sheet (a bend-measured gauge), as the costing's own unfold does. */
function sheetCandidate(geo: OCCTGeometry): boolean {
  const sm = geo.sheetMetal;
  return !!sm && sm.thicknessSource === 'bend-pairs' && (sm.bendCount ?? 0) > 0 && (sm.thicknessMm ?? 0) > 0;
}

/** Export the skins, flatten the largest, read the bends off its creases — the facts the blank checks need. */
async function developedBlankFacts(buf: Buffer, filename: string): Promise<SheetBlankFacts | null> {
  const mesh = await extractSkinMesh(buf, filename, { timeoutMs: 180_000 });
  if (mesh.status !== 'success') return null;
  return sheetBlankFromSkinMesh(mesh.mesh);
}

/** Pure: the blank facts from a kernel skin-mesh export (the largest skin, unfolded with its flat kept). */
export function sheetBlankFromSkinMesh(file: SkinMeshFile): SheetBlankFacts | null {
  const skin = [...(file.skins ?? [])].sort((a, b) => b.area3dMm2 - a.area3dMm2)[0];
  if (!skin) return null;
  const u = unfoldSkin(skin, { keepInternals: true });
  const fi = u.internals;
  if (!fi) return null;
  return sheetBlankFromFlat({
    vertices3d: skin.vertices, triangles: fi.T, mReal: fi.mReal, flat: fi.U, outer: fi.outer, holes: fi.holes,
    gaugeMm: file.thicknessMm, developable: u.maxStrainPct <= DEVELOPABLE_STRAIN_PCT,
    source: `the larger skin unfolded (${u.triangleCount.toLocaleString('en-GB')} triangles, ${file.thicknessMm.toFixed(2)} mm gauge, `
      + `${u.maxStrainPct.toFixed(1)}% stretch at the 95th percentile)`,
  });
}

/**
 * The rule pack's input from a kernel measurement — pure, so the real-parts DFM test and the before / after survey build
 * the part exactly as the job does.
 */
export function partFromKernelGeometry(geo: OCCTGeometry, req: Omit<DFMJobRequest, 'filePath'>): PartContext {
  const featureSet = geo.manufacturingFeatures ?? {
    available: false, features: [],
    note: 'The kernel ran but produced no feature set — the part may exceed the face cap.',
  };
  // The faces the costing machines, from the same feature table it reads (cast + machine, castings, forgings).
  const machined = machinedFaceSet(geo, featureSet, req.commodity);
  return {
    commodity: req.commodity,
    featureSet,
    ...(machined ? { machined } : {}),
    ...(req.machineIds?.length ? { machineIds: req.machineIds } : {}),
    bboxMm: geo.boundingBox
      ? { x: geo.boundingBox.xMm, y: geo.boundingBox.yMm, z: geo.boundingBox.zMm }
      : undefined,
    medianWallMm: geo.manufacturingFeatures?.medianThicknessMm ?? geo.wallThickness?.meanMm ?? null,
    materialFamily: req.materialFamily,
    process: req.process,
    cost: { ...resolveCostContext(req, geo.volume?.cm3),
      ...(geo.projectedArea?.alongDrawMm2 ? { projectedAreaCm2: geo.projectedArea.alongDrawMm2 / 100 } : {}) },
  };
}

/**
 * An STL part: the kernel cannot read a mesh, so the faces are recovered from the triangles
 * (`mesh-features.ts`, the kernel's feature definitions ported) and the same rule pack runs on them. The STEP path's
 * thickness clean-up (readings outside 0.3–3 × 2·V/S dropped) is applied to the mesh's readings as well.
 */
async function stlPart(buf: Buffer, req: DFMJobRequest): Promise<{ part: PartContext; meshFaces: MeshFaces }> {
  const m = await extractStlFeaturesOffThread(buf);
  const volumeCm3 = m.volumeMm3 > 0 ? m.volumeMm3 / 1000 : undefined;
  applyShellWallCorrectionToFeatures({
    status: 'success', manufacturingFeatures: m.featureSet,
    volume: { mm3: m.volumeMm3, cm3: m.volumeMm3 / 1000 }, surfaceArea: { mm2: m.surfaceMm2, cm2: m.surfaceMm2 / 100 },
  } as OCCTGeometry, null);
  const part: PartContext = {
    commodity: req.commodity,
    featureSet: m.featureSet,
    bboxMm: m.bboxMm,
    medianWallMm: m.featureSet.medianThicknessMm ?? null,
    materialFamily: req.materialFamily,
    process: req.process,
    ...(req.machineIds?.length ? { machineIds: req.machineIds } : {}),
    cost: { ...resolveCostContext(req, volumeCm3),
      ...(m.projectedAlongDrawMm2 ? { projectedAreaCm2: m.projectedAlongDrawMm2 / 100 } : {}) },
  };
  // The findings name these face ids; the viewer needs the same ids per triangle to show them on the mesh.
  const tf = new Uint32Array(m.triFace);
  return { part, meshFaces: { triangles: tf.length, triFaceB64: Buffer.from(tf.buffer, tf.byteOffset, tf.byteLength).toString('base64'), faces: m.faces } };
}

/**
 * Rates for the pricers, resolved ONCE from the same library the costing uses.
 *
 * A pricer must never look up a rate itself — if the DFM number and the costing
 * number came from different lookups they would drift, and a finding that
 * disagrees with the cost sheet is worse than one with no price at all.
 *
 * A general machining centre and a semi-skilled operator are used as the
 * reference pair, because a DFM finding is about the feature, not about which
 * specific machine a supplier happens to own. The basis string says so.
 */
/** The deployment's active book (company rates when loaded) in the requested country — the book the CAD rules price in. */
function costBook(req: Omit<DFMJobRequest, 'filePath'>) {
  // An unrecognised region falls back to the default library rather than throwing — a bad region code must not lose
  // the whole DFM report.
  try { return rateBookForRegion(regionOf(req.region)); }
  catch { return DEFAULT_RATE_LIBRARY; }
}

function resolveCostContext(req: Omit<DFMJobRequest, 'filePath'>, volumeCm3?: number): CostContext {
  const lib = costBook(req);
  const machine = lib.machines.find(m => /vmc|machining/i.test(m.id))
    ?? lib.machines[0];
  const labour = lib.labour.find(l => /semiskilled|semi-skilled/i.test(l.id))
    ?? lib.labour[0];
  // The manufacturing engineer prices CAM programming per fixturing — the same rate the costing uses.
  const engineer = lib.labour.find(l => /engineer/i.test(l.id));
  return {
    annualVolume: req.annualVolume && req.annualVolume > 0 ? req.annualVolume : undefined,
    machineRatePerHr: machine?.computedRatePerHr,
    labourRatePerHr: labour?.fullyLoadedRatePerHr,
    engineerRatePerHr: engineer?.fullyLoadedRatePerHr,
    partWeightKg: partWeightKgFor(req.materialFamily, volumeCm3),
    timeFactor: timeFactorFor(req.materialFamily),
    // Named as an engineer reads it ("CNC VMC 3-axis + semi-skilled operator"), never by library id.
    rateBasis: `at the reference rate (${machine?.machineClass ?? 'machine'} + ${(labour?.skillLevel ?? 'labour').toLowerCase()}; `
      + 'a costing re-prices the minutes at its own operation\u2019s rates)',
  };
}

function finish(id: string, result: GeometricAnalysis & { meshFaces?: MeshFaces }): void {
  db.prepare("UPDATE dfm_jobs SET status = 'done', result = ?, finished_at = ? WHERE id = ?")
    .run(JSON.stringify(result), new Date().toISOString(), id);
}

/** Recover jobs left mid-flight by a restart, so nothing sits 'running' forever. */
export function requeueOrphans(): number {
  const r = db.prepare("UPDATE dfm_jobs SET status = 'queued', started_at = NULL WHERE status = 'running'").run();
  if (r.changes > 0) void drain();
  return r.changes;
}
