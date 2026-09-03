/**
 * Geometry store — one measurement per file, addressed by the SHA-256 of the
 * upload bytes.
 *
 * Why this exists: the same STEP used to be measured up to four times per
 * upload (tessellate for the vision renders, /analyze, the DFM job, and the
 * viewer's meta fetch), each paying ~3 s of OCP import before any geometry
 * work. And /reanalyze accepted whatever `occtGeometry` the client posted and
 * treated it as measured truth — the cache key, the clamp reference, all of it.
 *
 * Now the server owns the measurement. /analyze stores the OCCT result under the
 * file hash and returns the hash; /reanalyze looks the geometry up by hash and
 * never reads it from the body. The upload bytes are kept on disk under the
 * same hash (TTL-swept) so a later step that genuinely needs the file — the
 * unit-confirmation re-measure at 25.4x, the DFM per-face pass — can have it
 * without a second upload.
 *
 * Sprint 3 extends this with the mesh + meta so the viewer reads it too.
 */
import { createHash } from 'crypto';
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createAnalysisCache } from './analysis-cache.js';
import type { OCCTGeometry } from '../../src/engine/ai-analysis.js';

const GEOMETRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // a week — the upload is re-hashed on every analyze anyway
const geometryCache = createAnalysisCache('cad_geometry_by_hash', GEOMETRY_TTL_MS);

const FILE_DIR = process.env.CV_GEOMETRY_FILE_DIR ?? join(tmpdir(), 'cv-geometry-files');
const FILE_TTL_MS = 24 * 60 * 60 * 1000;

function ensureDir(): void {
  if (!existsSync(FILE_DIR)) mkdirSync(FILE_DIR, { recursive: true });
}

/** SHA-256 of the upload bytes. This is the join key for everything server-side. */
export function hashUpload(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

const SAFE_EXT = /^[a-z0-9]{1,8}$/;
function extOf(filename: string): string {
  const e = filename.toLowerCase().split('.').pop() ?? '';
  return SAFE_EXT.test(e) ? e : 'bin';
}

/** Keep the upload bytes for a day so a follow-up step can re-measure without a re-upload. */
export function putUploadFile(hash: string, buffer: Buffer, filename: string): void {
  try {
    ensureDir();
    writeFileSync(join(FILE_DIR, `${hash}.${extOf(filename)}`), buffer);
  } catch (err) {
    console.warn('[geometry-store] could not persist upload:', err instanceof Error ? err.message : String(err));
  }
}

export function getUploadFile(hash: string): { buffer: Buffer; ext: string } | null {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  try {
    ensureDir();
    const hit = readdirSync(FILE_DIR).find(f => f.startsWith(hash + '.'));
    if (!hit) return null;
    const p = join(FILE_DIR, hit);
    if (Date.now() - statSync(p).mtimeMs > FILE_TTL_MS) { unlinkSync(p); return null; }
    return { buffer: readFileSync(p), ext: hit.split('.').pop() ?? 'bin' };
  } catch {
    return null;
  }
}

/**
 * Stored geometry is keyed by hash PLUS the unit scale it was measured at, so
 * the pre-confirmation (1x) and post-confirmation (25.4x) measurements of an
 * inch model never collide.
 */
function geoKey(hash: string, unitScale: number): string {
  return `${hash}:${unitScale}`;
}

export function putGeometry(hash: string, geo: OCCTGeometry, unitScale = 1): void {
  geometryCache.set(geoKey(hash, unitScale), geo);
}

export function getGeometry(hash: string, unitScale = 1): OCCTGeometry | null {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const g = geometryCache.get(geoKey(hash, unitScale));
  return g && typeof g === 'object' ? (g as OCCTGeometry) : null;
}

/** Sweep stale upload files. Called at startup; cheap enough to call on every put too. */
export function sweepUploadFiles(): number {
  let n = 0;
  try {
    ensureDir();
    for (const f of readdirSync(FILE_DIR)) {
      const p = join(FILE_DIR, f);
      if (Date.now() - statSync(p).mtimeMs > FILE_TTL_MS) { unlinkSync(p); n++; }
    }
  } catch { /* best effort */ }
  return n;
}

// ─── Mesh cache (viewer + vision renders) ─────────────────────────────────────
// The tessellation of a file is a pure function of (bytes, unit scale). It used
// to be computed once for the vision renders, again for the viewer's meta fetch,
// and again on every remount. Keep it on disk under the hash, alongside the
// sidecar, and serve both from here.

export interface StoredMesh {
  stl: Buffer;
  triangles: number;
  meta: unknown | null;
}

function meshBase(hash: string, unitScale: number): string {
  return join(FILE_DIR, `${hash}.${unitScale}`);
}

export function putMesh(hash: string, unitScale: number, mesh: StoredMesh): void {
  try {
    ensureDir();
    writeFileSync(meshBase(hash, unitScale) + '.mesh.stl', mesh.stl);
    writeFileSync(meshBase(hash, unitScale) + '.mesh.json',
      JSON.stringify({ triangles: mesh.triangles, meta: mesh.meta ?? null }));
  } catch (err) {
    console.warn('[geometry-store] could not persist mesh:', err instanceof Error ? err.message : String(err));
  }
}

/** `withMeta` — the caller needs the face sidecar; a cached mesh without one is not a hit for it. */
export function getMesh(hash: string, unitScale: number, withMeta: boolean): StoredMesh | null {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  try {
    const base = meshBase(hash, unitScale);
    if (!existsSync(base + '.mesh.stl') || !existsSync(base + '.mesh.json')) return null;
    if (Date.now() - statSync(base + '.mesh.stl').mtimeMs > FILE_TTL_MS) return null;
    const side = JSON.parse(readFileSync(base + '.mesh.json', 'utf-8')) as { triangles: number; meta: unknown | null };
    if (withMeta && !side.meta) return null;
    return { stl: readFileSync(base + '.mesh.stl'), triangles: side.triangles, meta: side.meta };
  } catch {
    return null;
  }
}
