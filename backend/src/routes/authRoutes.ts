import { Router } from 'express';
import { login, logout, getMe } from '../controllers/authController';
import { requestResetCode, verifyResetCode, setNewPassword, changePassword } from '../controllers/passwordResetController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authMiddleware, getMe);

// Password reset via code
router.post('/request-reset-code', requestResetCode);
router.post('/verify-reset-code', verifyResetCode);
router.post('/set-new-password', setNewPassword);
router.post('/change-password', authMiddleware, changePassword);

export default router;
