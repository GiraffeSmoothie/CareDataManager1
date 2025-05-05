import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger, defineConfig } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { fileURLToPath } from 'url';
import fsExtra from 'fs-extra';
const { copySync, existsSync } = fsExtra;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const rootDir = path.resolve(__dirname, '..');
  const clientDistPath = path.resolve(rootDir, 'client/dist');
  const serverPublicPath = path.resolve(rootDir, 'server/dist/public');

  // Create the public directory if it doesn't exist
  if (!fs.existsSync(serverPublicPath)) {
    fs.mkdirSync(serverPublicPath, { recursive: true });
    // Copy client dist contents to server public folder
    if (fs.existsSync(clientDistPath)) {
      fsExtra.copySync(clientDistPath, serverPublicPath);
    } else {
      throw new Error(`Could not find the client build directory: ${clientDistPath}, make sure to build the client first`);
    }
  }

  app.use(express.static(serverPublicPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(serverPublicPath, "index.html"));
  });
}

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: [
        'express',
        'pg',
        'dotenv',
        'cors',
        'body-parser'
      ],
      output: {
        format: 'cjs',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    writeBundle() {
      const clientDist = path.resolve(__dirname, '../../client/dist');
      const serverPublic = path.resolve(__dirname, 'dist/public');

      if (existsSync(clientDist)) {
        copySync(clientDist, serverPublic, { overwrite: true });
        console.log(`Copied client build output from ${clientDist} to ${serverPublic}`);
      } else {
        console.warn(`Client build output not found at ${clientDist}. Please build the client first.`);
      }
    }
  },
  server: {
    strictPort: true,
    host: true,
    port: 3001,
    hmr: {
      server: true
    },
    allowedHosts: true
  }
});
