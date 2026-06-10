import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listMultiComparisons,
  getMultiComparison,
  createMultiComparison,
  generateMultiAI,
} from '../controllers/multiComparisonController';

const router = Router();

router.get('/',        requireAuth, listMultiComparisons);
router.get('/:id',     requireAuth, getMultiComparison);
router.post('/',       requireAuth, requireRole('internal', 'admin'), createMultiComparison);
router.post('/:id/ai', requireAuth, requireRole('internal', 'admin'), generateMultiAI);

export default router;
