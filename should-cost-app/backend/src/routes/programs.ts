import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listPrograms, getProgram, listPartsByProgram } from '../controllers/programController';

const router = Router();

router.get('/',          requireAuth, listPrograms);
router.get('/:id',       requireAuth, getProgram);
router.get('/:id/parts', requireAuth, listPartsByProgram);

export default router;
