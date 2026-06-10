import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getLatestCurrentPrice, createCurrentPrice, listCurrentPrices } from '../controllers/currentPriceController';

const router = Router();

router.get('/',              requireAuth, listCurrentPrices);
router.get('/part/:partId',  requireAuth, getLatestCurrentPrice);
router.post('/',             requireAuth, requireRole('admin', 'internal'), createCurrentPrice);

export default router;
