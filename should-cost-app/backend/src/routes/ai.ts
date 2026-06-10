import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { generateSnapshotInsights, listInsights } from '../controllers/aiController';

const router = Router();

router.post('/insights',             requireAuth, requireRole('internal', 'admin'), generateSnapshotInsights);
router.get('/insights/:snapshotId',  requireAuth, listInsights);

export default router;
