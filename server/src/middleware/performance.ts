import { Request, Response, NextFunction } from 'express';
import { getStorage } from '../../storage';

interface PerformanceMetrics {
  startTime: number;
  memoryUsageStart: NodeJS.MemoryUsage;
}

declare global {
  namespace Express {
    interface Request {
      performanceMetrics?: PerformanceMetrics;
      user?: {
        id: number;
        username: string;
        name: string;
        role: string;
        company_id?: number;
      };
    }
  }
}

/**
 * Performance logging middleware
 * Captures request metrics and logs them to the performance_logs table
 */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip non-API routes
  if (!req.path.startsWith('/api')) {
    return next();
  }

  const startTime = Date.now();
  const memoryUsageStart = process.memoryUsage();

  // Store metrics on request object
  req.performanceMetrics = {
    startTime,
    memoryUsageStart
  };

  // Capture response completion
  const originalSend = res.send;
  res.send = function(body) {
    // Restore original send method
    res.send = originalSend;        // Log performance metrics asynchronously
        setImmediate(async () => {
          try {
            const storage = await getStorage();
            const endTime = Date.now();
        const memoryUsageEnd = process.memoryUsage();
        const responseTimeMs = endTime - startTime;

        // Calculate memory usage in MB
        const memoryUsageMb = (memoryUsageEnd.heapUsed - memoryUsageStart.heapUsed) / 1024 / 1024;

        // Get request/response sizes
        const requestSizeBytes = req.headers['content-length'] 
          ? parseInt(req.headers['content-length'] as string) 
          : 0;

        // Estimate response size (this is approximate)
        const responseSizeBytes = body ? Buffer.byteLength(body.toString()) : 0;

        // Get user info if authenticated
        const userId = req.user?.id;
        const companyId = req.user?.company_id;

        // Get client IP
        const clientIP = (req.headers['x-forwarded-for'] as string) || req.connection.remoteAddress || 'unknown';

        // Log performance metrics
        await storage.logPerformance({
          endpoint: req.path,
          method: req.method,
          userId,
          companyId,
          responseTimeMs,
          responseStatus: res.statusCode,
          memoryUsageMb: Math.round(memoryUsageMb * 100) / 100, // Round to 2 decimal places
          requestSizeBytes,
          responseSizeBytes,
          metadata: {
            userAgent: req.headers['user-agent'],
            clientIP,
            query: Object.keys(req.query).length > 0 ? req.query : undefined,
            params: Object.keys(req.params).length > 0 ? req.params : undefined
          },
          timestamp: new Date()
        });

        // Log slow requests (> 1 second) as warnings
        if (responseTimeMs > 1000) {
          console.warn(`🐌 SLOW REQUEST: ${req.method} ${req.path} took ${responseTimeMs}ms`);
        }

        // Log errors (4xx, 5xx) with additional context
        if (res.statusCode >= 400) {
          console.warn(`⚠️ ERROR RESPONSE: ${req.method} ${req.path} returned ${res.statusCode} in ${responseTimeMs}ms`);
        }

      } catch (error) {
        console.error('Failed to log performance metrics:', error);
        // Don't throw to avoid breaking the request
      }
    });

    // Call original send
    return originalSend.call(this, body);
  };

  next();
}

/**
 * Get current performance metrics for a request
 */
export function getCurrentMetrics(req: Request): { responseTimeMs: number; memoryUsageMb: number } | null {
  if (!req.performanceMetrics) {
    return null;
  }

  const currentTime = Date.now();
  const currentMemory = process.memoryUsage();
  
  const responseTimeMs = currentTime - req.performanceMetrics.startTime;
  const memoryUsageMb = (currentMemory.heapUsed - req.performanceMetrics.memoryUsageStart.heapUsed) / 1024 / 1024;

  return {
    responseTimeMs,
    memoryUsageMb: Math.round(memoryUsageMb * 100) / 100
  };
}
