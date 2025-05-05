import { Request, Response } from "express";
import { UserService } from "../services/user.service";

export class UserController {
  static async getUsers(req: Request, res: Response) {
    try {
      const users = await UserService.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Error fetching users" });
    }
  }

  static async getUserById(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const user = await UserService.getUserById(parseInt(id));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Error fetching user" });
    }
  }

  static async updateUser(req: Request, res: Response) {
    const { id } = req.params;
    const updateData = req.body;
    
    try {
      const user = await UserService.updateUser(parseInt(id), updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Error updating user" });
    }
  }

  static async deleteUser(req: Request, res: Response) {
    const { id } = req.params;
    
    try {
      await UserService.deleteUser(parseInt(id));
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting user" });
    }
  }
}