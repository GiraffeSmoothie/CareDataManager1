import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertMasterDataSchema, insertPersonInfoSchema } from "@shared/schema";
import session from "express-session";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import crypto from "crypto";

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
  const admin = await storage.getUserByUsername("admin");
  if (!admin) {
    // Create default admin user
    await storage.createUser({
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize session
  app.use(
    session({
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
      
      const user = await storage.getUserByUsername(username);
      
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

  // Master data routes
  app.post("/api/master-data", authMiddleware, async (req: Request, res: Response) => {
    try {
      const validatedData = insertMasterDataSchema.parse(req.body);
      
      // Add the current user as the creator
      const masterDataWithUser = {
        ...validatedData,
        createdBy: req.session.user!.id,
      };
      
      const createdData = await storage.createMasterData(masterDataWithUser);
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
      const masterData = await storage.getAllMasterData();
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
      
      const createdData = await storage.createPersonInfo(personInfoWithUser);
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
      const personInfo = await storage.getAllPersonInfo();
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
      
      const personInfo = await storage.getPersonInfoById(id);
      if (!personInfo) {
        return res.status(404).json({ message: "Person info not found" });
      }
      
      return res.status(200).json(personInfo);
    } catch (error) {
      console.error("Error fetching person info:", error);
      return res.status(500).json({ message: "Failed to fetch person info" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
