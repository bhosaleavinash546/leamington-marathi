/**
 * Runtime error observability (server half).
 *
 * Receives client error reports, validates and bounds them, logs them so they
 * surface in the hosting platform's logs, and keeps a small in-memory ring of
 * recent errors for a quick `/recent` health peek. Rate-limited so a misbehaving
 * client can't flood the logs.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

const router = Router();

export const errorReportSchema = z.object({
  kind: z.string().max(40),
  message: z.string().max(2000).optional(),
  stack: z.string().max(8000).optional(),
  source: z.string().max(500).optional(),
  line: z.number().finite().optional(),
  col: z.number().finite().optional(),
  url: z.string().max(1000).optional(),
  ua: z.string().max(500).optional(),
  ts: z.string().max(40).optional(),
  mode: z.string().max(20).optional(),
  breadcrumbs: z.array(z.string().max(200)).max(20).optional(),
});

export type ErrorReport = z.infer<typeof errorReportSchema>;

/** One-line log summary for a client error (exported for testing). */
export function summariseError(e: ErrorReport): string {
  const loc = e.source ? ` @ ${e.source}:${e.line ?? '?'}:${e.col ?? '?'}` : '';
  return `[client-error] ${e.kind}: ${e.message ?? '(no message)'}${loc} — ${e.url ?? ''}`;
}

const _recent: Array<ErrorReport & { receivedAt: string }> = [];
const RECENT_CAP = 200;

const limiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

router.post('/error', limiter, (req, res): void => {
  const parsed = errorReportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ ok: false }); return; }

  const e = parsed.data;
  console.error(summariseError(e));
  if (e.stack) console.error('  ' + e.stack.split('\n').slice(0, 4).map(s => s.trim()).join(' | '));

  _recent.push({ ...e, receivedAt: new Date().toISOString() });
  if (_recent.length > RECENT_CAP) _recent.shift();

  res.json({ ok: true });
});

/** Quick operational peek at the most recent client errors. */
router.get('/recent', (_req, res): void => {
  res.json({ count: _recent.length, errors: _recent.slice(-50) });
});

export default router;
