import { Router } from 'express';
import {
  getOperatorDashboard,
  createPendingUser,
  getOperatorUsers,
  createPendingGroup,
  getOperatorGroups,
  getApprovedGroups,
} from '../controllers/operatorController';
import { authMiddleware, operatorOnly } from '../middleware/authMiddleware';

const router = Router();

// Все маршруты защищены: authMiddleware + operatorOnly
router.use(authMiddleware, operatorOnly);

router.get('/dashboard', getOperatorDashboard);
router.get('/users', getOperatorUsers);
router.post('/users', createPendingUser);
router.get('/groups', getOperatorGroups);
router.post('/groups', createPendingGroup);
router.get('/approved-groups', getApprovedGroups);

export default router;
