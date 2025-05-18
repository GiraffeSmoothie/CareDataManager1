import { Request, Response, NextFunction } from "express";

declare module "express" {
  interface Request {    user?: {
      id: number;
      username: string;
      role: string;
      company_id?: number;
    };
    memberPath?: string;
    filePath?: string;
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  req.user = req.session.user;
  next();
};

export const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }
  next();
};