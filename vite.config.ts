import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import * as dotenv from 'dotenv';

const envFile = process.env.NODE_ENV === 'production' ? 'production.env' : 'development.env';
const envPath = path.resolve(__dirname, envFile);
dotenv.config({ path: envPath });

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000", // Backend port
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode);
          });
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  build: {
    outDir: path.resolve(__dirname, '../server/dist/client'),
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== 'production'
  }
});
