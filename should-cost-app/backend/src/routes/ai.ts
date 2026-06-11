import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  generateSnapshotInsights,
  streamSnapshotInsights,
  buildShouldCostWithAI,
  nlSearch,
  listInsights,
} from '../controllers/aiController';

const router = Router();

router.post('/insights',             requireAuth, requireRole('internal', 'admin'), generateSnapshotInsights);
router.post('/insights/stream',      requireAuth, requireRole('internal', 'admin'), streamSnapshotInsights);
router.post('/build-should-cost',    requireAuth, requireRole('internal', 'admin'), buildShouldCostWithAI);
router.post('/nl-search',            requireAuth, requireRole('internal', 'admin'), nlSearch);
router.get('/insights/:snapshotId',  requireAuth, listInsights);

export default router;
