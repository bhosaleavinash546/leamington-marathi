import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { estimateShouldCost } from '../controllers/cerController';

const router = Router();

// POST /api/cer/estimate
router.post('/estimate', requireAuth, estimateShouldCost);

export default router;
