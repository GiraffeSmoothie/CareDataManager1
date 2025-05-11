import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../types/error';
import { AuthService } from '../services/auth.service';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        throw new ApiError(400, "Missing credentials", null, "MISSING_CREDENTIALS");
      }

      const user = await AuthService.validateUser(username, password);
      if (!user) {
        throw new ApiError(401, "Invalid credentials", null, "INVALID_CREDENTIALS");
      }

      req.session.user = user;
      return res.json({ success: true, user });
    } catch (error) {
      console.error("Login error:", error);
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.session?.user) {
        throw new ApiError(401, "Not authenticated", null, "NOT_AUTHENTICATED");
      }

      req.session.destroy((err) => {
        if (err) {
          throw new ApiError(500, "Failed to logout", err, "LOGOUT_FAILED");
        }
        res.status(200).json({ success: true });
      });
    } catch (error) {
      next(error);
    }
  }

  async validateSession(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.session?.user) {
        throw new ApiError(401, "Session expired", null, "SESSION_EXPIRED");
      }
      
      const user = await AuthService.getUserById(req.session.user.id);
      if (!user) {
        throw new ApiError(401, "Invalid session", null, "INVALID_SESSION");
      }

      res.json({ user });
    } catch (error) {
      next(error);
    }
  }
}