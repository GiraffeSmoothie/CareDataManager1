// JWT token storage and management utilities

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenPayload {
  id: number;
  username: string;
  role: string;
  company_id?: number;
  exp: number;
  iat: number;
  type: 'access' | 'refresh';
}

/**
 * Storage keys for JWT tokens
 */
const ACCESS_TOKEN_KEY = 'care_data_manager_access_token';
const REFRESH_TOKEN_KEY = 'care_data_manager_refresh_token';

/**
 * Token storage utilities
 */
export class TokenStorage {
  /**
   * Store JWT tokens in localStorage
   */
  static storeTokens(tokens: TokenPair): void {
    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    } catch (error) {
      console.error('Failed to store tokens:', error);
    }
  }

  /**
   * Get access token from localStorage
   */
  static getAccessToken(): string | null {
    try {
      return localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
  }

  /**
   * Get refresh token from localStorage
   */
  static getRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch (error) {
      console.error('Failed to get refresh token:', error);
      return null;
    }
  }

  /**
   * Remove all stored tokens
   */
  static clearTokens(): void {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch (error) {
      console.error('Failed to clear tokens:', error);
    }
  }

  /**
   * Check if user has valid tokens
   */
  static hasTokens(): boolean {
    return !!(this.getAccessToken() && this.getRefreshToken());
  }

  /**
   * Decode JWT token without verification (client-side only for reading claims)
   */
  static decodeToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = parts[1];
      const decoded = JSON.parse(atob(payload));
      return decoded;
    } catch (error) {
      console.error('Failed to decode token:', error);
      return null;
    }
  }

  /**
   * Check if access token is expired or about to expire (within 5 minutes)
   */
  static isAccessTokenExpired(): boolean {
    const token = this.getAccessToken();
    if (!token) {
      return true;
    }

    const payload = this.decodeToken(token);
    if (!payload) {
      return true;
    }

    // Check if token expires within 5 minutes (300 seconds)
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = payload.exp - now;
    return expiresIn <= 300; // 5 minutes buffer
  }

  /**
   * Check if refresh token is expired
   */
  static isRefreshTokenExpired(): boolean {
    const token = this.getRefreshToken();
    if (!token) {
      return true;
    }

    const payload = this.decodeToken(token);
    if (!payload) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    return payload.exp <= now;
  }

  /**
   * Get user information from stored access token
   */
  static getCurrentUser(): { id: number; username: string; role: string; company_id?: number } | null {
    const token = this.getAccessToken();
    if (!token) {
      return null;
    }

    const payload = this.decodeToken(token);
    if (!payload || payload.type !== 'access') {
      return null;
    }

    return {
      id: payload.id,
      username: payload.username,
      role: payload.role,
      company_id: payload.company_id
    };
  }
}

/**
 * Token refresh service
 */
export class TokenRefreshService {
  private static isRefreshing = false;
  private static refreshPromise: Promise<string | null> | null = null;

  /**
   * Refresh access token using refresh token
   */
  static async refreshAccessToken(): Promise<string | null> {
    // If already refreshing, return the existing promise
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    
    this.refreshPromise = this.performRefresh();
    
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private static async performRefresh(): Promise<string | null> {
    try {
      const refreshToken = TokenStorage.getRefreshToken();
      
      if (!refreshToken) {
        console.log('No refresh token available');
        return null;
      }

      if (TokenStorage.isRefreshTokenExpired()) {
        console.log('Refresh token is expired');
        TokenStorage.clearTokens();
        return null;
      }

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        console.log('Failed to refresh token:', response.status);
        TokenStorage.clearTokens();
        return null;
      }

      const data = await response.json();
      
      if (data.accessToken) {
        // Update only the access token
        TokenStorage.storeTokens({
          accessToken: data.accessToken,
          refreshToken: refreshToken
        });
        
        return data.accessToken;
      }

      return null;
    } catch (error) {
      console.error('Token refresh error:', error);
      TokenStorage.clearTokens();
      return null;
    }
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  static async getValidAccessToken(): Promise<string | null> {
    // Check if we have a valid access token
    if (!TokenStorage.isAccessTokenExpired()) {
      return TokenStorage.getAccessToken();
    }

    // Try to refresh the token
    return await this.refreshAccessToken();
  }
}
