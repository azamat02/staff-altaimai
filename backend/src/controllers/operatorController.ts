import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';

// GET /api/operator/dashboard — Статистика по записям оператора
export const getOperatorDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.adminId!;

    const [pendingUsers, approvedUsers, rejectedUsers] = await Promise.all([
      prisma.user.count({ where: { createdByAdminId: adminId, approvalStatus: 'PENDING' } }),
      prisma.user.count({ where: { createdByAdminId: adminId, approvalStatus: 'APPROVED' } }),
      prisma.user.count({ where: { createdByAdminId: adminId, approvalStatus: 'REJECTED' } }),
    ]);

    const [pendingGroups, approvedGroups, rejectedGroups] = await Promise.all([
      prisma.group.count({ where: { createdByAdminId: adminId, approvalStatus: 'PENDING' } }),
      prisma.group.count({ where: { createdByAdminId: adminId, approvalStatus: 'APPROVED' } }),
      prisma.group.count({ where: { createdByAdminId: adminId, approvalStatus: 'REJECTED' } }),
    ]);

    res.json({
      users: { pending: pendingUsers, approved: approvedUsers, rejected: rejectedUsers },
      groups: { pending: pendingGroups, approved: approvedGroups, rejected: rejectedGroups },
    });
  } catch (error) {
    console.error('Get operator dashboard error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/operator/users — Создание пользователя со статусом PENDING
export const createPendingUser = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.adminId!;
    const {
      fullName,
      position,
      groupId,
      managerId,
      email,
      submitsBasicReport = false,
      submitsKpi = false,
      canAccessPlatform = false,
    } = req.body;

    if (!fullName || !position || !groupId) {
      return res.status(400).json({ error: 'ФИО, должность и группа обязательны' });
    }

    // Проверяем что группа существует и одобрена
    const group = await prisma.group.findFirst({
      where: { id: groupId, approvalStatus: 'APPROVED' },
    });

    if (!group) {
      return res.status(400).json({ error: 'Одобренная группа не найдена' });
    }

    if (managerId) {
      const manager = await prisma.user.findFirst({
        where: { id: managerId, approvalStatus: 'APPROVED' },
      });
      if (!manager) {
        return res.status(400).json({ error: 'Одобренный руководитель не найден' });
      }
    }

    const user = await prisma.user.create({
      data: {
        fullName,
        position,
        groupId,
        managerId: managerId || null,
        email: email || null,
        submitsBasicReport,
        submitsKpi,
        canAccessPlatform,
        approvalStatus: 'PENDING',
        createdByAdminId: adminId,
      },
      include: {
        group: true,
        manager: {
          select: {
            id: true,
            fullName: true,
            position: true,
          },
        },
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error('Create pending user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// GET /api/operator/users — Список пользователей, созданных оператором
export const getOperatorUsers = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.adminId!;

    const users = await prisma.user.findMany({
      where: { createdByAdminId: adminId },
      include: {
        group: true,
        manager: {
          select: {
            id: true,
            fullName: true,
            position: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(users);
  } catch (error) {
    console.error('Get operator users error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/operator/groups — Создание группы со статусом PENDING
export const createPendingGroup = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.adminId!;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Название группы обязательно' });
    }

    const existingGroup = await prisma.group.findUnique({
      where: { name },
    });

    if (existingGroup) {
      return res.status(400).json({ error: 'Группа с таким названием уже существует' });
    }

    const group = await prisma.group.create({
      data: {
        name,
        approvalStatus: 'PENDING',
        createdByAdminId: adminId,
      },
    });

    res.status(201).json(group);
  } catch (error) {
    console.error('Create pending group error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// GET /api/operator/groups — Список групп, созданных оператором
export const getOperatorGroups = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.adminId!;

    const groups = await prisma.group.findMany({
      where: { createdByAdminId: adminId },
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(groups);
  } catch (error) {
    console.error('Get operator groups error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// GET /api/operator/approved-groups — APPROVED группы для dropdown при создании пользователей
export const getApprovedGroups = async (req: AuthRequest, res: Response) => {
  try {
    const groups = await prisma.group.findMany({
      where: { approvalStatus: 'APPROVED' },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json(groups);
  } catch (error) {
    console.error('Get approved groups error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
