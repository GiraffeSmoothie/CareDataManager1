import { Request, Response, NextFunction } from 'express';
import { storage as dbStorage } from '../../storage';
import { ApiError } from '../types/error';
import { z } from 'zod';

const userUpdateSchema = z.object({
  name: z.string().optional(),
  password: z.string().optional(),
  role: z.enum(['admin', 'user']).optional(),
  company_id: z.number().optional()
});

export class UserController {
  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await dbStorage.getAllUsers();
      if (!users) {
        throw new ApiError(404, "No users found", null, "NOT_FOUND");
      }
      res.json(users);
    } catch (error) {
      next(error);
    }
  }

  async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        throw new ApiError(400, "Invalid user ID", null, "INVALID_ID");
      }

      const user = await dbStorage.getUserById(id);
      if (!user) {
        throw new ApiError(404, "User not found", null, "USER_NOT_FOUND");
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  }


  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        throw new ApiError(400, "Invalid user ID", null, "INVALID_ID");
      }

      // Validate request body against schema
      const validatedData = userUpdateSchema.parse(req.body);

      // Check if user exists
      const existingUser = await dbStorage.getUserById(id);
      if (!existingUser) {
        throw new ApiError(404, "User not found", null, "USER_NOT_FOUND");
      }

      // Check permissions
      if (req.session?.user?.role !== 'admin' && req.session?.user?.id !== id) {
        throw new ApiError(403, "Insufficient permissions", null, "FORBIDDEN");
      }

      const updatedUser = await dbStorage.updateUser(id, validatedData);
      res.json(updatedUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ApiError(400, "Invalid user data", error.errors, "VALIDATION_ERROR"));
      } else {
        next(error);
      }
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        throw new ApiError(400, "Invalid user ID", null, "INVALID_ID");
      }

      // Check if user exists
      const existingUser = await dbStorage.getUserById(id);
      if (!existingUser) {
        throw new ApiError(404, "User not found", null, "USER_NOT_FOUND");
      }

      // Check permissions
      if (req.session?.user?.role !== 'admin') {
        throw new ApiError(403, "Admin access required", null, "FORBIDDEN");
      }

      await dbStorage.deleteUser(id);
      res.status(200).json({ success: true });

    } catch (error) {
      next(error);
    }
  }
}