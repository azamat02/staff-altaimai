import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';

type AuditAction =
  | 'ADMIN_CREATE'
  | 'ADMIN_DELETE'
  | 'ADMIN_PASSWORD_REGENERATE'
  | 'USER_PROMOTE_TO_OPERATOR'
  | 'USER_DEMOTE_FROM_OPERATOR'
  | 'USER_PROMOTE_TO_ADMIN'
  | 'USER_DEMOTE_FROM_ADMIN'
  | 'OPERATOR_ROLE_EXPIRED'
  | 'USER_APPROVE'
  | 'USER_REJECT'
  | 'GROUP_APPROVE'
  | 'GROUP_REJECT'
  | 'PENDING_USER_CREATE'
  | 'PENDING_GROUP_CREATE'
  | 'GROUP_UPDATE'
  | 'GROUP_SUBMIT_FOR_APPROVAL'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'USER_PASSWORD_REGENERATE'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'PASSWORD_RESET'
  | 'PASSWORD_RESET_CODE_REQUESTED'
  | 'PASSWORD_CHANGED';

interface ActorOverride {
  actorType: 'ADMIN' | 'USER';
  actorId: number;
  actorName: string;
}

interface LogAuditParams {
  action: AuditAction;
  targetType?: string;
  targetId?: number;
  targetName?: string;
  details?: Prisma.InputJsonValue;
  actorOverride?: ActorOverride;
}

export async function logAudit(req: AuthRequest, params: LogAuditParams): Promise<void> {
  try {
    let actorType: 'ADMIN' | 'USER';
    let actorId: number;
    let actorName: string;

    if (params.actorOverride) {
      actorType = params.actorOverride.actorType;
      actorId = params.actorOverride.actorId;
      actorName = params.actorOverride.actorName;
    } else if (req.adminId) {
      actorType = 'ADMIN';
      actorId = req.adminId;
      const admin = await prisma.admin.findUnique({
        where: { id: req.adminId },
        select: { username: true },
      });
      actorName = admin?.username || `admin#${req.adminId}`;
    } else if (req.userId) {
      actorType = 'USER';
      actorId = req.userId;
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { fullName: true },
      });
      actorName = user?.fullName || `user#${req.userId}`;
    } else {
      return;
    }

    await prisma.auditLog.create({
      data: {
        actorType,
        actorId,
        actorName,
        action: params.action,
        targetType: params.targetType || null,
        targetId: params.targetId || null,
        targetName: params.targetName || null,
        details: params.details ?? Prisma.JsonNull,
        ipAddress: req.ip || null,
      },
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
}
