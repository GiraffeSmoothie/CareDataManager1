#!/bin/bash

# Install dependencies for server
cd server
npm install

# Build server
npm run build

# Install dependencies for client
cd ../client
npm install

# Build client
npm run build

# Copy client build to server's public folder
cp -r dist ../server/dist/client/

# Return to server directory
cd ../server

# Start the application
npm run start