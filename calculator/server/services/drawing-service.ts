/**
 * The drawing reader as a SERVICE of this server (offline 2D drawing intelligence, integration — Nov 2026).
 *
 * `server/drawing/` reads one file. This module is what a route calls:
 *
 *  - one read per file: an extraction is kept under the SHA-256 of the drawing's bytes + the reader's version (SQLite,
 *    as the measured geometry is), so /reanalyze, compare-routes and the option re-costs name a drawing by its hash
 *    and never re-read it — and can never be handed readings by a client;
 *  - never on the event loop: every read runs in a worker thread (`readDrawingOffThread`);
 *  - exact text first: a file is read with OCR OFF (a CAD-exported PDF: about a second, and that is the whole read).
 *    Only when a sheet has no usable text is the slow OCR pass queued — ONE at a time (the VM has 2 GB; an A0 sheet at
 *    300 dpi is a 40-megapixel image) — and the caller is told the drawing is still being read, with a job to poll;
 *  - the reader's own refusals (DWG, a password, a broken file) reach the engineer in the reader's words.
 *
 * No AI, no network: this file imports the reader, the cache and node built-ins only.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DrawingExtraction, DrawingSheetInfo } from '../../src/engine/engineering-data/model.js';
import { READER_VERSION, DrawingReadError, ocrWouldRead } from '../drawing/index.js';
import { detectFileKind, type FileKind } from '../drawing/ingest.js';
import { readDrawingOffThread } from '../drawing/worker.js';
import { createAnalysisCache } from '../utils/analysis-cache.js';

/** The upload limit of a drawing (the CAD screen has always said 30 MB). */
export const MAX_DRAWING_BYTES = 30 * 1024 * 1024;
/** The file types the drawing field accepts, for the screen's file picker and the limits route. */
export const DRAWING_ACCEPT = ['.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.dxf'];

const EXTRACTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;      // as the measured geometry
const FILE_TTL_MS = 24 * 60 * 60 * 1000;                // as the kept CAD upload
const extractionCache = createAnalysisCache('drawing_extraction_by_hash', EXTRACTION_TTL_MS);
const FILE_DIR = process.env.CV_DRAWING_FILE_DIR ?? join(tmpdir(), 'cv-drawing-files');

/** How long a costing request waits for an OCR pass before answering "still reading" (the costing never waits on it). */
export const OCR_INLINE_WAIT_MS = Math.max(0, parseInt(process.env.CV_DRAWING_OCR_INLINE_MS ?? '2500', 10) || 0);
/** OCR passes that may wait behind the one running. */
export const OCR_QUEUE_MAX = 6;

export type DrawingStatus = 'ready' | 'reading' | 'failed';

/** What a route knows about a drawing. */
export interface DrawingRecord {
  hash: string;
  filename: string;
  sizeBytes: number;
  fileKind: DrawingExtraction['fileKind'] | null;
  status: DrawingStatus;
  /** The complete extraction — null while an OCR pass is still running, or when the read failed. */
  extraction: DrawingExtraction | null;
  /** The OCR job to poll while `status` is 'reading'. */
  jobId: string | null;
  error: string | null;
  /** The reader's typed refusal, when it refused the file. */
  errorCode: DrawingReadError['code'] | null;
  /** The OCR queue is full: try again shortly (not a fault of the file). */
  busy?: boolean;
}

/** The part of a record a response carries (no text lines, no parameters — those are in `engineeringData`). */
export interface DrawingInfo {
  file: string; hash: string; sizeBytes: number; fileKind: DrawingExtraction['fileKind'] | null;
  readerVersion: string; status: DrawingStatus; jobId?: string; error?: string;
  sheets: DrawingSheetInfo[]; warnings: string[];
  /** Readings on the sheet, and how many of them came from OCR. */
  readings: number; ocrReadings: number;
}

interface Stored { extraction: DrawingExtraction; filename: string; sizeBytes: number }
interface Job {
  id: string; hash: string; filename: string; sizeBytes: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  error: string | null; errorCode: DrawingReadError['code'] | null;
  queuedAt: number; startedAt: number | null; finishedAt: number | null;
  done: Promise<void>;
}

const jobs = new Map<string, Job>();
const jobByHash = new Map<string, Job>();
/** Fast (exact-text) reads in flight, by hash — two requests for one file share one read. */
const fastInFlight = new Map<string, Promise<DrawingRecord>>();

const HASH_RE = /^[a-f0-9]{64}$/;
const cacheKey = (hash: string): string => `${hash}:${READER_VERSION}`;

export function drawingHash(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// ─── The file, kept for a day: the OCR pass reads it when its turn comes, and the review screen draws the sheet ───────

function ensureDir(): void { if (!existsSync(FILE_DIR)) mkdirSync(FILE_DIR, { recursive: true }); }

function putBytes(hash: string, buffer: Uint8Array): void {
  try { ensureDir(); writeFileSync(join(FILE_DIR, `${hash}.bin`), buffer); }
  catch (e) { console.warn('[drawing] could not keep the drawing file:', e instanceof Error ? e.message : String(e)); }
}

/** The drawing's bytes, while the server still holds them (a day). */
export function getDrawingBytes(hash: string): Buffer | null {
  if (!HASH_RE.test(hash)) return null;
  try {
    const p = join(FILE_DIR, `${hash}.bin`);
    if (!existsSync(p)) return null;
    if (Date.now() - statSync(p).mtimeMs > FILE_TTL_MS) { unlinkSync(p); return null; }
    return readFileSync(p);
  } catch { return null; }
}

/** Remove kept drawing files older than a day. */
export function sweepDrawingFiles(): number {
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

// ─── Concurrency: exact-text reads two at a time, OCR strictly one at a time ───────────────────────────────────────

function limiter(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>(r => waiting.push(r));
    active++;
    try { return await fn(); }
    finally { active--; waiting.shift()?.(); }
  };
}
const fastLane = limiter(2);
const ocrLane = limiter(1);
let ocrWaiting = 0;

/** Test hook: how many OCR passes are running or queued, and the most that ever ran at once. */
export const ocrStats = { running: 0, maxRunning: 0, started: 0 };

// ─── Reading ────────────────────────────────────────────────────────────────────────────────────────────────────

function stored(hash: string): Stored | null {
  const s = extractionCache.get(cacheKey(hash)) as Stored | null;
  return s && typeof s === 'object' && s.extraction?.readerVersion === READER_VERSION ? s : null;
}

function recordOf(hash: string, filename: string, sizeBytes: number): DrawingRecord {
  const s = stored(hash);
  // The record carries the name THIS request gave the file: the same bytes under another name are the same drawing.
  if (s) return { hash, filename, sizeBytes: s.sizeBytes, fileKind: s.extraction.fileKind, status: 'ready', extraction: { ...s.extraction, sourceFile: filename, parameters: s.extraction.parameters.map(p => ({ ...p, sourceFile: filename })) }, jobId: null, error: null, errorCode: null };
  const j = jobByHash.get(hash);
  if (j && (j.status === 'queued' || j.status === 'running')) return { hash, filename, sizeBytes, fileKind: null, status: 'reading', extraction: null, jobId: j.id, error: null, errorCode: null };
  if (j && j.status === 'failed') return { hash, filename, sizeBytes, fileKind: null, status: 'failed', extraction: null, jobId: j.id, error: j.error, errorCode: j.errorCode };
  return { hash, filename, sizeBytes, fileKind: null, status: 'failed', extraction: null, jobId: null, error: 'This drawing has not been read on this server.', errorCode: null };
}

function queueOcr(hash: string, filename: string, sizeBytes: number): Job {
  const existing = jobByHash.get(hash);
  if (existing && (existing.status === 'queued' || existing.status === 'running')) return existing;
  if (ocrWaiting >= OCR_QUEUE_MAX) {
    throw new DrawingBusyError(`The drawing reader is busy: ${ocrWaiting} scanned drawings are waiting to be read. Try again in a minute.`);
  }
  const job: Job = { id: randomUUID(), hash, filename, sizeBytes, status: 'queued', error: null, errorCode: null, queuedAt: Date.now(), startedAt: null, finishedAt: null, done: Promise.resolve() };
  ocrWaiting++;
  job.done = ocrLane(async () => {
    ocrWaiting--;
    job.status = 'running'; job.startedAt = Date.now();
    ocrStats.running++; ocrStats.started++; ocrStats.maxRunning = Math.max(ocrStats.maxRunning, ocrStats.running);
    try {
      const bytes = getDrawingBytes(hash);
      if (!bytes) throw new Error('the drawing file is no longer held on this server — attach it again');
      const extraction = await readDrawingOffThread(bytes, filename, { ocr: 'auto' });
      extractionCache.set(cacheKey(hash), { extraction, filename, sizeBytes } satisfies Stored);
      job.status = 'done';
    } catch (e) {
      job.status = 'failed';
      job.error = String((e as Error)?.message ?? e).slice(0, 400);
      job.errorCode = e instanceof DrawingReadError ? e.code : null;
      console.warn(`[drawing] OCR read failed for ${hash.slice(0, 12)}: ${job.error}`);
    } finally {
      ocrStats.running--;
      job.finishedAt = Date.now();
    }
  });
  jobs.set(job.id, job);
  jobByHash.set(hash, job);
  if (jobs.size > 200) {                       // finished jobs older than an hour are forgotten
    for (const [id, j] of jobs) if (j.finishedAt && Date.now() - j.finishedAt > 3_600_000) { jobs.delete(id); if (jobByHash.get(j.hash) === j) jobByHash.delete(j.hash); }
  }
  return job;
}

/** More scanned drawings are waiting than the queue holds — a 429, not a failure of the file. */
export class DrawingBusyError extends Error {}

export interface DrawingHandle {
  hash: string;
  filename: string;
  /**
   * The record once the exact-text read is done — waiting at most `ocrWaitMs` more for an OCR pass the file needs.
   * Never rejects: a refusal comes back as `status: 'failed'` with the reader's message.
   */
  settled(ocrWaitMs?: number): Promise<DrawingRecord>;
}

/**
 * Start reading a drawing. Throws `DrawingReadError` at once for a file that is not a drawing this reader takes (by
 * its first bytes) or is over the size limit; everything else is reported by `settled()`.
 */
export function startDrawingRead(buffer: Uint8Array, filename: string): DrawingHandle {
  if (buffer.length > MAX_DRAWING_BYTES) {
    throw new DrawingReadError('too-large', `The drawing is ${(buffer.length / 1048576).toFixed(0)} MB; the limit is ${MAX_DRAWING_BYTES / 1048576} MB.`);
  }
  const kind: FileKind = detectFileKind(buffer);          // throws for DWG, binary DXF and anything unrecognised
  const hash = drawingHash(buffer);
  const sizeBytes = buffer.length;
  const name = (filename || 'drawing').replace(/[\u0000-\u001f]/g, '').slice(0, 200) || 'drawing';

  let fast = fastInFlight.get(hash);
  if (!fast) {
    fast = (async (): Promise<DrawingRecord> => {
      try {
        if (stored(hash)) return recordOf(hash, name, sizeBytes);
        const running = jobByHash.get(hash);
        if (running && (running.status === 'queued' || running.status === 'running')) return recordOf(hash, name, sizeBytes);
        putBytes(hash, buffer);
        // An image has no text at all: straight to the OCR pass.
        if (kind === 'png' || kind === 'jpeg' || kind === 'tiff') { queueOcr(hash, name, sizeBytes); return recordOf(hash, name, sizeBytes); }
        const exact = await fastLane(() => readDrawingOffThread(buffer, name, { ocr: 'off', timeoutMs: 120_000 }));
        if (!ocrWouldRead(exact)) {
          extractionCache.set(cacheKey(hash), { extraction: exact, filename: name, sizeBytes } satisfies Stored);
          return recordOf(hash, name, sizeBytes);
        }
        queueOcr(hash, name, sizeBytes);
        return recordOf(hash, name, sizeBytes);
      } catch (e) {
        return { hash, filename: name, sizeBytes, fileKind: null, status: 'failed', extraction: null, jobId: null,
          error: String((e as Error)?.message ?? e).slice(0, 400), errorCode: e instanceof DrawingReadError ? e.code : null,
          ...(e instanceof DrawingBusyError ? { busy: true } : {}) };
      } finally {
        fastInFlight.delete(hash);
      }
    })();
    fastInFlight.set(hash, fast);
  }
  const first = fast;
  return {
    hash, filename: name,
    async settled(ocrWaitMs = OCR_INLINE_WAIT_MS): Promise<DrawingRecord> {
      const rec = await first;
      if (rec.status !== 'reading' || !rec.jobId) return rec.status === 'ready' ? recordOf(hash, name, sizeBytes) : rec;
      const job = jobs.get(rec.jobId);
      if (job && ocrWaitMs > 0) await Promise.race([job.done, new Promise<void>(r => setTimeout(r, ocrWaitMs).unref?.())]);
      return recordOf(hash, name, sizeBytes);
    },
  };
}

/** A drawing this server has already read, by its hash (what /reanalyze, compare-routes and the option re-costs name). */
export function getDrawing(hash: string, filename?: string): DrawingRecord | null {
  if (!HASH_RE.test(hash)) return null;
  const s = stored(hash);
  const j = jobByHash.get(hash);
  if (!s && !j) return null;
  return recordOf(hash, filename ?? s?.filename ?? j?.filename ?? 'drawing', s?.sizeBytes ?? j?.sizeBytes ?? 0);
}

/** A reading job for the screen's poll. */
export function getDrawingJob(id: string): { id: string; hash: string; status: Job['status']; error: string | null; queuedAt: number; startedAt: number | null; finishedAt: number | null; ahead: number } | null {
  const j = jobs.get(id);
  if (!j) return null;
  const ahead = j.status === 'queued' ? [...jobs.values()].filter(x => (x.status === 'queued' || x.status === 'running') && x.queuedAt < j.queuedAt).length : 0;
  return { id: j.id, hash: j.hash, status: j.status, error: j.error, queuedAt: j.queuedAt, startedAt: j.startedAt, finishedAt: j.finishedAt, ahead };
}

/** Wait for a job (tests, and the drawing-only route's bounded wait). */
export async function waitForDrawingJob(id: string, maxMs: number): Promise<void> {
  const j = jobs.get(id);
  if (!j) return;
  await Promise.race([j.done, new Promise<void>(r => setTimeout(r, maxMs).unref?.())]);
}

export function drawingInfo(rec: DrawingRecord): DrawingInfo {
  const ex = rec.extraction;
  return {
    file: rec.filename, hash: rec.hash, sizeBytes: rec.sizeBytes, fileKind: rec.fileKind, readerVersion: READER_VERSION, status: rec.status,
    ...(rec.jobId && rec.status === 'reading' ? { jobId: rec.jobId } : {}),
    ...(rec.error ? { error: rec.error } : {}),
    sheets: ex?.sheets ?? [], warnings: ex?.warnings ?? [],
    readings: ex?.parameters.length ?? 0, ocrReadings: ex?.parameters.filter(p => p.method === 'ocr').length ?? 0,
  };
}

/** The HTTP status of a reader refusal: the file type, its size, or a file that cannot be opened. */
export function drawingErrorStatus(rec: Pick<DrawingRecord, 'errorCode' | 'busy'> | DrawingReadError['code'] | null): number {
  const code = rec && typeof rec === 'object' ? rec.errorCode : rec;
  if (rec && typeof rec === 'object' && rec.busy) return 429;
  return code === 'unsupported-type' ? 415 : code === 'too-large' ? 413 : 422;
}

// ─── The sheet as a picture, for the review screen ─────────────────────────────────────────────────────────────────

const sheetInFlight = new Map<string, Promise<Buffer>>();

/**
 * Sheet `n` of a drawing this server holds, as a PNG — drawn once in a worker thread and kept beside the file.
 * Rejects with `DrawingReadError` when the sheet cannot be drawn (a DXF has no page picture), `Error` when the
 * server no longer holds the file.
 */
export function getSheetImage(hash: string, n: number): Promise<Buffer> {
  if (!HASH_RE.test(hash) || !Number.isInteger(n) || n < 1 || n > 200) return Promise.reject(new DrawingReadError('empty', 'No such sheet.'));
  const key = `${hash}.s${n}`;
  const hit = sheetInFlight.get(key);
  if (hit) return hit;
  const run = (async (): Promise<Buffer> => {
    const file = join(FILE_DIR, `${key}.png`);
    try { if (existsSync(file) && Date.now() - statSync(file).mtimeMs <= FILE_TTL_MS) return readFileSync(file); } catch { /* draw it again */ }
    const bytes = getDrawingBytes(hash);
    if (!bytes) throw new Error('The drawing file is no longer held on this server — attach it again to see the sheet.');
    const { renderSheetOffThread } = await import('../drawing/sheet-image.js');
    const img = await fastLane(() => renderSheetOffThread(bytes, n));
    const png = Buffer.from(img.png);
    try { ensureDir(); writeFileSync(file, png); } catch { /* served from memory this once */ }
    return png;
  })().finally(() => { sheetInFlight.delete(key); });
  sheetInFlight.set(key, run);
  return run;
}
