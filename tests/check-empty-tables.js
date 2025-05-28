// Check empty tables - performance_logs and error_logs
const { Client } = require('pg');

async function checkEmptyTables() {  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'CareDataManager1',
    password: 'postgres',
    port: 5432,
  });

  try {
    await client.connect();
    console.log('🔍 INVESTIGATING EMPTY TABLES');
    console.log('===============================\n');

    // Check if performance_logs table exists and get its structure
    console.log('📊 PERFORMANCE_LOGS TABLE:');
    try {
      const performanceSchema = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'performance_logs' 
        ORDER BY ordinal_position
      `);
      
      if (performanceSchema.rows.length > 0) {
        console.log('   ✅ Table exists');
        console.log('   📋 Schema:');
        performanceSchema.rows.forEach(col => {
          console.log(`      - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : '(NULLABLE)'}`);
        });
        
        const performanceCount = await client.query('SELECT COUNT(*) as count FROM performance_logs');
        console.log(`   📈 Current entries: ${performanceCount.rows[0].count}`);
      } else {
        console.log('   ❌ Table does not exist');
      }
    } catch (error) {
      console.log('   ❌ Error accessing performance_logs:', error.message);
    }

    console.log();

    // Check if error_logs table exists and get its structure
    console.log('🚨 ERROR_LOGS TABLE:');
    try {
      const errorSchema = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'error_logs' 
        ORDER BY ordinal_position
      `);
      
      if (errorSchema.rows.length > 0) {
        console.log('   ✅ Table exists');
        console.log('   📋 Schema:');
        errorSchema.rows.forEach(col => {
          console.log(`      - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : '(NULLABLE)'}`);
        });
        
        const errorCount = await client.query('SELECT COUNT(*) as count FROM error_logs');
        console.log(`   📈 Current entries: ${errorCount.rows[0].count}`);
      } else {
        console.log('   ❌ Table does not exist');
      }
    } catch (error) {
      console.log('   ❌ Error accessing error_logs:', error.message);
    }

    console.log();

    // List all tables to see what logging tables exist
    console.log('🗂️  ALL LOGGING TABLES:');
    const allTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%log%'
      ORDER BY table_name
    `);
    
    allTables.rows.forEach(table => {
      console.log(`   - ${table.table_name}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkEmptyTables();
