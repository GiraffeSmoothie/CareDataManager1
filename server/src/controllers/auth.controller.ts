import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";

export class AuthController {
  static async login(req: Request, res: Response) {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const user = await AuthService.validateUser(username, password);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    req.session.user = user;
    res.json({ user });
  }

  static async register(req: Request, res: Response) {
    const { username, password, name, role } = req.body;

    if (!username || !password || !name || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    try {
      const user = await AuthService.createUser({ username, password, name, role });
      res.status(201).json({ user });
    } catch (error) {
      res.status(400).json({ message: "Username already exists" });
    }
  }

  static logout(req: Request, res: Response) {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Error logging out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  }
}