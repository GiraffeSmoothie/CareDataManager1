#!/bin/bash

# Exit on error
set -e

echo "Starting deployment script"

# Check if required tools are available
command -v node >/dev/null 2>&1 || { echo "Error: node is required but not installed."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required but not installed."; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "Error: zip is required but not installed."; exit 1; }

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
if [ $? -ne 0 ]; then
    echo "Error: Server build failed"
    exit 1
fi
echo "✓ Server build completed successfully"

# Verify server build output
if [ ! -f "dist/index.js" ]; then
    echo "Error: Server build did not produce expected index.js file"
    exit 1
fi

# Install dependencies for client (full dependencies needed for build)
echo "Installing client dependencies..."
cd ../client
npm install
echo "Client dependencies installed"

# Build client
echo "Building client..."
npm run build
if [ $? -ne 0 ]; then
    echo "Error: Client build failed"
    exit 1
fi
echo "✓ Client build completed successfully"

# Verify client build output (check for the configured output location)
if [ -d "../server/dist/client" ]; then
    echo "✓ Client build found in server/dist/client (Vite configured output)"
elif [ -d "dist" ]; then
    echo "✓ Client build found in client/dist (default output)"
else
    echo "Error: Client build did not produce expected output directory"
    exit 1
fi

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

# Copy server's built index.js as server.js (for web.config compatibility)
if [ -f "server/dist/index.js" ]; then
    cp server/dist/index.js deployment-temp/server.js
    echo "Copied server build to deployment-temp/server.js"
else
    echo "Error: server/dist/index.js not found"
    exit 1
fi

# Copy client built files to client directory
if [ -d "server/dist/client" ]; then
    cp -r server/dist/client/* deployment-temp/client/
    echo "Copied client build files to deployment-temp/client/"
elif [ -d "client/dist" ]; then
    cp -r client/dist/* deployment-temp/client/
    echo "Copied client build files from client/dist to deployment-temp/client/"
else
    echo "Error: Neither server/dist/client nor client/dist directory found"
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

# Fix package.json for Azure deployment - move cross-env to dependencies
echo "Fixing package.json for Azure deployment..."
cd deployment-temp
# Fix package.json for Azure deployment using Node.js one-liner
node -e "const fs=require('fs'); let pkg=JSON.parse(fs.readFileSync('package.json','utf8')); delete pkg.type; pkg.dependencies=pkg.dependencies||{}; pkg.dependencies['cross-env']='^7.0.3'; if(pkg.devDependencies && pkg.devDependencies['cross-env']) delete pkg.devDependencies['cross-env']; pkg.main='server.js'; pkg.scripts.start='cross-env NODE_ENV=production node server.js'; pkg.scripts['start:azure']='NODE_ENV=production node server.js'; fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)); console.log('✓ Fixed package.json for Azure deployment');"
cd ..

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

# Clean up any unnecessary files/directories
echo "Cleaning up deployment structure..."
rm -rf deployment-temp/server 2>/dev/null || true
rm -rf deployment-temp/client/dist 2>/dev/null || true
rm -rf deployment-temp/node_modules 2>/dev/null || true

# Remove any duplicate or development files
find deployment-temp -name "*.ts" -delete 2>/dev/null || true
find deployment-temp -name "*.map" -delete 2>/dev/null || true
find deployment-temp -name ".git*" -delete 2>/dev/null || true
find deployment-temp -name "README*" -delete 2>/dev/null || true

# Install only production dependencies in deployment directory
echo "Installing production dependencies..."
cd deployment-temp
npm install --production --omit=dev
cd ..

# Create deployment zip file
echo "Creating deployment archive..."

# Final cleanup - ensure no development artifacts remain
echo "Final cleanup of deployment structure..."
rm -rf deployment-temp/server 2>/dev/null || true
rm -rf deployment-temp/node_modules 2>/dev/null || true
rm -rf deployment-temp/.git* 2>/dev/null || true
rm -rf deployment-temp/src 2>/dev/null || true
rm -rf deployment-temp/tests 2>/dev/null || true
rm -rf deployment-temp/*.md 2>/dev/null || true

# Remove any TypeScript files or source maps
find deployment-temp -name "*.ts" -type f -delete 2>/dev/null || true
find deployment-temp -name "*.map" -type f -delete 2>/dev/null || true
find deployment-temp -name "*.env" ! -name "production.env" -type f -delete 2>/dev/null || true

# Ensure correct Azure App Service structure
echo "Final deployment structure should contain:"
echo "- server.js (server entry point)"
echo "- package.json (production dependencies)"
echo "- client/ (React app)"
echo "- migrations/ (database files)"
echo "- production.env (environment config)"
echo "- web.config (Azure config)"

# Validate deployment structure before zipping
echo "Validating deployment structure..."
if [ ! -f "deployment-temp/server.js" ]; then
    echo "Error: server.js not found in deployment directory"
    exit 1
fi

if [ ! -f "deployment-temp/package.json" ]; then
    echo "Error: package.json not found in deployment directory"
    exit 1
fi

if [ ! -d "deployment-temp/client" ]; then
    echo "Error: client directory not found in deployment directory"
    exit 1
fi

if [ ! -f "deployment-temp/client/index.html" ]; then
    echo "Error: client/index.html not found in deployment directory"
    exit 1
fi

echo "✓ Deployment structure validation passed"

cd deployment-temp
zip -r ../deployment.zip ./*
cd ..

# Verify zip file was created
if [ ! -f "deployment.zip" ]; then
    echo "Error: Failed to create deployment.zip"
    exit 1
fi

echo "✓ Deployment zip file created successfully"

echo "Deployment build completed successfully!"
echo "Created deployment.zip with Azure App Service structure"
echo "Deployment structure contents:"
ls -la deployment-temp/
echo ""
echo "Deployment zip file created:"
ls -lh deployment.zip