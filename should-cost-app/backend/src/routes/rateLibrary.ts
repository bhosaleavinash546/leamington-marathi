import { Router } from 'express';
import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listRates,
  createRate,
  updateRate,
  deleteRate,
  getProcessTypes,
  getCountries,
  validateRate,
  importRatesCsv,
} from '../controllers/rateLibraryController';

const router = Router();

// Dropdown helpers (no admin required, just auth)
router.get('/process-types', requireAuth, getProcessTypes);
router.get('/countries',     requireAuth, getCountries);

// CSV import — must come before /:id routes
router.post(
  '/import',
  requireAuth,
  requireRole('admin'),
  express.raw({ type: 'text/plain', limit: '5mb' }),
  importRatesCsv
);

// CRUD
router.get('/',      requireAuth,                      listRates);
router.post('/',     requireAuth, requireRole('admin'), createRate);
router.patch('/:id/validate', requireAuth, requireRole('admin'), validateRate);
router.patch('/:id', requireAuth, requireRole('admin'), updateRate);
router.delete('/:id',requireAuth, requireRole('admin'), deleteRate);

export default router;
