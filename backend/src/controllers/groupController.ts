import { Request, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';

export const getGroups = async (req: Request, res: Response) => {
  try {
    const groups = await prisma.group.findMany({
      where: { approvalStatus: 'APPROVED' },
      include: {
        leader: {
          select: {
            id: true,
            fullName: true,
            position: true,
          },
        },
        block: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: { users: { where: { approvalStatus: 'APPROVED' } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(groups);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const getGroup = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const group = await prisma.group.findUnique({
      where: { id: parseInt(id) },
      include: {
        leader: {
          select: {
            id: true,
            fullName: true,
            position: true,
          },
        },
        block: {
          select: {
            id: true,
            name: true,
          },
        },
        users: {
          select: {
            id: true,
            fullName: true,
            position: true,
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    res.json(group);
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { name, blockId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Название группы обязательно' });
    }

    const existingGroup = await prisma.group.findUnique({
      where: { name },
    });

    if (existingGroup) {
      return res.status(400).json({ error: 'Группа с таким названием уже существует' });
    }

    // Validate blockId if provided
    if (blockId) {
      const block = await prisma.block.findUnique({ where: { id: blockId } });
      if (!block) {
        return res.status(400).json({ error: 'Блок не найден' });
      }
    }

    const group = await prisma.group.create({
      data: {
        name,
        blockId: blockId || null,
        approvalStatus: 'APPROVED',
        createdByAdminId: req.adminId || null,
      },
    });

    res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const updateGroup = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, leaderId, blockId } = req.body;

    const existingGroup = await prisma.group.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingGroup) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    // Validate name if provided
    if (name) {
      const duplicateGroup = await prisma.group.findFirst({
        where: {
          name,
          NOT: { id: parseInt(id) },
        },
      });

      if (duplicateGroup) {
        return res.status(400).json({ error: 'Группа с таким названием уже существует' });
      }
    }

    // Validate leader if provided (and not null)
    if (leaderId !== undefined && leaderId !== null) {
      const leader = await prisma.user.findUnique({
        where: { id: leaderId },
      });

      if (!leader) {
        return res.status(400).json({ error: 'Начальник не найден' });
      }

      // Leader must be in this group
      if (leader.groupId !== parseInt(id)) {
        return res.status(400).json({ error: 'Начальник должен быть членом этой группы' });
      }
    }

    // Validate blockId if provided (and not null)
    if (blockId !== undefined && blockId !== null) {
      const block = await prisma.block.findUnique({ where: { id: blockId } });
      if (!block) {
        return res.status(400).json({ error: 'Блок не найден' });
      }
    }

    const group = await prisma.group.update({
      where: { id: parseInt(id) },
      data: {
        name: name || existingGroup.name,
        leaderId: leaderId === null ? null : (leaderId ?? existingGroup.leaderId),
        blockId: blockId === null ? null : (blockId !== undefined ? blockId : existingGroup.blockId),
      },
      include: {
        leader: {
          select: {
            id: true,
            fullName: true,
            position: true,
          },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    res.json(group);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const deleteGroup = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const groupId = parseInt(id);

    const existingGroup = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        users: {
          select: {
            id: true,
            fullName: true,
            position: true,
          },
        },
      },
    });

    if (!existingGroup) {
      return res.status(404).json({ error: 'Группа не найдена' });
    }

    const userIds = existingGroup.users.map((u) => u.id);

    await prisma.$transaction(async (tx) => {
      // Снять leaderId у группы (убрать circular FK)
      if (existingGroup.leaderId) {
        await tx.group.update({
          where: { id: groupId },
          data: { leaderId: null },
        });
      }

      if (userIds.length > 0) {
        // Очистить managerId у внешних пользователей, ссылающихся на удаляемых
        await tx.user.updateMany({
          where: {
            managerId: { in: userIds },
            groupId: { not: groupId },
          },
          data: { managerId: null },
        });

        // Очистить managerId внутри группы
        await tx.user.updateMany({
          where: {
            id: { in: userIds },
            managerId: { not: null },
          },
          data: { managerId: null },
        });

        // Удалить Evaluation записи
        await tx.evaluation.deleteMany({
          where: {
            OR: [
              { evaluatorId: { in: userIds } },
              { evaluateeId: { in: userIds } },
            ],
          },
        });

        // Удалить Kpi где approverId in userIds (каскадно удалит blocks/tasks/assignments/facts)
        await tx.kpi.deleteMany({
          where: { approverId: { in: userIds } },
        });

        // Удалить KpiAssignment для userIds на других KPI (каскадно удалит facts)
        await tx.kpiAssignment.deleteMany({
          where: { userId: { in: userIds } },
        });

        // Удалить всех пользователей группы
        await tx.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }

      // Удалить саму группу (GroupScore каскадно удалится по схеме)
      await tx.group.delete({
        where: { id: groupId },
      });
    });

    res.json({ message: 'Группа успешно удалена' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
