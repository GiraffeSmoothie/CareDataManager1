#!/bin/bash

# Exit on error
set -e

# Navigate to the deployment directory
cd "$DEPLOYMENT_TARGET"

# Ensure NODE_ENV is set to production
export NODE_ENV=production

# Build client
echo "Building client..."
cd client
npm install
npm run build
cd ..

# Build server
echo "Building server..."
cd server
npm install
npm run build
cd ..

# Create directories in wwwroot if they don't exist
mkdir -p /home/site/wwwroot/client/dist
mkdir -p /home/site/wwwroot/server/dist

# Copy client build files with proper permissions
echo "Copying client build files..."
cp -r client/dist/* /home/site/wwwroot/client/dist/

# Copy server build files with proper permissions
echo "Copying server build files..."
cp -r server/dist/* /home/site/wwwroot/server/dist/
cp server/web.config /home/site/wwwroot/server/
cp server/package.json /home/site/wwwroot/server/

# Install server production dependencies in the deployment location
echo "Installing server production dependencies..."
cd /home/site/wwwroot/server
npm install --production

# Set proper permissions for the application
chmod -R 755 /home/site/wwwroot

# Run database migrations if environment is configured
if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations..."
  for migration in migrations/*.sql; do
    echo "Applying migration: $migration"
    psql "$DATABASE_URL" -f "$migration"
  done
fi

# Start the application from the correct dist location
export PORT=8080
pm2 delete care-data-manager || true
pm2 start dist/index.js --name care-data-manager -- --port $PORT