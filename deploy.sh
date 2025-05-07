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

# Consolidate files into dist folder
echo "Consolidating files into dist folder..."
cd ..
mkdir -p dist/client
mkdir -p dist/migrations

# Copy client build files to dist/client
cp -r client/dist/* dist/client/

# Copy server build files to dist
cp -r server/dist/* dist/

# Copy migrations to dist/migrations
cp -r server/migrations/* dist/migrations/

# Copy production.env to dist
cp server/production.env dist/production.env

# Copy package.json to dist
cp package.json dist/package.json

echo "Deployment build completed with Structure B."