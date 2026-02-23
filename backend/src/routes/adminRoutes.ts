import { Router } from 'express';
import { getAdmins, createAdmin, deleteAdmin, regenerateAdminPassword, getPromotableUsers, promoteUserToOperator, demoteUserFromOperator } from '../controllers/adminController';
import { authMiddleware, adminOnly } from '../middleware/authMiddleware';

const router = Router();

// Все маршруты защищены: authMiddleware + adminOnly
// Логика доступа внутри контроллера: обычный админ работает только с операторами, суперадмин — со всеми
router.use(authMiddleware, adminOnly);

router.get('/promotable-users', getPromotableUsers);
router.post('/promote-user', promoteUserToOperator);
router.post('/demote-user/:userId', demoteUserFromOperator);

router.get('/', getAdmins);
router.post('/', createAdmin);
router.delete('/:id', deleteAdmin);
router.post('/:id/regenerate-password', regenerateAdminPassword);

export default router;
