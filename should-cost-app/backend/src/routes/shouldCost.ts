import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listShouldCosts,
  getShouldCost,
  createShouldCost,
  updateShouldCostStatus,
} from '../controllers/shouldCostController';

const router = Router();

router.get('/',      requireAuth, listShouldCosts);
router.get('/:id',   requireAuth, getShouldCost);
router.post('/',     requireAuth, requireRole('internal', 'admin'), createShouldCost);
router.patch('/:id/status', requireAuth, requireRole('internal', 'admin'), updateShouldCostStatus);

export default router;
