const pg = require('pg');

async function checkAuditLogs() {
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

    // Check audit logs count
    const auditResult = await client.query('SELECT COUNT(*) FROM audit_logs');
    console.log('Audit logs count:', auditResult.rows[0].count);    // Check recent audit logs
    const recentAuditResult = await client.query(`
      SELECT id, user_id, username, action, resource_type, resource_id, metadata, created_at 
      FROM audit_logs 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.log('Recent audit logs:', recentAuditResult.rows);

    // Check login logs count
    const loginResult = await client.query('SELECT COUNT(*) FROM login_logs');
    console.log('Login logs count:', loginResult.rows[0].count);

    // Check recent login logs
    const recentLoginResult = await client.query(`
      SELECT id, username, user_id, login_type, ip_address, created_at 
      FROM login_logs 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    console.log('Recent login logs:', recentLoginResult.rows);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkAuditLogs();
