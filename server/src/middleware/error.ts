import { Request, Response, NextFunction } from 'express';
import { ApiError, ErrorResponse } from '../types/error';
import { ZodError } from 'zod';
import { getStorage } from '../../storage';

declare global {
  namespace Express {
    interface Request {
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

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let statusCode = 500;
  let errorResponse: ErrorResponse = {
    success: false,
    error: {
      message: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR'
    }
  };

  let errorType = 'UNKNOWN_ERROR';
  let errorCode: string | undefined;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    errorType = 'API_ERROR';
    errorCode = err.code;
    errorResponse.error = {
      message: err.message,
      code: err.code,
      details: err.details
    };
  } else if (err instanceof ZodError) {
    statusCode = 400;
    errorType = 'VALIDATION_ERROR';
    errorCode = 'VALIDATION_ERROR';
    errorResponse.error = {
      message: 'Validation Error',
      code: 'VALIDATION_ERROR',
      details: err.errors
    };
  } else if (err instanceof Error) {
    // Handle standard Error objects
    errorType = err.name || 'UNKNOWN_ERROR';
    errorResponse.error.message = err.message;
  }

  // Determine severity based on status code
  let severity = 'ERROR';
  if (statusCode >= 500) {
    severity = 'CRITICAL';
  } else if (statusCode >= 400) {
    severity = 'WARNING';
  }

  // Get client IP
  const clientIP = (req.headers['x-forwarded-for'] as string) || req.connection.remoteAddress || 'unknown';

  // Log error for debugging
  console.error('Error:', {
    path: req.path,
    method: req.method,
    statusCode,
    errorType,
    error: err.message,
    stack: err.stack,
    user: req.user?.username,
    ip: clientIP
  });
  // Log to database asynchronously (don't block response)
  setImmediate(async () => {
    try {
      const storage = await getStorage();
      await storage.logError({
        errorType,
        errorCode,
        errorMessage: err.message,
        stackTrace: err.stack,
        userId: req.user?.id,
        username: req.user?.username,
        method: req.method,
        endpoint: req.path,        ipAddress: clientIP,
        userAgent: req.headers['user-agent'],
        companyId: req.user?.company_id,
        requestData: {
          query: req.query,
          params: req.params,
          body: req.body
        },
        requestHeaders: req.headers,
        severity,
        metadata: {
          statusCode,
          timestamp: new Date(),
          referer: req.headers.referer,
          origin: req.headers.origin
        },
        timestamp: new Date()
      });
    } catch (logError) {
      console.error('Failed to log error to database:', logError);
    }
  });

  res.status(statusCode).json(errorResponse);
}