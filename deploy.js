#!/usr/bin/env node

/**
 * Cross-platform deployment script for Azure App Service
 * Works on both Linux and Windows environments
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Helper function to run a command and log its output
function runCommand(command, cwd = process.cwd()) {
  console.log(`Running: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', cwd });
    return true;
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.message);
    return false;
  }
}

// Helper function to create directory if it doesn't exist
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Helper function to copy file
function copyFile(src, dest) {
  console.log(`Copying file: ${src} -> ${dest}`);
  fs.copyFileSync(src, dest);
}

// Helper function to copy directory recursively
function copyDir(src, dest) {
  console.log(`Copying directory: ${src} -> ${dest}`);
  ensureDir(dest);
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

// Main deployment function
async function deploy() {
  try {
    console.log("Starting deployment script");
    
    // Log Node and NPM versions
    runCommand("node -v");
    runCommand("npm -v");
    
    // Install and build server
    console.log("Installing server dependencies...");
    runCommand("npm install --production", "./server");
    
    console.log("Building server...");
    runCommand("npm run build", "./server");
    
    // Install and build client
    console.log("Installing client dependencies...");
    runCommand("npm install --production", "./client");
    
    console.log("Building client...");
    runCommand("npm run build", "./client");
    
    // Create deployment structure
    console.log("Creating deployment structure...");
    
    // Create required directories
    ensureDir("./client");
    ensureDir("./migrations");
    
    // Copy files to appropriate locations
    console.log("Copying files to deployment directory...");
    
    // Copy server's index.js to root level
    copyFile(
      path.join("server", "dist", "index.js"),
      "index.js"
    );
    
    // Copy client files to client directory
    copyDir(
      path.join("server", "dist", "client"),
      "client"
    );
    
    // Copy migrations
    copyDir(
      path.join("server", "dist", "migrations"),
      "migrations"
    );
    
    // Copy configuration files
    copyFile(
      path.join("server", "production.env"),
      "production.env"
    );
    
    copyFile(
      "package.json",
      "package.json"
    );
    
    copyFile(
      "web.config",
      "web.config"
    );
    
    // Copy the server.js bootstrap file if it exists
    if (fs.existsSync("server.js")) {
      copyFile("server.js", "server.js");
    }
    
    console.log("Deployment build completed with Azure App Service structure");
    return true;
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

// Run the deployment
deploy().catch(err => {
  console.error("Deployment error:", err);
  process.exit(1);
});