import { User } from '@shared/schema';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        role: string;
      };
    }

    interface Session {
      user?: {
        id: number;
        username: string;
        role: string;
      };
    }
  }
}