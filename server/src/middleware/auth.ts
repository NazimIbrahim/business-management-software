import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: 'admin' | 'manager' | 'salesperson' | 'accounts' | 'dispatch' | 'dispatch_team' | string;
  email?: string;
  phone?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (err) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    req.user = user as AuthUser;
    next();
  });
}

export function optionalAuthenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

  if (token) {
    jwt.verify(token, config.jwtSecret, (err, user) => {
      if (!err && user) {
        req.user = user as AuthUser;
      }
      next();
    });
  } else {
    next();
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Requires one of roles: ${allowedRoles.join(', ')}`,
      });
      return;
    }

    next();
  };
}
