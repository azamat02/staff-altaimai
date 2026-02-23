import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';
import { logAudit } from '../utils/auditLog';

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

// POST /api/auth/login — Единая точка входа (admin, operator или user)
export const login = async (req: Request, res: Response) => {
  try {
    const { username: rawUsername, password: rawPassword } = req.body;

    if (!rawUsername || !rawPassword) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    const username = rawUsername.trim();
    const password = rawPassword.trim();

    // 1. Сначала проверить Admin (по username или email)
    const admin = await prisma.admin.findFirst({
      where: { OR: [{ username }, { email: username }] },
    });

    if (admin) {
      const isValidPassword = await bcrypt.compare(password, admin.passwordHash);

      if (isValidPassword) {
        const jwtRole = admin.role === 'OPERATOR' ? 'operator' : 'admin';
        const token = jwt.sign(
          { adminId: admin.id, role: jwtRole, adminRole: admin.role },
          process.env.JWT_SECRET || 'secret',
          { expiresIn: '24h' }
        );

        await logAudit(req as AuthRequest, {
          action: 'LOGIN_SUCCESS',
          targetType: 'Admin',
          targetId: admin.id,
          targetName: admin.username,
          actorOverride: { actorType: 'ADMIN', actorId: admin.id, actorName: admin.username },
        });

        return res.json({
          token,
          role: jwtRole,
          admin: {
            id: admin.id,
            username: admin.username,
            email: admin.email,
            role: admin.role,
          },
        });
      }
    }

    // 2. Затем проверить User (по login или email)
    const user = await prisma.user.findFirst({
      where: { OR: [{ login: username }, { email: username }], approvalStatus: 'APPROVED' },
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

    if (user && user.canAccessPlatform && user.passwordHash) {
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);

      if (isValidPassword) {
        // User-admin получает доступ как админ
        if (user.isAdmin) {
          const token = jwt.sign(
            { userId: user.id, role: 'admin', adminRole: 'ADMIN', isAdmin: true },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '24h' }
          );

          await logAudit(req as AuthRequest, {
            action: 'LOGIN_SUCCESS',
            targetType: 'User',
            targetId: user.id,
            targetName: user.fullName,
            actorOverride: { actorType: 'USER', actorId: user.id, actorName: user.fullName },
          });

          return res.json({
            token,
            role: 'admin',
            admin: {
              id: user.id,
              username: user.fullName,
              email: user.email,
              role: 'ADMIN',
              source: 'user',
            },
          });
        }

        const token = jwt.sign(
          { userId: user.id, role: 'user', isOperator: user.isOperator },
          process.env.JWT_SECRET || 'secret',
          { expiresIn: '24h' }
        );

        // Получаем дерево подчиненных
        const subordinatesTree = await getSubordinatesTree(user.id);

        await logAudit(req as AuthRequest, {
          action: 'LOGIN_SUCCESS',
          targetType: 'User',
          targetId: user.id,
          targetName: user.fullName,
          actorOverride: { actorType: 'USER', actorId: user.id, actorName: user.fullName },
        });

        return res.json({
          token,
          role: 'user',
          mustChangePassword: user.mustChangePassword,
          user: {
            id: user.id,
            fullName: user.fullName,
            position: user.position,
            groupId: user.groupId,
            group: user.group,
            managerId: user.managerId,
            manager: user.manager,
            login: user.login,
            email: user.email,
            submitsBasicReport: user.submitsBasicReport,
            submitsKpi: user.submitsKpi,
            canAccessPlatform: user.canAccessPlatform,
            isOperator: user.isOperator,
            mustChangePassword: user.mustChangePassword,
            subordinatesTree,
          },
        });
      }
    }

    // Fire-and-forget: log failed login attempt
    logAudit(req as AuthRequest, {
      action: 'LOGIN_FAILURE',
      details: { attemptedUsername: username },
      actorOverride: { actorType: 'ADMIN', actorId: 0, actorName: username },
    });

    return res.status(401).json({ error: 'Неверные учётные данные' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

export const logout = async (req: Request, res: Response) => {
  res.json({ message: 'Выход выполнен успешно' });
};

// GET /api/auth/me — Возвращает данные текущего пользователя + иерархию
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    // Если это админ или оператор
    if (req.adminId) {
      // Проверяем, не user-admin ли это
      if (req.userId) {
        const user = await prisma.user.findUnique({
          where: { id: req.userId },
          select: {
            id: true,
            fullName: true,
            email: true,
            isAdmin: true,
            createdAt: true,
          },
        });

        if (user && user.isAdmin) {
          return res.json({
            role: 'admin',
            admin: {
              id: user.id,
              username: user.fullName,
              email: user.email,
              role: 'ADMIN',
              createdAt: user.createdAt,
              source: 'user',
            },
          });
        }
      }

      const admin = await prisma.admin.findUnique({
        where: { id: req.adminId },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      if (!admin) {
        return res.status(404).json({ error: 'Администратор не найден' });
      }

      const responseRole = admin.role === 'OPERATOR' ? 'operator' : 'admin';

      return res.json({
        role: responseRole,
        admin,
      });
    }

    // Если это пользователь
    if (req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
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

      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      // Получаем дерево подчиненных
      const subordinatesTree = await getSubordinatesTree(user.id);

      return res.json({
        role: 'user',
        user: {
          id: user.id,
          fullName: user.fullName,
          position: user.position,
          groupId: user.groupId,
          group: user.group,
          managerId: user.managerId,
          manager: user.manager,
          login: user.login,
          email: user.email,
          submitsBasicReport: user.submitsBasicReport,
          submitsKpi: user.submitsKpi,
          canAccessPlatform: user.canAccessPlatform,
          isOperator: user.isOperator,
          mustChangePassword: user.mustChangePassword,
          subordinatesTree,
        },
      });
    }

    return res.status(401).json({ error: 'Не авторизован' });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

