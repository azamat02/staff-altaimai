import { Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendPasswordResetEmail } from '../utils/mailer';
import { logAudit } from '../utils/auditLog';

// Автоматическое снятие роли оператора у сотрудников с истёкшим сроком
async function autoExpireOperators(): Promise<void> {
  try {
    const expired = await prisma.user.findMany({
      where: {
        isOperator: true,
        operatorExpiresAt: { not: null, lte: new Date() },
      },
      select: { id: true, fullName: true, operatorExpiresAt: true },
    });

    for (const user of expired) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isOperator: false,
          operatorCreatedByAdminId: null,
          operatorExpiresAt: null,
        },
      });

      // Логируем автоматическое истечение
      await prisma.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: 0,
          actorName: 'system',
          action: 'OPERATOR_ROLE_EXPIRED',
          targetType: 'User',
          targetId: user.id,
          targetName: user.fullName,
          details: { expiresAt: user.operatorExpiresAt?.toISOString() },
        },
      });
    }
  } catch (error) {
    console.error('Auto-expire operators error:', error);
  }
}

// GET /api/admins — Список админов (зависит от роли запрашивающего)
export const getAdmins = async (req: AuthRequest, res: Response) => {
  try {
    // Автоматически снимаем роль у истёкших операторов
    await autoExpireOperators();

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
        admins.unshift(self);
      }
    }

    // Получаем User-операторов и User-админов
    const userOperatorWhere = isSuperAdmin
      ? { isOperator: true }
      : { isOperator: true, operatorCreatedByAdminId: req.adminId };

    const userOperators = await prisma.user.findMany({
      where: userOperatorWhere,
      include: {
        group: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // User-админы (только суперадмин видит)
    const userAdmins = isSuperAdmin
      ? await prisma.user.findMany({
          where: { isAdmin: true },
          include: {
            group: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const adminResults = admins.map((a: any) => ({ ...a, source: 'admin' as const }));
    const userOpResults = userOperators.map((u) => ({
      id: u.id,
      username: u.fullName,
      fullName: u.fullName,
      email: u.email,
      role: 'OPERATOR' as const,
      createdByAdminId: u.operatorCreatedByAdminId,
      createdAt: u.createdAt.toISOString(),
      _count: { createdKpis: 0 },
      source: 'user' as const,
      userId: u.id,
      position: u.position,
      groupName: u.group?.name || null,
      operatorExpiresAt: u.operatorExpiresAt?.toISOString() || null,
    }));
    const userAdminResults = userAdmins.map((u) => ({
      id: u.id,
      username: u.fullName,
      fullName: u.fullName,
      email: u.email,
      role: 'ADMIN' as const,
      createdByAdminId: u.adminCreatedByAdminId,
      createdAt: u.createdAt.toISOString(),
      _count: { createdKpis: 0 },
      source: 'user' as const,
      userId: u.id,
      position: u.position,
      groupName: u.group?.name || null,
    }));

    res.json([...adminResults, ...userAdminResults, ...userOpResults]);
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

    await logAudit(req, {
      action: 'ADMIN_CREATE',
      targetType: 'Admin',
      targetId: admin.id,
      targetName: admin.username,
      details: { role: admin.role },
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

    await logAudit(req, {
      action: 'ADMIN_DELETE',
      targetType: 'Admin',
      targetId: admin.id,
      targetName: admin.username,
      details: { role: admin.role },
    });

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

    await logAudit(req, {
      action: 'ADMIN_PASSWORD_REGENERATE',
      targetType: 'Admin',
      targetId: admin.id,
      targetName: admin.username,
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

// GET /api/admins/promotable-users — Список пользователей, которых можно назначить оператором
export const getPromotableUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        approvalStatus: 'APPROVED',
        canAccessPlatform: true,
        login: { not: null },
        passwordHash: { not: null },
        isOperator: false,
        isAdmin: false,
      },
      select: {
        id: true,
        fullName: true,
        position: true,
        group: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    res.json(users);
  } catch (error) {
    console.error('Get promotable users error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/admins/promote-user — Назначить сотрудника оператором или админом
export const promoteUserToOperator = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, role, expiresAt } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId обязателен' });
    }

    const isSuperAdmin = req.adminRole === 'SUPER_ADMIN';
    const targetRole: 'OPERATOR' | 'ADMIN' = (isSuperAdmin && role === 'ADMIN') ? 'ADMIN' : 'OPERATOR';

    // Валидация даты истечения
    let parsedExpiresAt: Date | null = null;
    if (targetRole === 'OPERATOR' && expiresAt) {
      parsedExpiresAt = new Date(expiresAt);
      if (isNaN(parsedExpiresAt.getTime())) {
        return res.status(400).json({ error: 'Некорректная дата истечения' });
      }
      if (parsedExpiresAt <= new Date()) {
        return res.status(400).json({ error: 'Дата истечения должна быть в будущем' });
      }
    }

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        approvalStatus: 'APPROVED',
        canAccessPlatform: true,
        login: { not: null },
        passwordHash: { not: null },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Подходящий пользователь не найден' });
    }

    if (targetRole === 'OPERATOR' && user.isOperator) {
      return res.status(400).json({ error: 'Пользователь уже является оператором' });
    }

    if (targetRole === 'ADMIN' && user.isAdmin) {
      return res.status(400).json({ error: 'Пользователь уже является админом' });
    }

    const data = targetRole === 'ADMIN'
      ? { isAdmin: true, adminCreatedByAdminId: req.adminId }
      : {
          isOperator: true,
          operatorCreatedByAdminId: req.adminId,
          operatorExpiresAt: parsedExpiresAt,
        };

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        fullName: true,
        position: true,
        isOperator: true,
        isAdmin: true,
        operatorExpiresAt: true,
        group: { select: { id: true, name: true } },
      },
    });

    const details: Record<string, string> = {};
    if (parsedExpiresAt) {
      details.expiresAt = parsedExpiresAt.toISOString();
    }

    await logAudit(req, {
      action: targetRole === 'ADMIN' ? 'USER_PROMOTE_TO_ADMIN' : 'USER_PROMOTE_TO_OPERATOR',
      targetType: 'User',
      targetId: updated.id,
      targetName: updated.fullName,
      details: Object.keys(details).length > 0 ? details : undefined,
    });

    res.json(updated);
  } catch (error) {
    console.error('Promote user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/admins/demote-user/:userId — Снять роль оператора/админа с сотрудника
export const demoteUserFromOperator = async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Некорректный ID пользователя' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const isSuperAdmin = req.adminRole === 'SUPER_ADMIN';

    // Снятие роли админа — только суперадмин
    if (user.isAdmin) {
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Только суперадмин может снять роль админа' });
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          isAdmin: false,
          adminCreatedByAdminId: null,
        },
      });

      await logAudit(req, {
        action: 'USER_DEMOTE_FROM_ADMIN',
        targetType: 'User',
        targetId: user.id,
        targetName: user.fullName,
      });

      return res.json({ message: 'Роль админа снята' });
    }

    // Снятие роли оператора
    if (!user.isOperator) {
      return res.status(400).json({ error: 'Пользователь не является оператором или админом' });
    }

    // Обычные админы могут снимать роль только у своих назначенных
    if (!isSuperAdmin && user.operatorCreatedByAdminId !== req.adminId) {
      return res.status(403).json({ error: 'Вы можете снять роль только у назначенных вами операторов' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        isOperator: false,
        operatorCreatedByAdminId: null,
        operatorExpiresAt: null,
      },
    });

    await logAudit(req, {
      action: 'USER_DEMOTE_FROM_OPERATOR',
      targetType: 'User',
      targetId: user.id,
      targetName: user.fullName,
      details: { reason: 'manual' },
    });

    res.json({ message: 'Роль оператора снята' });
  } catch (error) {
    console.error('Demote user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
