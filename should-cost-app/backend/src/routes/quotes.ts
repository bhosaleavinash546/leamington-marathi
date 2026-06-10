import { Router } from 'express';
import { requireAuth, requireRole, isolateSupplier } from '../middleware/auth';
import {
  listQuotes,
  getQuote,
  createQuote,
  updateQuoteStatus,
} from '../controllers/quotesController';

const router = Router();

router.get('/',      requireAuth, isolateSupplier, listQuotes);
router.get('/:id',   requireAuth, getQuote);
router.post('/',     requireAuth, requireRole('supplier', 'internal', 'admin'), createQuote);
router.patch('/:id/status', requireAuth, requireRole('internal', 'admin'), updateQuoteStatus);

export default router;
