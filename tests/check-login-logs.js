// Login logs checker
const pg = require('pg');

async function checkLoginLogs() {
  console.log('Starting login logs check...');
    const pool = new pg.Pool({
    host: 'localhost',
    database: 'CareDataManager1',
    user: 'postgres',
    password: 'postgres',
    port: 5432,
  });

  try {
    console.log('📊 Checking Login Logs...');
    console.log('=========================');
    
    const result = await pool.query(`
      SELECT 
        id,
        username,
        user_id,
        login_type,
        failure_reason,
        ip_address,
        user_agent,
        company_id,
        created_at
      FROM login_logs 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      console.log('❌ No login logs found');
    } else {
      console.log(`✅ Found ${result.rows.length} login log entries:`);
      console.log('');
      
      result.rows.forEach((log, index) => {
        console.log(`${index + 1}. ${log.login_type} - ${log.username || 'N/A'}`);
        console.log(`   User ID: ${log.user_id || 'N/A'}`);
        console.log(`   IP: ${log.ip_address || 'N/A'}`);
        console.log(`   Time: ${log.created_at}`);
        if (log.failure_reason) {
          console.log(`   Failure: ${log.failure_reason}`);
        }
        console.log('');
      });
    }

    // Also check the total count
    const countResult = await pool.query('SELECT COUNT(*) as total FROM login_logs');
    console.log(`📈 Total login log entries: ${countResult.rows[0].total}`);

  } catch (error) {
    console.error('❌ Error checking login logs:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

checkLoginLogs().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
