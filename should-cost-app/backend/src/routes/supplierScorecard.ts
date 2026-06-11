import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listScorecard, getSupplierDetail } from '../controllers/supplierScorecardController';

const router = Router();

router.get('/',              requireAuth, requireRole('internal', 'admin'), listScorecard);
router.get('/:supplierId',   requireAuth, requireRole('internal', 'admin'), getSupplierDetail);

export default router;
