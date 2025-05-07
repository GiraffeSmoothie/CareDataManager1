// This file serves as the entry point for Azure App Service
// Use CommonJS require to load the ESM application, which has better IIS compatibility
// First check if we need to register for ESM support
if (process.env.NODE_OPTIONS === undefined) {
  process.env.NODE_OPTIONS = '--experimental-modules';
}

// Wrap the import in a function to catch any errors
try {
  console.log('Starting application from server.js');
  console.log('Current directory:', process.cwd());
  console.log('Server dist folder exists:', require('fs').existsSync('./server/dist'));
  console.log('Server index.js exists:', require('fs').existsSync('./server/dist/index.js'));
  
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