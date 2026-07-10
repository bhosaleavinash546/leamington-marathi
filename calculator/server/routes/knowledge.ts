/**
 * Knowledge base API — the self-learning loop's transport.
 *
 *   POST /api/knowledge/case     remember (upsert) the current costing as a case
 *   POST /api/knowledge/similar  find similar past cases → suggestions + proactive insights
 *   POST /api/knowledge/actual   attach a real quoted/PO price to a stored case
 *   GET  /api/knowledge/stats    knowledge-base size / coverage (trust dashboard)
 *
 * Reads span the whole organisation (shared memory); writes are authenticated.
 */

import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth-middleware.js';
import { ensureKnowledgeTable, upsertCase, listCases, recordActual, knowledgeStats, type UpsertCaseInput } from '../data/knowledge-store.js';
import { findSimilarCases, deriveSuggestions, proactiveInsights, type PartFingerprint } from '../../src/engine/part-similarity.js';
import { computeIntelligenceSummary } from '../../src/engine/intelligence.js';

ensureKnowledgeTable(db);

const router = Router();
router.use(requireAuth);
router.use(rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false }));

router.post('/case', (req: AuthenticatedRequest, res: Response): void => {
  const c = req.body as UpsertCaseInput;
  if (!c?.partName || !c?.fingerprint?.commodity || !(c.totalCost > 0)) {
    res.status(400).json({ error: 'partName, fingerprint.commodity and totalCost are required' });
    return;
  }
  const saved = upsertCase(db, req.user!.userId, c);
  res.json({ success: true, case: saved, stats: knowledgeStats(db) });
});

router.post('/similar', (req: AuthenticatedRequest, res: Response): void => {
  const { fingerprint, currentTotal, breakdown, excludePartName } = req.body as {
    fingerprint?: PartFingerprint; currentTotal?: number; breakdown?: Record<string, number>; excludePartName?: string;
  };
  if (!fingerprint?.commodity) { res.status(400).json({ error: 'fingerprint.commodity is required' }); return; }
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const cases = listCases(db, fingerprint.commodity)
    .filter(c => !excludePartName || norm(c.partName) !== norm(excludePartName));   // don't match a part to itself
  const similar = findSimilarCases(fingerprint, cases, 3, 0.55);
  const suggestions = deriveSuggestions(similar, currentTotal);
  const insights = proactiveInsights(similar, { totalCost: currentTotal ?? 0, breakdown }, cases.length);
  res.json({ success: true, similar, suggestions, insights, stats: knowledgeStats(db) });
});

router.post('/actual', (req: AuthenticatedRequest, res: Response): void => {
  const { partName, commodity, actualCost } = req.body as { partName?: string; commodity?: string; actualCost?: number };
  if (!partName || !commodity || !(actualCost && actualCost > 0)) {
    res.status(400).json({ error: 'partName, commodity and a positive actualCost are required' });
    return;
  }
  res.json({ success: true, updated: recordActual(db, partName, commodity, actualCost) });
});

router.get('/stats', (_req: AuthenticatedRequest, res: Response): void => {
  res.json({ success: true, stats: knowledgeStats(db) });
});

/** Step 6 — the trust dashboard: is the tool measurably getting smarter? */
router.get('/intelligence', (_req: AuthenticatedRequest, res: Response): void => {
  res.json({ success: true, intelligence: computeIntelligenceSummary(listCases(db, undefined, 5000)) });
});

export default router;
