import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../types/error';
import { AuthService } from '../services/auth.service';
import { JWTService } from '../services/jwt.service';
import { storage as dbStorage } from '../../storage';

// Helper function to get client IP
function getClientIP(req: Request): string {
  return (req.headers['x-forwarded-for'] as string) ||
         (req.headers['x-real-ip'] as string) ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         '127.0.0.1';
}

export class AuthController {
  /**
   * Login endpoint - validates credentials and returns JWT tokens
   */  async login(req: Request, res: Response, next: NextFunction) {
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    let username: string | undefined;
    
    try {
      const { username: reqUsername, password } = req.body;
      username = reqUsername;
        if (!username || !password) {
        // Log failed login attempt
        await dbStorage.logLogin({
          username,
          loginType: 'LOGIN_FAILED',
          failureReason: 'Missing credentials',
          ipAddress: clientIP,
          userAgent,
          timestamp: new Date()
        });
        throw new ApiError(400, "Missing credentials", null, "MISSING_CREDENTIALS");
      }

      const user = await AuthService.validateUser(username, password);      
      
      if (!user) {
        // Log failed login attempt
        await dbStorage.logLogin({
          username,
          loginType: 'LOGIN_FAILED',
          failureReason: 'Invalid credentials',
          ipAddress: clientIP,
          userAgent,
          timestamp: new Date()
        });
        throw new ApiError(401, "Invalid credentials", null, "INVALID_CREDENTIALS");
      }

      // Generate JWT tokens
      const tokens = JWTService.generateTokens({
        id: user.id,
        username: user.username,
        role: user.role,
        company_id: user.company_id
      });

      // Log successful login
      await dbStorage.logLogin({
        username: user.username,
        userId: user.id,
        loginType: 'LOGIN_SUCCESS',
        ipAddress: clientIP,
        userAgent,
        companyId: user.company_id,        timestamp: new Date()
      });

      return res.json({ 
        success: true, 
        user,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      
      // Log failed login if not already logged and we have username
      if (username && error instanceof ApiError && error.statusCode !== 400) {
        try {
          await dbStorage.logLogin({
            username,
            loginType: 'LOGIN_FAILED',
            failureReason: error.message || 'Authentication error',
            ipAddress: clientIP,
            userAgent,
            timestamp: new Date()
          });
        } catch (logError) {
          console.error("Failed to log login error:", logError);
        }
      }
      
      next(error);
    }
  }
  /**
   * Logout endpoint - for JWT, this is primarily client-side token removal
   * Server can optionally maintain a blacklist of revoked tokens
   */
  async logout(req: Request, res: Response, next: NextFunction) {
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    try {
      if (!req.user) {
        throw new ApiError(401, "Not authenticated", null, "NOT_AUTHENTICATED");
      }

      // Log logout event
      await dbStorage.logLogin({
        username: req.user.username,
        userId: req.user.id,
        loginType: 'LOGOUT',
        ipAddress: clientIP,
        userAgent,
        companyId: req.user.company_id,
        timestamp: new Date()
      });

      // For JWT, logout is primarily handled client-side by removing tokens
      // In a production environment, you might want to add token blacklisting here
      console.log(`User ${req.user.username} logged out`);
      
      res.status(200).json({ 
        success: true,
        message: "Logged out successfully"
      });
    } catch (error) {
      console.error("Logout error:", error);
      next(error);
    }
  }

  /**
   * Validate token endpoint - verifies current JWT token validity
   */
  async validateToken(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, "Token invalid", null, "TOKEN_INVALID");
      }
      
      // Get fresh user data from database to ensure it's still valid
      const user = await AuthService.getUserById(req.user.id);
      if (!user) {
        throw new ApiError(401, "User not found", null, "USER_NOT_FOUND");
      }

      res.json({ 
        valid: true,
        user 
      });
    } catch (error) {
      next(error);
    }
  }
  /**
   * Refresh token endpoint - generates new access token using refresh token
   */
  async refreshToken(req: Request, res: Response, next: NextFunction) {
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        throw new ApiError(400, "Refresh token required", null, "REFRESH_TOKEN_REQUIRED");
      }

      const result = JWTService.refreshAccessToken(refreshToken);
      
      if (!result) {
        // Log failed token refresh
        await dbStorage.logLogin({
          loginType: 'TOKEN_REFRESH',
          failureReason: 'Invalid refresh token',
          ipAddress: clientIP,
          userAgent,
          timestamp: new Date()
        });
        throw new ApiError(401, "Invalid refresh token", null, "INVALID_REFRESH_TOKEN");
      }      // Get user info from the new token for logging
      let userId: number | undefined;
      let username: string | undefined;
      let companyId: number | undefined;
      try {
        const decoded = JWTService.verifyToken(result.accessToken);
        if (decoded) {
          userId = decoded.id;
          username = decoded.username;
          companyId = decoded.company_id;
        }
      } catch (decodeError) {
        console.warn("Could not decode new access token for logging:", decodeError);
      }

      // Log successful token refresh
      await dbStorage.logLogin({
        username,
        userId,
        loginType: 'TOKEN_REFRESH',
        ipAddress: clientIP,
        userAgent,
        companyId,
        timestamp: new Date()
      });

      res.json({
        success: true,
        accessToken: result.accessToken
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      next(error);
    }
  }

  // Keep validateSession for backward compatibility, but redirect to validateToken
  async validateSession(req: Request, res: Response, next: NextFunction) {
    return this.validateToken(req, res, next);
  }
}