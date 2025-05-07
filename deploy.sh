#!/bin/bash

# Exit on error
set -e

echo "Starting deployment script"

# Log Node and NPM versions
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install dependencies for server
echo "Installing server dependencies..."
cd server
npm install --production
echo "Server dependencies installed"

# Build server
echo "Building server..."
npm run build
echo "Server build completed"

# Install dependencies for client
echo "Installing client dependencies..."
cd ../client
npm install --production
echo "Client dependencies installed"

# Build client
echo "Building client..."
npm run build
echo "Client build completed"

# Go back to root
cd ..

# Create deployment structure at root level
echo "Creating deployment structure..."

# Ensure client directory exists
mkdir -p client
mkdir -p migrations

# Copy built files to deployment directory
echo "Copying files to deployment directory..."

# Copy server's index.js to root level
cp server/dist/index.js index.js

# Copy client files to client directory
cp -r server/dist/client/* client/

# Copy migrations
cp -r server/dist/migrations/* migrations/

# Copy configuration files
cp server/production.env production.env
cp package.json package.json
cp web.config web.config

echo "Deployment build completed with Azure App Service structure"