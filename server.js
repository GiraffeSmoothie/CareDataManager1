// This file serves as the entry point for Azure App Service
// It simply imports and runs the actual application from its location
import('./server/dist/index.js').catch(err => {
  console.error('Failed to start application:', err);
  process.exit(1);
});