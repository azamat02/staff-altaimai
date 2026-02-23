import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendResetCodeEmail } from '../utils/mailer';
import { logAudit } from '../utils/auditLog';

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/request-reset-code
export const requestResetCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email обязателен' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check if user or admin exists with this email
    const admin = await prisma.admin.findFirst({ where: { email: trimmedEmail } });
    const user = await prisma.user.findFirst({
      where: { email: trimmedEmail, approvalStatus: 'APPROVED', canAccessPlatform: true },
    });

    // Block SUPER_ADMIN
    if (admin && admin.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Сброс пароля для данного аккаунта запрещён' });
    }

    if (!admin && !user) {
      // Don't reveal that the email doesn't exist
      return res.json({ message: 'Если email зарегистрирован, код сброса будет отправлен' });
    }

    const fullName = admin ? admin.username : user!.fullName;

    // Invalidate previous unused codes for this email
    await prisma.passwordResetCode.updateMany({
      where: { email: trimmedEmail, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // +10 min

    await prisma.passwordResetCode.create({
      data: { email: trimmedEmail, code, expiresAt },
    });

    // Send email
    sendResetCodeEmail(trimmedEmail, fullName, code).catch((err) =>
      console.error('Failed to send reset code email:', err)
    );

    // Audit
    const targetType = admin ? 'Admin' : 'User';
    const targetId = admin ? admin.id : user!.id;
    const targetName = admin ? admin.username : user!.fullName;

    logAudit(req as AuthRequest, {
      action: 'PASSWORD_RESET_CODE_REQUESTED',
      targetType,
      targetId,
      targetName,
      actorOverride: {
        actorType: admin ? 'ADMIN' : 'USER',
        actorId: targetId,
        actorName: targetName,
      },
    });

    return res.json({ message: 'Если email зарегистрирован, код сброса будет отправлен' });
  } catch (error) {
    console.error('Request reset code error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/auth/verify-reset-code
export const verifyResetCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email и код обязательны' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();

    const resetCode = await prisma.passwordResetCode.findFirst({
      where: {
        email: trimmedEmail,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetCode) {
      return res.status(400).json({ error: 'Код не найден или истёк. Запросите новый код.' });
    }

    if (resetCode.attempts >= 5) {
      return res.status(400).json({ error: 'Превышено количество попыток. Запросите новый код.' });
    }

    if (resetCode.code !== trimmedCode) {
      await prisma.passwordResetCode.update({
        where: { id: resetCode.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = 4 - resetCode.attempts;
      return res.status(400).json({
        error: `Неверный код. Осталось попыток: ${remaining > 0 ? remaining : 0}`,
      });
    }

    // Code is correct — generate reset token (JWT, 5 min)
    const resetToken = jwt.sign(
      { email: trimmedEmail, codeId: resetCode.id, purpose: 'password-reset' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '5m' }
    );

    return res.json({ resetToken });
  } catch (error) {
    console.error('Verify reset code error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/auth/set-new-password
export const setNewPassword = async (req: Request, res: Response) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: 'Токен и новый пароль обязательны' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    let decoded: { email: string; codeId: number; purpose: string };
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET || 'secret') as typeof decoded;
    } catch {
      return res.status(400).json({ error: 'Токен недействителен или истёк' });
    }

    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({ error: 'Недействительный токен' });
    }

    // Verify code is still unused and not expired
    const resetCode = await prisma.passwordResetCode.findUnique({
      where: { id: decoded.codeId },
    });

    if (!resetCode || resetCode.usedAt || resetCode.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Код уже использован или истёк' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Find admin or user by email
    const admin = await prisma.admin.findFirst({ where: { email: decoded.email } });
    const user = await prisma.user.findFirst({
      where: { email: decoded.email, approvalStatus: 'APPROVED', canAccessPlatform: true },
    });

    if (admin && admin.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Сброс пароля для данного аккаунта запрещён' });
    }

    if (!admin && !user) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }

    if (admin) {
      await prisma.admin.update({
        where: { id: admin.id },
        data: { passwordHash },
      });
    }

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });
    }

    // Mark code as used
    await prisma.passwordResetCode.update({
      where: { id: decoded.codeId },
      data: { usedAt: new Date() },
    });

    // Audit
    const targetType = admin ? 'Admin' : 'User';
    const targetId = admin ? admin.id : user!.id;
    const targetName = admin ? admin.username : user!.fullName;

    logAudit(req as AuthRequest, {
      action: 'PASSWORD_CHANGED',
      targetType,
      targetId,
      targetName,
      actorOverride: {
        actorType: admin ? 'ADMIN' : 'USER',
        actorId: targetId,
        actorName: targetName,
      },
    });

    return res.json({ message: 'Пароль успешно изменён' });
  } catch (error) {
    console.error('Set new password error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

// POST /api/auth/change-password (authorized)
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Текущий и новый пароли обязательны' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    // Determine if admin or user
    if (req.adminId && !req.userId) {
      // Admin account
      const admin = await prisma.admin.findUnique({ where: { id: req.adminId } });
      if (!admin) {
        return res.status(404).json({ error: 'Аккаунт не найден' });
      }
      if (admin.role === 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Смена пароля для данного аккаунта запрещена через эту функцию' });
      }

      const isValid = await bcrypt.compare(currentPassword, admin.passwordHash);
      if (!isValid) {
        return res.status(400).json({ error: 'Неверный текущий пароль' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.admin.update({
        where: { id: admin.id },
        data: { passwordHash },
      });

      logAudit(req, {
        action: 'PASSWORD_CHANGED',
        targetType: 'Admin',
        targetId: admin.id,
        targetName: admin.username,
      });

      return res.json({ message: 'Пароль успешно изменён' });
    }

    if (req.userId) {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!user || !user.passwordHash) {
        return res.status(404).json({ error: 'Аккаунт не найден' });
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(400).json({ error: 'Неверный текущий пароль' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });

      logAudit(req, {
        action: 'PASSWORD_CHANGED',
        targetType: 'User',
        targetId: user.id,
        targetName: user.fullName,
      });

      return res.json({ message: 'Пароль успешно изменён' });
    }

    return res.status(401).json({ error: 'Не авторизован' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
