import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listNegotiations,
  getNegotiation,
  createNegotiation,
  updateNegotiation,
  deleteNegotiation,
  negotiationSummary,
} from '../controllers/negotiationController';

const router = Router();

router.get('/',           requireAuth, requireRole('internal', 'admin'), listNegotiations);
router.get('/summary',    requireAuth, requireRole('internal', 'admin'), negotiationSummary);
router.get('/:id',        requireAuth, requireRole('internal', 'admin'), getNegotiation);
router.post('/',          requireAuth, requireRole('internal', 'admin'), createNegotiation);
router.patch('/:id',      requireAuth, requireRole('internal', 'admin'), updateNegotiation);
router.delete('/:id',     requireAuth, requireRole('internal', 'admin'), deleteNegotiation);

export default router;
