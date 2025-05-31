// Test production server without vite dependency
process.env.NODE_ENV = 'production';
console.log('Testing production server build...');
console.log('NODE_ENV:', process.env.NODE_ENV);

import('./dist/index.js')
  .then(() => {
    console.log('✅ Production server imported successfully');
    console.log('✅ No vite dependency required in production');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Production server test failed:', error.message);
    process.exit(1);
  });
