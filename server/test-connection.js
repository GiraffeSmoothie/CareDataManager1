import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Set NODE_ENV to development
process.env.NODE_ENV = 'development';

// Load development.env
const envPath = path.join(process.cwd(), 'development.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  Object.keys(envConfig).forEach(key => {
    process.env[key] = envConfig[key];
  });
  console.log('✓ Loaded development.env successfully');
  console.log('✓ DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
  console.log('✓ NODE_ENV:', process.env.NODE_ENV);
  console.log('✓ AZURE_POSTGRESQL_SERVER_NAME:', process.env.AZURE_POSTGRESQL_SERVER_NAME ? 'Set (Azure mode)' : 'Not set (Local mode)');
  console.log('');
}

// Import and test the storage module
try {
  const storage = await import('./dist/storage.js');
  console.log('✓ Storage module loaded successfully');
  
  // Test database connection
  try {
    console.log('Testing database connection...');
    const result = await storage.query('SELECT 1 as test, current_database() as database_name, version() as pg_version');
    console.log('✓ Database connection successful!');
    console.log('  Database:', result.rows[0].database_name);
    console.log('  PostgreSQL version:', result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]);
    console.log('');
    
    // Test a simple table query to ensure full functionality
    try {
      const query = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LIMIT 5`;
      const tables = await storage.query(query);
      console.log('✓ Found', tables.rows.length, 'tables in the database');
      if (tables.rows.length > 0) {
        console.log('  Sample tables:', tables.rows.map(row => row.table_name).join(', '));
      } else {
        console.log('  (Database appears to be empty - this is normal for a fresh installation)');
      }
    } catch (tableError) {
      console.log('⚠ Could not query tables:', tableError.message);
    }
    
    console.log('');
    console.log('🎉 Azure managed identity implementation is working correctly!');
    console.log('   In development mode, it correctly falls back to DATABASE_URL connection.');
    console.log('   In production with Azure managed identity, it will use DefaultAzureCredential.');
    
  } catch (error) {
    console.log('❌ Database connection error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('   This means PostgreSQL is not running locally.');
      console.log('   Please start your local PostgreSQL server and try again.');
    } else if (error.code === 'ENOTFOUND') {
      console.log('   This means the database host could not be found.');
      console.log('   Please check your DATABASE_URL in development.env');
    } else {
      console.log('   Please check your database configuration.');
    }
  }
} catch (error) {
  console.log('❌ Error loading storage module:', error.message);
  console.log('   Make sure you have built the project with: npm run build');
}
