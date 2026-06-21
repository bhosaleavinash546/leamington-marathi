import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listAssemblies,
  getAssembly,
  createAssembly,
  addAssemblyLine,
  deleteAssemblyLine,
  deleteAssembly,
} from '../controllers/assemblyController';

const router = Router();

// Assembly headers
router.get('/',                       requireAuth, requireRole('internal', 'admin'), listAssemblies);
router.get('/:id',                    requireAuth, requireRole('internal', 'admin'), getAssembly);
router.post('/',                      requireAuth, requireRole('internal', 'admin'), createAssembly);
router.delete('/:id',                 requireAuth, requireRole('internal', 'admin'), deleteAssembly);

// BOM lines nested under assembly
router.post('/:id/lines',             requireAuth, requireRole('internal', 'admin'), addAssemblyLine);
router.delete('/:id/lines/:lineId',   requireAuth, requireRole('internal', 'admin'), deleteAssemblyLine);

export default router;
