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

# Go to project root
echo "Switching to project root..."
cd ..

# Copy server build output to root (index.js and all required files)
echo "Copying server build output to root..."
cp server/dist/index.js ./index.js
cp -r server/dist/* ./
echo "Server build copied"

# Copy client build to public/
echo "Copying client build to public/ ..."
mkdir -p public
cp -r client/dist/* public/
echo "Client build copied"

# Copy environment files if needed
echo "Copying environment files..."
cp server/production.env ./production.env
echo "Environment files copied"

# Copy web.config to root
echo "Copying web.config..."
cp web.config ./
echo "web.config copied"

# Final log
echo "Deployment build completed"