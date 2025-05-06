import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import { fileURLToPath } from 'url';
import fsExtra from 'fs-extra';
const { copySync, existsSync } = fsExtra;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const viteConfig = {
  root: path.join(__dirname, "..", "client"),
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true
  }
};

export const viteLogger = createLogger();

export async function setupVite(app: Express, server: Server) {
  if (process.env.NODE_ENV === "development") {
    const vite = await createViteServer({
      ...viteConfig,
      configFile: false,
      server: {
        middlewareMode: true,
        hmr: { server },
        allowedHosts: true
      },
      appType: "custom",
      customLogger: viteLogger
    });

    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const template = await fs.promises.readFile(
          path.resolve(__dirname, "../client/index.html"),
          "utf-8"
        );
        const transformedTemplate = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(transformedTemplate);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }
}

export function serveStatic(app: Express) {
  const clientDistPath = path.resolve(__dirname, "client");
  
  // Create the client dist directory if it doesn't exist
  if (!fs.existsSync(clientDistPath)) {
    fs.mkdirSync(clientDistPath, { recursive: true });
  }

  app.use(express.static(clientDistPath));

  // SPA fallback
  app.use("*", (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.resolve(clientDistPath, "index.html"));
    }
  });
}

export function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}
