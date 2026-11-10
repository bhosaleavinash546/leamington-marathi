/**
 * /api/drawing — the offline drawing reader on its own (offline 2D drawing intelligence, Nov 2026).
 *
 *   POST /read              a drawing in, its readings and their consolidation out. NO costing is started, no CAD is
 *                           needed, nothing is sent anywhere: "drawing-only extraction".
 *   GET  /jobs/:id          a drawing whose sheets need the OCR pass is read in the background, one at a time; the
 *                           screen polls this until it is done.
 *   GET  /:hash/sheet/:n    sheet n as a picture, for the review panel to show where a reading sits.
 *
 * Every route needs a session. This file calls no costing code and no AI client.
 */
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth-middleware.js';
import { cadLimiter } from './cad.js';
import { DrawingReadError } from '../drawing/index.js';
import { consolidate, type DrawingExtraction } from '../../src/engine/engineering-data/index.js';
import { specForCommodity } from '../../src/engine/cost-input-rules/index.js';
import {
  startDrawingRead, getDrawing, getDrawingJob, waitForDrawingJob, getSheetImage, drawingInfo, drawingErrorStatus, sweepDrawingFiles,
  MAX_DRAWING_BYTES, DRAWING_ACCEPT, type DrawingRecord,
} from '../services/drawing-service.js';
import { specLookup } from '../services/drawing-context.js';

const router = Router();
sweepDrawingFiles();   // drawings are kept for a day, as CAD uploads are

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DRAWING_BYTES, files: 1 } });
const readLimiter = cadLimiter(120, 'drawing reads');
const sheetLimiter = cadLimiter(600, 'drawing sheet pictures');

/** How long POST /read itself waits for an OCR pass before handing back a job to poll. */
const READ_WAIT_MS = Math.max(0, parseInt(process.env.CV_DRAWING_READ_WAIT_MS ?? '20000', 10) || 0);

/** A route with rules, or undefined — the consolidation then expects nothing and interprets route-independent readings only. */
function commodityOf(raw: unknown): string | undefined {
  const c = typeof raw === 'string' ? raw.trim() : '';
  return c && specForCommodity(c) ? c : undefined;
}

/** The reading and its consolidation with NO CAD: every parameter is the drawing's own, nothing is costed. */
function readingBody(rec: DrawingRecord, commodity: string | undefined): Record<string, unknown> {
  const ex: DrawingExtraction | null = rec.extraction;
  return {
    drawing: drawingInfo(rec),
    extraction: ex,
    engineeringData: ex ? consolidate({ drawing: ex, ...(commodity ? { commodity } : {}), specLookup: specLookup().lookup }) : null,
    // Said in the payload so no caller mistakes this for a costing.
    costing: null,
  };
}

router.post('/read', requireAuth, readLimiter, upload.fields([{ name: 'drawing', maxCount: 1 }, { name: 'drawingPdf', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const file = files?.drawing?.[0] ?? files?.drawingPdf?.[0];
    if (!file) { res.status(400).json({ error: `No drawing uploaded. Attach a ${DRAWING_ACCEPT.join(', ')} file as "drawing".` }); return; }
    const handle = startDrawingRead(file.buffer, file.originalname);
    const wait = req.body?.wait === '0' || req.body?.wait === 'false' ? 0 : READ_WAIT_MS;
    const rec = await handle.settled(wait);
    if (rec.status === 'failed') {
      res.status(rec.errorCode || rec.busy ? drawingErrorStatus(rec) : 500).json({ error: `The drawing cannot be read: ${rec.error}`, ...(rec.errorCode ? { code: `drawing_${rec.errorCode}` } : {}) });
      return;
    }
    res.status(rec.status === 'reading' ? 202 : 200).json(readingBody(rec, commodityOf(req.body?.commodity)));
  } catch (e) {
    if (e instanceof DrawingReadError) { res.status(drawingErrorStatus(e.code)).json({ error: `The drawing cannot be read: ${e.message}`, code: `drawing_${e.code}` }); return; }
    console.error('[drawing/read]', e instanceof Error ? e.message : String(e));
    res.status(500).json({ error: 'The drawing could not be read.' });
  }
});

router.get('/jobs/:id', requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id ?? '');
  const job = getDrawingJob(id);
  if (!job) { res.status(404).json({ error: 'No such drawing job on this server — attach the drawing again.' }); return; }
  // A short wait so a poll that arrives just before the read ends gets the result in one round trip.
  if ((job.status === 'queued' || job.status === 'running') && req.query.wait === '1') await waitForDrawingJob(id, 8000);
  const now = getDrawingJob(id)!;
  const rec = getDrawing(now.hash);
  res.json({
    jobId: now.id, status: now.status, ahead: now.ahead, error: now.error,
    elapsedMs: (now.finishedAt ?? Date.now()) - now.queuedAt,
    ...(rec ? { drawing: drawingInfo(rec) } : {}),
    // With ?reading=1 the finished reading itself (the drawing-only flow); the CAD screen asks the costing route instead.
    ...(now.status === 'done' && rec && req.query.reading === '1' ? readingBody(rec, commodityOf(req.query.commodity)) : {}),
  });
});

router.get('/:hash/sheet/:n', requireAuth, sheetLimiter, async (req: Request, res: Response) => {
  try {
    const png = await getSheetImage(String(req.params.hash ?? ''), Number(req.params.n));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(png);
  } catch (e) {
    if (e instanceof DrawingReadError) { res.status(e.code === 'empty' ? 404 : 415).json({ error: e.message }); return; }
    res.status(404).json({ error: e instanceof Error ? e.message : 'The sheet could not be drawn.' });
  }
});

// Multer's own errors (a file over the limit) as JSON, not a generic 500.
router.use((err: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
  if (err instanceof multer.MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `The drawing is over the ${MAX_DRAWING_BYTES / 1048576} MB limit.` : `Upload error: ${err.message}` });
    return;
  }
  next(err);
});

export default router;
