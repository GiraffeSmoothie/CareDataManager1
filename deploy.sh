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

# Copy client build to server's public directory
echo "Copying client build to server's public directory..."
mkdir -p ../server/dist/public
cp -r dist/* ../server/dist/public/
echo "Client build copied to server's public directory"

# Copy production.env to server's dist directory
echo "Copying environment files..."
cp production.env ../server/dist/
echo "Environment files copied"

# Copy web.config to the right place
echo "Copying web.config..."
cp ../web.config ../server/dist/
echo "web.config copied"

# Final log
echo "Deployment build completed"