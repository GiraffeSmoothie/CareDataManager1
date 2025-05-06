import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import * as dotenv from 'dotenv';

const envFile = process.env.NODE_ENV === 'production' ? 'client/production.env' : 'client/development.env';
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
    outDir: './dist', // Ensures client build output is in client/dist
    emptyOutDir: true,
    modulePreload: {
      polyfill: true
    },
    sourcemap: true,
    manifest: true,
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'assets/[name].[hash].mjs',
        chunkFileNames: 'assets/[name].[hash].mjs',
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    }
  },
  server: {
    port: 5173, // Client development server port for development
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // Proxy API requests to the server in development
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    strictPort: true,
    port: 5173
  }
});