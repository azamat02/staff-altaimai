import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';

export interface AuthRequest extends Request {
  adminId?: number;
  userId?: number;
  role?: 'admin' | 'operator' | 'user';
  adminRole?: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR';
  isOperator?: boolean;
}

interface JwtPayload {
  adminId?: number;
  userId?: number;
  role: 'admin' | 'operator' | 'user';
  adminRole?: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR';
  isOperator?: boolean;
  isAdmin?: boolean;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Не авторизован: токен не предоставлен' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;

    if (decoded.adminId) {
      req.adminId = decoded.adminId;
      req.adminRole = decoded.adminRole;
      // Operators get 'operator' role, admins/super_admins get 'admin'
      if (decoded.adminRole === 'OPERATOR') {
        req.role = 'operator';
      } else {
        req.role = 'admin';
      }
    } else if (decoded.userId && decoded.isAdmin) {
      // User-admin: получает доступ как админ
      req.adminId = decoded.userId;
      req.adminRole = 'ADMIN';
      req.role = 'admin';
      req.userId = decoded.userId;
    } else if (decoded.userId) {
      req.userId = decoded.userId;
      req.role = 'user';
      req.isOperator = decoded.isOperator || false;
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Не авторизован: недействительный токен' });
  }
};

// Middleware только для админов (SUPER_ADMIN и ADMIN, НЕ OPERATOR)
export const adminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён: требуются права администратора' });
  }
  next();
};

// Middleware только для супер-админов
export const superAdminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.adminRole !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Доступ запрещён: требуются права суперадминистратора' });
  }
  next();
};

// Middleware только для операторов
export const operatorOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.role !== 'operator') {
    return res.status(403).json({ error: 'Доступ запрещён: требуются права оператора' });
  }
  next();
};

// Middleware для админов и операторов
export const adminOrOperator = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.role !== 'admin' && req.role !== 'operator') {
    return res.status(403).json({ error: 'Доступ запрещён: требуются права администратора или оператора' });
  }
  next();
};

// Middleware для операторов (Admin-OPERATOR) или User-операторов (isOperator=true)
// Проверяет истечение срока действия роли оператора для user-операторов
export const operatorOrUserOperator = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.role === 'operator') {
    return next();
  }

  if (req.role === 'user' && req.isOperator && req.userId) {
    // Проверяем в БД: не истёк ли срок
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { isOperator: true, operatorExpiresAt: true },
    });

    if (user?.isOperator) {
      if (!user.operatorExpiresAt || user.operatorExpiresAt > new Date()) {
        return next();
      }
      // Срок истёк — автоматически снимаем роль
      await prisma.user.update({
        where: { id: req.userId },
        data: { isOperator: false, operatorCreatedByAdminId: null, operatorExpiresAt: null },
      });
      return res.status(403).json({ error: 'Срок действия роли оператора истёк' });
    }
  }

  return res.status(403).json({ error: 'Доступ запрещён' });
};

// Middleware для аутентифицированных пользователей (admin, operator или user)
export const authenticatedOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.adminId && !req.userId) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  next();
};
