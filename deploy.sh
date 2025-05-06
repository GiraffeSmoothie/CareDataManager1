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

# Create client directory in wwwroot if it doesn't exist
mkdir -p /home/site/wwwroot/client/dist

# Copy client build files with proper permissions
echo "Copying client build files..."
cp -r client/dist/* /home/site/wwwroot/client/dist/
chmod -R 755 /home/site/wwwroot/client

# Install server dependencies
echo "Installing server dependencies..."
cd server
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

# Start the application
export PORT=8080
pm2 delete care-data-manager || true
pm2 start index.js --name care-data-manager -- --port $PORT