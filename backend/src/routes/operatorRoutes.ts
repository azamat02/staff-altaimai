import { Router } from 'express';
import {
  getOperatorDashboard,
  createPendingUser,
  getOperatorUsers,
  createPendingGroup,
  getOperatorGroups,
  getApprovedGroups,
  updateOperatorGroup,
  submitGroup,
} from '../controllers/operatorController';
import { authMiddleware, operatorOrUserOperator } from '../middleware/authMiddleware';

const router = Router();

// Все маршруты защищены: authMiddleware + operatorOrUserOperator (Admin-OPERATOR или User с isOperator)
router.use(authMiddleware, operatorOrUserOperator);

router.get('/dashboard', getOperatorDashboard);
router.get('/users', getOperatorUsers);
router.post('/users', createPendingUser);
router.get('/groups', getOperatorGroups);
router.post('/groups', createPendingGroup);
router.put('/groups/:id', updateOperatorGroup);
router.post('/groups/:id/submit', submitGroup);
router.get('/approved-groups', getApprovedGroups);

export default router;
