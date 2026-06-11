import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listFamilies, getFamily } from '../controllers/crossModelController';

const router = Router();

router.get('/families',     requireAuth, listFamilies);
router.get('/family/:code', requireAuth, getFamily);

export default router;
