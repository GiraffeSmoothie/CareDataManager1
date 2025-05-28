const { Client } = require('pg');

async function checkAuditLogs() {
  console.log('🔍 Checking audit logs in database...');
  
  try {
    const client = new Client({
      user: 'postgres',
      host: 'localhost',
      database: 'CareDataManager1',
      password: 'Abcd@1234',
      port: 5432,
    });
    
    await client.connect();
    console.log('✅ Connected to database');
    
    // Check recent audit logs
    const auditLogsResult = await client.query(`
      SELECT 
        id,
        user_id,
        username,
        action,
        resource_type,
        resource_id,
        details,
        ip_address,
        created_at
      FROM audit_logs 
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`\n📊 Found ${auditLogsResult.rows.length} audit log entries:`);
    if (auditLogsResult.rows.length === 0) {
      console.log('ℹ️  No audit logs found. This means either:');
      console.log('   1. No auditable operations have been performed yet');
      console.log('   2. The audit logging implementation needs to be tested');
    } else {
      auditLogsResult.rows.forEach((log, index) => {
        console.log(`  ${index + 1}. [${log.action}] ${log.resource_type} ${log.resource_id} - ${log.details}`);
        console.log(`     User: ${log.username} (ID: ${log.user_id}) from ${log.ip_address}`);
        console.log(`     Time: ${log.created_at}`);
        console.log('');
      });
    }
    
    // Check login logs
    const loginLogsResult = await client.query(`
      SELECT 
        id,
        username,
        login_type,
        ip_address,
        created_at
      FROM login_logs 
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    console.log(`\n🔐 Found ${loginLogsResult.rows.length} recent login log entries:`);
    loginLogsResult.rows.forEach((log, index) => {
      console.log(`  ${index + 1}. [${log.login_type}] ${log.username} from ${log.ip_address} at ${log.created_at}`);
    });
    
    // Check table structure
    const auditTableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'audit_logs'
      ORDER BY ordinal_position
    `);
    
    console.log(`\n🗃️  Audit logs table structure:`);
    auditTableInfo.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    await client.end();
    
  } catch (error) {
    console.error('❌ Failed to check audit logs:', error.message);
  }
}

checkAuditLogs();
