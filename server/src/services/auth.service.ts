import crypto from "crypto";
import { storage } from "../../storage";

export class AuthService {
  static hashPassword(password: string): string {
    return crypto.createHash("sha256").update(password).digest("hex");
  }

  static async validateUser(username: string, password: string) {
    const user = await storage.getUserByUsername(username);
    if (!user) {
      return null;
    }

    const hashedPassword = this.hashPassword(password);
    if (user.password !== hashedPassword) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    };
  }

  static async createUser(userData: { name: string, username: string, password: string, role: string }) {
    return await storage.createUser({
      ...userData,
      password: this.hashPassword(userData.password)
    });
  }
}