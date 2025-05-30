import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enhanced environment variable loading system
console.log('Current directory:', __dirname);
console.log('Node Environment:', process.env.NODE_ENV);

// Initialize global error handlers first (before anything else)
import './src/middleware/global-error-handler';

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? 'production.env' : 'development.env';
dotenv.config({ path: envFile });

console.log('Environment:', process.env.NODE_ENV);
// Note: In production, we use Azure Managed Identity for database connections
console.log('Database connection mode:', process.env.NODE_ENV === 'production' ? 'Azure Managed Identity' : 'DATABASE_URL');

// Import remaining dependencies
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { getPool } from './storage';
import { performanceMiddleware } from './src/middleware/performance';
import { errorHandler } from './src/middleware/error';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.enable('trust proxy');

// Add performance monitoring middleware early in the stack
app.use(performanceMiddleware);

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
    console.log('Attempting to connect to database...');
    // Connect to the database
    const pool = await getPool();
    client = await pool.connect();
    console.log('Database connection established');
    
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
    console.log('Starting server initialization...');
    // Initialize database first
    await initializeDatabase();
    console.log('Database initialized successfully');    console.log('Registering routes...');
    const server = await registerRoutes(app);
    console.log('Routes registered successfully');

    // Add error handling middleware at the end
    app.use(errorHandler);

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      // Serve static files from server/dist/client
      const clientPath = path.resolve(__dirname, 'client');
      console.log('Serving static files from:', clientPath);

      app.use(express.static(clientPath, {
        maxAge: '1d',
        setHeaders: (res, path) => {
          if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        }
      }));

      // SPA fallback
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
          return next();
        }
        const indexPath = path.join(clientPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath, err => {
            if (err) {
              console.error('Error serving index.html:', err);
              res.status(500).send('Error loading application');
            }
          });
        } else {
          console.error('index.html not found at:', indexPath);
          res.status(404).send('Application files not found. Please check deployment.');
        }
      });
    }

    // Use port from environment variable or default to 3000
    const port = process.env.WEBSITES_PORT || process.env.PORT || 3000;
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
