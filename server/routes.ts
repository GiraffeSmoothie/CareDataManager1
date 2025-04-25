import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage as dbStorage } from "./storage";
import { insertUserSchema, insertMasterDataSchema, insertPersonInfoSchema, insertCaseNoteSchema, insertDocumentSchema } from "@shared/schema";
import session from "express-session";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import pgSession from "connect-pg-simple"; // You need to install this
import pg from "pg"; // Use Pool for connection pooling
const { Pool } = pg; // Destructure Pool from the default export

declare module "express-session" {
  interface SessionData {
    user: {
      id: number;
      username: string;
    };
  }
}

// Initialize users if none exist
async function initializeUsers() {
  const admin = await dbStorage.getUserByUsername("admin");
  if (!admin) {
    // Create default admin user
    await dbStorage.createUser({
      username: "admin",
      password: hashPassword("password"),
    });
    console.log("Default admin user created");
  }
}

// Helper function to hash passwords
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const PgStore = pgSession(session);
export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize session store
  const pgStore = new PgStore({
    pool: pool,
    tableName: 'user_sessions',
  });

  // Initialize session
  app.use(
    session({
      store: pgStore,
      secret: process.env.SESSION_SECRET || "care-system-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
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

  app.get("/api/auth/status", (req: Request, res: Response) => {
    if (req.session.user) {
      return res.status(200).json({ authenticated: true, user: req.session.user });
    }
    return res.status(401).json({ authenticated: false });
  });

  // Auth middleware for protected routes
  const authMiddleware = (req: Request, res: Response, next: Function) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };
  
  // Setup file upload
  const uploadsDir = path.join(process.cwd(), "uploads");
  
  // Create uploads directory if it doesn't exist
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + "-" + uniqueSuffix + ext);
    },
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

  // Master data routes
  app.post("/api/master-data", authMiddleware, async (req: Request, res: Response) => {
    try {
      const validatedData = insertMasterDataSchema.parse(req.body);
      
      // Add the current user as the creator
      const masterDataWithUser = {
        ...validatedData,
        createdBy: req.session.user!.id,
      };
      
      const createdData = await dbStorage.createMasterData(masterDataWithUser);
      return res.status(201).json(createdData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      console.error("Error creating master data:", error);
      return res.status(500).json({ message: "Failed to create master data" });
    }
  });

  app.get("/api/master-data", authMiddleware, async (req: Request, res: Response) => {
    try {
      const masterData = await dbStorage.getAllMasterData();
      return res.status(200).json(masterData);
    } catch (error) {
      console.error("Error fetching master data:", error);
      return res.status(500).json({ message: "Failed to fetch master data" });
    }
  });

  // Person Info routes
  app.post("/api/person-info", authMiddleware, async (req: Request, res: Response) => {
    try {
      const validatedData = insertPersonInfoSchema.parse(req.body);
      
      // Add the current user as the creator
      const personInfoWithUser = {
        ...validatedData,
        createdBy: req.session.user!.id,
      };
      
      const createdData = await dbStorage.createPersonInfo(personInfoWithUser);
      return res.status(201).json(createdData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      console.error("Error creating person info:", error);
      return res.status(500).json({ message: "Failed to create person info" });
    }
  });

  app.get("/api/person-info", authMiddleware, async (req: Request, res: Response) => {
    try {
      const personInfo = await dbStorage.getAllPersonInfo();
      return res.status(200).json(personInfo);
    } catch (error) {
      console.error("Error fetching person info:", error);
      return res.status(500).json({ message: "Failed to fetch person info" });
    }
  });

  app.get("/api/person-info/:id", authMiddleware, async (req: Request, res: Response) => {
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
  
  // Update member assignment status
  app.patch("/api/member-assignment/:id", authMiddleware, async (req: Request, res: Response) => {
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
  app.post("/api/member-assignment", authMiddleware, upload.single("document"), async (req: Request, res: Response) => {
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
        careCategory,
        careType,
        active: true,
        notes: notes || "",
        memberId: memberIdNum,
        createdBy: req.session.user!.id,
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
  
  // Endpoint to get master data by member ID
  app.get("/api/master-data/member/:memberId", authMiddleware, async (req: Request, res: Response) => {
    try {
      const memberId = parseInt(req.params.memberId);
      if (isNaN(memberId)) {
        return res.status(400).json({ message: "Invalid member ID format" });
      }
      
      const masterData = await dbStorage.getMasterDataByMemberId(memberId);
      return res.status(200).json(masterData);
    } catch (error) {
      console.error("Error fetching master data for member:", error);
      return res.status(500).json({ message: "Failed to fetch master data for member" });
    }
  });

  // Endpoint to serve uploaded files
  app.get("/api/documents/:filename", authMiddleware, (req: Request, res: Response) => {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Document not found" });
    }
    
    // Send the file
    res.sendFile(filePath);
  });

  // Case Notes routes
  app.post("/api/case-notes", authMiddleware, async (req: Request, res: Response) => {
    try {
      const validatedData = insertCaseNoteSchema.parse(req.body);
      
      // Check if member exists
      const memberId = validatedData.memberId;
      const member = await dbStorage.getPersonInfoById(memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      // Add the current user as the creator
      const caseNoteWithUser = {
        ...validatedData,
        createdBy: req.session.user!.id,
      };
      
      const createdNote = await dbStorage.createCaseNote(caseNoteWithUser);
      return res.status(201).json(createdNote);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      console.error("Error creating case note:", error);
      return res.status(500).json({ message: "Failed to create case note" });
    }
  });

  app.get("/api/case-notes/member/:memberId", authMiddleware, async (req: Request, res: Response) => {
    try {
      const memberId = parseInt(req.params.memberId);
      if (isNaN(memberId)) {
        return res.status(400).json({ message: "Invalid member ID format" });
      }
      
      // Check if member exists
      const member = await dbStorage.getPersonInfoById(memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      const caseNotes = await dbStorage.getCaseNotesByMemberId(memberId);
      return res.status(200).json(caseNotes);
    } catch (error) {
      console.error("Error fetching case notes for member:", error);
      return res.status(500).json({ message: "Failed to fetch case notes for member" });
    }
  });

  // Document management routes
  app.post("/api/documents", authMiddleware, upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { memberId, documentName, documentType } = req.body;
      
      // Validation
      if (!memberId || !documentName || !documentType) {
        return res.status(400).json({ message: "Member ID, document name, and document type are required" });
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
      
      // Create document entry
      const documentData = {
        memberId: memberIdNum,
        documentName,
        documentType,
        createdBy: req.session.user!.id,
        filename: req.file.filename
      };
      
      const createdDocument = await dbStorage.createDocument(documentData);
      
      return res.status(201).json(createdDocument);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      console.error("Error uploading document:", error);
      return res.status(500).json({ message: "Failed to upload document" });
    }
  });

  app.get("/api/documents/member/:memberId", authMiddleware, async (req: Request, res: Response) => {
    try {
      const memberId = parseInt(req.params.memberId);
      if (isNaN(memberId)) {
        return res.status(400).json({ message: "Invalid member ID format" });
      }
      
      // Check if member exists
      const member = await dbStorage.getPersonInfoById(memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      const documents = await dbStorage.getDocumentsByMemberId(memberId);
      return res.status(200).json(documents);
    } catch (error) {
      console.error("Error fetching documents for member:", error);
      return res.status(500).json({ message: "Failed to fetch documents for member" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
