import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';
import { logAudit } from '../utils/auditLog';

// Получить фильтр для записей оператора (Admin-оператор или User-оператор)
const getOperatorFilter = (req: AuthRequest) => {
  if (req.adminId) {
    return { createdByAdminId: req.adminId };
  }
  // User-оператор: показываем записи с createdByAdminId = null (не привязанные к конкретному админу)
  // В будущем можно добавить отдельное поле createdByOperatorUserId
  return { createdByAdminId: null as any };
};

// GET /api/operator/dashboard — Статистика по записям оператора
export const getOperatorDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const filter = getOperatorFilter(req);

    const [pendingUsers, approvedUsers, rejectedUsers] = await Promise.all([
      prisma.user.count({ where: { ...filter, approvalStatus: 'PENDING' } }),
      prisma.user.count({ where: { ...filter, approvalStatus: 'APPROVED' } }),
      prisma.user.count({ where: { ...filter, approvalStatus: 'REJECTED' } }),
    ]);

    const [draftGroups, pendingGroups, approvedGroups, revisionGroups] = await Promise.all([
      prisma.group.count({ where: { ...filter, approvalStatus: 'DRAFT' } }),
      prisma.group.count({ where: { ...filter, approvalStatus: 'PENDING' } }),
      prisma.group.count({ where: { ...filter, approvalStatus: 'APPROVED' } }),
      prisma.group.count({ where: { ...filter, approvalStatus: 'REVISION' } }),
    ]);

    res.json({
      users: { pending: pendingUsers, approved: approvedUsers, rejected: rejectedUsers },
      groups: { draft: draftGroups, pending: pendingGroups, approved: approvedGroups, revision: revisionGroups },
    });
  } catch (error) {
    console.error('Get operator dashboard error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/operator/users — Создание пользователя со статусом PENDING
export const createPendingUser = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.adminId || null;
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

    // Проверяем что группа существует и одобрена, или принадлежит оператору
    const filter = getOperatorFilter(req);
    const group = await prisma.group.findFirst({
      where: {
        id: groupId,
        OR: [
          { approvalStatus: 'APPROVED' },
          { ...filter, approvalStatus: { in: ['DRAFT', 'PENDING', 'REVISION'] } },
        ],
      },
    });

    if (!group) {
      return res.status(400).json({ error: 'Группа не найдена или недоступна' });
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

    await logAudit(req, {
      action: 'PENDING_USER_CREATE',
      targetType: 'User',
      targetId: user.id,
      targetName: (user as any).fullName || fullName,
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
    const filter = getOperatorFilter(req);

    const users = await prisma.user.findMany({
      where: filter,
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
    const adminId = req.adminId || null;
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
        approvalStatus: 'DRAFT',
        createdByAdminId: adminId,
      },
    });

    await logAudit(req, {
      action: 'PENDING_GROUP_CREATE',
      targetType: 'Group',
      targetId: group.id,
      targetName: group.name,
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
    const filter = getOperatorFilter(req);

    const groups = await prisma.group.findMany({
      where: filter,
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

// GET /api/operator/approved-groups — APPROVED группы + собственные DRAFT/PENDING/REVISION для dropdown
export const getApprovedGroups = async (req: AuthRequest, res: Response) => {
  try {
    const filter = getOperatorFilter(req);
    const groups = await prisma.group.findMany({
      where: {
        OR: [
          { approvalStatus: 'APPROVED' },
          { ...filter, approvalStatus: { in: ['DRAFT', 'PENDING', 'REVISION'] } },
        ],
      },
      select: {
        id: true,
        name: true,
        approvalStatus: true,
        block: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json(groups);
  } catch (error) {
    console.error('Get approved groups error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// PUT /api/operator/groups/:id — Редактирование группы (только DRAFT/REVISION)
export const updateOperatorGroup = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const filter = getOperatorFilter(req);
    const { name } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID группы' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Название группы обязательно' });
    }

    const group = await prisma.group.findFirst({
      where: { id, ...filter },
    });

    if (!group) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (group.approvalStatus !== 'DRAFT' && group.approvalStatus !== 'REVISION') {
      return res.status(400).json({ error: 'Редактирование разрешено только для черновиков и групп на доработке' });
    }

    // Проверяем уникальность имени
    const existing = await prisma.group.findFirst({
      where: { name: name.trim(), id: { not: id } },
    });

    if (existing) {
      return res.status(400).json({ error: 'Группа с таким названием уже существует' });
    }

    const updated = await prisma.group.update({
      where: { id },
      data: { name: name.trim() },
      include: {
        _count: { select: { users: true } },
      },
    });

    await logAudit(req, {
      action: 'GROUP_UPDATE',
      targetType: 'Group',
      targetId: updated.id,
      targetName: updated.name,
    });

    res.json(updated);
  } catch (error) {
    console.error('Update operator group error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/operator/groups/:id/submit — Отправить группу на рассмотрение (DRAFT/REVISION → PENDING)
export const submitGroup = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const filter = getOperatorFilter(req);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID группы' });
    }

    const group = await prisma.group.findFirst({
      where: { id, ...filter },
    });

    if (!group) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (group.approvalStatus !== 'DRAFT' && group.approvalStatus !== 'REVISION') {
      return res.status(400).json({ error: 'Отправить можно только черновик или группу на доработке' });
    }

    const updated = await prisma.group.update({
      where: { id },
      data: {
        approvalStatus: 'PENDING',
        rejectionReason: null,
      },
      include: {
        _count: { select: { users: true } },
      },
    });

    await logAudit(req, {
      action: 'GROUP_SUBMIT_FOR_APPROVAL',
      targetType: 'Group',
      targetId: updated.id,
      targetName: updated.name,
    });

    res.json(updated);
  } catch (error) {
    console.error('Submit group error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
