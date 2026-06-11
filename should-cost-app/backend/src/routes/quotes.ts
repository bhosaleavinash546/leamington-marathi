import { Router } from 'express';
import { requireAuth, requireRole, isolateSupplier } from '../middleware/auth';
import {
  listQuotes,
  getQuote,
  createQuote,
  updateQuoteStatus,
} from '../controllers/quotesController';
import { importQuotes, downloadTemplate } from '../controllers/quoteImportController';

const router = Router();

router.get('/',      requireAuth, isolateSupplier, listQuotes);
router.get('/import/template', requireAuth, requireRole('internal', 'admin'), downloadTemplate);
router.get('/:id',   requireAuth, getQuote);
router.post('/',     requireAuth, requireRole('supplier', 'internal', 'admin'), createQuote);
router.post('/import', requireAuth, requireRole('internal', 'admin'), importQuotes);
router.patch('/:id/status', requireAuth, requireRole('internal', 'admin'), updateQuoteStatus);

export default router;

