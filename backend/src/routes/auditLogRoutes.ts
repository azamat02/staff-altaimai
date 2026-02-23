import { Router } from 'express';
import { authMiddleware, superAdminOnly } from '../middleware/authMiddleware';
import { getAuditLogs } from '../controllers/auditLogController';

const router = Router();

router.get('/', authMiddleware, superAdminOnly, getAuditLogs);

export default router;
