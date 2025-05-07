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
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== 'production'
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});