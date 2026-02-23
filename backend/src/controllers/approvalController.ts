import { Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';
import { generatePassword, generateLogin } from '../utils/helpers';
import { logAudit } from '../utils/auditLog';

// GET /api/approvals/pending — Все PENDING users и groups
export const getPendingItems = async (req: AuthRequest, res: Response) => {
  try {
    const [pendingUsers, pendingGroups] = await Promise.all([
      prisma.user.findMany({
        where: { approvalStatus: 'PENDING' },
        include: {
          group: true,
          manager: {
            select: { id: true, fullName: true, position: true },
          },
          createdByAdmin: {
            select: { id: true, username: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.group.findMany({
        where: { approvalStatus: 'PENDING' },
        include: {
          createdByAdmin: {
            select: { id: true, username: true, role: true },
          },
          _count: {
            select: { users: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({ users: pendingUsers, groups: pendingGroups });
  } catch (error) {
    console.error('Get pending items error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/approvals/users/:id/approve — Одобрить пользователя
export const approveUser = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID пользователя' });
    }

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (user.approvalStatus !== 'PENDING') {
      return res.status(400).json({ error: 'Пользователь не ожидает одобрения' });
    }

    // Генерация логина/пароля если canAccessPlatform
    let plainPassword: string | null = null;
    let login: string | null = null;
    let passwordHash: string | null = null;

    if (user.canAccessPlatform) {
      login = await generateLogin(user.fullName);
      plainPassword = generatePassword();
      passwordHash = await bcrypt.hash(plainPassword, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        login,
        passwordHash,
        ...(passwordHash ? { mustChangePassword: true } : {}),
      },
      include: {
        group: true,
        manager: {
          select: { id: true, fullName: true, position: true },
        },
      },
    });

    await logAudit(req, {
      action: 'USER_APPROVE',
      targetType: 'User',
      targetId: updatedUser.id,
      targetName: updatedUser.fullName,
    });

    res.json({
      ...updatedUser,
      generatedPassword: plainPassword,
      generatedLogin: login,
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/approvals/users/:id/reject — Отклонить пользователя
export const rejectUser = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID пользователя' });
    }

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (user.approvalStatus !== 'PENDING') {
      return res.status(400).json({ error: 'Пользователь не ожидает одобрения' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        approvalStatus: 'REJECTED',
        rejectionReason: reason || null,
      },
    });

    await logAudit(req, {
      action: 'USER_REJECT',
      targetType: 'User',
      targetId: updatedUser.id,
      targetName: updatedUser.fullName,
      details: reason ? { reason } : undefined,
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/approvals/groups/:id/approve — Одобрить группу
export const approveGroup = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID группы' });
    }

    const group = await prisma.group.findUnique({ where: { id } });

    if (!group) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (group.approvalStatus !== 'PENDING') {
      return res.status(400).json({ error: 'Группа не ожидает одобрения' });
    }

    const updatedGroup = await prisma.group.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
      },
    });

    await logAudit(req, {
      action: 'GROUP_APPROVE',
      targetType: 'Group',
      targetId: updatedGroup.id,
      targetName: updatedGroup.name,
    });

    res.json(updatedGroup);
  } catch (error) {
    console.error('Approve group error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/approvals/groups/:id/reject — Вернуть группу на доработку
export const rejectGroup = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID группы' });
    }

    const group = await prisma.group.findUnique({ where: { id } });

    if (!group) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (group.approvalStatus !== 'PENDING') {
      return res.status(400).json({ error: 'Группа не ожидает одобрения' });
    }

    const updatedGroup = await prisma.group.update({
      where: { id },
      data: {
        approvalStatus: 'REVISION',
        rejectionReason: reason || null,
      },
    });

    await logAudit(req, {
      action: 'GROUP_REJECT',
      targetType: 'Group',
      targetId: updatedGroup.id,
      targetName: updatedGroup.name,
      details: reason ? { reason } : undefined,
    });

    res.json(updatedGroup);
  } catch (error) {
    console.error('Reject group error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
