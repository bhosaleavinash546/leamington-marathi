import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSystems, getSubsystems, getComponents, getFilteredParts } from '../controllers/vehicleController';

const router = Router();

router.get('/systems',    requireAuth, getSystems);
router.get('/subsystems', requireAuth, getSubsystems);
router.get('/components', requireAuth, getComponents);
router.get('/parts',      requireAuth, getFilteredParts);

export default router;
