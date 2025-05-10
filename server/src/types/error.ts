export interface ApiErrorResponse {
  message: string;
  details?: unknown;
  code?: string;
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details: any = null,
    public code: string = 'INTERNAL_SERVER_ERROR'
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: any;
  };
}

export function createErrorResponse(error: unknown): ApiErrorResponse {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      details: error.details,
      code: error.code
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    };
  }

  return {
    message: 'An unexpected error occurred',
    code: 'INTERNAL_SERVER_ERROR'
  };
}