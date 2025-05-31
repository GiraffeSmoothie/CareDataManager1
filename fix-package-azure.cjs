const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

console.log('Fixing package.json for Azure deployment...');

// Move cross-env from devDependencies to dependencies if it exists
if (pkg.devDependencies && pkg.devDependencies['cross-env']) {
  if (!pkg.dependencies) pkg.dependencies = {};
  pkg.dependencies['cross-env'] = pkg.devDependencies['cross-env'];
  delete pkg.devDependencies['cross-env'];
  console.log('✓ Moved cross-env to dependencies');
} else {
  // Add cross-env to dependencies if it's missing but needed
  if (!pkg.dependencies) pkg.dependencies = {};
  pkg.dependencies['cross-env'] = '^7.0.3';
  console.log('✓ Added cross-env to dependencies');
}

// Set the main entry point to server.js for web.config compatibility
pkg.main = 'server.js';

// Create Azure-compatible start script as fallback
pkg.scripts['start:azure'] = 'NODE_ENV=production node server.js';

// Update main start script to work with server.js
if (pkg.scripts.start && pkg.scripts.start.includes('cross-env')) {
  // Keep the original but update path
  pkg.scripts['start:original'] = pkg.scripts.start;
  pkg.scripts.start = 'cross-env NODE_ENV=production node server.js';
} else {
  pkg.scripts.start = 'NODE_ENV=production node server.js';
}

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✓ Fixed package.json for Azure deployment');
