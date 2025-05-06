import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force load production environment variables
if (process.env.NODE_ENV === 'production') {
  const envPath = path.join(__dirname, '..', 'production.env');
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

// Verify DATABASE_URL is loaded
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

console.log('Environment:', process.env.NODE_ENV);
console.log('DATABASE_URL:', process.env.DATABASE_URL);

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from './storage';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Initialize database and run migrations
export async function initializeDatabase() {
  let client;
  try {
    // Connect to the database
    client = await pool.connect();
    
    // Run each migration file in sequence from the migrations folder
    const migrationsPath = path.resolve(__dirname, 'migrations'); // Fixed the path to avoid appending 'server' twice
    console.log('Migrations path:', migrationsPath);
    const migrationFiles = fs.readdirSync(migrationsPath).sort();
    
    for (const migrationFile of migrationFiles) {
      try {
        console.log(`Running migration: ${migrationFile}`);
        const migrationSQL = fs.readFileSync(path.join(migrationsPath, migrationFile), 'utf8');
        await client.query('BEGIN');
        await client.query(migrationSQL);
        await client.query('COMMIT');
        console.log(`Successfully completed migration: ${migrationFile}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error running migration ${migrationFile}:`, err);
        if (process.env.NODE_ENV !== 'production') {
          throw err;
        }
      }
    }
    
    console.log('Database migrations completed');
  } catch (err) {
    console.error('Database connection error:', err);
    throw err;
  } finally {
    if (client) {
      client.release();
    }
  }
}

(async () => {
  try {
    // Initialize database first
    await initializeDatabase();
    console.log('Database initialized successfully');

    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      // Serve static files from the client build
      app.use(express.static(path.join(__dirname, 'client')));
      
      // Handle client-side routing
      app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
          res.sendFile(path.join(__dirname, 'client/index.html'));
        }
      });
    }

    // Use port from environment variable (required for Azure App Service) or default to 3000
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
