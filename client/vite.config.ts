import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import * as dotenv from 'dotenv';

const envFile = process.env.NODE_ENV === 'production' ? 'production.env' : 'development.env';
const envPath = path.resolve(__dirname, envFile);
dotenv.config({ path: envPath });

export default defineConfig({
  plugins: [react()],
  base: "/",
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
  },
  server: {
    port: 5173,
    proxy: {      '/api': {
        target: 'http://localhost:3000', // Corrected to match actual server port
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path) => path, // Keep this to ensure paths are preserved exactly
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('Sending Request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req) => { 
            console.log('Received Response:', proxyRes.statusCode, 'for', req.url);
          });
        }
      }
    }
  }
});