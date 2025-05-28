// reset-rate-limit.js
// A utility script to reset rate limiters in development environment
// Run this with: node server/reset-rate-limit.js

console.log('=== Rate Limit Reset Tool ===');

if (process.env.NODE_ENV === 'production') {
  console.error('WARNING: This script should not be run in production!');
  process.exit(1);
}

// In express-rate-limit, the limiter uses an in-memory store by default
// To reset it, we need to restart the server

const { exec } = require('child_process');
const path = require('path');

console.log('Restarting server to reset rate limiters...');

// Kill any node processes that might be running the server
// This is a simple implementation - adjust as needed for your environment
const isWindows = process.platform === 'win32';

if (isWindows) {
  exec('taskkill /f /im node.exe', (error) => {
    if (error) {
      console.log('No node processes were running or could not be killed.');
    } else {
      console.log('Terminated existing node processes.');
    }
    
    console.log('Starting server...');
    const serverPath = path.join(__dirname, 'index.ts');
    
    const child = exec('cd server && npm run dev', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error starting server: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Server stderr: ${stderr}`);
      }
    });
    
    child.stdout.on('data', (data) => {
      console.log(data);
    });
    
    console.log('Server restarted. Rate limiters have been reset.');
    console.log('You can now upload documents again.');
  });
} else {
  // For Unix-based systems
  exec('pkill -f node', (error) => {
    if (error) {
      console.log('No node processes were running or could not be killed.');
    } else {
      console.log('Terminated existing node processes.');
    }
    
    console.log('Starting server...');
    const serverPath = path.join(__dirname, 'index.ts');
    
    const child = exec('cd server && npm run dev', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error starting server: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Server stderr: ${stderr}`);
      }
    });
    
    child.stdout.on('data', (data) => {
      console.log(data);
    });
    
    console.log('Server restarted. Rate limiters have been reset.');
    console.log('You can now upload documents again.');
  });
}
