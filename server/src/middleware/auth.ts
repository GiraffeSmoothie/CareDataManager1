import { Request, Response, NextFunction } from 'express';
import { AuthenticationError, ForbiddenError } from './error';

declare module "express" {
  interface Request {
    user?: {
      id: number;
      username: string;
      role: string;
    };
    memberPath?: string;
    filePath?: string;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.user) {
    return next(new AuthenticationError());
  }
  req.user = req.session.user;
  next();
}

export function requireRole(roles: string | string[]) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthenticationError());
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}

export function requireSelfOrAdmin(paramIdField: string = 'id') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthenticationError());
    }

    const resourceId = parseInt(req.params[paramIdField]);
    if (isNaN(resourceId)) {
      return next(new AuthenticationError('Invalid resource ID'));
    }

    // Allow access if user is admin or accessing their own resource
    if (req.user.role === 'admin' || req.user.id === resourceId) {
      return next();
    }

    return next(new ForbiddenError('Access denied'));
  };
}