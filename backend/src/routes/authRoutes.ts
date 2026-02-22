import { Router } from 'express';
import { login, logout, getMe, resetPassword } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.post('/reset-password', resetPassword);
router.get('/me', authMiddleware, getMe);

export default router;
