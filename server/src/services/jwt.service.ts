import jwt, { SignOptions } from 'jsonwebtoken';
import { Request } from 'express';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface JWTUser {
  id: number;
  username: string;
  role: string;
  company_id?: number;
}

export interface JWTPayload extends JWTUser {
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export class JWTService {  /**
   * Generate access token
   */
  static generateAccessToken(user: JWTUser): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      id: user.id,
      username: user.username,
      role: user.role,
      company_id: user.company_id,
      type: 'access'
    };    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'care-data-manager',
      audience: 'care-data-manager-app'
    } as any);
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(user: JWTUser): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      id: user.id,
      username: user.username,
      role: user.role,
      company_id: user.company_id,
      type: 'refresh'
    };    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: 'care-data-manager',
      audience: 'care-data-manager-app'
    } as any);
  }

  /**
   * Generate both access and refresh tokens
   */
  static generateTokens(user: JWTUser): { accessToken: string; refreshToken: string } {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user)
    };
  }

  /**
   * Verify and decode a JWT token
   */
  static verifyToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'care-data-manager',
        audience: 'care-data-manager-app'
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      console.error('JWT verification failed:', error);
      return null;
    }
  }
  /**
   * Extract token from request headers or query parameters
   */
  static extractTokenFromRequest(req: Request): string | null {
    // First try to get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      // Support both "Bearer token" and "token" formats
      if (authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
      }
      return authHeader;
    }

    // If no header, try query parameter (for direct file access)
    const tokenFromQuery = req.query.token as string;
    if (tokenFromQuery) {
      return tokenFromQuery;
    }

    return null;
  }

  /**
   * Decode token without verification (for expired token handling)
   */
  static decodeToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      return decoded;
    } catch (error) {
      console.error('JWT decode failed:', error);
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }

    return Date.now() >= decoded.exp * 1000;
  }

  /**
   * Refresh access token using refresh token
   */
  static refreshAccessToken(refreshToken: string): { accessToken: string } | null {
    const decoded = this.verifyToken(refreshToken);
    
    if (!decoded || decoded.type !== 'refresh') {
      return null;
    }

    const user: JWTUser = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      company_id: decoded.company_id
    };

    return {
      accessToken: this.generateAccessToken(user)
    };
  }
}
