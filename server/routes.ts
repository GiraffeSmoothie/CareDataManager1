import express from "express";
import { Request, Response, NextFunction } from "express";
import { AuthService } from "./src/services/auth.service";
import { AuthController } from "./src/controllers/auth.controller";

import { type Express } from "express";
import { createServer, type Server } from "http";
import { storage as dbStorage, pool } from "./storage";  // Import pool from storage.ts
import { insertUserSchema, insertMasterDataSchema, insertPersonInfoSchema, insertDocumentSchema, insertServiceCaseNoteSchema, insertClientServiceSchema, insertCompanySchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import cors from 'cors';
import { BlobStorageService } from "./services/blob-storage.service";
import { RequestHandler, ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { errorHandler } from './src/middleware/error';
import { ApiError } from './src/types/error';
import { Company } from "../shared/schema";
import { Request as ExpressRequest } from "express";
import { validateSegmentAccess, companyDataFilter, authMiddleware } from './src/middleware/auth';
import { 
  securityHeaders, 
  sanitizeInput, 
  requestSizeLimit,
  validateRequest,
  apiKeyAuth,
  auditLog,
  preventSQLInjection,
  secureFileUpload,
  configureCORS,
  apiVersioning,
  enhancedErrorHandler,
  authRateLimit,
  apiRateLimit,
  uploadRateLimit,
  strictRateLimit,
  idValidation,
  companyIdValidation,
  clientIdValidation,
  serviceIdValidation,
  paginationValidation,
  segmentValidation
} from './src/middleware/security';

// Note: We already have a session type declaration above, removing duplicate

// We'll use AuthenticatedRequest instead of this interface
// interface AuthRequest extends Request {
//   user: {
//     id: number;
//     username: string;
//     role: string;
//   };
// }

// Base response type for consistent error handling
interface ApiResponse<T = any> {
  message?: string;
  data?: T;
}

interface UserSession {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

interface TypedRequestBody<T> extends AuthenticatedRequest {
  body: T;
}

interface TypedRequestParams<T extends ParamsDictionary> extends AuthenticatedRequest {
  params: T;
}

// Define AuthenticatedRequest type
interface AuthenticatedRequest<
  P = ParamsDictionary,
  ReqBody = any,
  ReqQuery = ParsedQs
> extends Request<P, any, ReqBody, ReqQuery> {
  user: {
    id: number;
    username: string;
    role: string;
  };
}

/**
 * Type guard for authenticated requests
 * 
 * Checks if the request has a user property, indicating it came from an authenticated route.
 * Used to safely narrow the type of requests in route handlers that require authentication.
 * 
 * @template P - Type for request parameters 
 * @template ReqBody - Type for request body
 * @template ReqQuery - Type for request query parameters
 * @param req - Express request object to check
 * @returns Type predicate indicating whether the request is authenticated
 */
const isAuthenticated = <
  P = ParamsDictionary,
  ReqBody = any,
  ReqQuery = ParsedQs
>(
  req: Request<P, any, ReqBody, ReqQuery>
): req is AuthenticatedRequest<P, ReqBody, ReqQuery> => {
  return 'user' in req && req.user !== undefined;
};

/**
 * Helper to create typed request handlers with authentication check
 * 
 * Creates an Express request handler with proper type checking and authentication verification.
 * Automatically rejects unauthenticated requests and provides proper type safety for handlers.
 * Passes errors to the next middleware for centralized error handling.
 * 
 * @template P - Type for request parameters
 * @template ResBody - Type for response body 
 * @template ReqBody - Type for request body
 * @template ReqQuery - Type for request query parameters
 * @param handler - The async handler function that processes authenticated requests
 * @returns A middleware function that enforces authentication and handles errors
 */
const createHandler = <
  P extends ParamsDictionary = ParamsDictionary,
  ResBody extends ApiResponse = ApiResponse,
  ReqBody = any,
  ReqQuery extends ParsedQs = ParsedQs
>(
  handler: (
    req: AuthenticatedRequest<P, ReqBody, ReqQuery>,
    res: Response<ResBody>
  ) => Promise<any>
): RequestHandler<P, ResBody, ReqBody, ReqQuery> => {
  return async (req, res, next) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Unauthorized' } as ResBody);
    }
    try {
      await handler(req as AuthenticatedRequest<P, ReqBody, ReqQuery>, res);
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Initializes the system admin user based on environment configuration
 * 
 * This function checks if automatic admin creation is enabled and creates
 * an admin user only if explicitly configured. For security, this should
 * be disabled in production environments.
 * 
 * Security improvements:
 * - Only creates admin if AUTO_CREATE_ADMIN=true
 * - Uses environment variables for credentials (not hardcoded)
 * - Warns about security implications
 * - Supports forced password change on first login
 */
async function initializeUsers() {
  console.log("Checking admin user initialization settings");
  
  // Check if automatic admin creation is enabled
  const autoCreateAdmin = process.env.AUTO_CREATE_ADMIN === 'true';
  
  if (!autoCreateAdmin) {
    console.log("Automatic admin creation is disabled (recommended for production)");
    console.log("To create an admin user, run: node create-admin.js");
    return;
  }
  
  // Only proceed if explicitly enabled (for development/testing)
  console.log("⚠️  WARNING: Automatic admin creation is enabled");
  console.log("   This should be disabled in production environments");
  
  const admin = await dbStorage.getUserByUsername("admin");
  if (!admin) {
    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
    
    if (!initialPassword) {
      console.log("❌ Error: INITIAL_ADMIN_PASSWORD not set in environment");
      console.log("   For security, admin password must be provided via environment variable");
      console.log("   Or use the create-admin.js script for interactive setup");
      return;
    }
    
    if (initialPassword === 'password' || initialPassword.length < 8) {
      console.log("❌ Error: Weak admin password detected");
      console.log("   Please set a strong password in INITIAL_ADMIN_PASSWORD");
      console.log("   Or use the create-admin.js script for guided setup");
      return;
    }
      await AuthService.createUser({
      name: "Initial Admin",
      username: process.env.INITIAL_ADMIN_USERNAME || "admin",
      password: initialPassword,
      role: "admin"
    });
      // Set force password change if configured
    if (process.env.FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN === 'true') {
      await dbStorage.updateUserForcePasswordChange(
        process.env.INITIAL_ADMIN_USERNAME || "admin",
        true
      );
      console.log("   ⚠️  Admin will be required to change password on first login");
    }
    
    console.log("✅ Initial admin user created");
    console.log("   Username:", process.env.INITIAL_ADMIN_USERNAME || "admin");
    console.log("   ⚠️  Remember to change the password after first login");
    console.log("   ⚠️  Set AUTO_CREATE_ADMIN=false after initial setup");
  }
}

// Initialize blob storage service only for production
let blobStorage: BlobStorageService | null = null;

async function initializeBlobStorage(): Promise<void> {
  try {
    if (process.env.NODE_ENV === 'production') {
      console.log('Initializing blob storage service for production...');
      blobStorage = new BlobStorageService();
      // Give it a moment to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Blob storage service initialized for production');
    } else {
      console.log('Using local file storage for development mode');
    }
  } catch (error) {
    console.error('Error initializing blob storage service:', error);
    console.log('Falling back to local file storage');
    blobStorage = null;
  }
}

// Start blob storage initialization (don't await here to avoid blocking startup)
initializeBlobStorage().catch(error => {
  console.error('Blob storage initialization failed:', error);
  blobStorage = null;
});

// Ensure uploads directory exists
const uploadsDir = process.env.DOCUMENTS_ROOT_PATH || path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
console.log(`Document uploads directory: ${uploadsDir}`);

// Configure multer for appropriate storage based on environment
const storage = process.env.NODE_ENV === 'production' 
  ? multer.memoryStorage() // Use memory storage for production (for blob storage)
  : multer.diskStorage({    // Use disk storage for development
      destination: (req, file, cb) => {
        // Create client-specific directory structure
        const clientId = req.body.clientId;
        if (!clientId) {
          return cb(new Error('Client ID is required'), '');
        }
        
        // We'll handle directory creation in the upload endpoint since we need client info
        cb(null, uploadsDir);
      },
      filename: (req, file, cb) => {
        // Use original filename to preserve user-friendly names
        // Note: Client-specific directories will handle conflicts between different clients
        // Same client uploading same filename will overwrite (which may be desired behavior)
        cb(null, file.originalname);
      }
    });

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, DOC, DOCX, JPG, JPEG, and PNG files are allowed."));
    }
  }
});

/**
 * Input validation middleware
 * 
 * Validates request body against a provided Zod schema.
 * Replaces the original request body with the validated data if successful.
 * Returns 400 Bad Request with validation error details if validation fails.
 * 
 * @param schema - The Zod schema to validate against
 * @returns Express middleware function
 */
const validateInput = (schema: z.ZodSchema) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedBody = await schema.parseAsync(req.body);
    req.body = validatedBody;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ 
        message: validationError.message,
        details: validationError.details
      });
    }
    next(error);
  }
};

/**
 * Request sanitization middleware
 * 
 * Sanitizes the request by removing potentially dangerous characters 
 * from all string values in the request body, query parameters, and URL parameters.
 * This provides basic protection against SQL injection and other injection attacks.
 * 
 * @param req - Express request object
 * @param _res - Express response object (unused)
 * @param next - Express next function
 */
const sanitizeRequest = (req: Request, _res: Response, next: NextFunction) => {
  /**
   * Recursively sanitizes all string values in an object
   * 
   * @param obj - Object to sanitize
   */
  const sanitize = (obj: any) => {
    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].replace(/['";]/g, '');
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    });
  };

  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);
  next();
};

/**
 * Configuration for rate limiting
 * 
 * @property windowMs - Time window in milliseconds (15 minutes)
 * @property max - Maximum number of requests allowed per IP within the time window
 */
const rateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
};

/**
 * In-memory storage for tracking request counts per IP address
 * Maps IP addresses to their request count and timestamp of first request
 */
let requestCounts = new Map<string, { count: number, firstRequest: number }>();

/**
 * Rate limiting middleware
 * 
 * Implements a basic rate limiting mechanism to protect the API from abuse.
 * Tracks requests by IP address and rejects requests that exceed the configured limit.
 * Uses in-memory storage which resets when the server restarts.
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
const rateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Use a default IP if not available
  const ip = req.ip || '0.0.0.0';
  const now = Date.now();
  const windowStart = now - rateLimit.windowMs;

  // Clean up old entries
  requestCounts.forEach((data, key) => {
    if (data.firstRequest < windowStart) {
      requestCounts.delete(key);
    }
  });

  // Check current IP
  const currentCount = requestCounts.get(ip);
  if (!currentCount) {
    requestCounts.set(ip, { count: 1, firstRequest: now });
    next();
  } else if (currentCount.firstRequest < windowStart) {
    requestCounts.set(ip, { count: 1, firstRequest: now });
    next();
  } else if (currentCount.count >= rateLimit.max) {
    res.status(429).json({ message: 'Too many requests, please try again later' });
  } else {
    currentCount.count++;
    next();
  }
};

// Update client service interfaces
interface ClientService {
  id: number;
  clientId: number;
  serviceType: string;
  startDate: Date;
  endDate: Date | null;
  status: string;
}

// Update PersonInfo interface to include HCP dates
interface PersonInfo {
  // ... existing fields ...
  hcpStartDate?: string;
}

/**
 * Registers all API routes and middleware for the application
 * 
 * This is the main function that sets up the entire API routing structure.
 * It configures global middleware, JWT-based authentication,
 * and all API endpoints for the Care Data Manager application.
 * 
 * @param app - Express application instance
 * @returns HTTP server instance
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // Apply enhanced security middleware in proper order
  app.use(securityHeaders);
  app.use(requestSizeLimit);
  app.use(sanitizeInput);
  app.use(preventSQLInjection);
  app.use(apiVersioning);
  app.use(auditLog);
  
  // Apply general API rate limiting
  app.use('/api', apiRateLimit);
  // Configure enhanced CORS
  const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174,http://localhost:3000").split(',');
  app.use(configureCORS(corsOrigins));

  // Initialize users
  await initializeUsers();

  // Create AuthController instance
  const authController = new AuthController();

  /**
   * User login endpoint
   * 
   * Authenticates a user with their username and password.
   * Returns JWT tokens for authenticated users.
   * Enhanced with input validation, sanitization, and audit logging.
   * 
   * @route POST /api/auth/login
   * @param {object} req.body - Login credentials
   * @param {string} req.body.username - User's username
   * @param {string} req.body.password - User's password
   * @returns {object} Success status, user data, and JWT tokens if authenticated
   */
  app.post("/api/auth/login", authController.login.bind(authController));  /**
   * User logout endpoint
   * 
   * For JWT-based authentication, logout is primarily client-side token removal.
   * Server can optionally maintain a blacklist of revoked tokens.
   * Enhanced with audit logging.
   * 
   * @route POST /api/auth/logout
   * @returns {object} Success or error message
   */
  app.post("/api/auth/logout", authMiddleware, authController.logout.bind(authController));  
  /**
   * Authentication status endpoint
   * 
   * Verifies JWT token validity and returns user information.
   * Validates the token and fetches fresh user data from database.
   * 
   * @route GET /api/auth/status
   * @returns {object} Authentication status and user data if authenticated
   */
  app.get("/api/auth/status", authMiddleware, authController.validateToken.bind(authController));

  /**
   * Refresh token endpoint
   * 
   * Generates a new access token using a valid refresh token.
   * Allows clients to obtain new access tokens without re-authentication.
   * 
   * @route POST /api/auth/refresh
   * @param {object} req.body - Refresh token data
   * @param {string} req.body.refreshToken - Valid refresh token
   * @returns {object} New access token if refresh token is valid
   */
  app.post("/api/auth/refresh", authController.refreshToken.bind(authController));
  /**
   * Validate session endpoint (backward compatibility)
   * 
   * Legacy endpoint that redirects to the new token validation.
   * Maintained for backward compatibility during transition period.
   * 
   * @route GET /api/validate-session
   * @returns {object} Authentication status and user data if authenticated
   */  
  app.get("/api/validate-session", authMiddleware, authController.validateSession.bind(authController));

  /**
   * Health check endpoint
   * 
   * Provides server health status and system information.
   * Used for monitoring, load balancing, and debugging.
   * Tests database connectivity and basic system metrics.
   * 
   * @route GET /api/health
   * @returns {object} Health status, database connectivity, and system metrics
   */
  app.get("/api/health", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const healthData: any = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: "1.0.0",
      database: {
        connected: false,
        latency: 0
      },
      memory: process.memoryUsage(),
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version
    };

    try {
      // Test database connectivity
      const dbStartTime = Date.now();
      const client = await pool.connect();
      const result = await client.query('SELECT 1 as test');
      client.release();
      
      healthData.database.connected = true;
      healthData.database.latency = Date.now() - dbStartTime;
      healthData.database.status = "connected";
    } catch (error) {
      healthData.status = "unhealthy";
      healthData.database.connected = false;
      healthData.database.status = "disconnected";
      healthData.database.error = error instanceof Error ? error.message : 'Unknown database error';
    }

    // Calculate response time
    healthData.responseTime = Date.now() - startTime;

    // Set appropriate HTTP status
    const httpStatus = healthData.status === "healthy" ? 200 : 503;
    
    return res.status(httpStatus).json(healthData);
  });

  // Remove global authentication middleware since we'll apply it per route
  // Protected routes will explicitly use authMiddleware where needed
  
  // Apply route-specific security middleware
  
  // Authentication endpoints - apply auth rate limiting and enhanced validation
  app.use(["/api/auth/login", "/api/auth/logout"], authRateLimit);
  app.use(["/api/change-password"], authRateLimit);
  
  // File upload endpoints - apply upload rate limiting and secure file handling
  app.use(["/api/documents", "/api/client-assignment"], uploadRateLimit, secureFileUpload);  // Sensitive operations - apply strict rate limiting and enhanced validation
  app.use(["/api/users", "/api/companies"], strictRateLimit, idValidation);
  
  // API endpoints with pagination - apply pagination validation
  app.use(["/api/person-info", "/api/master-data", "/api/client-services"], paginationValidation);
  
  // Apply segment validation to segment-specific routes
  app.use(["/api/master-data", "/api/person-info", "/api/client-services", "/api/documents/client"], segmentValidation);
  
  // Apply enhanced input validation to POST/PUT endpoints  app.post("/api/users", validateInput(insertUserSchema), authMiddleware);
  app.post("/api/person-info", validateInput(insertPersonInfoSchema), authMiddleware);
  app.post("/api/master-data", validateInput(insertMasterDataSchema), authMiddleware);
  app.post("/api/client-services", validateInput(insertClientServiceSchema), authMiddleware);
  app.post("/api/companies", validateInput(insertCompanySchema), authMiddleware);
    /**
   * Create master data entry endpoint
   * 
   * Creates a new master data entry for service categories, types, and providers.
   * Handles segment-specific data by properly processing the segmentId field.
   * Validates input data using the insertMasterDataSchema from shared schema.
   * Enhanced with comprehensive security middleware.
   * 
   * @route POST /api/master-data
   * @param {object} req.body - Master data to create
   * @returns {object} Created master data entry
   */
  app.post("/api/master-data", apiRateLimit, sanitizeInput, preventSQLInjection, validateSegmentAccess, authMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "No active session found" });
      }

      console.log("Received master data:", JSON.stringify(req.body));
      
      // Handle null/undefined segmentId before validation
      const requestData = { ...req.body };
      if (requestData.segmentId === null || requestData.segmentId === undefined) {
        delete requestData.segmentId; // Remove it to avoid validation error
      }
      
      const validatedData = insertMasterDataSchema.parse(requestData);
      
      // Add the current user as the creator
      const masterDataWithUser = {
        ...validatedData,
        createdBy: req.user.id,
        active: validatedData.active ?? true,
        segmentId: req.body.segmentId // Explicitly use the original segmentId from request body
      };
        console.log("Creating master data with:", JSON.stringify(masterDataWithUser));
      const createdData = await dbStorage.createMasterData(masterDataWithUser);
      console.log("Created master data:", JSON.stringify(createdData));
      
      // Log master data creation for audit
      const clientIP = req.headers['x-forwarded-for'] as string || 
                      req.headers['x-real-ip'] as string || 
                      req.socket.remoteAddress || 
                      req.ip || 
                      'unknown';
      
      await dbStorage.logUserActivity({
        userId: req.user.id,
        username: req.user.username || 'unknown',
        action: 'CREATE_MASTER_DATA',
        resourceType: 'MASTER_DATA',
        resourceId: createdData.id.toString(),
        details: `Created master data: ${createdData.serviceCategory} - ${createdData.serviceType} (${createdData.serviceProvider})`,
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date()
      });
      
      return res.status(201).json(createdData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        console.error("Validation error:", validationError);
        return res.status(400).json({ 
          message: validationError.message,
          details: validationError.details
        });
      }
      
      console.error("Error creating master data:", error);
      // Check for duplicate service error
      if (error instanceof Error && error.message.includes('combination of category, type, and provider already exists')) {
        return res.status(409).json({ message: error.message });
      }
      
      return res.status(500).json({ 
        message: "Failed to create master data",
        details: error instanceof Error ? error.message : 'Unknown error'
      });    }
  });

  /**
   * Create service case note endpoint
   * 
   * Creates a new case note for a specific service.
   * Validates input data and optionally attaches documents to the case note.
   * Enhanced with comprehensive security middleware.
   * 
   * @route POST /api/service-case-notes
   * @param {object} req.body - Case note data including serviceId, noteText, createdBy, and optional documentIds
   * @returns {object} Created case note information
   * @throws {ApiError} 400 - If validation fails
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 500 - If database operation fails
   */
  app.post("/api/service-case-notes", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "No active session found" });
      }

      console.log("Received service case note data:", JSON.stringify(req.body));
      
      const validatedData = insertServiceCaseNoteSchema.parse(req.body);
      
      // Add the current user as the creator
      const caseNoteWithUser = {
        ...validatedData,
        createdBy: req.user.id
      };
      
      console.log("Creating service case note with:", JSON.stringify(caseNoteWithUser));
      const createdCaseNote = await dbStorage.createServiceCaseNote(caseNoteWithUser);
      console.log("Created service case note:", JSON.stringify(createdCaseNote));
      
      // Log case note creation for audit
      const clientIP = req.headers['x-forwarded-for'] as string || 
                      req.headers['x-real-ip'] as string || 
                      req.socket.remoteAddress || 
                      req.ip || 
                      'unknown';
      
      await dbStorage.logUserActivity({
        userId: req.user.id,
        username: req.user.username || 'unknown',
        action: 'CREATE_CASE_NOTE',
        resourceType: 'CASE_NOTE',
        resourceId: createdCaseNote.id.toString(),
        details: `Created case note for service ID: ${createdCaseNote.serviceId}${validatedData.documentIds ? ` with ${validatedData.documentIds.length} document(s)` : ''}`,
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date()
      });
      
      return res.status(201).json(createdCaseNote);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        console.error("Validation error:", validationError);
        return res.status(400).json({ 
          message: validationError.message,
          details: validationError.details
        });
      }
      
      console.error("Error creating service case note:", error);
      return res.status(500).json({ 
        message: "Failed to create service case note",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  /**
   * Get master data entries endpoint
   * 
   * Retrieves master data entries, filtered by the segment ID provided in the query.
   * Frontend ensures segment is selected for all operations.
   * Enhanced with comprehensive security middleware including rate limiting, input validation,
   * sanitization, and SQL injection prevention.
   * 
   * @route GET /api/master-data
   * @param {string} [req.query.segmentId] - Optional segment ID to filter master data
   * @returns {Array} List of master data entries
   * @security Applies rate limiting, input validation, sanitization, SQL injection prevention, segment access validation, and company data filtering
   */
  app.get("/api/master-data", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, async (req: Request, res: Response) => {
    try {
      // Get segment ID from query parameter if provided
      const segmentId = req.query.segmentId ? parseInt(req.query.segmentId as string) : undefined;
      
      console.log(`Fetching master data${segmentId !== undefined ? ` for segmentId: ${segmentId}` : ''}`);
      
      const masterData = await dbStorage.getAllMasterData(segmentId);
      console.log("Fetched master data count:", masterData.length);
      return res.status(200).json(masterData);
    } catch (error) {
      console.error("Error fetching master data:", error);
      return res.status(500).json({ message: "Failed to fetch master data" });
    }
  });
    /**
   * Update master data entry endpoint
   * 
   * Updates an existing master data entry by ID.
   * Handles proper validation and segment ID processing.
   * Enhanced with comprehensive security middleware including ID validation.
   * 
   * @route PUT /api/master-data/:id
   * @param {string} req.params.id - ID of the master data entry to update
   * @param {object} req.body - Updated master data values
   * @returns {object} Updated master data entry
   */  app.put("/api/master-data/:id", apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }
    
    try {
      
      console.log("Updating master data for id:", id, "with data:", req.body);
      
      // Get existing data for audit logging
      const existingData = await dbStorage.getMasterDataById(id);
      if (!existingData) {
        return res.status(404).json({ message: "Master data not found" });
      }
      
      // Handle null/undefined segmentId before validation
      const requestData = { ...req.body };
      if (requestData.segmentId === null || requestData.segmentId === undefined) {
        delete requestData.segmentId; // Remove it to avoid validation error
      }
      
      const validatedData = insertMasterDataSchema.parse(requestData);
      
      const updatedData = await dbStorage.updateMasterData(id, {
        ...validatedData,
        createdBy: req.user!.id,
        segmentId: req.body.segmentId // Use original value which can be null
      });

      // Log master data update for audit
      const clientIP = req.headers['x-forwarded-for'] as string || 
                      req.headers['x-real-ip'] as string || 
                      req.socket.remoteAddress || 
                      req.ip || 
                      'unknown';
      
      await dbStorage.logUserActivity({
        userId: req.user!.id,
        username: req.user!.username || 'unknown',
        action: 'UPDATE_MASTER_DATA',
        resourceType: 'MASTER_DATA',
        resourceId: id.toString(),
        details: `Updated master data: ${existingData.serviceCategory} - ${existingData.serviceType} (${existingData.serviceProvider})`,
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date()
      });      console.log("Updated master data:", updatedData);
      return res.status(200).json(updatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ 
          message: validationError.message,
          details: validationError.details
        });
      }
      
      // Check for foreign key constraint violation
      if (error instanceof Error && error.message.includes('client_services_master_data_fkey')) {
        try {
          // Get the existing master data to show which combination is being referenced
          const existingData = await dbStorage.getMasterDataById(id);
          if (existingData) {
            // Get client services that are using this master data combination
            const referencingServices = await dbStorage.getClientServicesReferencingMasterData(
              existingData.serviceCategory,
              existingData.serviceType,
              existingData.serviceProvider || '',
              existingData.segmentId || null
            );            const clientNames = referencingServices.map(service => service.clientName);
            const uniqueClientNames = Array.from(new Set(clientNames));

            return res.status(409).json({
              message: "Cannot update master data: Service is currently assigned to clients",
              details: `This service combination (${existingData.serviceCategory} - ${existingData.serviceType} - ${existingData.serviceProvider || 'No provider'}) is currently assigned to ${referencingServices.length} service(s) for ${uniqueClientNames.length} client(s): ${uniqueClientNames.join(', ')}. Please remove or reassign these services before updating the master data.`,
              conflictType: "FOREIGN_KEY_CONSTRAINT",
              referencingServices: referencingServices.map(service => ({
                clientName: service.clientName,
                status: service.status,
                serviceStartDate: service.serviceStartDate
              }))
            });
          }
        } catch (lookupError) {
          console.error("Error getting referencing services:", lookupError);
          // Fall through to generic error handling
        }
      }
        console.error("Error updating master data:", error);
      return res.status(500).json({ 
        message: "Failed to update master data",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Verify master data existence endpoint
   * 
   * Verifies that a specific combination of service category, type, and provider exists in the master data.
   * Used to validate service assignments before creating a client service record.
   * 
   * @route GET /api/master-data/verify
   * @param {string} req.query.category - Service category to verify
   * @param {string} req.query.type - Service type to verify
   * @param {string} req.query.provider - Service provider to verify
   * @param {string} [req.query.segmentId] - Optional segment ID to check against
   * @returns {object} Success or error message
   */
  app.get("/api/master-data/verify", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { category, type, provider, segmentId } = req.query;
      
      if (!category || !type || !provider) {
        return res.status(400).json({ message: "Missing required parameters: category, type, and provider are required" });
      }
      
      // Check if the master data combination exists
      const exists = await dbStorage.checkMasterDataExists(
        category as string, 
        type as string, 
        provider as string,
        segmentId ? parseInt(segmentId as string) : undefined
      );
      
      if (!exists) {
        return res.status(404).json({ 
          message: "The selected service combination doesn't exist in the master data. Please use the Master Data page to create it first." 
        });
      }
      
      return res.status(200).json({ 
        success: true, 
        message: "Service combination exists in master data" 
      });
    } catch (error) {
      console.error("Error verifying master data:", error);
      return res.status(500).json({ message: "Failed to verify master data" });
    }
  });

    /**
   * Get master data by ID endpoint
   * 
   * Retrieves a specific master data entry by its ID.
   * Enhanced with comprehensive security middleware including ID validation.
   * 
   * @route GET /api/master-data/:id
   * @param {string} req.params.id - ID of the master data entry to retrieve
   * @returns {object} Master data entry
   */
  app.get("/api/master-data/:id", apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      console.log("Getting master data for id:", id);
      
      const masterData = await dbStorage.getMasterDataById(id);
      if (!masterData) {
        return res.status(404).json({ message: "Master data not found" });
      }
      
      console.log("Found master data:", masterData);
      return res.status(200).json(masterData);
    } catch (error) {
      console.error("Error fetching master data by ID:", error);
      return res.status(500).json({ 
        message: "Failed to fetch master data",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

    /**
   * Create person info (client) endpoint
   * 
   * Creates a new client with personal information, address, and HCP details.
   * Properly handles optional fields and segment assignment.
   * Enhanced with comprehensive security middleware including input validation.
   * 
   * @route POST /api/person-info
   * @param {object} req.body - Client personal information
   * @returns {object} Created client information
   */
  app.post("/api/person-info", apiRateLimit, sanitizeInput, preventSQLInjection, validateSegmentAccess, authMiddleware, async (req: Request, res: Response) => {
    try {
      console.log("Received person info data:", req.body);
      const validatedData = insertPersonInfoSchema.parse(req.body);      
      console.log("Validated data:", validatedData);      // Add the current user as the creator and handle optional fields
      const personInfoWithUser = {
        ...validatedData,
        createdBy: req.user!.id,
        middleName: validatedData.middleName || '',
        email: validatedData.email || '',
        homePhone: validatedData.homePhone || '',
        mobilePhone: validatedData.mobilePhone || '',
        addressLine2: validatedData.addressLine2 || '',
        addressLine3: validatedData.addressLine3 || '',
        postCode: validatedData.postCode || '',
        mailingAddressLine1: validatedData.mailingAddressLine1 || '',
        mailingAddressLine2: validatedData.mailingAddressLine2 || '',
        mailingAddressLine3: validatedData.mailingAddressLine3 || '',
        mailingPostCode: validatedData.mailingPostCode || '',        nextOfKinName: validatedData.nextOfKinName || '',
        nextOfKinRelationship: validatedData.nextOfKinRelationship || '',
        nextOfKinAddress: validatedData.nextOfKinAddress || '',        
        nextOfKinEmail: validatedData.nextOfKinEmail || '',        
        nextOfKinPhone: validatedData.nextOfKinPhone || '',
        hcpLevel: validatedData.hcpLevel || '',
        useHomeAddress: validatedData.useHomeAddress ?? true,        
        status: validatedData.status || 'New',
        // Handle segmentId to ensure it's either number or undefined, not null
        segmentId: validatedData.segmentId !== null ? validatedData.segmentId : undefined
      };
        console.log("Processed data:", personInfoWithUser);
      const createdData = await dbStorage.createPersonInfo(personInfoWithUser);
      console.log("Created data:", createdData);
      
      // Log client creation for audit
      const clientIP = req.headers['x-forwarded-for'] as string || 
                      req.headers['x-real-ip'] as string || 
                      req.socket.remoteAddress || 
                      req.ip || 
                      'unknown';
      
      await dbStorage.logUserActivity({
        userId: req.user!.id,
        username: req.user!.username || 'unknown',
        action: 'CREATE_CLIENT',
        resourceType: 'CLIENT',
        resourceId: createdData.id.toString(),
        details: `Created new client: ${createdData.firstName} ${createdData.lastName}`,
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date()
      });
      
      return res.status(201).json(createdData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        console.error("Validation error:", validationError);
        return res.status(400).json({ message: validationError.message });
      }
      console.error("Error creating person info:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack);
      }
      return res.status(500).json({ message: "Failed to create person info" });
    }
  });
    /**
   * Get list of clients endpoint
   * 
   * Retrieves all clients (person info), optionally filtered by segment.
   * Enhanced with comprehensive security middleware including rate limiting, input validation,
   * sanitization, and SQL injection prevention.
   * 
   * @route GET /api/person-info
   * @param {string} [req.query.segmentId] - Optional segment ID to filter clients   * @returns {Array} List of client information
   * @security Applies rate limiting, input validation, sanitization, SQL injection prevention, authentication, segment access validation, and company data filtering
   */  app.get("/api/person-info", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, async (req: Request, res: Response) => {
    try {
      // Get segment ID from query parameter if provided
      const segmentId = req.query.segmentId ? parseInt(req.query.segmentId as string) : undefined;
      const personInfo = await dbStorage.getAllPersonInfo(segmentId);
      return res.status(200).json(personInfo);
    } catch (error) {
      console.error("Error fetching person info:", error);
      return res.status(500).json({ message: "Failed to fetch person info" });
    }
  });
    /**
   * Get client details by ID endpoint
   * 
   * Retrieves detailed information for a specific client by their ID.
   * Uses centralized error handling with ApiError for consistent responses.
   * Enhanced with comprehensive security middleware including rate limiting, input validation,
   * sanitization, SQL injection prevention, ID validation, and authentication.
   * 
   * @route GET /api/person-info/:id
   * @param {string} req.params.id - Client ID to retrieve
   * @returns {object} Client detailed information
   * @throws {ApiError} 400 - If ID format is invalid
   * @throws {ApiError} 404 - If client not found
   * @security Requires authentication and applies rate limiting, input validation, sanitization, SQL injection prevention
   */
  app.get("/api/person-info/:id", apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        throw new ApiError(400, "Invalid ID format", null, "INVALID_ID");
      }
      
      const personInfo = await dbStorage.getPersonInfoById(id);
      if (!personInfo) {
        throw new ApiError(404, "Person info not found", null, "NOT_FOUND");
      }
      
      res.status(200).json(personInfo);
    } catch (error) {
      next(error);
    }
  });
    /**
   * Update client information endpoint
   * 
   * Updates an existing client's personal information, address, and other details.
   * Preserves the original creator and handles segment ID properly.
   * Uses centralized error handling with ApiError for consistent responses.
   * Enhanced with comprehensive security middleware including ID validation.
   * 
   * @route PUT /api/person-info/:id
   * @param {string} req.params.id - Client ID to update
   * @param {object} req.body - Updated client information
   * @returns {object} Updated client information
   * @throws {ApiError} 400 - If ID format is invalid
   * @throws {ApiError} 404 - If client not found
   */
  app.put('/api/person-info/:id', apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, async (req: Request, res: Response, next) => {
    try {
      console.log("Update request received for id:", req.params.id, "with data:", req.body);
      
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        throw new ApiError(400, "Invalid ID format", null, "INVALID_ID");
      }

      // First check if the person exists
      const existingPerson = await dbStorage.getPersonInfoById(id);
      if (!existingPerson) {
        throw new ApiError(404, "Person not found", null, "NOT_FOUND");
      }

      // Validate the update data
      const validatedData = insertPersonInfoSchema.parse({
        ...req.body,
        status: req.body.status || existingPerson.status || 'New'
      });
        console.log("Validated update data:", validatedData);      // Update the person info
      const updatedPerson = await dbStorage.updatePersonInfo(id, {
        ...validatedData,
        email: validatedData.email || '',
        mobilePhone: validatedData.mobilePhone || '',
        postCode: validatedData.postCode || '',
        createdBy: existingPerson.createdBy, // Preserve the original createdBy value
        segmentId: validatedData.segmentId !== null ? validatedData.segmentId : undefined // Handle segmentId properly
      });
      
      // Log client update for audit
      const clientIP = req.headers['x-forwarded-for'] as string || 
                      req.headers['x-real-ip'] as string || 
                      req.socket.remoteAddress || 
                      req.ip || 
                      'unknown';
      
      await dbStorage.logUserActivity({
        userId: req.user!.id,
        username: req.user!.username || 'unknown',
        action: 'UPDATE_CLIENT',
        resourceType: 'CLIENT',
        resourceId: id.toString(),
        details: `Updated client: ${existingPerson.firstName} ${existingPerson.lastName}`,
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date()
      });
      
      console.log("Person updated successfully:", updatedPerson);
      res.status(200).json(updatedPerson);
    } catch (error) {
      next(error);
    }
  });
    /**
   * Update client assignment status endpoint
   * 
   * Updates the status of a client assignment (service) to track its progress.
   * Validates that the status is one of the allowed values.
   * Enhanced with comprehensive security middleware including ID validation.
   * 
   * @route PATCH /api/client-assignment/:id
   * @param {string} req.params.id - Assignment ID to update
   * @param {string} req.body.status - New status value (Planned, In Progress, or Closed)
   * @returns {object} Success message
   */
  app.patch("/api/client-assignment/:id", apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status || !["Planned", "In Progress", "Closed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      
      await dbStorage.updateClientServiceStatus(id, status);
      return res.status(200).json({ message: "Status updated successfully" });
    } catch (error) {
      console.error("Error updating assignment status:", error);
      return res.status(500).json({ message: "Failed to update status" });
    }
  });
  
  /**
   * Create client assignment with document upload endpoint
   * 
   * Assigns care services to a client and optionally uploads an associated document.
   * Creates a master data entry to track the client's assigned care.
   * 
   * @route POST /api/client-assignment
   * @param {string} req.body.clientId - Client ID to assign care to
   * @param {string} req.body.careCategory - Category of care to assign
   * @param {string} req.body.careType - Type of care to assign
   * @param {string} [req.body.notes] - Optional notes about the assignment
   * @param {File} [req.file] - Optional document file to upload
   * @returns {object} Created client assignment data
   */
  /**
   * Create client assignment endpoint
   * 
   * Creates a new client assignment with optional document upload.
   * Uses multer for file handling and validates the assignment data.
   * Enhanced with file upload security and comprehensive input validation.
   * 
   * @route POST /api/client-assignment
   * @returns {object} Created assignment information
   */
  app.post("/api/client-assignment", uploadRateLimit, secureFileUpload, sanitizeInput, preventSQLInjection, authMiddleware, upload.single("document"), async (req: Request, res: Response) => {
    try {
      const { clientId, careCategory, careType, notes } = req.body;
      
      // Validation
      if (!clientId || !careCategory || !careType) {
        return res.status(400).json({ message: "Client ID, care category, and care type are required" });
      }
      
      // Check if client exists
      const clientIdNum = parseInt(clientId);
      if (isNaN(clientIdNum)) {
        return res.status(400).json({ message: "Invalid client ID format" });
      }
      
      const client = await dbStorage.getPersonInfoById(clientIdNum);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      // Create master data entry for this client
      const masterDataEntry = {
        serviceCategory: careCategory,
        serviceType: careType,
        serviceProvider: "",
        active: true,
        clientId: clientIdNum,
        createdBy: req.user!.id,
        notes: notes || ""
      };
      
      // Add document info if uploaded
      let documentPath = "";
      if (req.file) {
        documentPath = req.file.path;
        masterDataEntry.notes += `\nDocument: ${req.file.originalname}`;
      }
      
      const createdData = await dbStorage.createMasterData(masterDataEntry);
      
      return res.status(201).json({
        ...createdData,
        documentUploaded: !!req.file,
      });
    } catch (error) {
      console.error("Error creating client assignment:", error);
      return res.status(500).json({ message: "Failed to create client assignment" });
    }
  });
  
  /**
   * Document upload endpoint
   * 
   * Uploads a document file and creates a document record in the database.
   * Associates the document with a client and optionally a segment.
   * Handles file storage using either local filesystem or Azure Blob Storage.
   * 
   * @route POST /api/documents
   * @param {string} req.body.clientId - ID of the client the document belongs to
   * @param {string} req.body.documentName - Display name of the document
   * @param {string} req.body.documentType - Type/category of the document
   * @param {File} req.file - Document file to upload
   * @param {string} [req.body.segmentId] - Optional segment ID to associate with the document
   * @returns {object} Created document record
   */
  /**
   * Document upload endpoint
   * 
   * Handles file uploads for client documents.
   * Supports various file types and stores metadata in the database.
   * Enhanced with comprehensive file upload security and rate limiting.
   * 
   * @route POST /api/documents
   * @returns {object} Upload success response with file metadata
   */
  app.post("/api/documents", uploadRateLimit, secureFileUpload, sanitizeInput, preventSQLInjection, authMiddleware, upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { clientId, documentName, documentType, segmentId } = req.body;
      if (!clientId || !documentName || !documentType) {
        return res.status(400).json({ message: "Missing required fields: clientId, documentName, documentType, and file are required" });
      }
        // Get client information to use in folder name
      const client = await dbStorage.getPersonInfoById(parseInt(clientId));
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      // Check if a document with the same original filename already exists for this client
      const existingDocument = await dbStorage.getDocumentByClientAndFilename(parseInt(clientId), req.file.originalname);
      if (existingDocument) {
        return res.status(409).json({ 
          message: `Document with filename "${req.file.originalname}" already exists for this client. Please use the existing document or rename the file.`,
          conflictType: "filename_exists",
          existingDocument: {
            id: existingDocument.id,
            documentName: existingDocument.documentName,
            uploadedAt: existingDocument.uploadedAt
          }
        });
      }

      // Create directory for client using the new naming convention: client_id_clientfirstname_lastname
      const clientDirName = `client_${clientId}_${client.firstName}_${client.lastName}`.replace(/[^a-zA-Z0-9_]/g, '_');
      const clientDir = path.join(uploadsDir, clientDirName);
      
      // Use original filename to preserve user-friendly names
      const filename = req.file.originalname;
      
      // Full system path for file operations
      const fullFilePath = path.join(clientDir, filename);
      // Relative path for database storage (from uploads root)
      const relativeFilePath = path.join(clientDirName, filename).replace(/\\/g, '/');
      
      console.log('Document upload debug - NODE_ENV:', process.env.NODE_ENV);
      console.log('Document upload debug - clientDir:', clientDir);
      console.log('Document upload debug - fullFilePath:', fullFilePath);
      console.log('Document upload debug - relativeFilePath:', relativeFilePath);
      console.log('Document upload debug - req.file.path:', req.file?.path);
      console.log('Document upload debug - req.file.filename:', req.file?.filename);
        let finalFilePath = relativeFilePath;
        if (process.env.NODE_ENV !== 'production') {
        // Create client directory
        await fs.promises.mkdir(clientDir, { recursive: true });
        console.log('Created client directory:', clientDir);
        
        if (req.file.path) {
          // Move from multer temp location to client-specific directory with original filename
          await fs.promises.rename(req.file.path, fullFilePath);
          console.log('Moved file from', req.file.path, 'to', fullFilePath);
          
          // Verify file exists at final location
          const fileExists = await fs.promises.access(fullFilePath).then(() => true).catch(() => false);
          console.log('File exists at destination:', fileExists);
          
          if (!fileExists) {
            throw new Error('File was not properly moved to destination');
          }
        } else {
          throw new Error('No file path provided by multer');
        }
      } else if (blobStorage) {
        // In production, upload to Azure Blob Storage
        const fileBuffer = Buffer.isBuffer(req.file.buffer) ? req.file.buffer : Buffer.from(req.file.buffer);
        await blobStorage.uploadFile(fileBuffer, relativeFilePath, req.file.mimetype);
        console.log('Uploaded file to Azure Blob Storage:', relativeFilePath);
      }// Create document record in database
      // Store the original filename for both display and file access
      const documentRecord = await dbStorage.createDocument({
        clientId: parseInt(clientId),
        documentName,
        documentType,
        filename: req.file.originalname, // Store the original filename for file access
        filePath: finalFilePath, // Use the relative path for database storage
        createdBy: req.user!.id,
        uploadedAt: new Date(),
        segmentId: segmentId ? parseInt(segmentId) : null
      });
      
      // Log document upload for audit
      const clientIP = req.headers['x-forwarded-for'] as string || 
                      req.headers['x-real-ip'] as string || 
                      req.socket.remoteAddress || 
                      req.ip || 
                      'unknown';
      
      await dbStorage.logUserActivity({
        userId: req.user!.id,
        username: req.user!.username || 'unknown',
        action: 'UPLOAD_DOCUMENT',
        resourceType: 'DOCUMENT',
        resourceId: documentRecord.id.toString(),
        details: `Uploaded document: ${documentName} (${documentType}) for client ${client.firstName} ${client.lastName}`,
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date()
      });
      
      return res.status(201).json(documentRecord);
    } catch (error) {
      console.error("Error uploading document:", error);
      return res.status(500).json({ message: "Failed to upload document" });
    }
  });
    /**
   * Get documents by client ID endpoint
   * 
   * Retrieves all documents associated with a specific client.
   * Handles file path normalization to ensure documents can be properly accessed
   * regardless of storage method or environment (development vs production).
   * Enhanced with comprehensive security middleware including rate limiting, input validation,
   * sanitization, and SQL injection prevention.
   * 
   * @route GET /api/documents/client/:clientId
   * @param {string} req.params.clientId - Client ID to retrieve documents for
   * @param {string} [req.query.segmentId] - Optional segment ID to filter documents
   * @returns {Array} List of document metadata including normalized file paths
   * @throws {ApiError} 400 - If client ID format is invalid
   * @throws {ApiError} 404 - If no documents are found
   * @security Applies rate limiting, input validation, sanitization, SQL injection prevention, segment access validation, and company data filtering
   */
  app.get("/api/documents/client/:clientId", apiRateLimit, validateRequest(clientIdValidation), sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, createHandler(async (req, res) => {
    try {
      console.log(`Document list requested for client ID: ${req.params.clientId}`);
      const clientId = parseInt(req.params.clientId);
      const segmentId = req.query.segmentId ? parseInt(req.query.segmentId as string) : undefined;
      
      if (isNaN(clientId)) {
        return res.status(400).json({ message: "Invalid client ID format" });
      }
      
      // Get all documents for the client from database
      const documents = await dbStorage.getDocumentsByClientId(clientId, segmentId);
      
      if (!documents || documents.length === 0) {
        console.log(`No documents found for client ${clientId}${segmentId ? ` in segment ${segmentId}` : ''}`);
        return res.status(404).json({ message: "Document not found" });  // Return 404 if no documents found
      }
        // Verify that the document files actually exist and normalize the paths
      const normalizedDocuments = documents.map(doc => {
        let filePath = doc.filePath;
        const isLocalDev = process.env.NODE_ENV !== 'production';
        
        if (isLocalDev) {
          // For local development, check if the file exists in the file system
          // and ensure the path is correct for the download endpoint
          
          // Skip processing if no file path
          if (!filePath) {
            console.log(`Missing file path for document ${doc.id}`);
            return {
              ...doc,
              filePath: ''
            };
          }
          
          // Build full path with proper handling
          let fullPath = filePath;
          if (!fullPath.startsWith('/') && !fullPath.match(/^[A-Za-z]:\\/)) {
            fullPath = path.join(process.cwd(), filePath);
          }
          
          // If file doesn't exist at direct path, check if it's in uploads directory
          if (fs.existsSync(fullPath)) {
            // File exists, use it
          } else {
            const uploadsDir = process.env.DOCUMENTS_ROOT_PATH || path.join(process.cwd(), "uploads");
            
            // If file path starts with 'uploads/', try to find it directly in uploads dir
            if (filePath.startsWith('uploads/')) {
              const pathWithoutUploads = filePath.substring('uploads/'.length);
              fullPath = path.join(uploadsDir, pathWithoutUploads);
            } else {
              // Otherwise try with the full path in uploads dir
              fullPath = path.join(uploadsDir, filePath);
            }
              // If file exists in the new location, keep the original database path
            if (fs.existsSync(fullPath)) {
              // Keep the original filePath from database (don't modify it)
              // The download endpoint expects the database path, not the file system path
              console.log(`Found document at file system path: ${fullPath}, keeping database path: ${filePath}`);
            } else {
              console.log(`Document file not found at: ${fullPath}`);
              // Don't filter out documents that can't be found, just log it
            }
          }
        }
        
        // Return document with normalized path that can be used with download endpoint
        return {
          ...doc,
          filePath: filePath ? filePath.replace(/\\/g, '/') : ''  // Ensure forward slashes, fallback to empty string
        };
      });
        console.log(`Found ${documents.length} documents for client ${clientId}`);
      // Return as data property in ApiResponse format
      return res.status(200).json({ data: normalizedDocuments });    } catch (error) {
      console.error("Error fetching client documents:", error);
      return res.status(500).json({ message: "Failed to fetch client documents" });
    }
  }));

  /**
   * Secure document viewing endpoint with flexible authentication
   * 
   * This endpoint allows viewing documents with authentication via either:
   * 1. Authorization header (for API calls)
   * 2. Query parameter token (for direct browser access)
   * 
   * @route GET /api/documents/view/:filePath
   * @param {string} req.params.filePath - File path of the document to view   * @param {string} [req.query.token] - JWT token for authentication (alternative to header)
   * @returns {File} Document file for viewing in browser
   */
  app.get("/api/documents/view/:filePath(*)", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, createHandler(async (req, res) => {
    try {
      const filePath = decodeURIComponent(req.params.filePath);
      console.log(`Document view requested for path: ${filePath}`);
      
      // Check if path exists in database
      const document = await dbStorage.getDocumentByFilePath(filePath);
      
      if (!document) {
        console.log(`Document not found in database with path: ${filePath}`);
        return res.status(404).json({ message: "Document not found in database" });
      }

      // Different handling for production (blob storage) vs development (file system)
      if (process.env.NODE_ENV === 'production' && blobStorage) {
        try {
          // For production, use blob storage
          if (!document.filePath) {
            return res.status(404).json({ message: "Document file path is missing" });
          }
          
          const fileBuffer = await blobStorage.downloadFile(document.filePath);
          
          // Set content type based on file extension for inline viewing
          const ext = path.extname(document.filename).toLowerCase();
          const contentType = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png'
          }[ext] || 'application/octet-stream';

          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `inline; filename="${document.filename}"`);
          return res.end(fileBuffer);
        } catch (error) {
          console.error("Error downloading from blob storage:", error);
          return res.status(404).json({ message: "Document not found in blob storage" });
        }
      } else {
        // For development, find the file on disk
        if (!document.filePath) {
          return res.status(404).json({ message: "Document file path is missing" });
        }
        
        // Build full path from uploads directory + relative file path
        let fullPath = path.join(uploadsDir, document.filePath);
        console.log(`Attempting to access file at: ${fullPath}`);
        
        if (!fs.existsSync(fullPath)) {
          // Try fallback paths for backward compatibility
          console.log(`File not found, trying fallback paths...`);
          
          // Try 1: Just the basename in uploads directory
          const basename = path.basename(document.filePath);
          const fallbackPath1 = path.join(uploadsDir, basename);
          console.log(`Trying fallback 1 - basename in uploads: ${fallbackPath1}`);
          
          if (fs.existsSync(fallbackPath1)) {
            fullPath = fallbackPath1;
          } else {
            // Try 2: Remove uploads/ prefix if present and try again
            let cleanPath = document.filePath;
            if (cleanPath.startsWith('uploads/')) {
              cleanPath = cleanPath.substring('uploads/'.length);
            }
            const fallbackPath2 = path.join(uploadsDir, cleanPath);
            console.log(`Trying fallback 2 - cleaned path: ${fallbackPath2}`);
            
            if (fs.existsSync(fallbackPath2)) {
              fullPath = fallbackPath2;
            }
          }
        }
        
        if (!fs.existsSync(fullPath)) {
          console.error(`File not found at any attempted path. Last tried: ${fullPath}`);
          return res.status(404).json({ message: "Document file not found on disk" });
        }
        
        // Set content type based on file extension for inline viewing
        const ext = path.extname(document.filename).toLowerCase();
        const contentType = {
          '.pdf': 'application/pdf',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png'
        }[ext] || 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${document.filename}"`);
        
        // Stream the file for better performance with large files
        const fileStream = fs.createReadStream(fullPath);
        fileStream.pipe(res);
      }
    } catch (error) {
      console.error("Error in document view endpoint:", error);
      return res.status(500).json({ message: "Failed to retrieve document" });
    }
  }));

  /**
   * Document download endpoint
   * 
   * Retrieves and serves a document file for download based on its file path.
   * Supports both blob storage (production) and file system (development) retrieval.
   * Handles various path formats and attempts multiple lookup strategies to find files.
   * Sets appropriate content type and disposition headers for proper download handling.
   * Enhanced with comprehensive security middleware including rate limiting, input validation,
   * sanitization, SQL injection prevention, and authentication.
   * 
   * @route GET /api/documents/:filePath
   * @param {string} req.params.filePath - File path of the document to download
   * @returns {File} Document file as a downloadable response
   * @throws {ApiError} 404 - If document metadata or file not found
   * @security Requires authentication and applies rate limiting, input validation, sanitization, SQL injection prevention
   */  // This is defined AFTER the client documents endpoint to avoid route conflicts
  app.get("/api/documents/:filePath(*)", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, createHandler(async (req, res) => {
    try {
      const filePath = decodeURIComponent(req.params.filePath);
      console.log(`Document download requested for path: ${filePath}`);
      
      // Check if path exists in database
      const document = await dbStorage.getDocumentByFilePath(filePath);
      
      if (!document) {
        console.log(`Document not found in database with path: ${filePath}`);
        return res.status(404).json({ message: "Document not found in database" });
      }
        // Different handling for production (blob storage) vs development (file system)
      if (process.env.NODE_ENV === 'production' && blobStorage) {
        try {
          // For production, use blob storage
          if (!document.filePath) {
            return res.status(404).json({ message: "Document file path is missing" });
          }
          
          const fileBuffer = await blobStorage.downloadFile(document.filePath);
          
          // Set content type based on file extension
          const ext = path.extname(document.filename).toLowerCase();
          const contentType = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png'
          }[ext] || 'application/octet-stream';

          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
          // Send buffer directly without attempting to match ApiResponse
          return res.end(fileBuffer);
        } catch (error) {
          console.error("Error downloading from blob storage:", error);
          return res.status(404).json({ message: "Document not found in blob storage" });
        }      } else {
        // For development, find the file on disk
        // Try different paths - with or without "uploads" prefix
        if (!document.filePath) {
          return res.status(404).json({ message: "Document file path is missing" });
        }        
        // For development, find the file on disk using relative path from uploads directory
        if (!document.filePath) {
          return res.status(404).json({ message: "Document file path is missing" });
        }
        
        // Build full path from uploads directory + relative file path
        let fullPath = path.join(uploadsDir, document.filePath);
        console.log(`Attempting to access file at: ${fullPath}`);
        
        if (!fs.existsSync(fullPath)) {
          // Try fallback paths for backward compatibility
          console.log(`File not found, trying fallback paths...`);
          
          // Try 1: Just the basename in uploads directory
          const basename = path.basename(document.filePath);
          const fallbackPath1 = path.join(uploadsDir, basename);
          console.log(`Trying fallback 1 - basename in uploads: ${fallbackPath1}`);
          
          if (fs.existsSync(fallbackPath1)) {
            fullPath = fallbackPath1;
          } else {
            // Try 2: Remove uploads/ prefix if present and try again
            let cleanPath = document.filePath;
            if (cleanPath.startsWith('uploads/')) {
              cleanPath = cleanPath.substring('uploads/'.length);
            }
            const fallbackPath2 = path.join(uploadsDir, cleanPath);
            console.log(`Trying fallback 2 - cleaned path: ${fallbackPath2}`);
            
            if (fs.existsSync(fallbackPath2)) {
              fullPath = fallbackPath2;
            }
          }
        }
        
        if (!fs.existsSync(fullPath)) {
          console.error(`File not found at any attempted path. Last tried: ${fullPath}`);
          return res.status(404).json({ message: "Document file not found on disk" });
        }
        
        // Set content type based on file extension
        const ext = path.extname(document.filename).toLowerCase();
        const contentType = {
          '.pdf': 'application/pdf',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png'
        }[ext] || 'application/octet-stream';        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
        
        // Convert to absolute path for res.sendFile
        const absolutePath = path.resolve(fullPath);
        res.sendFile(absolutePath);
      }
    } catch (error) {
      console.error("Error retrieving document:", error);
      return res.status(500).json({ message: "Failed to retrieve document" });
    }
  }));


    /**
   * Secure document viewing endpoint with flexible authentication
   * 
   * This endpoint allows viewing documents with authentication via either:
   * 1. Authorization header (for API calls)
   * 2. Query parameter token (for direct browser access)
   * 
   * @route GET /api/documents/view/:filePath
   * @param {string} req.params.filePath - File path of the document to view
   * @param {string} [req.query.token] - JWT token for authentication (alternative to header)
   * @returns {File} Document file for viewing in browser
   */
  /*
  app.get("/api/documents/view/:filePath(*)", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, createHandler(async (req, res) => {
    try {
      const filePath = req.params.filePath;
      console.log(`Document view requested for path: ${filePath}`);
      
      // Check if path exists in database
      const document = await dbStorage.getDocumentByFilePath(filePath);
      
      if (!document) {
        console.log(`Document not found in database with path: ${filePath}`);
        return res.status(404).json({ message: "Document not found in database" });
      }

      // Different handling for production (blob storage) vs development (file system)
      if (process.env.NODE_ENV === 'production' && blobStorage) {
        try {
          // For production, use blob storage
          if (!document.filePath) {
            return res.status(404).json({ message: "Document file path is missing" });
          }
          
          const fileBuffer = await blobStorage.downloadFile(document.filePath);
          
          // Set content type based on file extension for inline viewing
          const ext = path.extname(document.filename).toLowerCase();
          const contentType = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png'
          }[ext] || 'application/octet-stream';

          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `inline; filename="${document.filename}"`);
          return res.end(fileBuffer);
        } catch (error) {
          console.error("Error downloading from blob storage:", error);
          return res.status(404).json({ message: "Document not found in blob storage" });
        }
      } else {
        // For development, find the file on disk
        if (!document.filePath) {
          return res.status(404).json({ message: "Document file path is missing" });
        }
        
        // Build full path from uploads directory + relative file path
        let fullPath = path.join(uploadsDir, document.filePath);
        console.log(`Attempting to access file at: ${fullPath}`);
        
        if (!fs.existsSync(fullPath)) {
          // Try fallback paths for backward compatibility
          console.log(`File not found, trying fallback paths...`);
          
          // Try 1: Just the basename in uploads directory
          const basename = path.basename(document.filePath);
          const fallbackPath1 = path.join(uploadsDir, basename);
          console.log(`Trying fallback 1 - basename in uploads: ${fallbackPath1}`);
          
          if (fs.existsSync(fallbackPath1)) {
            fullPath = fallbackPath1;
          } else {
            // Try 2: Remove uploads/ prefix if present and try again
            let cleanPath = document.filePath;
            if (cleanPath.startsWith('uploads/')) {
              cleanPath = cleanPath.substring('uploads/'.length);
            }
            const fallbackPath2 = path.join(uploadsDir, cleanPath);
            console.log(`Trying fallback 2 - cleaned path: ${fallbackPath2}`);
            
            if (fs.existsSync(fallbackPath2)) {
              fullPath = fallbackPath2;
            }
          }
        }
        
        if (!fs.existsSync(fullPath)) {
          console.error(`File not found at any attempted path. Last tried: ${fullPath}`);
          return res.status(404).json({ message: "Document file not found on disk" });
        }
        
        // Set content type based on file extension for inline viewing
        const ext = path.extname(document.filename).toLowerCase();
        const contentType = {
          '.pdf': 'application/pdf',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png'
        }[ext] || 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${document.filename}"`);
        
        // Stream the file for better performance with large files
        const fileStream = fs.createReadStream(fullPath);
        fileStream.pipe(res);
      }
    } catch (error) {
      console.error("Error in document view endpoint:", error);
      return res.status(500).json({ message: "Failed to retrieve document" });
    }
  }));
*/

  /**
   * List all client services endpoint
   * 
   * Retrieves all client services records from the database.
   * Used for admin dashboard and reporting features.
   * Enhanced with comprehensive security middleware.
   * 
   * @route GET /api/client-services
   * @returns {Array} List of all client service records
   */
  app.get("/api/client-services", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, async (req: Request, res: Response) => {
    try {
      const clientServices = await dbStorage.getClientServices();
      return res.status(200).json(clientServices);
    } catch (error) {
      console.error("Error fetching client services:", error);
      return res.status(500).json({ message: "Failed to fetch client services" });
    }
  });
  /**
   * Create client service endpoint
   * 
   * Creates a new service record for a client with validation.
   * Logs detailed information about the validation and creation process.
   * Automatically sets default status and includes creator information.
   * Enhanced with comprehensive security middleware.
   * 
   * @route POST /api/client-services
   * @param {object} req.body - Client service data to create
   * @returns {object} Created client service record
   * @throws {ApiError} 400 - If validation fails
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 409 - If username already exists
   */    
  app.post("/api/client-services", apiRateLimit, sanitizeInput, preventSQLInjection, validateSegmentAccess, authMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      console.log("[API] Received client service data:", req.body);      // Ensure segmentId is explicitly handled
      const requestData = {
        ...req.body,
        segmentId: req.body.segmentId === undefined ? null : req.body.segmentId,
        createdBy: req.user.id
      };
      
      const validatedData = insertClientServiceSchema.parse(requestData);
      console.log("[API] Validated client service data:", validatedData);
      
      // Verify that the master data combination exists
      const exists = await dbStorage.checkMasterDataExists(
        validatedData.serviceCategory,
        validatedData.serviceType,
        validatedData.serviceProvider,
        validatedData.segmentId === null ? undefined : validatedData.segmentId
      );
      
      if (!exists) {
        return res.status(400).json({ 
          message: "The selected service combination doesn't exist in the master data. Please use the Master Data page to create it first." 
        });
      }        const clientServiceWithUser = {
        ...validatedData,
        segmentId: validatedData.segmentId === null ? undefined : validatedData.segmentId,
        createdBy: req.user.id,
        status: validatedData.status || 'Planned',
        createdAt: new Date()
      };
      
      console.log("[API] Creating client service with:", clientServiceWithUser);
      const createdService = await dbStorage.createClientService(clientServiceWithUser);
      console.log("[API] Client service created:", createdService);
      return res.status(201).json(createdService);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        console.error("[API] Validation error:", validationError);
        return res.status(400).json({ message: validationError.message, details: validationError.details });
      }
      console.error("[API] Error creating client service:", error);
      return res.status(500).json({ message: "Failed to create client service" });
    }
  });
    /**
   * Get services by client ID endpoint
   * 
   * Retrieves all service records associated with a specific client ID.
   * Optionally filters results by segment ID.
   * Enhanced with comprehensive security middleware including ID validation.
   * 
   * @route GET /api/client-services/client/:clientId
   * @param {string} req.params.clientId - Client ID to retrieve services for
   * @param {string} [req.query.segmentId] - Optional segment ID to filter services
   * @returns {Array} List of service records for the specified client
   * @throws {ApiError} 400 - If client ID format is invalid
   */
  app.get("/api/client-services/client/:clientId", apiRateLimit, validateRequest(clientIdValidation), sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, async (req: Request, res: Response) => {
    console.log("[API] Getting existing services for client:", req.params.clientId);
    try {
      const clientId = parseInt(req.params.clientId);
      if (isNaN(clientId)) {
        return res.status(400).json({ message: "Invalid client ID format" });
      }
      
      // Get segment ID from query parameter if provided
      const segmentId = req.query.segmentId ? parseInt(req.query.segmentId as string) : undefined;
      console.log(`[API] Fetching client services with segmentId: ${segmentId || 'none'}`);

      const services = await dbStorage.getClientServicesByClientId(clientId, segmentId);
      return res.status(200).json(services);
    } catch (error) {
      console.error("Error fetching client services:", error);
      return res.status(500).json({ message: "Failed to fetch client services" });
    }
  });
  /**
   * Update service status endpoint
   * 
   * Updates the status of a client service to track its progress through the workflow.
   * Validates that the status is one of the allowed values: Planned, In Progress, or Closed.
   * Enhanced with comprehensive security middleware including ID validation.
   * 
   * @route PATCH /api/client-services/:id
   * @param {string} req.params.id - Service ID to update
   * @param {string} req.body.status - New status value
   * @returns {object} Success message
   * @throws {ApiError} 400 - If service ID format is invalid or status value is invalid
   */
  app.patch("/api/client-services/:id", apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid service ID format" });
      }

      const { status } = req.body;
      if (!status || !["Planned", "In Progress", "Closed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }

      await dbStorage.updateClientServiceStatus(id, status);
      return res.status(200).json({ message: "Service status updated successfully" });
    } catch (error) {
      console.error("Error updating service status:", error);
      return res.status(500).json({ message: "Failed to update service status" });
    }
  });
  /**
   * Get case notes by service ID endpoint
   * 
   * Retrieves all case notes associated with a specific service.
   * Used to display the history of notes for a client service.
   * Enhanced with comprehensive security middleware including ID validation.
   * 
   * @route GET /api/service-case-notes/service/:serviceId
   * @param {string} req.params.serviceId - Service ID to retrieve notes for
   * @returns {Array} List of case notes for the specified service
   * @throws {ApiError} 400 - If service ID format is invalid
   * @throws {ApiError} 404 - If no case notes are found
   * @security Requires authentication and applies rate limiting, input validation, sanitization, SQL injection prevention
   */
  app.get("/api/service-case-notes/service/:serviceId", apiRateLimit, validateRequest(serviceIdValidation), sanitizeInput, preventSQLInjection, authMiddleware, async (req: Request, res: Response) => {
    try {
      const serviceId = parseInt(req.params.serviceId);
      if (isNaN(serviceId)) {
        return res.status(400).json({ message: "Invalid service ID format" });
      }

      const notes = await dbStorage.getServiceCaseNotesByServiceId(serviceId);
      return res.status(200).json(notes);
    } catch (error) {
      console.error("Error fetching service case notes:", error);
      return res.status(500).json({ message: "Failed to fetch service case notes" });
    }
  });
  /**
   * Get case notes count for multiple services endpoint
   * 
   * Retrieves case notes count for multiple services in a single request.
   * Used for displaying case notes indicators in the services table.
   * 
   * @route POST /api/service-case-notes/counts
   * @param {number[]} req.body.serviceIds - Array of service IDs to get counts for
   * @returns {object} Object with serviceId as key and count as value
   * @throws {ApiError} 400 - If service IDs format is invalid
   * @throws {ApiError} 401 - If user is not authenticated
   */
  app.post("/api/service-case-notes/counts", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, async (req: Request, res: Response) => {
    try {
      const { serviceIds } = req.body;
      
      if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
        return res.status(400).json({ message: "Invalid service IDs format" });
      }

      // Validate all service IDs are numbers
      const validServiceIds = serviceIds.filter(id => Number.isInteger(id) && id > 0);
      if (validServiceIds.length !== serviceIds.length) {
        return res.status(400).json({ message: "All service IDs must be valid positive integers" });
      }

      const counts: Record<number, number> = {};
      
      // Get counts for each service
      for (const serviceId of validServiceIds) {
        const count = await dbStorage.getServiceCaseNotesCount(serviceId);
        counts[serviceId] = count;
      }

      return res.status(200).json(counts);
    } catch (error) {
      console.error("Error fetching case notes counts:", error);
      return res.status(500).json({ message: "Failed to fetch case notes counts" });
    }
  });
  
  /**
   * Change password endpoint
   * 
   * Allows users to change their own password.
   * Verifies the current password before allowing the change.
   * Enhanced with input validation, strength checking, and audit logging.
   * 
   * @route POST /api/change-password
   * @param {string} req.body.currentPassword - User's current password for verification
   * @param {string} req.body.newPassword - New password to set
   * @returns {object} Success message
   * @throws {ApiError} 400 - If passwords are missing or current password is incorrect
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 404 - If user not found in database
   */  
  app.post("/api/change-password", authRateLimit, authMiddleware, async (req: Request, res: Response) => {
    try {
      // Use JWT user instead of session
      const userId = req.user?.id;
      const username = req.user?.username;
      const { currentPassword, newPassword } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password required" });
      }
      
      // Validate password types and lengths
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({ message: "Invalid password format" });
      }
      
      // Basic password strength validation
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters long" });
      }
      
      if (newPassword.length > 128) {
        return res.status(400).json({ message: "New password is too long" });
      }
      
      // Prevent reusing the same password
      if (currentPassword === newPassword) {
        return res.status(400).json({ message: "New password must be different from current password" });
      }
      
      // Fetch user from DB
      const user = await dbStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check current password
      const isMatch = await dbStorage.verifyPassword(user.username, currentPassword);
      if (!isMatch) {
        console.warn(`Failed password change attempt for user: ${username} (ID: ${userId}) from IP: ${req.ip}`);
        return res.status(400).json({ message: "Current password is incorrect" });
      }
        // Update password
      await dbStorage.updateUserPassword(userId, newPassword);
      
      // Log successful password change for audit
      console.info(`Password changed successfully for user: ${username} (ID: ${userId}) from IP: ${req.ip}`);
      
      const clientIP = req.headers['x-forwarded-for'] as string || 
                      req.headers['x-real-ip'] as string || 
                      req.socket.remoteAddress || 
                      req.ip || 
                      'unknown';
      
      await dbStorage.logUserActivity({
        userId: userId,
        username: username || 'unknown',
        action: 'CHANGE_PASSWORD',
        resourceType: 'USER',
        resourceId: userId.toString(),
        details: 'User changed password',
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date()
      });
      
      return res.status(200).json({ message: "Password changed successfully" });
    } catch (err) {
      console.error("Password change error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to change password";
      return res.status(500).json({ message: errorMessage });
    }
  });
    /**
   * List all users endpoint (admin only)
   * 
   * Retrieves a list of all users in the system.
   * Restricted to administrators only.
   * Returns sanitized user data without sensitive information.
   * Enhanced with comprehensive security middleware.
   * 
   * @route GET /api/users
   * @returns {Array} List of users with sanitized data
   * @throws {ApiError} 403 - If requester is not an admin
   */
  app.get("/api/users", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, async (req: Request, res: Response) => {
    // Type assertion to access user property
    const authReq = req as any;    try {
      const user = await dbStorage.getUserById(authReq.user.id);
      if (!user || user.role !== "admin") {
        console.log("Request rejected: User is not admin", {
          userId: user?.id,
          userRole: user?.role
        });
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      const users = await dbStorage.getAllUsers();
      return res.status(200).json(users.map(u => ({ 
        id: u.id, 
        name: u.name, 
        username: u.username, 
        role: u.role,
        company_id: u.company_id
      })));
    } catch (err) {
      console.error("Error fetching users:", err);
      console.log ("[API /api/users] Failed to fetch users")
      return res.status(500).json({ message: "[API /api/users] Failed to fetch users", error: err instanceof Error ? err.message : "Unknown error" });
    }
  });
    /**
   * Get user by ID endpoint (admin only)
   * 
   * Retrieves detailed information about a specific user.
   * Restricted to administrators only.
   * Implements detailed logging for troubleshooting authentication issues.
   * Enhanced with comprehensive security middleware including ID validation.
   * 
   * @route GET /api/users/:id
   * @param {string} req.params.id - User ID to retrieve
   * @returns {object} User data
   * @throws {ApiError} 400 - If user ID format is invalid
   * @throws {ApiError} 403 - If requester is not an admin
   * @throws {ApiError} 404 - If user not found
   */
  app.get("/api/users/:id", apiRateLimit, sanitizeInput, preventSQLInjection, idValidation, authMiddleware, async (req: Request, res: Response) => {
    try {
      console.log(`[API /api/users/:id] Request received for user with ID: ${req.params.id}`);
      console.log(`[API /api/users/:id] Request headers:`, req.headers);
      
      // Type assertion for authenticated user
      const authReq = req as any;
      const currentUser = await dbStorage.getUserById(authReq.user.id);
      if (!currentUser || currentUser.role !== "admin") {
        console.log("[API /api/users/:id] Request rejected: User is not admin", {
          userId: currentUser?.id,
          userRole: currentUser?.role
        });
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        console.log(`[API /api/users/:id] Invalid user ID format: ${req.params.id}`);
        return res.status(400).json({ message: "Invalid user ID format" });
      }
      
      console.log(`[API /api/users/:id] Looking up user with ID: ${userId}`);
      const user = await dbStorage.getUserById(userId);
      if (!user) {
        console.log(`[API /api/users/:id] User not found with ID: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      console.log(`[API /api/users/:id] Found user: ${user.username}`);
      
      // Set explicit headers to ensure proper response type
      res.setHeader('Content-Type', 'application/json');
      
      return res.status(200).json({ 
        id: user.id, 
        name: user.name, 
        username: user.username, 
        role: user.role,
        company_id: user.company_id
      });
    } catch (err) {
      console.error("[API /api/users/:id] Error fetching user:", err);
      return res.status(500).json({ message: "Failed to fetch user", error: err instanceof Error ? err.message : "Unknown error" });
    }
  });
    /**
   * Update user endpoint
   * 
   * Updates a user's information in the database.
   * Enforces different permission levels:
   * - Admins can update any user and any fields
   * - Regular users can only update their own name and password
   * Enhanced with comprehensive security middleware.
   * 
   * @route PUT /api/users/:id
   * @param {string} req.params.id - User ID to update
   * @param {object} req.body - User data to update
   * @returns {object} Updated user data
   * @throws {ApiError} 400 - If user ID format is invalid
   * @throws {ApiError} 403 - If user lacks permission for the update
   * @throws {ApiError} 404 - If user not found
   */
  app.put("/api/users/:id", apiRateLimit, sanitizeInput, preventSQLInjection, idValidation, authMiddleware, async (req: Request, res: Response) => {
    try {
      console.log(`[API PUT /api/users/:id] Update request received for user with ID: ${req.params.id}`);
      
      // Type assertion for authenticated user
      const authReq = req as any;
      const currentUser = await dbStorage.getUserById(authReq.user.id);
      if (!currentUser || (currentUser.role !== "admin" && currentUser.id !== parseInt(req.params.id))) {
        console.log("[API PUT /api/users/:id] Request rejected: User is not admin or not updating own account", {
          userId: currentUser?.id,
          userRole: currentUser?.role
        });
        return res.status(403).json({ message: "Forbidden: Admin access required or can only update own account" });
      }
      
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        console.log(`[API PUT /api/users/:id] Invalid user ID format: ${req.params.id}`);
        return res.status(400).json({ message: "Invalid user ID format" });
      }
      
      // Check if user exists
      const existingUser = await dbStorage.getUserById(userId);
      if (!existingUser) {
        console.log(`[API PUT /api/users/:id] User not found with ID: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      console.log(`[API PUT /api/users/:id] Updating user with ID: ${userId}`);
      
      // Non-admin users can only update certain fields of their own account
      let updateData = req.body;
      if (currentUser.role !== "admin" && currentUser.id === userId) {
        // Regular users can only update name and password
        updateData = {
          name: req.body.name
        };
        
        if (req.body.password) {
          updateData.password = req.body.password;
        }
      }
        const updatedUser = await dbStorage.updateUser(userId, updateData);
      
      // Log user update for audit
      const clientIP = req.headers['x-forwarded-for'] as string || 
                      req.headers['x-real-ip'] as string || 
                      req.socket.remoteAddress || 
                      req.ip || 
                      'unknown';
      
      const updatedFields = Object.keys(updateData).filter(key => key !== 'password');
      const details = currentUser.role === "admin" && currentUser.id !== userId ? 
        `Admin updated user ${existingUser.username}. Fields: ${updatedFields.join(', ')}` :
        `User updated own profile. Fields: ${updatedFields.join(', ')}`;
      
      await dbStorage.logUserActivity({
        userId: currentUser.id,
        username: currentUser.username,
        action: 'UPDATE_USER',
        resourceType: 'USER',
        resourceId: userId.toString(),
        details: details,
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date()
      });
      
      // Set explicit headers to ensure proper response type
      res.setHeader('Content-Type', 'application/json');
      
      return res.status(200).json({ 
        id: updatedUser.id, 
        name: updatedUser.name, 
        username: updatedUser.username, 
        role: updatedUser.role,
        company_id: updatedUser.company_id
      });
    } catch (err) {
      console.error("[API PUT /api/users/:id] Error updating user:", err);
      return res.status(500).json({ message: "Failed to update user", error: err instanceof Error ? err.message : "Unknown error" });
    }
  });

    /**
   * Create new user endpoint (admin only)
   * 
   * Creates a new user account in the system.
   * Restricted to administrators only.
   * Performs validation and checks for duplicate usernames.
   * Uses AuthService to ensure proper password hashing.
   * Enhanced with comprehensive security middleware.
   * 
   * @route POST /api/users
   * @param {object} req.body - User data including username, password, role, etc.
   * @returns {object} Created user data (without password)
   * @throws {ApiError} 400 - If validation fails
   * @throws {ApiError} 403 - If requester is not an admin
   * @throws {ApiError} 409 - If username already exists
   */  
  app.post("/api/users", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, async (req: Request, res: Response) => {
    try {
      console.log("Received user creation request with body:", {
        ...req.body,
        password: '[REDACTED]'  // Don't log passwords
      });

      if (!req.user?.id) {
        console.log("Request rejected: No user ID");
        return res.status(401).json({ message: "Unauthorized" });
      }

      const currentUser = await dbStorage.getUserById(req.user.id);
      console.log("Current user attempting operation:", {
        id: currentUser?.id,
        username: currentUser?.username,
        role: currentUser?.role
      });

      if (!currentUser || currentUser.role !== "admin") {
        console.log("Request rejected: User is not admin", {
          userId: currentUser?.id,
          userRole: currentUser?.role
        });
        return res.status(403).json({ message: "Forbidden" });
      }

      // Validate input using the schema
      try {
        console.log("Validating input data...");
        const validatedData = insertUserSchema.parse(req.body);
        console.log("Input validation successful");

        // Check for duplicate username
        const existing = await dbStorage.getUserByUsername(validatedData.username);
        if (existing) {
          console.log("Request rejected: Username already exists:", validatedData.username);
          return res.status(409).json({ message: "Username already exists" });
        }        // Create user using AuthService to ensure bcrypt is used
        console.log("Creating new user with username:", validatedData.username);
        const user = await AuthService.createUser({ 
          name: validatedData.name,
          username: validatedData.username, 
          password: validatedData.password,
          role: validatedData.role,
          company_id: validatedData.company_id
        });
        
        console.log("User created successfully:", {
          id: user.id,
          username: user.username,
          role: user.role,
          company_id: user.company_id
        });

        // Log user creation for audit
        const clientIP = req.headers['x-forwarded-for'] as string || 
                        req.headers['x-real-ip'] as string || 
                        req.socket.remoteAddress || 
                        req.ip || 
                        'unknown';
        
        await dbStorage.logUserActivity({
          userId: currentUser.id,
          username: currentUser.username,
          action: 'CREATE_USER',
          resourceType: 'USER',
          resourceId: user.id.toString(),
          details: `Created new user: ${user.username} with role: ${user.role}`,
          ipAddress: clientIP,
          userAgent: req.headers['user-agent'] || 'unknown',
          timestamp: new Date()
        });

        return res.status(201).json(user);
      } catch (validationError) {
        console.error("Validation error:", validationError);
        if (validationError instanceof z.ZodError) {
          const formattedError = fromZodError(validationError);
          return res.status(400).json({ 
            message: "Validation failed", 
            errors: formattedError.details 
          });
        }
        throw validationError;
      }
    } catch (err) {
      console.error("Error creating user:", err);
      if (err instanceof Error) {
        console.error("Error stack:", err.stack);
      }
      return res.status(500).json({ message: "Failed to add user" });
    }
  });
  /**
   * List all companies endpoint (admin only)
   * 
   * Retrieves all companies registered in the system.
   * Restricted to administrators only.
   * Enhanced with comprehensive security middleware including rate limiting,
   * input validation, sanitization, and SQL injection prevention.
   * 
   * Security Features:
   * - Rate limiting to prevent API abuse
   * - Request validation and sanitization
   * - SQL injection prevention
   * - Authentication required
   * - Admin role verification
   * 
   * @route GET /api/companies
   * @middleware apiRateLimit - Rate limiting protection
   * @middleware validateRequest - Request structure validation
   * @middleware sanitizeInput - Input sanitization
   * @middleware preventSQLInjection - SQL injection protection
   * @middleware authMiddleware - Authentication verification
   * @returns {Array} List of company records
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 403 - If requester is not an admin
   * @throws {ApiError} 429 - If rate limit exceeded
   * @throws {ApiError} 500 - If database operation fails
   */  
  app.get("/api/companies", 
    apiRateLimit,
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req: Request, res: Response) => {
    // Type assertion for authenticated user
    const authReq = req as any;
    try {
      const user = await dbStorage.getUserById(authReq.user.id);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const companies = await dbStorage.getAllCompanies();
      return res.status(200).json(companies);
    } catch (error) {
      console.error("Error fetching companies:", error);
      return res.status(500).json({ message: "Failed to fetch companies" });
    }  });
    
    /**
   * Create company endpoint (admin only)
   * 
   * Creates a new company record in the system.
   * Automatically adds the current user's ID as the creator.
   * Enhanced with comprehensive security middleware including rate limiting,
   * input validation, sanitization, and SQL injection prevention.
   * 
   * Security Features:
   * - Rate limiting to prevent API abuse
   * - Request validation and sanitization
   * - SQL injection prevention
   * - Authentication required
   * - Input schema validation using Zod
   * 
   * @route POST /api/companies
   * @middleware apiRateLimit - Rate limiting protection
   * @middleware validateRequest - Request structure validation
   * @middleware sanitizeInput - Input sanitization
   * @middleware preventSQLInjection - SQL injection protection
   * @middleware authMiddleware - Authentication verification
   * @param {object} req.body - Company data to create
   * @param {string} req.body.company_name - Name of the company
   * @param {string} req.body.registered_address - Registered business address
   * @param {string} req.body.postal_address - Postal/mailing address
   * @param {string} req.body.contact_person_name - Primary contact person name
   * @param {string} req.body.contact_person_phone - Contact phone number (10 digits)
   * @param {string} req.body.contact_person_email - Contact email address
   * @returns {object} Created company record
   * @throws {ApiError} 400 - If validation fails or required fields missing
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 429 - If rate limit exceeded
   * @throws {ApiError} 500 - If database operation fails
   */  app.post("/api/companies", 
    apiRateLimit,
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req: Request, res: Response) => {
    // Type assertion for authenticated user
    const authReq = req as any;
    try {
      if (!authReq.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
        // Add the current user's ID as the creator
      const validatedData = insertCompanySchema.parse({
        ...req.body,
        created_by: authReq.user.id
      });
      
      const company = await dbStorage.createCompany(validatedData);
      
      // Log company creation for audit
      const clientIP = req.headers['x-forwarded-for'] as string || 
                      req.headers['x-real-ip'] as string || 
                      req.socket.remoteAddress || 
                      req.ip || 
                      'unknown';
        await dbStorage.logUserActivity({
        userId: authReq.user.id,
        username: authReq.user.username || 'unknown',
        action: 'CREATE_COMPANY',
        resourceType: 'COMPANY',
        resourceId: company.company_id.toString(),
        details: `Created new company: ${company.company_name}`,
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date()
      });
      
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      return res.status(500).json({ message: "Failed to create company" });
    }  });  
    
    /**
   * Update company endpoint (admin only)
   * 
   * Updates an existing company's information.
   * Preserves the original creator ID if available.
   * Enhanced with comprehensive security middleware including rate limiting,
   * input validation, sanitization, ID validation, and SQL injection prevention.
   * 
   * Security Features:
   * - Rate limiting to prevent API abuse
   * - Request validation and sanitization
   * - SQL injection prevention
   * - Parameter ID validation
   * - Authentication required
   * - Admin role verification
   * - Input schema validation using Zod
   * 
   * @route PUT /api/companies/:id
   * @middleware apiRateLimit - Rate limiting protection
   * @middleware validateRequest - Request structure validation
   * @middleware sanitizeInput - Input sanitization
   * @middleware preventSQLInjection - SQL injection protection
   * @middleware idValidation - Parameter ID validation
   * @middleware authMiddleware - Authentication verification
   * @param {string} req.params.id - Company ID to update
   * @param {object} req.body - Updated company data
   * @param {string} req.body.company_name - Name of the company
   * @param {string} req.body.registered_address - Registered business address
   * @param {string} req.body.postal_address - Postal/mailing address
   * @param {string} req.body.contact_person_name - Primary contact person name
   * @param {string} req.body.contact_person_phone - Contact phone number (10 digits)
   * @param {string} req.body.contact_person_email - Contact email address
   * @returns {object} Updated company record
   * @throws {ApiError} 400 - If company ID format is invalid or validation fails
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 403 - If user is not an admin
   * @throws {ApiError} 404 - If company not found
   * @throws {ApiError} 429 - If rate limit exceeded
   * @throws {ApiError} 500 - If database operation fails   */  
  app.put("/api/companies/:id", 
    apiRateLimit,
    validateRequest(idValidation),
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (
    req: Request,
    res: Response
  ) => {
    // Type assertion for authenticated user
    const authReq = req as any;
    try {
      if (!authReq.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await dbStorage.getUserById(authReq.user.id);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid company ID" });
      }      const existingCompany = await dbStorage.getCompanyById(id);
      if (!existingCompany) {
        return res.status(404).json({ message: "Company not found" });
      }      // Ensure created_by is a number rather than undefined or null
      const validatedData = insertCompanySchema.parse({
        ...req.body,
        created_by: existingCompany.created_by || authReq.user.id
      });

      const company = await dbStorage.updateCompany(id, validatedData);
      
      // Log company update for audit
      const clientIP = req.headers['x-forwarded-for'] as string || 
                      req.headers['x-real-ip'] as string || 
                      req.socket.remoteAddress || 
                      req.ip || 
                      'unknown';
      
      await dbStorage.logUserActivity({
        userId: authReq.user.id,
        username: authReq.user.username || 'unknown',
        action: 'UPDATE_COMPANY',
        resourceType: 'COMPANY',
        resourceId: id.toString(),
        details: `Updated company: ${existingCompany.company_name}`,
        ipAddress: clientIP,
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date()
      });
      
      return res.status(200).json(company);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      console.error("Error updating company:", error);
      return res.status(500).json({ message: "Failed to update company" });
    }  });
  
  /**
   * Delete company endpoint (admin only)
   * 
   * Permanently removes a company from the system.
   * Restricted to administrators only.
   * 
   * @route DELETE /api/companies/:id
   * @param {string} req.params.id - Company ID to delete
   * @returns {object} Success message
   * @throws {ApiError} 400 - If company ID format is invalid
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 403 - If user is not an admin
   * @throws {ApiError} 404 - If company not found
   */
  

/**
   * Get segments by company endpoint
   * 
   * Retrieves all segments belonging to a specific company.
   * Enhanced with comprehensive security middleware including rate limiting,
   * input validation, sanitization, ID validation, and SQL injection prevention.
   * 
   * Security Features:
   * - Rate limiting to prevent API abuse
   * - Request validation and sanitization
   * - SQL injection prevention
   * - Parameter ID validation
   * - Authentication required
   * - Company ID format validation
   * 
   * @route GET /api/segments/:companyId
   * @middleware apiRateLimit - Rate limiting protection
   * @middleware validateRequest - Request structure validation
   * @middleware sanitizeInput - Input sanitization
   * @middleware preventSQLInjection - SQL injection protection
   * @middleware idValidation - Parameter ID validation
   * @middleware authMiddleware - Authentication verification
   * @param {string} req.params.companyId - Company ID to retrieve segments for
   * @returns {Array} List of segments for the company
   * @throws {ApiError} 400 - If company ID format is invalid
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 429 - If rate limit exceeded
   * @throws {ApiError} 500 - If database operation fails
   */  
  app.get("/api/segments/:companyId", 
    apiRateLimit,
    strictRateLimit,
    validateRequest(companyIdValidation),
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req: Request, res: Response) => {
    // Type assertion for authenticated user
    const authReq = req as any;
    try {
      const companyId = parseInt(req.params.companyId);
      if (isNaN(companyId)) {
        return res.status(400).json({ message: "Invalid company ID" });
      }

      const segments = await dbStorage.getAllSegmentsByCompany(companyId);
      return res.status(200).json(segments);
    } catch (error) {
      console.error("Error fetching segments:", error);
      return res.status(500).json({ message: "Failed to fetch segments" });
    }  });
  /**
   * Create segment endpoint
   * 
   * Creates a new segment for a specified company.
   * Automatically records the creator's user ID.
   * Enhanced with comprehensive security middleware including rate limiting,
   * input validation, sanitization, and SQL injection prevention.
   * 
   * Security Features:
   * - Rate limiting to prevent API abuse
   * - Request validation and sanitization
   * - SQL injection prevention
   * - Authentication required
   * - Input validation for required fields
   * 
   * @route POST /api/segments
   * @middleware apiRateLimit - Rate limiting protection
   * @middleware validateRequest - Request structure validation
   * @middleware sanitizeInput - Input sanitization
   * @middleware preventSQLInjection - SQL injection protection
   * @middleware authMiddleware - Authentication verification
   * @param {object} req.body - Segment data including segment_name and company_id
   * @param {string} req.body.segment_name - Name of the segment
   * @param {number} req.body.company_id - ID of the company this segment belongs to
   * @returns {object} Created segment record
   * @throws {ApiError} 400 - If segment name or company ID are missing
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 429 - If rate limit exceeded
   * @throws {ApiError} 500 - If database operation fails  */  
  app.post("/api/segments", 
    apiRateLimit,
    strictRateLimit,
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req: Request, res: Response) => {
    // Type assertion for authenticated user
    const authReq = req as any;
    try {
      const { segment_name, company_id } = req.body;
      
      if (!segment_name || !company_id) {
        return res.status(400).json({ message: "Segment name and company ID are required" });
      }      const segmentData = {
        segment_name,
        company_id,
        created_by: authReq.user.id
      };

      const newSegment = await dbStorage.createSegment(segmentData);
      return res.status(201).json(newSegment);
    } catch (error) {
      console.error("Error creating segment:", error);
      return res.status(500).json({ message: "Failed to create segment" });
    }  });
  /**
   * Update segment endpoint
   * 
   * Updates an existing segment's information.
   * Currently only allows updating the segment name.
   * Enhanced with comprehensive security middleware including rate limiting,
   * input validation, sanitization, ID validation, and SQL injection prevention.
   * 
   * Security Features:
   * - Rate limiting to prevent API abuse
   * - Request validation and sanitization
   * - SQL injection prevention
   * - Parameter ID validation
   * - Authentication required
   * - Input validation for required fields
   * 
   * @route PUT /api/segments/:id
   * @middleware apiRateLimit - Rate limiting protection
   * @middleware validateRequest - Request structure validation
   * @middleware sanitizeInput - Input sanitization
   * @middleware preventSQLInjection - SQL injection protection
   * @middleware idValidation - Parameter ID validation
   * @middleware authMiddleware - Authentication verification
   * @param {string} req.params.id - Segment ID to update
   * @param {object} req.body - Updated segment data
   * @param {string} req.body.segment_name - New segment name
   * @returns {object} Updated segment record
   * @throws {ApiError} 400 - If segment ID format is invalid or segment name is missing
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 404 - If segment not found
   * @throws {ApiError} 429 - If rate limit exceeded
   * @throws {ApiError} 500 - If database operation fails   */  
  app.put("/api/segments/:id", 
    apiRateLimit,
    strictRateLimit,
    validateRequest(idValidation),
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req: Request, res: Response) => {
    // Type assertion for authenticated user
    const authReq = req as any;
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid segment ID" });
      }

      const { segment_name } = req.body;
      
      if (!segment_name) {
        return res.status(400).json({ message: "Segment name is required" });
      }

      const segmentData = {
        segment_name
      };

      const updatedSegment = await dbStorage.updateSegment(id, segmentData);
      
      if (!updatedSegment) {
        return res.status(404).json({ message: "Segment not found" });
      }

      return res.status(200).json(updatedSegment);
    } catch (error) {
      console.error("Error updating segment:", error);
      return res.status(500).json({ message: "Failed to update segment" });
    }  });

  

  /**
   * Get current user's segments endpoint
   * 
   * Retrieves all segments associated with the current user's company.
   * For admins without a company assignment, returns an empty array.
   * Used for segment selection and filtering across the application.
   * 
   * @route GET /api/user/segments
   * @returns {Array} List of segments for the user's company
   */  
  app.get("/api/user/segments", authMiddleware, async (req: Request, res: Response) => {
    // Type assertion for authenticated user
    const authReq = req as any;    
    try {
      // Get current user with company_id
      const user = await dbStorage.getUserById(authReq.user.id);
      
      // Return 401 if user not found
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }      // Log user details for debugging
      console.log('Fetching segments for user:', {
        userId: user.id,
        username: user.username,
        role: user.role,
        companyId: user.company_id
      });
      
      // For users with company_id (regardless of role), return their company's segments
      if (user.company_id) {
        console.log(`Fetching segments for user's company: ${user.company_id}`);
        const segments = await dbStorage.getAllSegmentsByCompany(user.company_id);
        console.log(`Found ${segments.length} segments for company ${user.company_id}`);
        return res.status(200).json(segments);
      }
      
      // For admins without company_id, return empty array (segments are company-specific)
      if (!user.company_id) {
        console.log(`user ${user.id} has no company assignment, returning empty array`);
        return res.status(200).json([]);
      }
/*
      // For admins without company_id, return empty array (segments are company-specific)
      if (user.role === 'admin' && !user.company_id) {
        console.log(`Admin user ${user.id} has no company assignment, returning empty array`);
        return res.status(200).json([]);
      }

      // Regular users without company_id get empty array
      if (user.role !== 'admin' && !user.company_id) {
        console.log(`Regular user ${user.id} has no company assignment, returning empty array`);
        return res.status(200).json([]);
      }
*/
      // Fallback case - return empty array
      console.log('Unhandled user case, returning empty array:', user);
      return res.status(200).json([]);
    } catch (error) {
      console.error("Error fetching user segments:", error);
      return res.status(500).json({ message: "Failed to fetch segments" });
    }  });

  // Add error handling middleware
  app.use(errorHandler);
  const httpServer = createServer(app);
  return httpServer;
}

