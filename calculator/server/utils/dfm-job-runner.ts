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
import { randomUUID } from 'node:crypto';
import db from '../db.js';
import { analyzeGeometry } from './geometry-bridge.js';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  analyseGeometricDFM, GEOMETRIC_DFM_COMMODITIES,
  type GeometricAnalysis, type PartContext,
} from '../../src/engine/dfm-geometry/index.js';
import type { CommodityType } from '../../src/engine/types.js';

export type DFMJobStatus = 'queued' | 'running' | 'done' | 'error';

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
  createdBy?: string;
}

export interface DFMJobRow {
  id: string;
  status: DFMJobStatus;
  commodity: string;
  partName: string;
  result: GeometricAnalysis | null;
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

function safeParse(s: string): GeometricAnalysis | null {
  try { return JSON.parse(s) as GeometricAnalysis; } catch { return null; }
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

    // CV_EXTRACT_FEATURES turns on the per-face scan. Passed explicitly to the
    // kernel spawn rather than by mutating process.env around an await — the
    // costing path never sets it, so a normal run pays nothing for this.
    const buf = await readFile(req.filePath);
    const geo = await analyzeGeometry(buf, basename(req.filePath), undefined,
                                      { CV_EXTRACT_FEATURES: '1' });

    if (!geo || geo.status !== 'success') {
      throw new Error(geo?.error || 'geometry engine did not return a successful measurement');
    }

    const part: PartContext = {
      commodity: req.commodity,
      featureSet: geo.manufacturingFeatures ?? {
        available: false, features: [],
        note: 'The kernel ran but produced no feature set — the part may exceed the face cap.',
      },
      bboxMm: geo.boundingBox
        ? { x: geo.boundingBox.xMm, y: geo.boundingBox.yMm, z: geo.boundingBox.zMm }
        : undefined,
      medianWallMm: geo.manufacturingFeatures?.medianThicknessMm ?? geo.wallThickness?.meanMm ?? null,
      materialFamily: req.materialFamily,
      process: req.process,
    };
    finish(id, analyseGeometricDFM(part));
  } catch (e) {
    db.prepare("UPDATE dfm_jobs SET status = 'error', error = ?, finished_at = ? WHERE id = ?")
      .run(String((e as Error).message ?? e).slice(0, 500), new Date().toISOString(), id);
  } finally {
    // Temp uploads are ours to clean up, on the success and the failure path.
    if (req.ownsFile) await unlink(req.filePath).catch(() => {});
  }
}

function finish(id: string, result: GeometricAnalysis): void {
  db.prepare("UPDATE dfm_jobs SET status = 'done', result = ?, finished_at = ? WHERE id = ?")
    .run(JSON.stringify(result), new Date().toISOString(), id);
}

/** Recover jobs left mid-flight by a restart, so nothing sits 'running' forever. */
export function requeueOrphans(): number {
  const r = db.prepare("UPDATE dfm_jobs SET status = 'queued', started_at = NULL WHERE status = 'running'").run();
  if (r.changes > 0) void drain();
  return r.changes;
}
