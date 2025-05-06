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

# Create the deployment structure
echo "Creating deployment structure..."
cd ..
mkdir -p dist/public

# Copy server build to dist
echo "Copying server build to dist..."
cp -r server/dist/* dist/
echo "Server build copied"

# Copy client build to public directory
echo "Copying client build to public directory..."
cp -r client/dist/* dist/public/
echo "Client build copied"

# Copy environment files
echo "Copying environment files..."
cp server/production.env dist/
echo "Environment files copied"

# Copy web.config to the right place
echo "Copying web.config..."
cp web.config dist/
echo "web.config copied"

# Final log
echo "Deployment build completed"