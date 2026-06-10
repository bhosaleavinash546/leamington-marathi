import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  getOpportunitySummary,
  getOpportunityBySystem,
  getTopOpportunityParts,
  getVersionTrend,
  getElementHeatmap,
  getSupplierScoreboard,
} from '../controllers/opportunityController';

const router = Router();

router.get('/summary',            requireAuth, requireRole('internal', 'admin'), getOpportunitySummary);
router.get('/by-system',          requireAuth, requireRole('internal', 'admin'), getOpportunityBySystem);
router.get('/top-parts',          requireAuth, requireRole('internal', 'admin'), getTopOpportunityParts);
router.get('/version-trend',      requireAuth, requireRole('internal', 'admin'), getVersionTrend);
router.get('/element-heatmap',    requireAuth, requireRole('internal', 'admin'), getElementHeatmap);
router.get('/supplier-scoreboard',requireAuth, requireRole('internal', 'admin'), getSupplierScoreboard);

export default router;
