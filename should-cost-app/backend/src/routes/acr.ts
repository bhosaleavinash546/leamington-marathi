import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listAcrTargets,
  acrSummary,
  createAcrTarget,
  updateAcrTarget,
  deleteAcrTarget,
} from '../controllers/acrController';

const router = Router();

router.get('/',         requireAuth, requireRole('internal', 'admin'), listAcrTargets);
router.get('/summary',  requireAuth, requireRole('internal', 'admin'), acrSummary);
router.post('/',        requireAuth, requireRole('internal', 'admin'), createAcrTarget);
router.patch('/:id',    requireAuth, requireRole('internal', 'admin'), updateAcrTarget);
router.delete('/:id',   requireAuth, requireRole('internal', 'admin'), deleteAcrTarget);

export default router;
