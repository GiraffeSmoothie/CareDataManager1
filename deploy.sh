#!/bin/bash

# Navigate to the deployment directory
cd "$DEPLOYMENT_TARGET"

# Build client
echo "Building client..."
cd client
npm install
npm run build
cd ..

# Create client directory in wwwroot if it doesn't exist
mkdir -p /home/site/wwwroot/client

# Copy client build files
echo "Copying client build files..."
cp -r client/dist/* /home/site/wwwroot/client/

# Install server dependencies
echo "Installing server dependencies..."
cd server
npm install --production

# Run database migrations if environment is configured
if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations..."
  for migration in migrations/*.sql; do
    echo "Applying migration: $migration"
    psql "$DATABASE_URL" -f "$migration"
  done
fi

# Start the application
pm2 start index.js --name care-data-manager