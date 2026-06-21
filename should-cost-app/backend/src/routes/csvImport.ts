import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { importPartsCsv } from '../controllers/csvImportController';

const router = Router();

// POST /api/import/parts
// Body: raw text/plain CSV content
router.post('/parts', requireAuth, requireRole('admin', 'internal'), importPartsCsv);

export default router;
