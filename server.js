// This file serves as the entry point for Azure App Service
// Using ES modules syntax for compatibility with type: "module" in package.json
// First check if we need to register for ESM support
if (process.env.NODE_OPTIONS === undefined) {
  process.env.NODE_OPTIONS = '--experimental-modules';
}

// Import ES modules
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { join } from 'path';

// Get current file path and directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Wrap the import in a function to catch any errors
try {
  console.log('Starting application from server.js');
  console.log('Current directory:', process.cwd());
  
  // Use ES module compatible path checks
  const serverDistPath = join(process.cwd(), 'server', 'dist');
  const indexPath = join(serverDistPath, 'index.js');
  
  console.log('Server dist folder exists:', existsSync(serverDistPath));
  console.log('Server index.js exists:', existsSync(indexPath));
  
  // Import the application using dynamic import
  import('./server/dist/index.js')
    .catch(err => {
      console.error('Failed to import application:', err);
      process.exit(1);
    });
} catch (err) {
  console.error('Error in server.js bootstrap:', err);
  process.exit(1);
}