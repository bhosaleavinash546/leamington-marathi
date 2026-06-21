import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listCommodityPrices,
  commodityPriceSummary,
  commodityPriceHistory,
  createCommodityPrice,
} from '../controllers/commodityPriceController';

const router = Router();

// Read — internal and admin
router.get('/',                      requireAuth, requireRole('internal', 'admin'), listCommodityPrices);
router.get('/summary',               requireAuth, requireRole('internal', 'admin'), commodityPriceSummary);
router.get('/history/:materialCode', requireAuth, requireRole('internal', 'admin'), commodityPriceHistory);

// Write — internal and admin
router.post('/', requireAuth, requireRole('internal', 'admin'), createCommodityPrice);

export default router;
