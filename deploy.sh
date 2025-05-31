#!/bin/bash

# Exit on error
set -e

echo "Starting deployment script"

# Log Node and NPM versions
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install dependencies for server (full dependencies needed for build)
echo "Installing server dependencies..."
cd server
npm install
echo "Server dependencies installed"

# Build server
echo "Building server..."
npm run build
echo "Server build completed"

# Install dependencies for client (full dependencies needed for build)
echo "Installing client dependencies..."
cd ../client
npm install
echo "Client dependencies installed"

# Build client
echo "Building client..."
npm run build
echo "Client build completed"

# Go back to root
cd ..

# Create deployment structure
echo "Creating deployment structure..."

# Remove any existing deployment directory
rm -rf deployment-temp
mkdir -p deployment-temp
mkdir -p deployment-temp/client
mkdir -p deployment-temp/migrations

# Copy built files to deployment directory
echo "Copying files to deployment structure..."

# Copy server's built index.js to deployment root
if [ -f "server/dist/index.js" ]; then
    cp server/dist/index.js deployment-temp/index.js
    echo "Copied server build to deployment-temp/index.js"
else
    echo "Error: server/dist/index.js not found"
    exit 1
fi

# Copy client built files to client directory
if [ -d "client/dist" ]; then
    cp -r client/dist/* deployment-temp/client/
    echo "Copied client build files to deployment-temp/client/"
else
    echo "Error: client/dist directory not found"
    exit 1
fi

# Copy migrations if they exist
if [ -d "server/dist/migrations" ]; then
    cp -r server/dist/migrations/* deployment-temp/migrations/
    echo "Copied migrations to deployment-temp/migrations/"
elif [ -d "migrations" ]; then
    cp -r migrations/* deployment-temp/migrations/
    echo "Copied root migrations to deployment-temp/migrations/"
else
    echo "Warning: No migrations found"
fi

# Copy necessary configuration files
echo "Copying configuration files..."

# Copy server package.json for production dependencies
cp server/package.json deployment-temp/package.json

# Copy environment file
if [ -f "server/production.env" ]; then
    cp server/production.env deployment-temp/production.env
elif [ -f "production.env" ]; then
    cp production.env deployment-temp/production.env
else
    echo "Warning: No production.env found"
fi

# Copy web.config if it exists
if [ -f "web.config" ]; then
    cp web.config deployment-temp/web.config
fi

# Copy server.js if it exists at root level
if [ -f "server.js" ]; then
    cp server.js deployment-temp/server.js
fi

# Install only production dependencies in deployment directory
echo "Installing production dependencies..."
cd deployment-temp
npm install --production --omit=dev
cd ..

# Create deployment zip file
echo "Creating deployment archive..."
cd deployment-temp
zip -r ../deployment.zip ./*
cd ..

echo "Deployment build completed successfully!"
echo "Created deployment.zip with Azure App Service structure"
echo "Contents:"
ls -la deployment-temp/