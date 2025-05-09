import { Request, Response, NextFunction } from 'express';
import { storage } from '../../storage';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../middleware/error';
import { insertUserSchema } from '@shared/schema';
import { z } from 'zod';

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Confirm password is required")
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export class UserController {
  async getAllUsers(req: Request, res: Response, next: NextFunction) {
    try {
      // Only admin can list all users
      if (req.user?.role !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }

      const users = await storage.getAllUsers();
      return res.status(200).json({
        status: 'success',
        data: users
      });
    } catch (error) {
      next(error);
    }
  }

  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      // Only admin can create users
      if (req.user?.role !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }

      const validatedData = insertUserSchema.parse(req.body);
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        throw new ConflictError('Username already exists');
      }

      const user = await storage.createUser(validatedData);
      
      return res.status(201).json({
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

  async updatePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = updatePasswordSchema.parse(req.body);
      const userId = req.user?.id;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify current password
      const isValidPassword = await storage.verifyPassword(user.username, validatedData.currentPassword);
      if (!isValidPassword) {
        throw new ValidationError('Current password is incorrect');
      }

      // Update password
      await storage.updateUserPassword(userId, validatedData.newPassword);

      return res.status(200).json({
        status: 'success',
        message: 'Password updated successfully'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError(error.errors[0].message));
      }
      next(error);
    }
  }

  async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        throw new ValidationError('Invalid user ID');
      }

      // Users can only view their own profile unless they're an admin
      if (req.user?.role !== 'admin' && req.user?.id !== userId) {
        throw new ForbiddenError('Access denied');
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
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