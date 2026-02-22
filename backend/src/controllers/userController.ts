import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';
import { generatePassword, generateLogin } from '../utils/helpers';
import { sendCredentialsEmail, sendPasswordResetEmail } from '../utils/mailer';

// Рекурсивное получение всех подчиненных
async function getSubordinatesTree(userId: number): Promise<any[]> {
  const direct = await prisma.user.findMany({
    where: { managerId: userId, approvalStatus: 'APPROVED' },
    include: {
      group: true,
    },
  });
  const all: any[] = [...direct];
  for (const sub of direct) {
    const nested = await getSubordinatesTree(sub.id);
    all.push(...nested);
  }
  return all;
}

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { approvalStatus: 'APPROVED' },
      include: {
        group: {
          include: {
            leader: {
              select: {
                id: true,
                fullName: true,
                position: true,
              },
            },
          },
        },
        manager: {
          select: {
            id: true,
            fullName: true,
            position: true,
          },
        },
        subordinates: {
          select: {
            id: true,
            fullName: true,
            position: true,
          },
        },
        leadsGroup: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: {
        group: {
          include: {
            leader: {
              select: {
                id: true,
                fullName: true,
                position: true,
              },
            },
          },
        },
        manager: {
          select: {
            id: true,
            fullName: true,
            position: true,
          },
        },
        subordinates: {
          select: {
            id: true,
            fullName: true,
            position: true,
          },
        },
        leadsGroup: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const {
      fullName,
      position,
      groupId,
      managerId,
      email,
      submitsBasicReport = false,
      submitsKpi = false,
      canAccessPlatform = false,
      isGroupLeader = false,
    } = req.body;

    if (!fullName || !position || !groupId) {
      return res.status(400).json({ error: 'ФИО, должность и группа обязательны' });
    }

    if (canAccessPlatform && !email) {
      return res.status(400).json({ error: 'Email обязателен для пользователей с доступом к платформе' });
    }

    // Проверка уникальности email
    if (email) {
      const existingUserEmail = await prisma.user.findFirst({ where: { email } });
      if (existingUserEmail) {
        return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
      }
      const existingAdminEmail = await prisma.admin.findFirst({ where: { email } });
      if (existingAdminEmail) {
        return res.status(400).json({ error: 'Этот email уже используется' });
      }
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(400).json({ error: 'Группа не найдена' });
    }

    if (managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });
      if (!manager) {
        return res.status(400).json({ error: 'Руководитель не найден' });
      }
    }

    // Генерация логина и пароля если пользователь может зайти в платформу
    let plainPassword: string | null = null;
    let passwordHash: string | null = null;
    let login: string | null = null;

    if (canAccessPlatform) {
      login = await generateLogin(fullName);
      plainPassword = generatePassword();
      passwordHash = await bcrypt.hash(plainPassword, 10);
    }

    const authReq = req as AuthRequest;
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
        login,
        passwordHash,
        approvalStatus: 'APPROVED',
        createdByAdminId: authReq.adminId || null,
      },
      include: {
        group: true,
        manager: true,
      },
    });

    // Если пользователь должен быть начальником группы - назначаем его
    if (isGroupLeader) {
      await prisma.group.update({
        where: { id: groupId },
        data: { leaderId: user.id },
      });
    }

    // Отправляем учётные данные на email если есть
    if (plainPassword && login && email) {
      sendCredentialsEmail(email, fullName, login, plainPassword).catch((err) =>
        console.error('Failed to send credentials email:', err)
      );
    }

    // Возвращаем пользователя с сгенерированным логином и паролем (только при создании)
    res.status(201).json({
      ...user,
      generatedPassword: plainPassword,
      generatedLogin: login,
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      position,
      groupId,
      managerId,
      email,
      submitsBasicReport,
      submitsKpi,
      canAccessPlatform,
      isGroupLeader,
    } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { leadsGroup: true },
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Валидация email при включении canAccessPlatform
    const effectiveCanAccessPlatform = canAccessPlatform ?? existingUser.canAccessPlatform;
    const effectiveEmail = email !== undefined ? (email || null) : existingUser.email;

    if (effectiveCanAccessPlatform && !effectiveEmail) {
      return res.status(400).json({ error: 'Email обязателен для пользователей с доступом к платформе' });
    }

    // Проверка уникальности email (исключая текущего пользователя)
    if (effectiveEmail) {
      const existingUserEmail = await prisma.user.findFirst({
        where: { email: effectiveEmail, id: { not: parseInt(id) } },
      });
      if (existingUserEmail) {
        return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
      }
      const existingAdminEmail = await prisma.admin.findFirst({ where: { email: effectiveEmail } });
      if (existingAdminEmail) {
        return res.status(400).json({ error: 'Этот email уже используется' });
      }
    }

    const newGroupId = groupId || existingUser.groupId;

    if (groupId) {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
      });
      if (!group) {
        return res.status(400).json({ error: 'Группа не найдена' });
      }
    }

    // Если пользователь меняет группу и был начальником старой группы - очищаем leaderId
    if (groupId && groupId !== existingUser.groupId && existingUser.leadsGroup) {
      await prisma.group.update({
        where: { id: existingUser.groupId },
        data: { leaderId: null },
      });
    }

    if (managerId) {
      if (managerId === parseInt(id)) {
        return res.status(400).json({ error: 'Пользователь не может быть своим руководителем' });
      }
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });
      if (!manager) {
        return res.status(400).json({ error: 'Руководитель не найден' });
      }
    }

    // Если включен доступ к платформе, но логина/пароля нет - генерируем
    let plainPassword: string | null = null;
    let passwordHash = existingUser.passwordHash;
    let login = existingUser.login;

    if (canAccessPlatform && !existingUser.canAccessPlatform) {
      // Генерируем логин если его нет
      if (!login) {
        login = await generateLogin(fullName || existingUser.fullName);
      }
      // Генерируем пароль если его нет
      if (!passwordHash) {
        plainPassword = generatePassword();
        passwordHash = await bcrypt.hash(plainPassword, 10);
      }
    }

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        fullName: fullName || existingUser.fullName,
        position: position || existingUser.position,
        groupId: newGroupId,
        managerId: managerId === null ? null : (managerId || existingUser.managerId),
        submitsBasicReport: submitsBasicReport ?? existingUser.submitsBasicReport,
        submitsKpi: submitsKpi ?? existingUser.submitsKpi,
        canAccessPlatform: canAccessPlatform ?? existingUser.canAccessPlatform,
        email: email !== undefined ? (email || null) : existingUser.email,
        login,
        passwordHash,
      },
      include: {
        group: true,
        manager: true,
      },
    });

    // Если флаг isGroupLeader установлен - назначаем пользователя начальником новой группы
    if (isGroupLeader) {
      await prisma.group.update({
        where: { id: newGroupId },
        data: { leaderId: user.id },
      });
    }

    // Отправляем учётные данные на email если были сгенерированы
    const userEmail = email || existingUser.email;
    if (plainPassword && login && userEmail) {
      sendCredentialsEmail(userEmail, user.fullName, login, plainPassword).catch((err) =>
        console.error('Failed to send credentials email:', err)
      );
    }

    // Возвращаем пользователя с сгенерированным логином и паролем (если были созданы)
    res.json({
      ...user,
      generatedPassword: plainPassword,
      generatedLogin: login !== existingUser.login ? login : null,
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { subordinates: true, leadsGroup: true },
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Если пользователь был начальником группы - очищаем leaderId
    if (existingUser.leadsGroup) {
      await prisma.group.update({
        where: { id: existingUser.leadsGroup.id },
        data: { leaderId: null },
      });
    }

    if (existingUser.subordinates.length > 0) {
      await prisma.user.updateMany({
        where: { managerId: parseInt(id) },
        data: { managerId: null },
      });
    }

    await prisma.user.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Пользователь успешно удалён' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// Пересоздание пароля пользователя (только для админов)
export const regeneratePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (!existingUser.canAccessPlatform) {
      return res.status(400).json({ error: 'У пользователя нет доступа к платформе' });
    }

    const plainPassword = generatePassword();
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { passwordHash },
    });

    // Отправляем новый пароль на email если есть
    if (existingUser.email) {
      sendPasswordResetEmail(existingUser.email, existingUser.fullName, existingUser.login || existingUser.email, plainPassword).catch((err) =>
        console.error('Failed to send password reset email:', err)
      );
    }

    res.json({ generatedPassword: plainPassword });
  } catch (error) {
    console.error('Regenerate password error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// Получение дерева подчиненных для пользователя
export const getUserSubordinatesTree = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const subordinates = await getSubordinatesTree(userId);
    res.json(subordinates);
  } catch (error) {
    console.error('Get subordinates tree error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
