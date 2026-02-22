import { Router } from 'express';
import {
  getPendingItems,
  approveUser,
  rejectUser,
  approveGroup,
  rejectGroup,
} from '../controllers/approvalController';
import { authMiddleware, adminOnly } from '../middleware/authMiddleware';

const router = Router();

// Все маршруты защищены: authMiddleware + adminOnly
router.use(authMiddleware, adminOnly);

router.get('/pending', getPendingItems);
router.post('/users/:id/approve', approveUser);
router.post('/users/:id/reject', rejectUser);
router.post('/groups/:id/approve', approveGroup);
router.post('/groups/:id/reject', rejectGroup);

export default router;
