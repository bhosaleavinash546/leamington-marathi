import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { exportComparisonExcel, exportMultiComparisonExcel } from '../controllers/exportController';

const router = Router();

router.get('/comparison/:id.xlsx',        requireAuth, exportComparisonExcel);
router.get('/multi-comparison/:id.xlsx',  requireAuth, exportMultiComparisonExcel);

export default router;
