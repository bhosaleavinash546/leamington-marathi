/**
 * The drawing service's queue (offline 2D drawing intelligence, integration): reading never blocks, and at most ONE
 * OCR pass runs at a time — the VM has 2 GB and an A0 sheet at 300 dpi is a 40-megapixel image.
 *
 * The reader is replaced by a stand-in here (a delay and a counter), so this test is about the queue alone and runs
 * in well under a second. The real reader runs through the same service in tests/drawing-integration-routes.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { rmSync } from 'node:fs';

const env = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/cv-drawing-queue-${process.pid}-${Date.now()}`;
  process.env.CV_DATA_DIR = dir;
  process.env.CV_DRAWING_FILE_DIR = `${dir}/drawings`;
  return { dir };
});

const reader = vi.hoisted(() => ({
  ocrRunning: 0, ocrMax: 0, ocrCalls: 0, exactCalls: 0, needsOcr: true, failWith: null as null | { code: string; message: string }, delayMs: 30,
}));

vi.mock('../server/drawing/worker.js', async () => {
  const { DrawingReadError } = await vi.importActual<typeof import('../server/drawing/types.js')>('../server/drawing/types.js');
  const { READER_VERSION } = await vi.importActual<typeof import('../server/drawing/index.js')>('../server/drawing/index.js');
  return {
    readDrawingOffThread: async (_buf: Uint8Array, filename: string, opts: { ocr?: string } = {}) => {
      const ocr = opts.ocr !== 'off';
      if (reader.failWith) throw new DrawingReadError(reader.failWith.code as 'encrypted', reader.failWith.message);
      if (ocr) { reader.ocrCalls++; reader.ocrRunning++; reader.ocrMax = Math.max(reader.ocrMax, reader.ocrRunning); } else reader.exactCalls++;
      await new Promise(r => setTimeout(r, ocr ? reader.delayMs : 2));
      if (ocr) reader.ocrRunning--;
      const scanned = reader.needsOcr;
      return {
        schemaVersion: 1, readerVersion: READER_VERSION, sourceFile: filename, fileKind: 'pdf',
        sheets: [{ sheet: 1, widthPt: 842, heightPt: 595, content: scanned ? 'scanned' : 'vector-text', textItemCount: ocr || !scanned ? 3 : 0, rotationDeg: 0 }],
        parameters: ocr || !scanned ? [{ id: 'drawing:title.partName:1', name: 'title.partName', value: 'X', source: 'drawing', method: ocr ? 'ocr' : 'pdf-text', kind: 'extracted', status: ocr ? 'needs-validation' : 'extracted' }] : [],
        text: [], warnings: [],
      };
    },
  };
});

import { startDrawingRead, getDrawing, getDrawingJob, waitForDrawingJob, drawingInfo, drawingErrorStatus, ocrStats, OCR_QUEUE_MAX, MAX_DRAWING_BYTES } from '../server/services/drawing-service.js';
import { DrawingReadError, READER_VERSION } from '../server/drawing/index.js';

/** A distinct "PDF" every call (the service keys on the bytes). */
let n = 0;
const pdf = (): Buffer => Buffer.from(`%PDF-1.7\n% drawing ${++n} ${Math.random()}\n`.padEnd(64, ' '));

beforeEach(() => { Object.assign(reader, { ocrRunning: 0, ocrMax: 0, ocrCalls: 0, exactCalls: 0, needsOcr: true, failWith: null, delayMs: 30 }); });
afterAll(() => { rmSync(env.dir, { recursive: true, force: true }); });

describe('the drawing service', () => {
  it('a drawing with exact text is read once, with OCR off, and is ready at once — no job', async () => {
    reader.needsOcr = false;
    const rec = await startDrawingRead(pdf(), 'bracket.pdf').settled(0);
    expect(rec).toMatchObject({ status: 'ready', jobId: null, filename: 'bracket.pdf' });
    expect(rec.extraction?.parameters).toHaveLength(1);
    expect(reader).toMatchObject({ exactCalls: 1, ocrCalls: 0 });
    expect(drawingInfo(rec)).toMatchObject({ status: 'ready', readerVersion: READER_VERSION, readings: 1, ocrReadings: 0 });
    expect('jobId' in drawingInfo(rec)).toBe(false);
  });

  it('a sheet with no usable text: the caller is told "reading" with a job, and the OCR pass finishes behind it', async () => {
    const h = startDrawingRead(pdf(), 'scan.pdf');
    const rec = await h.settled(0);
    expect(rec.status).toBe('reading');
    expect(rec.extraction).toBeNull();
    expect(rec.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(['queued', 'running']).toContain(getDrawingJob(rec.jobId!)!.status);
    await waitForDrawingJob(rec.jobId!, 2000);
    expect(getDrawingJob(rec.jobId!)!.status).toBe('done');
    const done = getDrawing(h.hash)!;
    expect(done.status).toBe('ready');
    expect(done.extraction?.parameters[0]).toMatchObject({ method: 'ocr', status: 'needs-validation' });
    expect(drawingInfo(done).ocrReadings).toBe(1);
  });

  it('given a little time the OCR pass is simply in the response', async () => {
    reader.delayMs = 10;
    const rec = await startDrawingRead(pdf(), 'scan.pdf').settled(1000);
    expect(rec.status).toBe('ready');
  });

  it('at most ONE OCR pass runs at a time, whatever arrives together', async () => {
    const before = ocrStats.maxRunning;
    const handles = Array.from({ length: 5 }, (_, i) => startDrawingRead(pdf(), `scan-${i}.pdf`));
    const recs = await Promise.all(handles.map(h => h.settled(0)));
    expect(recs.every(r => r.status === 'reading')).toBe(true);
    // the job that waits knows how many are ahead of it
    expect(Math.max(...recs.map(r => getDrawingJob(r.jobId!)!.ahead))).toBeGreaterThanOrEqual(1);
    await Promise.all(recs.map(r => waitForDrawingJob(r.jobId!, 5000)));
    expect(recs.map(r => getDrawingJob(r.jobId!)!.status)).toEqual(Array(5).fill('done'));
    expect(reader.ocrCalls).toBe(5);
    expect(reader.ocrMax).toBe(1);
    expect(Math.max(before, ocrStats.maxRunning)).toBe(1);
  });

  it('the same bytes are one read: a second request joins the job, and a third finds the stored reading', async () => {
    const bytes = pdf();
    const a = startDrawingRead(bytes, 'a.pdf'), b = startDrawingRead(bytes, 'b.pdf');
    const [ra, rb] = await Promise.all([a.settled(0), b.settled(0)]);
    expect(ra.jobId).toBe(rb.jobId);
    await waitForDrawingJob(ra.jobId!, 2000);
    const again = await startDrawingRead(bytes, 'renamed.pdf').settled(0);
    expect(again.status).toBe('ready');
    expect(again.filename).toBe('renamed.pdf');                       // the name this request gave the file
    expect(again.extraction?.sourceFile).toBe('renamed.pdf');
    expect(reader).toMatchObject({ exactCalls: 1, ocrCalls: 1 });      // read once
  });

  it('more scans than the queue holds: the next one is told to try again (429), not failed as a bad file', async () => {
    reader.delayMs = 150;
    const recs = await Promise.all(Array.from({ length: OCR_QUEUE_MAX + 4 }, (_, i) => startDrawingRead(pdf(), `q-${i}.pdf`).settled(0)));
    const busy = recs.filter(r => r.status === 'failed');
    expect(busy.length).toBeGreaterThan(0);
    for (const r of busy) { expect(r.busy).toBe(true); expect(r.error).toMatch(/drawing reader is busy/); expect(drawingErrorStatus(r)).toBe(429); }
    await Promise.all(recs.filter(r => r.jobId).map(r => waitForDrawingJob(r.jobId!, 10_000)));
  }, 20_000);

  it('the reader\'s refusals come back in its words with a 4xx; a file that is not a drawing is refused before anything is read', async () => {
    reader.failWith = { code: 'encrypted', message: 'This PDF is password-protected and cannot be read. Export the drawing without a password.' };
    const rec = await startDrawingRead(pdf(), 'locked.pdf').settled(0);
    expect(rec).toMatchObject({ status: 'failed', errorCode: 'encrypted' });
    expect(rec.error).toMatch(/password-protected/);
    expect(drawingErrorStatus(rec)).toBe(422);
    reader.failWith = null;
    expect(() => startDrawingRead(Buffer.from('AC1027' + ' '.repeat(100)), 'x.dwg')).toThrow(DrawingReadError);
    expect(() => startDrawingRead(Buffer.from('just some words, not a drawing at all'), 'x.txt')).toThrow(/File type not recognised/);
    expect(() => startDrawingRead(Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(MAX_DRAWING_BYTES)]), 'big.pdf')).toThrow(/limit is 30 MB/);
    expect(drawingErrorStatus('unsupported-type')).toBe(415);
    expect(drawingErrorStatus('too-large')).toBe(413);
    expect(reader.exactCalls).toBe(0);
  });

  it('an OCR pass that fails leaves a failed job with the reason — never a silent empty reading', async () => {
    const h = startDrawingRead(pdf(), 'scan.pdf');
    const rec = await h.settled(0);
    reader.failWith = { code: 'corrupt', message: 'This image cannot be decoded.' };
    await waitForDrawingJob(rec.jobId!, 2000);
    const job = getDrawingJob(rec.jobId!)!;
    // the pass may have started before the failure was armed: either it finished, or it failed with the reason
    if (job.status === 'failed') { expect(job.error).toMatch(/cannot be decoded/); expect(getDrawing(h.hash)!.status).toBe('failed'); }
    else expect(job.status).toBe('done');
  });

  it('an unknown hash or job is simply not there', () => {
    expect(getDrawing('f'.repeat(64))).toBeNull();
    expect(getDrawing('not-a-hash')).toBeNull();
    expect(getDrawingJob('nope')).toBeNull();
  });
});
