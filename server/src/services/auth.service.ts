import bcrypt from "bcrypt";
import { getStorage } from "../../storage";

const SALT_ROUNDS = 10;

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }
  static async validateUser(username: string, password: string) {
    try {
      const storage = await getStorage();
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return null;
      }

      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        return null;
      }

      // Don't return the password in the response, but include password change requirements
      const { password: _, ...userWithoutPassword } = user;

      return {
        ...userWithoutPassword,
        requiresPasswordChange: user.force_password_change || false
      };
    } catch (error) {
      console.error('Error in validateUser:', error);
      throw error;
    }
  }  static async getUserById(id: number) {
    try {
      const storage = await getStorage();
      const user = await storage.getUserById(id);
      if (!user) {
        return null;
      }

      // Don't return the password in the response
      const { password: _, ...userWithoutPassword } = user;
      
      // If user has a company_id, fetch the company details
      let company = null;
      if (user.company_id) {        try {
          company = await storage.getCompanyById(user.company_id);
        } catch (error) {
          console.warn('Failed to fetch company details for user:', error);
          // Don't fail the whole request if company fetch fails
        }
      }

      return {
        ...userWithoutPassword,
        company
      };
    } catch (error) {
      console.error('Error in getUserById:', error);
      throw error;
    }
  }
  static async createUser(userData: { name: string; username: string; password: string; role?: string; company_id?: number }) {
    const storage = await getStorage();
    return await storage.createUser({
      ...userData,
      password: await this.hashPassword(userData.password)
    });
  }
}