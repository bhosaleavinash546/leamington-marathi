import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listComparisons,
  getComparison,
  createComparison,
} from '../controllers/comparisonController';

const router = Router();

router.get('/',      requireAuth, listComparisons);
router.get('/:id',   requireAuth, getComparison);
router.post('/',     requireAuth, requireRole('internal', 'admin'), createComparison);

export default router;
