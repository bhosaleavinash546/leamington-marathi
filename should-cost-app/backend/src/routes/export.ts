import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  exportComparisonExcel,
  exportMultiComparisonExcel,
  exportThreeWayExcel,
  exportThreeWayPptx,
  exportShouldCostExcel,
  exportShouldCostHtml,
} from '../controllers/exportController';
import { generateRfqExcel } from '../controllers/rfqController';

const router = Router();

router.get('/comparison/:id.xlsx',           requireAuth, exportComparisonExcel);
router.get('/multi-comparison/:id.xlsx',     requireAuth, exportMultiComparisonExcel);
router.get('/three-way/:partId.xlsx',        requireAuth, exportThreeWayExcel);
router.get('/three-way/:partId.pptx',        requireAuth, exportThreeWayPptx);
router.get('/should-cost/:id.xlsx',          requireAuth, exportShouldCostExcel);
router.get('/should-cost/:id/report.html',   requireAuth, exportShouldCostHtml);
router.get('/rfq/:id.xlsx',                  requireAuth, requireRole('internal', 'admin'), generateRfqExcel);

export default router;
