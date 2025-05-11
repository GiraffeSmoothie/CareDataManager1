import { Request, Response, NextFunction } from 'express';
import { ApiError, ErrorResponse } from '../types/error';
import { ZodError } from 'zod';

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

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    errorResponse.error = {
      message: err.message,
      code: err.code,
      details: err.details
    };
  } else if (err instanceof ZodError) {
    statusCode = 400;
    errorResponse.error = {
      message: 'Validation Error',
      code: 'VALIDATION_ERROR',
      details: err.errors
    };
  } else if (err instanceof Error) {
    // Handle standard Error objects
    errorResponse.error.message = err.message;
  }

  // Log error for debugging (consider using a proper logging service in production)
  console.error('Error:', {
    path: req.path,
    method: req.method,
    error: err
  });

  res.status(statusCode).json(errorResponse);
}