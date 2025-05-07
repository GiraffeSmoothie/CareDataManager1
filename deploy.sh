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

# Create deployment directory structure
echo "Creating deployment structure..."
cd ..
rm -rf dist
mkdir -p dist/client
mkdir -p dist/migrations

# Copy built files to deployment directory
echo "Copying files to deployment directory..."

# Copy server's index.js to root level of dist
cp server/dist/index.js dist/index.js

# Copy client files to dist/client
cp -r server/dist/client/* dist/client/

# Copy migrations to dist/migrations
cp -r server/dist/migrations/* dist/migrations/

# Copy configuration files
cp server/production.env dist/production.env
cp package.json dist/package.json
cp web.config dist/web.config

echo "Deployment build completed with Azure App Service structure"