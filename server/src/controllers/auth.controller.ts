import { Request, Response, NextFunction } from 'express';
import { storage } from '../../storage';  // Fixed path to point to server root
import { ValidationError, AuthenticationError } from '../middleware/error';
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required")
});

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = loginSchema.parse(req.body);
      
      const user = await storage.getUserByUsername(validatedData.username);
      if (!user || !(await storage.verifyPassword(validatedData.username, validatedData.password))) {
        throw new AuthenticationError("Invalid username or password");
      }

      // Set user session
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role
      };

      return res.status(200).json({
        status: 'success',
        data: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError(error.errors[0].message));
      }
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      req.session.destroy((err) => {
        if (err) {
          throw new Error("Failed to logout");
        }
        res.clearCookie("connect.sid");
        res.status(200).json({ status: 'success', message: "Logged out successfully" });
      });
    } catch (error) {
      next(error);
    }
  }

  async getCurrentUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.session.user) {
        throw new AuthenticationError();
      }

      const user = await storage.getUserById(req.session.user.id);
      if (!user) {
        throw new AuthenticationError("User session is invalid");
      }

      return res.status(200).json({
        status: 'success',
        data: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (error) {
      next(error);
    }
  }
}