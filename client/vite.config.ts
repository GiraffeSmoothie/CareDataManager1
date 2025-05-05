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
        format: 'es',
        entryFileNames: 'assets/[name].[hash].mjs',
        chunkFileNames: 'assets/[name].[hash].mjs',
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    }
  },
  server: {
    strictPort: true,
    host: true,
    port: 3000
  },
  preview: {
    strictPort: true,
    port: 5173
  }
});