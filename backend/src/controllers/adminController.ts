import { Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendPasswordResetEmail } from '../utils/mailer';

// GET /api/admins — Список админов (зависит от роли запрашивающего)
export const getAdmins = async (req: AuthRequest, res: Response) => {
  try {
    const isSuperAdmin = req.adminRole === 'SUPER_ADMIN';

    const admins = await prisma.admin.findMany({
      where: isSuperAdmin
        ? { role: { not: 'SUPER_ADMIN' } } // суперадмин видит всех кроме себя (покажется отдельно)
        : { role: 'OPERATOR', createdByAdminId: req.adminId }, // обычные админы видят только своих операторов
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdByAdminId: true,
        createdAt: true,
        _count: {
          select: { createdKpis: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Суперадмин видит себя тоже
    if (isSuperAdmin) {
      const self = await prisma.admin.findUnique({
        where: { id: req.adminId },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          createdByAdminId: true,
          createdAt: true,
          _count: {
            select: { createdKpis: true },
          },
        },
      });
      if (self) {
        return res.json([self, ...admins]);
      }
    }

    res.json(admins);
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/admins — Создание нового админа/оператора
export const createAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, role, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email обязателен' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Логин должен быть не менее 3 символов' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    const isSuperAdmin = req.adminRole === 'SUPER_ADMIN';

    // Определяем роль создаваемого аккаунта
    let targetRole: 'ADMIN' | 'OPERATOR';
    if (isSuperAdmin) {
      // Суперадмин может создавать и ADMIN и OPERATOR
      targetRole = role === 'ADMIN' ? 'ADMIN' : 'OPERATOR';
    } else {
      // Обычный админ может создавать только OPERATOR
      targetRole = 'OPERATOR';
    }

    const existing = await prisma.admin.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: 'Администратор с таким логином уже существует' });
    }

    // Проверка уникальности email по Admin и User таблицам
    const trimmedEmail = email.trim();
    const existingAdminEmail = await prisma.admin.findFirst({ where: { email: trimmedEmail } });
    if (existingAdminEmail) {
      return res.status(409).json({ error: 'Этот email уже используется' });
    }
    const existingUserEmail = await prisma.user.findFirst({ where: { email: trimmedEmail } });
    if (existingUserEmail) {
      return res.status(409).json({ error: 'Этот email уже используется' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const admin = await prisma.admin.create({
      data: {
        username,
        passwordHash,
        email: trimmedEmail,
        role: targetRole,
        createdByAdminId: req.adminId,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdByAdminId: true,
        createdAt: true,
      },
    });

    res.status(201).json(admin);
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// DELETE /api/admins/:id — Удаление админа/оператора
export const deleteAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID администратора' });
    }

    // Нельзя удалить себя
    if (id === req.adminId) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }

    const admin = await prisma.admin.findUnique({ where: { id } });
    if (!admin) {
      return res.status(404).json({ error: 'Администратор не найден' });
    }

    // Нельзя удалить супер-админа
    if (admin.role === 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'Нельзя удалить суперадминистратора' });
    }

    const isSuperAdmin = req.adminRole === 'SUPER_ADMIN';

    // Обычные админы могут удалять только операторов
    if (!isSuperAdmin && admin.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Вы можете удалять только операторов' });
    }

    // Обычные админы могут удалять только своих операторов
    if (!isSuperAdmin && admin.createdByAdminId !== req.adminId) {
      return res.status(403).json({ error: 'Вы можете удалять только созданных вами операторов' });
    }

    // Переназначить KPI на текущего админа
    await prisma.kpi.updateMany({
      where: { createdById: id },
      data: { createdById: req.adminId! },
    });

    await prisma.admin.delete({ where: { id } });

    res.json({ message: 'Администратор успешно удалён' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/admins/:id/regenerate-password — Генерация нового пароля
export const regenerateAdminPassword = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID администратора' });
    }

    const admin = await prisma.admin.findUnique({ where: { id } });
    if (!admin) {
      return res.status(404).json({ error: 'Администратор не найден' });
    }

    // Нельзя менять пароль другому супер-админу
    if (admin.role === 'SUPER_ADMIN' && id !== req.adminId) {
      return res.status(400).json({ error: 'Нельзя сменить пароль другому суперадминистратору' });
    }

    const isSuperAdmin = req.adminRole === 'SUPER_ADMIN';

    // Обычные админы могут менять пароль только операторам
    if (!isSuperAdmin && admin.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'Вы можете сменить пароль только операторам' });
    }

    const newPassword = crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.admin.update({
      where: { id },
      data: { passwordHash },
    });

    // Отправляем новый пароль на email если есть
    if (admin.email) {
      sendPasswordResetEmail(admin.email, admin.username, admin.username, newPassword).catch((err) =>
        console.error('Failed to send password reset email:', err)
      );
    }

    res.json({ generatedPassword: newPassword });
  } catch (error) {
    console.error('Regenerate admin password error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
