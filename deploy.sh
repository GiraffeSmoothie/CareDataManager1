#!/bin/bash

# Navigate to the deployment directory
cd "$DEPLOYMENT_TARGET"

# Install production dependencies
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