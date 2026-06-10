import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listComments, addComment, deleteComment } from '../controllers/commentController';

const router = Router({ mergeParams: true });

router.get('/',            requireAuth, listComments);
router.post('/',           requireAuth, addComment);
router.delete('/:id',      requireAuth, deleteComment);

export default router;
