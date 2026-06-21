import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listShouldCosts,
  getShouldCost,
  createShouldCost,
  updateShouldCostStatus,
  updateShouldCostProcessParams,
} from '../controllers/shouldCostController';
import { getPartFamilyNorms, getCommodityDetail } from '../controllers/partFamilyNormsController';
import { listVersionsForPart, compareVersions } from '../controllers/versionDiffController';

const router = Router();

// Norms and diff routes — must come before /:id to avoid conflicts
router.get('/norms',              requireAuth, getPartFamilyNorms);
router.get('/norms/:commodity',   requireAuth, getCommodityDetail);
router.get('/versions/:partId',   requireAuth, listVersionsForPart);
router.get('/diff',               requireAuth, compareVersions);

router.get('/',      requireAuth, listShouldCosts);
router.get('/:id',   requireAuth, getShouldCost);
router.post('/',     requireAuth, requireRole('internal', 'admin'), createShouldCost);
router.patch('/:id/status',        requireAuth, requireRole('internal', 'admin'), updateShouldCostStatus);
router.patch('/:id/process-params', requireAuth, requireRole('internal', 'admin'), updateShouldCostProcessParams);

export default router;
