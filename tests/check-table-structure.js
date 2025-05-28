const pg = require('pg');

async function checkTableStructure() {
  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    database: 'CareDataManager1',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check audit_logs table structure
    const tableStructure = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'audit_logs' 
      ORDER BY ordinal_position
    `);
    
    console.log('audit_logs table structure:');
    tableStructure.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

    // Test a simple insert to audit_logs
    console.log('\nTesting manual insert to audit_logs...');
    try {
      const testInsert = await client.query(`
        INSERT INTO audit_logs (
          user_id, username, action, resource_type, resource_id, 
          ip_address, user_agent, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
      `, [
        1, 'admin', 'TEST_ACTION', 'TEST_RESOURCE', '1',
        '127.0.0.1', 'test-agent', new Date(), '{}'
      ]);
      
      console.log('Manual insert successful, ID:', testInsert.rows[0].id);
      
      // Delete the test record
      await client.query('DELETE FROM audit_logs WHERE id = $1', [testInsert.rows[0].id]);
      console.log('Test record cleaned up');
      
    } catch (insertError) {
      console.error('Manual insert failed:', insertError.message);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkTableStructure();
