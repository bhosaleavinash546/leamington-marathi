import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { estimateShouldCost } from '../controllers/cerController';
import {
  logAccuracy,
  listAccuracy,
  updateActual,
  getAccuracySummary,
} from '../controllers/cerAccuracyController';

const router = Router();

// Accuracy routes — must be before :id-style routes to avoid conflicts
router.get('/accuracy/summary', requireAuth, getAccuracySummary);
router.get('/accuracy',         requireAuth, listAccuracy);
router.post('/accuracy',        requireAuth, logAccuracy);
router.patch('/accuracy/:id/actual', requireAuth, updateActual);

// POST /api/cer/estimate
router.post('/estimate', requireAuth, estimateShouldCost);

export default router;
