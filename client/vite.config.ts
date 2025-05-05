import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

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
    outDir: './dist',
    emptyOutDir: true,
    modulePreload: {
      polyfill: true
    },
    sourcemap: true,
    manifest: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  server: {
    strictPort: true,
    host: true,
    port: 3000,
    headers: {
      'Content-Type': 'text/javascript'
    }
  },
  preview: {
    strictPort: true,
    port: 5173,
    headers: {
      'Content-Type': 'text/javascript'
    }
  }
});