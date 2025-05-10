import express from "express";
import { Request, Response, NextFunction } from "express";
import { Session } from "express-session";
import { AuthService } from "./src/services/auth.service";

// Define session types
declare module "express-session" {
  interface Session {
    user?: {
      id: string;
      username: string;
      role?: string;
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
import helmet from 'helmet';
import { BlobStorageService } from "./services/blob-storage.service";
import { RequestHandler, ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { errorHandler } from './src/middleware/error';
import { ApiError } from './src/types/error';
import { Compay } from "../shared/schema";
import { Request as ExpressRequest } from "express";

// Augment Express Request type
declare module 'express-session' {

  interface SessionData {
    user: {
      id: number;
      username: string;
      role: string;
    };
  }
}

// Type augmentation for Express Request
interface AuthRequest extends Request {
  user: {
    id: number;
    username: string;
    role: string;
  };
}

// Base response type for consistent error handling
interface ApiResponse<T = undefined> {
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

interface TypedRequestBody<T> extends AuthRequest {
  body: T;
}

interface TypedRequestParams<T extends ParamsDictionary> extends AuthRequest {
  params: T;
}

// Type guard for authenticated requests
const isAuthenticated = (
  req: Request<ParamsDictionary, any, any, ParsedQs>
): req is AuthenticatedRequest => {
  return 'user' in req && req.user !== undefined;
};

// Helper to create typed request handlers
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

// Initialize users if none exist
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

// Initialize blob storage service
const blobStorage = new BlobStorageService();

// Input validation middleware
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

// Request sanitization middleware
const sanitizeRequest = (req: Request, _res: Response, next: NextFunction) => {
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

// Rate limiting middleware
const rateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
};

let requestCounts = new Map<string, { count: number, firstRequest: number }>();

const rateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip;
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply global middleware
  app.use(sanitizeRequest);
  app.use(rateLimitMiddleware);

  // Configure CORS

  app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.CORS_ORIGIN 
      : "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"],
    maxAge: 86400,
    optionsSuccessStatus: 204
  }));

  // Initialize session store with secure configuration
  const pgStore = new PgStore({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true,
    pruneSessionInterval: 60
  });

  // Initialize session with secure settings
  app.use(
    session({
      store: pgStore,
      name: 'sessionId',
      secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/',
        domain: process.env.COOKIE_DOMAIN
      }
    })
  );

  // Add security headers
  app.use(helmet());
  app.use(helmet.referrerPolicy({ policy: 'same-origin' }));
  app.use(helmet.noSniff());
  app.use(helmet.frameguard({ action: 'deny' }));

  // Initialize users
  await initializeUsers();

  // Authentication routes
  app.post("/api/auth/login", async (req: Request, res: Response, next) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ success: false, error: "Missing credentials" });
      }

      const user = await AuthService.validateUser(username, password);
      if (!user) {
        return res.status(401).json({ success: false, error: "Invalid credentials" });

      }

      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role
      };
      
      return res.json({ success: true, user });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ success: false, error: "Internal server error" });

    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response, next) => {
    req.session.destroy((err) => {
      if (err) {
        next(new Error("Failed to logout"));
        return;
      }
      res.clearCookie("connect.sid");
      res.status(200).json({ message: "Logout successful" });
    });
  });

  app.get("/api/auth/status", async (req: Request, res: Response, next) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ authenticated: false });
      }

      const user = await storage.getUserById(req.session.user.id);
      if (!user) {
        req.session.destroy((err) => {
          if (err) console.error("Error destroying invalid session:", err);
        });
        return res.status(401).json({ authenticated: false });
      }

      return res.status(200).json({ 
        authenticated: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role 
        } 
      });
    } catch (error) {
      next(error);
    }
  });

  // Auth middleware for protected routes
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.user) {
      throw new AuthenticationError();
    }
    req.user = req.session.user; // Make user data available on request object
    next();
  };

  // Admin middleware
  const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }
    next();
  };

  // Setup file upload
  const uploadsDir = process.env.DOCUMENTS_ROOT_PATH || path.join(process.cwd(), "uploads");
  
  // Configure multer for memory storage (for blob uploads)
  const multerStorage = multer.memoryStorage();
  const upload = multer({ 
    storage: multerStorage,
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

  // Protected routes
  app.use("/api", authMiddleware);

  // Apply route-specific middleware
  app.post("/api/users", validateInput(insertUserSchema), authMiddleware);
  app.post("/api/person-info", validateInput(insertPersonInfoSchema), authMiddleware);
  app.post("/api/master-data", validateInput(insertMasterDataSchema), authMiddleware);
  app.post("/api/documents", validateInput(insertDocumentSchema), authMiddleware);
  app.post("/api/service-case-notes", validateInput(insertServiceCaseNoteSchema), authMiddleware);
  app.post("/api/client-services", validateInput(insertClientServiceSchema), authMiddleware);
  app.post("/api/companies", validateInput(insertCompanySchema), authMiddleware);

  // Master data routes
  app.post("/api/master-data", async (req: Request, res: Response, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError("No active session found");
      }

      console.log("Received master data:", req.body);
      const validatedData = insertMasterDataSchema.parse(req.body);
      
      // Add the current user as the creator
      const masterDataWithUser = {
        ...validatedData,
        createdBy: req.user.id,
        active: validatedData.active ?? true,
      };
      
      console.log("Creating master data with:", masterDataWithUser);
      const createdData = await storage.createMasterData(masterDataWithUser);
      console.log("Created master data:", createdData);
      return res.status(201).json(createdData);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/master-data", async (req: Request, res: Response, next) => {
    try {
      console.log("Fetching all master data");
      const masterData = await storage.getAllMasterData();
      console.log("Fetched master data count:", masterData.length);
      return res.status(200).json(masterData);
    } catch (error) {
      next(error);
    }
  });

  // Add PUT endpoint for updating master data
  app.put("/api/master-data/:id", async (req: Request, res: Response, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        throw new ValidationError("Invalid ID format");
      }

      console.log("Updating master data for id:", id, "with data:", req.body);
      const validatedData = insertMasterDataSchema.parse(req.body);
      
      const updatedData = await storage.updateMasterData(id, {
        ...validatedData,
        createdBy: req.user!.id
      });

      console.log("Updated master data:", updatedData);
      return res.status(200).json(updatedData);
    } catch (error) {
      next(error);
    }
  });

  // Person Info routes
  app.post("/api/person-info", async (req: Request, res: Response, next) => {
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
        hcpEndDate: validatedData.hcpEndDate || '',
        useHomeAddress: validatedData.useHomeAddress ?? true,
        status: validatedData.status || 'New'
      };
      
      console.log("Processed data:", personInfoWithUser);
      const createdData = await storage.createPersonInfo(personInfoWithUser);
      console.log("Created data:", createdData);
      return res.status(201).json(createdData);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/person-info", async (req: Request, res: Response, next) => {
    try {
      const personInfo = await storage.getAllPersonInfo();
      return res.status(200).json(personInfo);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/person-info/:id", async (req: Request, res: Response, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {

        throw new ApiError(400, "Invalid ID format", null, "INVALID_ID");

      }
      
      const personInfo = await storage.getPersonInfoById(id);
      if (!personInfo) {
        throw new ApiError(404, "Person info not found", null, "NOT_FOUND");

      }
      
      res.status(200).json(personInfo);
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/person-info/:id', async (req: Request, res: Response, next) => {
    try {
      console.log("Update request received for id:", req.params.id, "with data:", req.body);
      
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        throw new ApiError(400, "Invalid ID format", null, "INVALID_ID");

      }

      // First check if the person exists
      const existingPerson = await storage.getPersonInfoById(id);
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
      const updatedPerson = await storage.updatePersonInfo(id, {
        ...validatedData,
        createdBy: existingPerson.createdBy // Preserve the original createdBy value
      });
      
      console.log("Person updated successfully:", updatedPerson);
      res.status(200).json(updatedPerson);
    } catch (error) {
      next(error);
    }
  });
  
  // Update client assignment status
  app.patch("/api/client-assignment/:id", async (req: Request, res: Response, next) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status || !["Planned", "In Progress", "Closed"].includes(status)) {
        throw new ValidationError("Invalid status value");
      }
      
      await storage.updateClientServiceStatus(id, status);
      return res.status(200).json({ message: "Status updated successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Client Assignment route with file upload  
  app.post("/api/client-assignment", upload.single("document"), async (req: Request, res: Response, next) => {
    try {
      const { clientId, careCategory, careType, notes } = req.body;
      
      // Validation
      if (!clientId || !careCategory || !careType) {
        throw new ValidationError("Client ID, care category, and care type are required");
      }
      
      // Check if client exists
      const clientIdNum = parseInt(clientId);
      if (isNaN(clientIdNum)) {
        throw new ValidationError("Invalid client ID format");
      }
      
      const client = await storage.getPersonInfoById(clientIdNum);
      if (!client) {
        throw new NotFoundError("Client not found");
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
      
      const createdData = await storage.createMasterData(masterDataEntry);
      
      return res.status(201).json({
        ...createdData,
        documentUploaded: !!req.file,
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Modified document upload endpoint
  app.post("/api/documents", upload.single("file"), createHandler(async (req, res) => {
    console.log("Document upload request received");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    console.log("File:", req.file);

    try {
      if (!req.file) {
        throw new ValidationError("No file uploaded");
      }

      const { clientId, documentName, documentType } = req.body;
      
      if (!clientId || !documentName || !documentType) {
        throw new ValidationError("Missing required fields: clientId, documentName, and documentType are required");
      }
      
      // Check if client exists
      const clientIdNum = parseInt(clientId);
      if (isNaN(clientIdNum)) {
        throw new ValidationError("Invalid client ID format");
      }
      
      const client = await storage.getPersonInfoById(clientIdNum);
      if (!client) {
        throw new NotFoundError("Client not found");
      }

      // Use original filename but sanitize it by removing any path components
      const originalFilename = req.file.originalname;
      const sanitizedFilename = originalFilename.replace(/^.*[\\\/]/, '');
      const clientDirName = `${clientIdNum}_${client.firstName}_${client.lastName}`;
      const blobPath = `${clientDirName}/${sanitizedFilename}`;

      // Upload to blob storage
      const fileBuffer = req.file.buffer;
      await blobStorage.uploadFile(fileBuffer, blobPath, req.file.mimetype);
      
      // Create document record in database
      const documentRecord = await storage.createDocument({
        clientId: clientIdNum,
        documentName,
        documentType,
        filename: sanitizedFilename,
        filePath: blobPath,
        createdBy: req.user.id,
        uploadedAt: new Date()
      });
      
      return res.status(201).json(documentRecord);
    } catch (error) {
      next(error);
    }
  }));

  // Modified document download endpoint
  app.get("/api/documents/:filePath(*)", createHandler(async (req, res: Response<Buffer>) => {
    const filePath = req.params.filePath;
    const document = await storage.getDocumentByFilePath(filePath);
    
    if (!document) {
      throw new NotFoundError("Document not found");
    }
    
    if (!document.filePath) {
      throw new NotFoundError("Document file path not found");
    }
    
    try {
      // Download from blob storage
      const fileBuffer = await blobStorage.downloadFile(document.filePath);
      
      // Get the original filename from the filePath
      const originalFilename = document.filename;
      
      // Set content type based on file extension
      const ext = path.extname(originalFilename).toLowerCase();
      const contentType = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png'
      }[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      // Use original filename in Content-Disposition
      res.setHeader('Content-Disposition', `attachment; filename="${originalFilename}"`);
      res.send(fileBuffer);
    } catch (error) {
      throw new NotFoundError("Document not found in blob storage");
    }
  }));

  // Add client services routes
  app.get("/api/client-services", async (req: Request, res: Response, next) => {
    try {
      const clientServices = await storage.getClientServices();
      return res.status(200).json(clientServices);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/client-services", async (req: Request, res: Response, next) => {
    try {
      if (!req.session?.user?.id) {
        throw new AuthenticationError("Unauthorized");
      }

      console.log("[API] Received client service data:", req.body);
      
      const validatedData = insertClientServiceSchema.parse({
        ...req.body,
        createdBy: req.session.user.id
      });
      
      console.log("[API] Validated client service data:", validatedData);
      
      const clientServiceWithUser = {
        ...validatedData,
        createdBy: req.session.user.id,
        status: validatedData.status || 'Planned',
        createdAt: new Date()
      };
      
      console.log("[API] Creating client service with:", clientServiceWithUser);
      const createdService = await storage.createClientService(clientServiceWithUser);
      console.log("[API] Client service created:", createdService);
      return res.status(201).json(createdService);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/client-services/client/:clientId", async (req: Request, res: Response, next) => {
    console.log("[API] Getting existing services for client:", req.params.clientId);
    try {
      const clientId = parseInt(req.params.clientId);
      if (isNaN(clientId)) {
        throw new ValidationError("Invalid client ID format");
      }

      const services = await storage.getClientServicesByClientId(clientId);
      return res.status(200).json(services);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/client-services/:id", async (req: Request, res: Response, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        throw new ValidationError("Invalid service ID format");
      }

      const { status } = req.body;
      if (!status || !["Planned", "In Progress", "Closed"].includes(status)) {
        throw new ValidationError("Invalid status value");
      }

      await storage.updateClientServiceStatus(id, status);
      return res.status(200).json({ message: "Service status updated successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Service case notes endpoints
  app.get("/api/service-case-notes/:serviceId", async (req: Request, res: Response, next) => {
    try {
      const serviceId = parseInt(req.params.serviceId);
      if (isNaN(serviceId)) {
        throw new ValidationError("Invalid service ID format");
      }

      const note = await storage.getServiceCaseNote(serviceId);
      return res.status(200).json(note);
    } catch (error) {
      next(error);
    }
  });

  // Create service case note
  app.post("/api/service-case-notes", async (req: Request, res: Response, next) => {
    try {
      const { serviceId, noteText } = req.body;
      if (!req.session?.user?.id) {
        throw new AuthenticationError("Unauthorized");
      }

      const note = await storage.createServiceCaseNote({
        serviceId,
        noteText,
        createdBy: req.session.user.id
      });

      return res.status(201).json(note);
    } catch (error) {
      next(error);
    }
  });

  // Update service case note
  app.put("/api/service-case-notes/:serviceId", async (req: Request, res: Response, next) => {
    try {
      const serviceId = parseInt(req.params.serviceId);
      const { noteText } = req.body;
      if (!req.session?.user?.id) {
        throw new AuthenticationError("Unauthorized");
      }

      if (isNaN(serviceId)) {
        throw new ValidationError("Invalid service ID format");
      }

      const note = await storage.updateServiceCaseNote(serviceId, {
        noteText,
        updatedBy: req.session.user.id
      });

      return res.status(200).json(note);
    } catch (error) {
      next(error);
    }
  });

  // Change password endpoint
  app.post("/api/change-password", async (req, res, next) => {
    try {
      const userId = req.user?.id; // Assumes authentication middleware sets req.user
      const { currentPassword, newPassword } = req.body;
      if (!userId) {
        throw new AuthenticationError("Not authenticated");
      }
      if (!currentPassword || !newPassword) {
        throw new ValidationError("Current and new password required");
      }
      // Fetch user from DB
      const user = await storage.getUserById(userId);
      if (!user) {
        throw new NotFoundError("User not found");
      }
      // Check current password
      const isMatch = await storage.verifyPassword(user.username, currentPassword);
      if (!isMatch) {
        throw new ValidationError("Current password is incorrect");
      }
      // Update password
      await storage.updateUserPassword(userId, newPassword);
      return res.status(200).json({ message: "Password changed successfully" });
    } catch (err) {
      next(err);
    }
  });

  // List all users (admin only)
  app.get("/api/users", adminMiddleware, async (req, res, next) => {
    try {
      const user = await dbStorage.getUserById(req.user.id);
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
      next(err);
    }
  });

  // Add a new user (admin only)
  app.post("/api/users", adminMiddleware, async (req, res, next) => {
    try {
      console.log("Received user creation request with body:", {
        ...req.body,
        password: '[REDACTED]'  // Don't log passwords
      });

      // Validate input using the schema
      try {
        console.log("Validating input data...");
        const validatedData = insertUserSchema.parse(req.body);
        console.log("Input validation successful");

        // Check for duplicate username
        const existing = await storage.getUserByUsername(validatedData.username);
        if (existing) {
          throw new ValidationError("Username already exists");
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
        if (validationError instanceof z.ZodError) {
          const formattedError = fromZodError(validationError);
          throw new ValidationError(`Validation failed: ${formattedError.message}`);
        }
        throw validationError;
      }
    } catch (err) {
      next(err);
    }
  });

  // Company routes
  app.post("/api/companies", adminMiddleware, async (req: Request, res: Response, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError("User not authenticated");
      }
      
      const companyData = {
        ...req.body,
        created_by: req.user.id
      };
      
      const createdCompany = await storage.createCompany(companyData);
      return res.status(201).json(createdCompany);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/companies", adminMiddleware, async (req: Request, res: Response, next) => {
    try {
      const companies = await storage.getAllCompanies();
      return res.status(200).json(companies);
    } catch (error) {
      next(error);
    }
  });


  // Company routes (admin only)
  type CompanyDeleteRequest = ExpressRequest<{ id: string }> & AuthRequest;

  app.get("/api/companies", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await dbStorage.getUserById(req.user.id);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const companies = await dbStorage.getAllCompanies();
      return res.status(200).json(companies);
    } catch (error) {
      console.error("Error fetching companies:", error);
      return res.status(500).json({ message: "Failed to fetch companies" });
    }
  });

  app.post("/api/companies", authMiddleware, async (req: AuthRequest & TypedRequestBody<typeof insertCompanySchema._type>, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const validatedData = insertCompanySchema.parse(req.body);
      const company = await dbStorage.createCompany(validatedData);
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      return res.status(500).json({ message: "Failed to create company" });
    }
  });

  app.put("/api/companies/:id", authMiddleware, async (
    req: Request<{ id: string }, any, any> & AuthRequest,
    res: Response
  ) => {
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

      const validatedData = insertCompanySchema.parse({
        ...req.body,
        created_by: existingCompany.created_by
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
    }
  });

  app.delete("/api/companies/:id", authMiddleware, async (
    req: CompanyDeleteRequest,
    res: Response
  ) => {
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
    }
  });

  // Add error handling middleware
  app.use(errorHandler);

  const httpServer = createServer(app);
  return httpServer;
}

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
  hcpEndDate?: string;
}
