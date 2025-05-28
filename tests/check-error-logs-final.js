// Check error log details
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../server/development.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkErrorDetails() {
    try {
        const result = await pool.query('SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 3');
        console.log('📊 Error logs details:');
        console.log('Total count:', result.rows.length);
        
        result.rows.forEach((row, index) => {
            console.log(`\n🚨 Error ${index + 1}:`);
            console.log('- Type:', row.error_type);
            console.log('- Message:', row.error_message?.substring(0, 100) + '...');
            console.log('- Severity:', row.severity);
            console.log('- Endpoint:', row.endpoint);
            console.log('- Method:', row.method);
            console.log('- User ID:', row.user_id);
            console.log('- IP Address:', row.ip_address);
            console.log('- Created:', row.created_at);
        });
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkErrorDetails();
