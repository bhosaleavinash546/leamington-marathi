import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listShouldCosts,
  getShouldCost,
  createShouldCost,
  updateShouldCostStatus,
  updateShouldCostProcessParams,
} from '../controllers/shouldCostController';

const router = Router();

router.get('/',      requireAuth, listShouldCosts);
router.get('/:id',   requireAuth, getShouldCost);
router.post('/',     requireAuth, requireRole('internal', 'admin'), createShouldCost);
router.patch('/:id/status',        requireAuth, requireRole('internal', 'admin'), updateShouldCostStatus);
router.patch('/:id/process-params', requireAuth, requireRole('internal', 'admin'), updateShouldCostProcessParams);

export default router;
