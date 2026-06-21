import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listCommodityTemplates,
  getCommodityTemplate,
} from '../controllers/commodityTemplateController';

const router = Router();

// All reads are restricted to authenticated internal/admin users.
// Templates are reference data — no write endpoints exposed via the API
// (managed via schema_v7.sql seed or database migrations).
router.get('/',    requireAuth, requireRole('internal', 'admin'), listCommodityTemplates);
router.get('/:id', requireAuth, requireRole('internal', 'admin'), getCommodityTemplate);

export default router;
