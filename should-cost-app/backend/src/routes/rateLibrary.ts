import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listRates,
  createRate,
  updateRate,
  deleteRate,
  getProcessTypes,
  getCountries,
} from '../controllers/rateLibraryController';

const router = Router();

// Dropdown helpers (no admin required, just auth)
router.get('/process-types', requireAuth, getProcessTypes);
router.get('/countries',     requireAuth, getCountries);

// CRUD
router.get('/',      requireAuth,                      listRates);
router.post('/',     requireAuth, requireRole('admin'), createRate);
router.patch('/:id', requireAuth, requireRole('admin'), updateRate);
router.delete('/:id',requireAuth, requireRole('admin'), deleteRate);

export default router;
