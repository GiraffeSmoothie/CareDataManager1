import crypto from "crypto";
import { storage } from "../../storage";

export class AuthService {
  static hashPassword(password: string): string {
    return crypto.createHash("sha256").update(password).digest("hex");
  }

  static async validateUser(username: string, password: string) {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) {
        console.log('User not found:', username);
        return null;
      }

      const hashedPassword = this.hashPassword(password);
      const isValid = user.password === hashedPassword;
      console.log('Password validation:', isValid ? 'successful' : 'failed');

      if (!isValid) {
        return null;
      }

      // Don't return the password in the response
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      console.error('Error in validateUser:', error);
      throw error;
    }
  }

  static async getUserById(id: number) {
    try {
      const user = await storage.getUserById(id);
      if (!user) {
        return null;
      }

      // Don't return the password in the response
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      console.error('Error in getUserById:', error);
      throw error;
    }
  }

  static async createUser(userData: { name: string, username: string, password: string, role: string }) {
    return await storage.createUser({
      ...userData,
      password: this.hashPassword(userData.password)
    });
  }
}