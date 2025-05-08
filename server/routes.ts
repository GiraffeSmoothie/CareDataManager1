import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage as dbStorage, pool } from "./storage";  // Import pool from storage.ts
import { insertUserSchema, insertMasterDataSchema, insertPersonInfoSchema, insertDocumentSchema, insertMemberServiceSchema, insertServiceCaseNoteSchema } from "@shared/schema";
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

// Base response type for consistent error handling
interface ApiResponse<T = undefined> {
  message?: string;
  data?: T;
}

declare module "express-session" {
  interface SessionData {
    user: {
      id: number;
      username: string;
      role: string; // include role in session
    };
  }
}

declare module "express" {
  interface Request {
    user?: {
      id: number;
      username: string;
      role: string; // include role in session
    };
    memberPath?: string;
    filePath?: string;
  }
}

// Define authenticated request type
interface AuthenticatedRequest<
  P = ParamsDictionary,
  B = any,
  Q = ParsedQs
> extends Request<P, any, B, Q> {
  user: {
    id: number;
    username: string;
    role: string;
  };
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

  console.log("Default admin user created");
  console.log("Connecting to:", process.env.DATABASE_URL);
  console.log("Environment:", process.env.NODE_ENV);

  const admin = await dbStorage.getUserByUsername("admin");
  if (!admin) {
    // Create default admin user
    await dbStorage.createUser({
      name: "Default Admin",
      username: "admin",
      password: hashPassword("password"),
      role: "admin"
    });
    console.log("Default admin user created");
    console.log("Connecting to:", process.env.DATABASE_URL);
    console.log("Environment:", process.env.NODE_ENV);
  }
}

// Helper function to hash passwords
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const PgStore = pgSession(session);

// Initialize blob storage service
const blobStorage = new BlobStorageService();

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure CORS
  app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type"]
  }));

  // Initialize session store with connection check using the shared pool
  const pgStore = new PgStore({
    pool: pool,
    tableName: 'session',  // Changed from user_sessions to session
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

  // Authentication routes
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await dbStorage.getUserByUsername(username);
      
      if (!user || user.password !== hashPassword(password)) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Set session
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role // include role in session
      };

      return res.status(200).json({ message: "Login successful" });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      return res.status(200).json({ message: "Logout successful" });
    });
  });

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
      console.error("Error checking auth status:", error);
      return res.status(500).json({ message: "Internal server error checking auth status" });
    }
  });

  // Auth middleware for protected routes
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.user = req.session.user; // Make user data available on request object
    next();
  };
  
  // Setup file upload
  const uploadsDir = process.env.DOCUMENTS_ROOT_PATH || path.join(process.cwd(), "uploads");
  
  // Configure multer for memory storage (for blob uploads)
  const storage = multer.memoryStorage();
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

  // Protected routes
  app.use("/api", authMiddleware);

  // Master data routes
  app.post("/api/master-data", async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "No active session found" });
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
      const createdData = await dbStorage.createMasterData(masterDataWithUser);
      console.log("Created master data:", createdData);
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

  app.get("/api/master-data", async (req: Request, res: Response) => {
    try {
      console.log("Fetching all master data");
      const masterData = await dbStorage.getAllMasterData();
      console.log("Fetched master data count:", masterData.length);
      return res.status(200).json(masterData);
    } catch (error) {
      console.error("Error fetching master data:", error);
      return res.status(500).json({ message: "Failed to fetch master data" });
    }
  });

  // Add PUT endpoint for updating master data
  app.put("/api/master-data/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      console.log("Updating master data for id:", id, "with data:", req.body);
      const validatedData = insertMasterDataSchema.parse(req.body);
      
      const updatedData = await dbStorage.updateMasterData(id, {
        ...validatedData,
        createdBy: req.user!.id
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

  // Person Info routes
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
        hcpEndDate: validatedData.hcpEndDate || '',
        useHomeAddress: validatedData.useHomeAddress ?? true,
        status: validatedData.status || 'New'
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

  app.get("/api/person-info", async (req: Request, res: Response) => {
    try {
      const personInfo = await dbStorage.getAllPersonInfo();
      return res.status(200).json(personInfo);
    } catch (error) {
      console.error("Error fetching person info:", error);
      return res.status(500).json({ message: "Failed to fetch person info" });
    }
  });

  app.get("/api/person-info/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      const personInfo = await dbStorage.getPersonInfoById(id);
      if (!personInfo) {
        return res.status(404).json({ message: "Person info not found" });
      }
      
      return res.status(200).json(personInfo);
    } catch (error) {
      console.error("Error fetching person info:", error);
      return res.status(500).json({ message: "Failed to fetch person info" });
    }
  });

  app.put('/api/person-info/:id', async (req: Request, res: Response) => {
    try {
      console.log("Update request received for id:", req.params.id, "with data:", req.body);
      
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        console.error("Invalid ID format:", req.params.id);
        return res.status(400).json({ message: 'Invalid ID provided' });
      }

      // First check if the person exists
      const existingPerson = await dbStorage.getPersonInfoById(id);
      if (!existingPerson) {
        console.error("Person not found with ID:", id);
        return res.status(404).json({ message: 'Person not found' });
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
        createdBy: existingPerson.createdBy // Preserve the original createdBy value
      });
      
      console.log("Person updated successfully:", updatedPerson);
      return res.status(200).json(updatedPerson);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        console.error('Validation error:', validationError, '\nFull error:', error);
        return res.status(400).json({ 
          message: validationError.message,
          details: validationError.details
        });
      }
      console.error('Error updating person info:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      return res.status(500).json({ 
        message: 'Failed to update person info',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Update member assignment status
  app.patch("/api/member-assignment/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status || !["Planned", "In Progress", "Closed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      
      await dbStorage.updateMasterDataStatus(id, status);
      return res.status(200).json({ message: "Status updated successfully" });
    } catch (error) {
      console.error("Error updating assignment status:", error);
      return res.status(500).json({ message: "Failed to update status" });
    }
  });

  // Member Assignment route with file upload  
  app.post("/api/member-assignment", upload.single("document"), async (req: Request, res: Response) => {
    try {
      const { memberId, careCategory, careType, notes } = req.body;
      
      // Validation
      if (!memberId || !careCategory || !careType) {
        return res.status(400).json({ message: "Member ID, care category, and care type are required" });
      }
      
      // Check if member exists
      const memberIdNum = parseInt(memberId);
      if (isNaN(memberIdNum)) {
        return res.status(400).json({ message: "Invalid member ID format" });
      }
      
      const member = await dbStorage.getPersonInfoById(memberIdNum);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      // Create master data entry for this member
      const masterDataEntry = {
        serviceCategory: careCategory,
        serviceType: careType,
        serviceProvider: "",
        active: true,
        memberId: memberIdNum,
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
      console.error("Error creating member assignment:", error);
      return res.status(500).json({ message: "Failed to create member assignment" });
    }
  });
  
  // Modified document upload endpoint
  app.post("/api/documents", upload.single("file"), createHandler(async (req, res) => {
    console.log("Document upload request received");
    
    if (!req.file) {
      console.log("No file uploaded");
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { memberId, documentName, documentType } = req.body;
    
    // Validation
    if (!memberId || !documentName || !documentType) {
      console.log("Missing required fields:", { memberId, documentName, documentType });
      return res.status(400).json({ message: "Member ID, document name, and document type are required" });
    }
    
    // Check if member exists
    const memberIdNum = parseInt(memberId);
    if (isNaN(memberIdNum)) {
      console.log("Invalid member ID format:", memberId);
      return res.status(400).json({ message: "Invalid member ID format" });
    }
    
    const member = await dbStorage.getPersonInfoById(memberIdNum);
    if (!member) {
      console.log("Member not found:", memberIdNum);
      return res.status(404).json({ message: "Member not found" });
    }
    
    // Generate blob name (same structure as before but for blob storage)
    const blobName = `${member.id}_${member.firstName}_${member.lastName}/${req.file.originalname}`;
    
    // Upload to blob storage
    const blobUrl = await blobStorage.uploadFile(
      req.file.buffer,
      blobName,
      req.file.mimetype
    );
    
    // Create document entry with blob URL
    const documentData = {
      memberId: memberIdNum,
      documentName,
      documentType,
      createdBy: req.user.id,
      filename: req.file.originalname,
      filePath: blobName, // Store the blob path instead of local file path
      uploadedAt: new Date()
    };

    console.log("Creating document with data:", documentData);
    const createdDocument = await dbStorage.createDocument(documentData);
    
    return res.status(201).json(createdDocument);
  }));

  // Modified document download endpoint
  app.get("/api/documents/:filename", createHandler(async (req, res) => {
    const { filename } = req.params;
    const document = await dbStorage.getDocumentByFilename(filename);
    
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }
    
    if (!document.filePath) {
      return res.status(404).json({ message: "Document file path not found" });
    }
    
    // Download from blob storage
    const fileBuffer = await blobStorage.downloadFile(document.filePath);
    
    // Set content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    const contentType = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png'
    }[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.documentName}"`);
    res.send(fileBuffer);
  }));

  // Member services routes
  app.get("/api/member-services", async (req: Request, res: Response) => {
    try {
      const memberServices = await dbStorage.getAllMemberServices(); // Fetch all member services
      return res.status(200).json(memberServices);
    } catch (error) {
      console.error("Error fetching member services:", error);
      return res.status(500).json({ message: "Failed to fetch member services" });
    }
  });

  app.post("/api/member-services", async (req: Request, res: Response) => {
    try {
      if (!req.session?.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      console.log("[API] Received member service data:", req.body);
      
      const validatedData = insertMemberServiceSchema.parse({
        ...req.body,
        createdBy: req.session.user.id
      });
      
      console.log("[API] Validated member service data:", validatedData);
      
      const memberServiceWithUser = {
        ...validatedData,
        createdBy: req.session.user.id,
        status: validatedData.status || 'Planned',
        createdAt: new Date() // Add createdAt property
      };
      
      console.log("[API] Creating member service with:", memberServiceWithUser);
      const createdService = await dbStorage.createMemberService(memberServiceWithUser);
      console.log("[API] Member service created:", createdService);
      return res.status(201).json(createdService);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        console.error("[API] Validation error:", validationError);
        return res.status(400).json({ message: validationError.message, details: validationError.details });
      }
      console.error("[API] Error creating member service:", error);
      return res.status(500).json({ message: "Failed to create member service" });
    }
  });

  app.get("/api/member-services/member/:memberId", async (req: Request, res: Response) => {
    console.log("[API] Getting existing services for member:", req.body);
    try {
      const memberId = parseInt(req.params.memberId);
      if (isNaN(memberId)) {
        return res.status(400).json({ message: "Invalid member ID format" });
      }

      const services = await dbStorage.getMemberServicesByMemberId(memberId);
      return res.status(200).json(services);
    } catch (error) {
      console.error("Error fetching member services:", error);
      return res.status(500).json({ message: "Failed to fetch member services" });
    }
  });

  app.get("/api/member-services/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      const memberService = await dbStorage.getMemberServiceById(id) || null;
      if (!memberService) {
        return res.status(404).json({ message: "Member service not found" });
      }
      
      return res.status(200).json(memberService);
    } catch (error) {
      console.error("Error fetching member service:", error);
      return res.status(500).json({ message: "Failed to fetch member service" });
    }
  });

  app.patch("/api/member-services/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid service ID format" });
      }

      const { status } = req.body;
      if (!status || !["Planned", "In Progress", "Closed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }

      await dbStorage.updateMemberServiceStatus(id, status);
      return res.status(200).json({ message: "Service status updated successfully" });
    } catch (error) {
      console.error("Error updating service status:", error);
      return res.status(500).json({ message: "Failed to update service status" });
    }
  });

  // Service case notes endpoints
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

  // Create service case note
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

  // Update service case note
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

  // Change password endpoint
  app.post("/api/change-password", async (req, res) => {
    try {
      const userId = req.user?.id; // Assumes authentication middleware sets req.user
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

  // List all users (admin only)
  app.get("/api/users", authMiddleware, async (req, res) => {
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
      return res.status(200).json(users.map(u => ({ id: u.id, name: u.name, username: u.username, role: u.role })));
    } catch (err) {
      console.error("Error fetching users:", err);
      console.log ("[API /api/users] Failed to fetch users")
      return res.status(500).json({ message: "[API /api/users] Failed to fetch users", error: err instanceof Error ? err.message : "Unknown error" });
    }
  });

  // Add a new user (admin only)
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

        // Hash password using the helper function
        console.log("Creating new user with username:", validatedData.username);
        const hashedPassword = hashPassword(validatedData.password);
        const user = await dbStorage.createUser({ 
          name: validatedData.name,
          username: validatedData.username, 
          password: hashedPassword, 
          role: validatedData.role 
        });
        
        console.log("User created successfully:", {
          id: user.id,
          username: user.username,
          role: user.role
        });

        return res.status(201).json({ 
          id: user.id, 
          name: user.name, 
          username: user.username, 
          role: user.role 
        });
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

  const httpServer = createServer(app);
  return httpServer;
}

// Member service interfaces
interface MemberService {
  id: number;
  memberId: number;
  serviceType: string;
  startDate: Date;
  endDate: Date | null;
  status: string;
}

// Extend storage interface with member service methods
declare module './storage' {
  interface Storage {
    getAllMemberServices(): Promise<MemberService[]>;
    getMemberServiceById(id: number): Promise<MemberService | null>;
    // ... other member service related methods
  }
}

// Update PersonInfo interface to include HCP dates
interface PersonInfo {
  // ... existing fields ...
  hcpStartDate?: string;
  hcpEndDate?: string;
}
