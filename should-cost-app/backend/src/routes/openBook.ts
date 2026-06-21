import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  createShare,
  listSharesForHeader,
  getMyShares,
  getShareResponses,
  addLineResponse,
  closeShare,
} from '../controllers/openBookController';

const router = Router();

// POST /api/open-book/share
router.post('/share', requireAuth, requireRole('internal', 'admin'), createShare);

// GET /api/open-book/shares/:headerId
router.get('/shares/:headerId', requireAuth, requireRole('internal', 'admin'), listSharesForHeader);

// GET /api/open-book/my-shares
router.get('/my-shares', requireAuth, getMyShares);

// GET /api/open-book/shares/:shareId/responses
router.get('/shares/:shareId/responses', requireAuth, getShareResponses);

// POST /api/open-book/shares/:shareId/responses
router.post('/shares/:shareId/responses', requireAuth, addLineResponse);

// PATCH /api/open-book/shares/:shareId/close
router.patch('/shares/:shareId/close', requireAuth, requireRole('internal', 'admin'), closeShare);

export default router;
