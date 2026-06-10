import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getThreeWayComparison, listPartsForThreeWay } from '../controllers/threeWayController';

const router = Router();

router.get('/parts',          requireAuth, listPartsForThreeWay);
router.get('/compare/:partId', requireAuth, getThreeWayComparison);

export default router;
