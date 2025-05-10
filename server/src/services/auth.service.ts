import bcrypt from "bcrypt";
import { storage } from "../../storage";

const SALT_ROUNDS = 10;

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  static async validateUser(username: string, password: string) {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) {
        console.log('User not found:', username);
        return null;
      }

      const isValid = await bcrypt.compare(password, user.password);
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
      password: await this.hashPassword(userData.password)
    });
  }
}