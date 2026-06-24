import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  exportComparisonExcel,
  exportMultiComparisonExcel,
  exportThreeWayExcel,
  exportThreeWayPptx,
  exportShouldCostExcel,
  exportShouldCostHtml,
  exportNegotiationsCsv,
  exportAcrCsv,
  exportCommodityPricesCsv,
  exportShouldCostListCsv,
  exportQuotesCsv,
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

// CSV exports
router.get('/negotiations.csv',       requireAuth, requireRole('internal', 'admin'), exportNegotiationsCsv);
router.get('/acr.csv',                requireAuth, requireRole('internal', 'admin'), exportAcrCsv);
router.get('/commodity-prices.csv',   requireAuth, exportCommodityPricesCsv);
router.get('/should-costs.csv',       requireAuth, requireRole('internal', 'admin'), exportShouldCostListCsv);
router.get('/quotes.csv',             requireAuth, requireRole('internal', 'admin'), exportQuotesCsv);

export default router;
