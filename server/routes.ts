import express from "express";
import { Request, Response, NextFunction } from "express";
import { Session } from "express-session";
import { AuthService } from "./src/services/auth.service";

// Define session types
declare module "express-session" {  interface Session {
    user?: {
      id: number;
      username: string;
      role: string;
      company_id?: number;
    };
  }
}

import { type Express } from "express";
import { createServer, type Server } from "http";
import { storage as dbStorage, pool } from "./storage";  // Import pool from storage.ts
import { insertUserSchema, insertMasterDataSchema, insertPersonInfoSchema, insertDocumentSchema, insertServiceCaseNoteSchema, insertClientServiceSchema, insertCompanySchema } from "@shared/schema";
import session from "express-session";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import pgSession from "connect-pg-simple";
import cors from 'cors';
import { BlobStorageService } from "./services/blob-storage.service";
import { RequestHandler, ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { errorHandler } from './src/middleware/error';
import { ApiError } from './src/types/error';
import { Company } from "../shared/schema";
import { Request as ExpressRequest } from "express";

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

interface CustomSession extends Session {
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
 * Initializes the system with a default admin user if none exists
 * 
 * This function checks if an admin user already exists in the database.
 * If no admin is found, it creates a default admin user with predefined credentials.
 * Used during system startup to ensure there's always an admin account to access the system.
 */
async function initializeUsers() {
  console.log("Checking for default admin user");
  const admin = await dbStorage.getUserByUsername("admin");
  if (!admin) {
    // Create default admin user using AuthService to ensure bcrypt is used
    await AuthService.createUser({
      name: "Default Admin",
      username: "admin",
      password: "password",
      role: "admin"
    });
    console.log("Default admin user created");
  }
}

const PgStore = pgSession(session);

// Initialize blob storage service only for production
let blobStorage: BlobStorageService | null = null;
try {
  if (process.env.NODE_ENV === 'production') {
    blobStorage = new BlobStorageService();
    console.log('Blob storage service initialized for production');
  } else {
    console.log('Using local file storage for development mode');
  }
} catch (error) {
  console.error('Error initializing blob storage service:', error);
  console.log('Falling back to local file storage');
}

// Ensure uploads directory exists
const uploadsDir = process.env.DOCUMENTS_ROOT_PATH || path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
console.log(`Document uploads directory: ${uploadsDir}`);

// Configure multer for appropriate storage based on environment
const storage = process.env.NODE_ENV === 'production' 
  ? multer.memoryStorage() // Use memory storage for production (for blob storage)
  : multer.diskStorage({    // Use disk storage for development
      destination: (req, file, cb) => {
        cb(null, uploadsDir);
      },
      filename: (req, file, cb) => {
        // Generate unique filename while preserving original extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
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
 * It configures global middleware, authentication, session management,
 * and all API endpoints for the Care Data Manager application.
 * 
 * @param app - Express application instance
 * @returns HTTP server instance
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // Apply global middleware
  app.use(sanitizeRequest);
  app.use(rateLimitMiddleware);

  // Configure CORS
  app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Cookie", "Authorization"]
  }));

  // Initialize session store with connection check using the shared pool
  const pgStore = new PgStore({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true
  });

  // Initialize session
  app.use(
    session({
      store: pgStore,
      secret: process.env.SESSION_SECRET || "care-system-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        //secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        sameSite: 'lax'
      },
    })
  );

  // Initialize users
  await initializeUsers();
  
  /**
   * User login endpoint
   * 
   * Authenticates a user with their username and password.
   * Creates a session for authenticated users.
   * 
   * @route POST /api/auth/login
   * @param {object} req.body - Login credentials
   * @param {string} req.body.username - User's username
   * @param {string} req.body.password - User's password
   * @returns {object} Success status and user data if authenticated
   */
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ success: false, error: "Missing credentials" });
      }

      const user = await AuthService.validateUser(username, password);
      if (!user) {
        return res.status(401).json({ success: false, error: "Invalid credentials" });
      }      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        company_id: user.company_id
      };
      
      return res.json({ success: true, user });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });
  
  /**
   * User logout endpoint
   * 
   * Destroys the user's session and clears the session cookie.
   * 
   * @route POST /api/auth/logout
   * @returns {object} Success or error message
   */
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      return res.status(200).json({ message: "Logout successful" });
    });
  });
  
  /**
   * Authentication status endpoint
   * 
   * Checks if user has a valid session and returns user information.
   * Destroys invalid sessions if user no longer exists in database.
   * 
   * @route GET /api/auth/status
   * @returns {object} Authentication status and user data if authenticated
   */
  app.get("/api/auth/status", async (req: Request, res: Response) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ authenticated: false });
      }

      const user = await dbStorage.getUserById(req.session.user.id);
      if (!user) {
        req.session.destroy((err) => {
          if (err) console.error("Error destroying invalid session:", err);
        });
        return res.status(401).json({ authenticated: false });
      }        return res.status(200).json({ 
        authenticated: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role,
          name: user.name,
          company_id: user.company_id
        } 
      });
    } catch (error) {
      console.error("Error checking auth status:", error);
      return res.status(500).json({ message: "Internal server error checking auth status" });
    }
  });
  
  /**
   * Authentication middleware for protected routes
   * 
   * Verifies that the request has a valid user session.
   * Attaches the user information to the request object for use in route handlers.
   * Returns 401 Unauthorized if no valid session exists.
   * 
   * @param req - Express request object
   * @param res - Express response object
   * @param next - Express next function
   */
  const authMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Assign the user data to req.user with proper type handling
    (req as any).user = req.session.user;
    next();
  };
  
  // Protected routes
  app.use("/api", authMiddleware);

  // Apply route-specific middleware
  app.post("/api/users", validateInput(insertUserSchema), authMiddleware);
  app.post("/api/person-info", validateInput(insertPersonInfoSchema), authMiddleware);
  app.post("/api/master-data", validateInput(insertMasterDataSchema), authMiddleware);
  app.post("/api/service-case-notes", validateInput(insertServiceCaseNoteSchema), authMiddleware);
  app.post("/api/client-services", validateInput(insertClientServiceSchema), authMiddleware);
  app.post("/api/companies", validateInput(insertCompanySchema), authMiddleware);
  
  /**
   * Create master data entry endpoint
   * 
   * Creates a new master data entry for service categories, types, and providers.
   * Handles segment-specific data by properly processing the segmentId field.
   * Validates input data using the insertMasterDataSchema from shared schema.
   * 
   * @route POST /api/master-data
   * @param {object} req.body - Master data to create
   * @returns {object} Created master data entry
   */
  app.post("/api/master-data", async (req: Request, res: Response) => {
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
      });
    }
  });  
    /**
   * Get master data entries endpoint
   * 
   * Retrieves master data entries, filtered by the segment ID provided in the query.
   * Frontend ensures segment is selected for all operations.
   * 
   * @route GET /api/master-data
   * @param {string} [req.query.segmentId] - Optional segment ID to filter master data
   * @returns {Array} List of master data entries
   */
  app.get("/api/master-data", async (req: Request, res: Response) => {
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
   * 
   * @route PUT /api/master-data/:id
   * @param {string} req.params.id - ID of the master data entry to update
   * @param {object} req.body - Updated master data values
   * @returns {object} Updated master data entry
   */
  app.put("/api/master-data/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      console.log("Updating master data for id:", id, "with data:", req.body);
      
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

      console.log("Updated master data:", updatedData);
      return res.status(200).json(updatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ 
          message: validationError.message,
          details: validationError.details
        });
      }
      
      console.error("Error updating master data:", error);
      return res.status(500).json({ 
        message: "Failed to update master data",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  /**
   * Create person info (client) endpoint
   * 
   * Creates a new client with personal information, address, and HCP details.
   * Properly handles optional fields and segment assignment.
   * 
   * @route POST /api/person-info
   * @param {object} req.body - Client personal information
   * @returns {object} Created client information
   */
  app.post("/api/person-info", async (req: Request, res: Response) => {
    try {
      console.log("Received person info data:", req.body);
      const validatedData = insertPersonInfoSchema.parse(req.body);      
      console.log("Validated data:", validatedData);
      
      // Add the current user as the creator and handle optional fields
      const personInfoWithUser = {
        ...validatedData,
        createdBy: req.user!.id,
        middleName: validatedData.middleName || '',
        homePhone: validatedData.homePhone || '',
        addressLine2: validatedData.addressLine2 || '',
        addressLine3: validatedData.addressLine3 || '',
        mailingAddressLine1: validatedData.mailingAddressLine1 || '',
        mailingAddressLine2: validatedData.mailingAddressLine2 || '',
        mailingAddressLine3: validatedData.mailingAddressLine3 || '',
        mailingPostCode: validatedData.mailingPostCode || '',
        nextOfKinName: validatedData.nextOfKinName || '',
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
   * 
   * @route GET /api/person-info
   * @param {string} [req.query.segmentId] - Optional segment ID to filter clients
   * @returns {Array} List of client information
   */
  app.get("/api/person-info", async (req: Request, res: Response) => {
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
   * 
   * @route GET /api/person-info/:id
   * @param {string} req.params.id - Client ID to retrieve
   * @returns {object} Client detailed information
   * @throws {ApiError} 400 - If ID format is invalid
   * @throws {ApiError} 404 - If client not found
   */
  app.get("/api/person-info/:id", async (req: Request, res: Response, next) => {
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
   * 
   * @route PUT /api/person-info/:id
   * @param {string} req.params.id - Client ID to update
   * @param {object} req.body - Updated client information
   * @returns {object} Updated client information
   * @throws {ApiError} 400 - If ID format is invalid
   * @throws {ApiError} 404 - If client not found
   */
  app.put('/api/person-info/:id', async (req: Request, res: Response, next) => {
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
      
      console.log("Validated update data:", validatedData);
        // Update the person info
      const updatedPerson = await dbStorage.updatePersonInfo(id, {
        ...validatedData,
        createdBy: existingPerson.createdBy, // Preserve the original createdBy value
        segmentId: validatedData.segmentId !== null ? validatedData.segmentId : undefined // Handle segmentId properly
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
   * 
   * @route PATCH /api/client-assignment/:id
   * @param {string} req.params.id - Assignment ID to update
   * @param {string} req.body.status - New status value (Planned, In Progress, or Closed)
   * @returns {object} Success message
   */
  app.patch("/api/client-assignment/:id", async (req: Request, res: Response) => {
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
  app.post("/api/client-assignment", upload.single("document"), async (req: Request, res: Response) => {
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
  app.post("/api/documents", upload.single("file"), async (req: Request, res: Response) => {
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
      
      // Create directory for client using the new naming convention: client_id_clientfirstname_lastname
      const clientDir = path.join(uploadsDir, `client_${clientId}_${client.firstName}_${client.lastName}`.replace(/[^a-zA-Z0-9_]/g, '_'));
      
      // Generate a unique filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(req.file.originalname);
      const filename = uniqueSuffix + ext;
      const filePath = path.join(clientDir, filename).replace(/\\/g, '/');

      // In development, move file within filesystem
      if (process.env.NODE_ENV !== 'production') {
        await fs.promises.mkdir(clientDir, { recursive: true });
        if (req.file.path) {
          await fs.promises.rename(req.file.path, filePath);
        }
      } else if (blobStorage) {
        // In production, upload to Azure Blob Storage
        const fileBuffer = Buffer.isBuffer(req.file.buffer) ? req.file.buffer : Buffer.from(req.file.buffer);
        await blobStorage.uploadFile(fileBuffer, filePath, req.file.mimetype);
      }
      
      // Create document record in database
      const documentRecord = await dbStorage.createDocument({
        clientId: parseInt(clientId),
        documentName,
        documentType,
        filename: req.file.originalname,
        filePath: filePath.replace(/\\/g, '/').replace(`${process.cwd().replace(/\\/g, '/')}/`, ''),
        createdBy: req.user!.id,
        uploadedAt: new Date(),
        segmentId: segmentId ? parseInt(segmentId) : null
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
   * 
   * @route GET /api/documents/client/:clientId
   * @param {string} req.params.clientId - Client ID to retrieve documents for
   * @param {string} [req.query.segmentId] - Optional segment ID to filter documents
   * @returns {Array} List of document metadata including normalized file paths
   * @throws {ApiError} 400 - If client ID format is invalid
   * @throws {ApiError} 404 - If no documents are found
   */
  app.get("/api/documents/client/:clientId", createHandler(async (req, res) => {
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
            
            // If file exists in the new location, update the path that will be sent to frontend
            if (fs.existsSync(fullPath)) {
              // Only send the path that the download endpoint will understand
              filePath = fullPath.replace(/\\/g, '/').replace(process.cwd().replace(/\\/g, '/') + '/', '');
              console.log(`Found document at path: ${fullPath}, using path: ${filePath}`);
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
      return res.status(200).json({ data: normalizedDocuments });
    } catch (error) {
      console.error("Error fetching client documents:", error);
      return res.status(500).json({ message: "Failed to fetch client documents" });
    }
  }));
  
  /**
   * Document download endpoint
   * 
   * Retrieves and serves a document file for download based on its file path.
   * Supports both blob storage (production) and file system (development) retrieval.
   * Handles various path formats and attempts multiple lookup strategies to find files.
   * Sets appropriate content type and disposition headers for proper download handling.
   * 
   * @route GET /api/documents/:filePath
   * @param {string} req.params.filePath - File path of the document to download
   * @returns {File} Document file as a downloadable response
   * @throws {ApiError} 404 - If document metadata or file not found
   */
  // This is defined AFTER the client documents endpoint to avoid route conflicts
  app.get("/api/documents/:filePath(*)", createHandler(async (req, res) => {
    try {
      const filePath = req.params.filePath;
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
          }[ext] || 'application/octet-stream';          res.setHeader('Content-Type', contentType);
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
        
        let fullPath = document.filePath;
        
        // If path doesn't start with slash or drive letter, assume it's relative to cwd
        if (!fullPath.startsWith('/') && !fullPath.match(/^[A-Za-z]:\\/)) {
          fullPath = path.join(process.cwd(), fullPath);
        }
          console.log(`Attempting to access file at: ${fullPath}`);
        
        if (!fs.existsSync(fullPath) && document.filePath) {
          // Try a series of fallback paths to find the file
          
          // Try 1: Just the basename in uploads directory
          const basename = path.basename(document.filePath);
          fullPath = path.join(uploadsDir, basename);
          console.log(`File not found, trying uploads dir with basename: ${fullPath}`);
          
          // Try 2: Full path without "uploads/" prefix
          if (!fs.existsSync(fullPath) && document.filePath.startsWith('uploads/')) {
            const pathWithoutUploads = document.filePath.substring('uploads/'.length);
            fullPath = path.join(uploadsDir, pathWithoutUploads);
            console.log(`File not found, trying without uploads prefix: ${fullPath}`);
          }
        }
        
        if (!fs.existsSync(fullPath)) {
          console.error(`File not found at any attempted path: ${fullPath}`);
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
        }[ext] || 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
        res.sendFile(fullPath);
      }
    } catch (error) {
      console.error("Error retrieving document:", error);
      return res.status(500).json({ message: "Failed to retrieve document" });
    }
  }));
  
  /**
   * List all client services endpoint
   * 
   * Retrieves all client services records from the database.
   * Used for admin dashboard and reporting features.
   * 
   * @route GET /api/client-services
   * @returns {Array} List of all client service records
   */
  app.get("/api/client-services", async (req: Request, res: Response) => {
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
   * 
   * @route POST /api/client-services
   * @param {object} req.body - Client service data to create
   * @returns {object} Created client service record
   * @throws {ApiError} 400 - If validation fails
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 409 - If username already exists
   */  app.post("/api/client-services", async (req: Request, res: Response) => {
    try {
      if (!req.session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      console.log("[API] Received client service data:", req.body);      // Ensure segmentId is explicitly handled
      const requestData = {
        ...req.body,
        segmentId: req.body.segmentId === undefined ? null : req.body.segmentId,
        createdBy: req.session.user.id
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
      }
      
      const clientServiceWithUser = {
        ...validatedData,
        createdBy: req.session.user.id,
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
   * 
   * @route GET /api/client-services/client/:clientId
   * @param {string} req.params.clientId - Client ID to retrieve services for
   * @param {string} [req.query.segmentId] - Optional segment ID to filter services
   * @returns {Array} List of service records for the specified client
   * @throws {ApiError} 400 - If client ID format is invalid
   */
  app.get("/api/client-services/client/:clientId", async (req: Request, res: Response) => {
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
   * 
   * @route PATCH /api/client-services/:id
   * @param {string} req.params.id - Service ID to update
   * @param {string} req.body.status - New status value
   * @returns {object} Success message
   * @throws {ApiError} 400 - If service ID format is invalid or status value is invalid
   */
  app.patch("/api/client-services/:id", async (req: Request, res: Response) => {
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
   * 
   * @route GET /api/service-case-notes/service/:serviceId
   * @param {string} req.params.serviceId - Service ID to retrieve notes for
   * @returns {Array} List of case notes for the specified service
   * @throws {ApiError} 400 - If service ID format is invalid
   */
  app.get("/api/service-case-notes/service/:serviceId", async (req: Request, res: Response) => {
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
   * Get specific case note endpoint
   * 
   * Retrieves a single case note by its service ID.
   * Used for viewing or editing a specific note.
   * 
   * @route GET /api/service-case-notes/:serviceId
   * @param {string} req.params.serviceId - Service ID of the note to retrieve
   * @returns {object} Case note data
   * @throws {ApiError} 400 - If service ID format is invalid
   */
  app.get("/api/service-case-notes/:serviceId", async (req: Request, res: Response) => {
    try {
      const serviceId = parseInt(req.params.serviceId);
      if (isNaN(serviceId)) {
        return res.status(400).json({ message: "Invalid service ID format" });
      }

      const note = await dbStorage.getServiceCaseNote(serviceId);
      return res.status(200).json(note);
    } catch (error) {
      console.error("Error fetching case note:", error);
      return res.status(500).json({ message: "Failed to fetch case note" });
    }
  });
  
  /**
   * Create service case note endpoint
   * 
   * Creates a new case note associated with a service.
   * Automatically records the creator's user ID from the session.
   * 
   * @route POST /api/service-case-notes
   * @param {object} req.body - Case note data with serviceId and noteText
   * @returns {object} Created case note
   * @throws {ApiError} 401 - If user is not authenticated
   */
  app.post("/api/service-case-notes", async (req: Request, res: Response) => {
    try {
      const { serviceId, noteText } = req.body;
      if (!req.session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const note = await dbStorage.createServiceCaseNote({
        serviceId,
        noteText,
        createdBy: req.session.user.id
      });

      return res.status(201).json(note);
    } catch (error) {
      console.error("Error creating case note:", error);
      return res.status(500).json({ message: "Failed to create case note" });
    }
  });
  
  /**
   * Update service case note endpoint
   * 
   * Updates an existing case note with new content.
   * Records the user ID of who made the update from the session.
   * 
   * @route PUT /api/service-case-notes/:serviceId
   * @param {string} req.params.serviceId - Service ID of the note to update
   * @param {string} req.body.noteText - Updated note text content
   * @returns {object} Updated case note
   * @throws {ApiError} 400 - If service ID format is invalid
   * @throws {ApiError} 401 - If user is not authenticated
   */
  app.put("/api/service-case-notes/:serviceId", async (req: Request, res: Response) => {
    try {
      const serviceId = parseInt(req.params.serviceId);
      const { noteText } = req.body;
      if (!req.session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (isNaN(serviceId)) {
        return res.status(400).json({ message: "Invalid service ID format" });
      }

      const note = await dbStorage.updateServiceCaseNote(serviceId, {
        noteText,
        updatedBy: req.session.user.id
      });

      return res.status(200).json(note);
    } catch (error) {
      console.error("Error updating case note:", error);
      return res.status(500).json({ message: "Failed to update case note" });
    }
  });  
  
  /**
   * Change password endpoint
   * 
   * Allows users to change their own password.
   * Verifies the current password before allowing the change.
   * 
   * @route POST /api/change-password
   * @param {string} req.body.currentPassword - User's current password for verification
   * @param {string} req.body.newPassword - New password to set
   * @returns {object} Success message
   * @throws {ApiError} 400 - If passwords are missing or current password is incorrect
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 404 - If user not found in database
   */
  app.post("/api/change-password", async (req, res) => {
    try {
      // Use session instead of req.user since this endpoint isn't using authMiddleware
      const userId = req.session.user?.id;
      const { currentPassword, newPassword } = req.body;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password required" });
      }
      // Fetch user from DB
      const user = await dbStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Check current password
      const isMatch = await dbStorage.verifyPassword(user.username, currentPassword);
      if (!isMatch) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      // Update password
      await dbStorage.updateUserPassword(userId, newPassword);
      return res.status(200).json({ message: "Password changed successfully" });
    } catch (err) {
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
   * 
   * @route GET /api/users
   * @returns {Array} List of users with sanitized data
   * @throws {ApiError} 403 - If requester is not an admin
   */
  app.get("/api/users", authMiddleware, async (req: Request, res: Response) => {
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
   * 
   * @route GET /api/users/:id
   * @param {string} req.params.id - User ID to retrieve
   * @returns {object} User data
   * @throws {ApiError} 400 - If user ID format is invalid
   * @throws {ApiError} 403 - If requester is not an admin
   * @throws {ApiError} 404 - If user not found
   */
  app.get("/api/users/:id", authMiddleware, async (req, res) => {
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
   * 
   * @route PUT /api/users/:id
   * @param {string} req.params.id - User ID to update
   * @param {object} req.body - User data to update
   * @returns {object} Updated user data
   * @throws {ApiError} 400 - If user ID format is invalid
   * @throws {ApiError} 403 - If user lacks permission for the update
   * @throws {ApiError} 404 - If user not found
   */
  app.put("/api/users/:id", authMiddleware, async (req, res) => {
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
   * 
   * @route POST /api/users
   * @param {object} req.body - User data including username, password, role, etc.
   * @returns {object} Created user data (without password)
   * @throws {ApiError} 400 - If validation fails
   * @throws {ApiError} 403 - If requester is not an admin
   * @throws {ApiError} 409 - If username already exists
   */
  app.post("/api/users", async (req, res) => {
    try {
      console.log("Received user creation request with body:", {
        ...req.body,
        password: '[REDACTED]'  // Don't log passwords
      });

      if (!req.session?.user?.id) {
        console.log("Request rejected: No session user ID");
        return res.status(401).json({ message: "Unauthorized" });
      }

      const currentUser = await dbStorage.getUserById(req.session.user.id);
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
        }

        // Create user using AuthService to ensure bcrypt is used
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
  // Company routes (admin only)  
   * List all companies endpoint (admin only)
   * 
   * Retrieves all companies registered in the system.
   * Restricted to administrators only.
   * 
   * @route GET /api/companies
   * @returns {Array} List of company records
   * @throws {ApiError} 403 - If requester is not an admin
   */
  app.get("/api/companies", authMiddleware, async (req: Request, res: Response) => {
    // Type assertion for authenticated user
    const authReq = req as any;    try {
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
   * 
   * @route POST /api/companies
   * @param {object} req.body - Company data to create
   * @returns {object} Created company record
   * @throws {ApiError} 401 - If user is not authenticated
   */
  app.post("/api/companies", authMiddleware, async (req: Request, res: Response) => {
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
   * 
   * @route PUT /api/companies/:id
   * @param {string} req.params.id - Company ID to update
   * @param {object} req.body - Updated company data
   * @returns {object} Updated company record
   * @throws {ApiError} 400 - If company ID format is invalid or validation fails
   * @throws {ApiError} 401 - If user is not authenticated
   * @throws {ApiError} 403 - If user is not an admin
   * @throws {ApiError} 404 - If company not found
   */
  app.put("/api/companies/:id", authMiddleware, async (
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
      }

      // Ensure created_by is a number rather than undefined or null
      const validatedData = insertCompanySchema.parse({
        ...req.body,
        created_by: existingCompany.created_by || authReq.user.id
      });

      const company = await dbStorage.updateCompany(id, validatedData);
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
  /*
  app.delete("/api/companies/:id", authMiddleware, async (
    req: Request,
    res: Response
  ) => {
    // Type assertion for authenticated user
    const authReq = req as any;
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await dbStorage.getUserById(req.user.id);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid company ID" });
      }

      const existingCompany = await dbStorage.getCompanyById(id);
      if (!existingCompany) {
        return res.status(404).json({ message: "Company not found" });
      }

      await dbStorage.deleteCompany(id);
      return res.status(200).json({ message: "Company deleted successfully" });
    } catch (error) {
      console.error("Error deleting company:", error);
      return res.status(500).json({ message: "Failed to delete company" });
    }  });
*/
  /**
   * Get segments by company endpoint
   * 
   * Retrieves all segments belonging to a specific company.
   * 
   * @route GET /api/segments/:companyId
   * @param {string} req.params.companyId - Company ID to retrieve segments for
   * @returns {Array} List of segments for the company
   * @throws {ApiError} 400 - If company ID format is invalid
   */
  app.get("/api/segments/:companyId", authMiddleware, async (req: Request, res: Response) => {
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
   * 
   * @route POST /api/segments
   * @param {object} req.body - Segment data including segment_name and company_id
   * @returns {object} Created segment record
   * @throws {ApiError} 400 - If segment name or company ID are missing
   * @throws {ApiError} 401 - If user is not authenticated
   */
  app.post("/api/segments", authMiddleware, async (req: Request, res: Response) => {
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
   * 
   * @route PUT /api/segments/:id
   * @param {string} req.params.id - Segment ID to update
   * @param {string} req.body.segment_name - New segment name
   * @returns {object} Updated segment record
   * @throws {ApiError} 400 - If segment ID format is invalid or segment name is missing
   * @throws {ApiError} 404 - If segment not found
   */
  app.put("/api/segments/:id", authMiddleware, async (req: Request, res: Response) => {
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
   * Delete segment endpoint
   * 
   * Permanently removes a segment from the system.
   * 
   * @route DELETE /api/segments/:id
   * @param {string} req.params.id - Segment ID to delete
   * @returns {object} Success message
   * @throws {ApiError} 400 - If segment ID format is invalid
   * @throws {ApiError} 404 - If segment not found
   */
  /*
  app.delete("/api/segments/:id", authMiddleware, async (req: Request, res: Response) => {
    // Type assertion for authenticated user
    const authReq = req as any;
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid segment ID" });
      }

      const result = await dbStorage.deleteSegment(id);
      
      if (!result) {
        return res.status(404).json({ message: "Segment not found" });
      }

      return res.status(200).json({ message: "Segment deleted successfully" });
    } catch (error) {
      console.error("Error deleting segment:", error);
      return res.status(500).json({ message: "Failed to delete segment" });
    }  });
      */

  /**
   * Get current user's segments endpoint
   * 
   * Retrieves all segments associated with the current user's company.
   * For admins without a company assignment, returns an empty array.
   * Used for segment selection and filtering across the application.
   * 
   * @route GET /api/user/segments
   * @returns {Array} List of segments for the user's company
   */  app.get("/api/user/segments", authMiddleware, async (req: Request, res: Response) => {
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
  app.get("/api/master-data/verify", async (req: Request, res: Response) => {
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

  // Add error handling middleware
  app.use(errorHandler);
  const httpServer = createServer(app);
  return httpServer;
}

