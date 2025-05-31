#!/usr/bin/env node

/**
 * Cross-platform deployment script for Azure App Service
 * Works on both Linux and Windows environments
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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
    const deploymentTempDir = "./deployment-temp";
    ensureDir(deploymentTempDir);
    ensureDir(path.join(deploymentTempDir, "server"));
    ensureDir(path.join(deploymentTempDir, "client"));
    ensureDir(path.join(deploymentTempDir, "migrations"));
    
    // Clean up any existing files in deployment-temp
    const existingFiles = fs.readdirSync(deploymentTempDir, { withFileTypes: true })
      .filter(entry => !["server", "client", "migrations"].includes(entry.name));
      
    for (const entry of existingFiles) {
      const entryPath = path.join(deploymentTempDir, entry.name);
      if (entry.isDirectory()) {
        fs.rmSync(entryPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(entryPath);
      }
    }
    
    // Copy files to appropriate locations
    console.log("Copying files to deployment directory...");
      // Copy server's index.js to deployment-temp
    copyFile(
      path.join("server", "dist", "index.js"),
      path.join(deploymentTempDir, "index.js")
    );
      // Create a deployment-client directory for the built client files
    const deploymentClientDir = path.join("deployment-temp", "client");
    ensureDir(deploymentClientDir);
    
    // Copy client files to deployment-client directory
    copyDir(
      path.join("server", "dist", "client"),
      deploymentClientDir
    );
      // Copy migrations to deployment-temp
    copyDir(
      path.join("server", "dist", "migrations"),
      path.join(deploymentTempDir, "migrations")
    );
      // Copy configuration files
    copyFile(
      path.join("server", "production.env"),
      path.join(deploymentTempDir, "production.env")
    );
    
    copyFile(
      "package.json",
      path.join(deploymentTempDir, "package.json")
    );
    
    copyFile(
      "web.config",
      path.join(deploymentTempDir, "web.config")
    );
    
    // Copy the server.js bootstrap file if it exists
    if (fs.existsSync("server.js")) {
      copyFile("server.js", path.join(deploymentTempDir, "server.js"));
    }
      console.log("Deployment build completed with Azure App Service structure");
    
    // Create a deployment zip file
    console.log("Creating deployment zip file...");
    const deploymentZipPath = "deployment.zip";
    
    // Check if we're on Windows
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Use PowerShell to create zip on Windows
      const powershellCommand = `powershell -Command "Compress-Archive -Path '${deploymentTempDir}\\*' -DestinationPath '${deploymentZipPath}' -Force"`;
      runCommand(powershellCommand);
    } else {
      // Use zip command on Linux/macOS
      runCommand(`cd ${deploymentTempDir} && zip -r ../${deploymentZipPath} .`);
    }
    
    console.log(`Deployment zip created at: ${deploymentZipPath}`);
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