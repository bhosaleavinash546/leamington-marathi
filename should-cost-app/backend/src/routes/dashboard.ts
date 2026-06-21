import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getDashboard } from '../controllers/dashboardController';

const router = Router();

router.get('/', requireAuth, requireRole('internal', 'admin'), getDashboard);

export default router;
