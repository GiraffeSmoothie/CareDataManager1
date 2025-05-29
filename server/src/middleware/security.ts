import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { body, param, query, validationResult } from "express-validator";
import DOMPurify from "isomorphic-dompurify";

/**
 * Enhanced security middleware collection for API hardening
 */

// Enhanced rate limiting with different limits for different endpoint types
export const createRateLimit = (windowMs: number, max: number, message?: string) => {
  return rateLimit({
    windowMs,
    max,
    message: message || "Too many requests from this IP, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
    // Use a more sophisticated key generator that includes user info when available
    keyGenerator: (req: Request) => {
      const userId = req.user?.id;
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return userId ? `${ip}:${userId}` : ip;
    },
    // Skip rate limiting for certain conditions
    skip: (req: Request) => {
      // Skip for health checks
      return req.path === '/health' || req.path === '/api/health';
    }
  });
};

// Different rate limits for different endpoint types
export const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts per window
  "Too many authentication attempts, please try again in 15 minutes"
);

export const apiRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  200, // 200 requests per window for general API
  "API rate limit exceeded, please try again later"
);

export const uploadRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  50, // 50 uploads per hour for both production and development
  "Upload rate limit exceeded, please try again in an hour"
);

export const strictRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  50, // Lower limit for sensitive operations
  "Sensitive operation rate limit exceeded"
);

/**
 * Security headers middleware using Helmet
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
});

/**
 * Enhanced input sanitization middleware
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  const sanitizeValue = (value: any): any => {
    if (typeof value === 'string') {
      // Use DOMPurify for HTML content sanitization
      const sanitized = DOMPurify.sanitize(value, { 
        ALLOWED_TAGS: [], 
        ALLOWED_ATTR: [] 
      });
      // Additional SQL injection prevention
      return sanitized.replace(/['";\\]/g, '').trim();
    } else if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    } else if (typeof value === 'object' && value !== null) {
      const sanitizedObj: any = {};
      Object.keys(value).forEach(key => {
        sanitizedObj[key] = sanitizeValue(value[key]);
      });
      return sanitizedObj;
    }
    return value;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeValue(req.query);
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeValue(req.params);
  }

  next();
};

/**
 * Request size limiting middleware
 */
export const requestSizeLimit = (req: Request, res: Response, next: NextFunction) => {
  const maxSize = 10 * 1024 * 1024; // 10MB limit
  const contentLength = req.get('Content-Length');
  
  if (contentLength && parseInt(contentLength) > maxSize) {
    return res.status(413).json({
      success: false,
      error: {
        message: 'Request entity too large',
        code: 'REQUEST_TOO_LARGE',
        maxSize: `${maxSize / (1024 * 1024)}MB`
      }
    });
  }
  
  next();
};

/**
 * Enhanced input validation middleware factory
 */
export const validateRequest = (validations: any[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    next();
  };
};

/**
 * Common validation chains
 */
export const idValidation = [
  param('id').custom((value) => {
    console.log(`[DEBUG] idValidation received value: "${value}", type: ${typeof value}`);
    const id = parseInt(value, 10);
    console.log(`[DEBUG] idValidation parsed value: ${id}, isNaN: ${isNaN(id)}`);
    if (isNaN(id) || id <= 0) {
      throw new Error('ID must be a positive integer');
    }
    return true;
  })
];

export const companyIdValidation = [
  param('companyId').custom((value) => {
    const id = parseInt(value, 10);
    if (isNaN(id) || id <= 0) {
      throw new Error('Company ID must be a positive integer');
    }
    return true;
  })
];

export const clientIdValidation = [
  param('clientId').custom((value) => {
    const id = parseInt(value, 10);
    if (isNaN(id) || id <= 0) {
      throw new Error('Client ID must be a positive integer');
    }
    return true;
  })
];

export const serviceIdValidation = [
  param('serviceId').custom((value) => {
    const id = parseInt(value, 10);
    if (isNaN(id) || id <= 0) {
      throw new Error('Service ID must be a positive integer');
    }
    return true;
  })
];

export const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

export const segmentValidation = [
  body('segmentId').optional().isInt({ min: 1 }).withMessage('Segment ID must be a positive integer'),
  query('segmentId').optional().isInt({ min: 1 }).withMessage('Segment ID must be a positive integer')
];

/**
 * API key authentication middleware for service-to-service calls
 */
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.header('X-API-Key');
  const validApiKey = process.env.API_KEY;
  // Skip API key check for regular user sessions
  if (req.user) {
    return next();
  }

  if (!validApiKey) {
    // API key not configured, skip this check
    return next();
  }

  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid or missing API key',
        code: 'INVALID_API_KEY'
      }
    });
  }

  next();
};

/**
 * Request logging middleware for audit trails
 */
export const auditLog = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const userId = req.user?.id || 'anonymous';
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  
  // Log request start
  console.log(`[AUDIT] ${new Date().toISOString()} - ${req.method} ${req.path} - User: ${userId} - IP: ${ip}`);
  
  // Capture response
  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - startTime;
    
    // Log response (be careful not to log sensitive data)
    console.log(`[AUDIT] ${new Date().toISOString()} - ${req.method} ${req.path} - Status: ${res.statusCode} - Duration: ${duration}ms - User: ${userId} - IP: ${ip}`);
    
    // Log sensitive operations
    if (req.method !== 'GET' && (req.path.includes('/api/users') || req.path.includes('/api/auth'))) {
      console.log(`[AUDIT-SENSITIVE] ${new Date().toISOString()} - ${req.method} ${req.path} - User: ${userId} - IP: ${ip} - UserAgent: ${userAgent}`);
    }
    
    return originalSend.call(this, body);
  };
  
  next();
};

/**
 * SQL injection prevention middleware
 */
export const preventSQLInjection = (req: Request, res: Response, next: NextFunction) => {
  const sqlInjectionPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/i,
    /(--|\;|\||\/\*|\*\/)/,
    /(script|javascript|vbscript|onload|onerror|onclick)/i
  ];

  const checkForSQLInjection = (value: any, path: string = ''): boolean => {
    if (typeof value === 'string') {
      return sqlInjectionPatterns.some(pattern => pattern.test(value));
    } else if (Array.isArray(value)) {
      return value.some((item, index) => checkForSQLInjection(item, `${path}[${index}]`));
    } else if (typeof value === 'object' && value !== null) {
      return Object.keys(value).some(key => 
        checkForSQLInjection(value[key], `${path}.${key}`)
      );
    }
    return false;
  };

  // Check request body
  if (req.body && checkForSQLInjection(req.body)) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid input detected',
        code: 'INVALID_INPUT'
      }
    });
  }

  // Check query parameters
  if (req.query && checkForSQLInjection(req.query)) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid query parameters detected',
        code: 'INVALID_QUERY'
      }
    });
  }

  next();
};

/**
 * File upload security middleware
 */
export const secureFileUpload = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file && !req.files) {
    return next();
  }

  const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ];
  const file = req.file || (Array.isArray(req.files) ? req.files[0] : Object.values(req.files || {})[0]);
  
  if (file && !Array.isArray(file)) {
    // Check file type
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid file type',
          code: 'INVALID_FILE_TYPE',
          allowedTypes: allowedMimeTypes
        }
      });
    }    // Check file size (5MB limit)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'File too large',
          code: 'FILE_TOO_LARGE',
          maxSize: `${maxSize / (1024 * 1024)}MB`
        }
      });
    }

    // Sanitize filename
    if (file.originalname) {
      file.originalname = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '');
    }
  }

  next();
};

/**
 * CORS configuration for production
 */
export const configureCORS = (corsOrigins: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    
    if (!origin || corsOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  };
};

/**
 * API versioning middleware
 */
export const apiVersioning = (req: Request, res: Response, next: NextFunction) => {
  const version = req.headers['api-version'] || req.query.version || 'v1';
    // Store version in request for route handlers to use
  (req as any).apiVersion = version;
  
  // Set response header to indicate which version was used
  res.setHeader('API-Version', String(version));
  
  next();
};

/**
 * Enhanced error handling middleware
 */
export const enhancedErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Don't log passwords or other sensitive data
  const sanitizedBody = { ...req.body };
  if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
  if (sanitizedBody.currentPassword) sanitizedBody.currentPassword = '[REDACTED]';
  if (sanitizedBody.newPassword) sanitizedBody.newPassword = '[REDACTED]';

  console.error(`[ERROR] ${new Date().toISOString()} - ${req.method} ${req.path}`, {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    userId: req.user?.id,
    ip: req.ip,
    body: sanitizedBody
  });

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  let statusCode = 500;
  let errorResponse: any = {
    success: false,
    error: {
      message: 'Internal Server Error',
      code: 'INTERNAL_ERROR'
    }
  };

  if (err.statusCode) {
    statusCode = err.statusCode;
    errorResponse.error.message = err.message;
    errorResponse.error.code = err.code || 'UNKNOWN_ERROR';
  }

  if (isDevelopment) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err.details;
  }

  res.status(statusCode).json(errorResponse);
};
