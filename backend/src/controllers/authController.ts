import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';
import { generatePassword } from '../utils/helpers';
import { sendPasswordResetEmail } from '../utils/mailer';

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
        const token = jwt.sign(
          { userId: user.id, role: 'user' },
          process.env.JWT_SECRET || 'secret',
          { expiresIn: '24h' }
        );

        // Получаем дерево подчиненных
        const subordinatesTree = await getSubordinatesTree(user.id);

        return res.json({
          token,
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
            subordinatesTree,
          },
        });
      }
    }

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

// POST /api/auth/reset-password — Сброс пароля по email
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email обязателен' });
    }

    // Ищем Admin по email
    const admin = await prisma.admin.findFirst({ where: { email } });

    if (admin) {
      const newPassword = generatePassword();
      const passwordHash = await bcrypt.hash(newPassword, 10);

      await prisma.admin.update({
        where: { id: admin.id },
        data: { passwordHash },
      });

      sendPasswordResetEmail(email, admin.username, admin.username, newPassword).catch((err) =>
        console.error('Failed to send password reset email:', err)
      );

      return res.json({ message: 'Если указанный email зарегистрирован, на него отправлен новый пароль' });
    }

    // Ищем User по email
    const user = await prisma.user.findFirst({
      where: { email, approvalStatus: 'APPROVED', canAccessPlatform: true },
    });

    if (user) {
      const newPassword = generatePassword();
      const passwordHash = await bcrypt.hash(newPassword, 10);

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      sendPasswordResetEmail(email, user.fullName, user.login || email, newPassword).catch((err) =>
        console.error('Failed to send password reset email:', err)
      );
    }

    // Одинаковый ответ независимо от наличия email (защита от перебора)
    return res.json({ message: 'Если указанный email зарегистрирован, на него отправлен новый пароль' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
