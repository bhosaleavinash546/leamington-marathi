import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { exportAcrCommitmentExcel } from '../controllers/acrCommitmentController';

const router = Router();

// GET /api/export/acr/:id/commitment.xlsx
router.get('/:id/commitment.xlsx', requireAuth, exportAcrCommitmentExcel);

export default router;
