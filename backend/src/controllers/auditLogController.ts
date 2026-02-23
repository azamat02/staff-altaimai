import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';

// GET /api/audit-logs — Список аудит-логов с пагинацией и фильтрами (только SUPER_ADMIN)
export const getAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = '1',
      limit = '50',
      action,
      actorId,
      targetType,
      targetId,
      dateFrom,
      dateTo,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};

    if (action) {
      where.action = action as string;
    }

    if (actorId) {
      where.actorId = parseInt(actorId as string);
    }

    if (targetType) {
      where.targetType = targetType as string;
    }

    if (targetId) {
      where.targetId = parseInt(targetId as string);
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        (where.createdAt as Record<string, unknown>).lte = new Date(dateTo as string);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
