// Test Azure PostgreSQL Managed Identity Configuration
// Run this script to test if managed identity authentication is working

const { DefaultAzureCredential } = require('@azure/identity');
const { Pool } = require('pg');

async function testManagedIdentityConnection() {
    console.log('🧪 Testing Azure PostgreSQL Managed Identity Connection...\n');

    // Check environment variables
    const serverName = process.env.AZURE_POSTGRESQL_SERVER_NAME;
    const databaseName = process.env.AZURE_POSTGRESQL_DATABASE_NAME;
    const userName = process.env.AZURE_POSTGRESQL_USER_NAME;

    console.log('Environment Variables:');
    console.log(`  AZURE_POSTGRESQL_SERVER_NAME: ${serverName || 'NOT SET'}`);
    console.log(`  AZURE_POSTGRESQL_DATABASE_NAME: ${databaseName || 'NOT SET'}`);
    console.log(`  AZURE_POSTGRESQL_USER_NAME: ${userName || 'NOT SET'}`);
    console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}\n`);

    if (!serverName || !databaseName || !userName) {
        console.error('❌ Missing required environment variables');
        process.exit(1);
    }

    try {
        // Step 1: Test Azure AD token acquisition
        console.log('Step 1: Testing Azure AD token acquisition...');
        const credential = new DefaultAzureCredential();
        const tokenResponse = await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');
        
        if (!tokenResponse) {
            throw new Error('Failed to acquire access token');
        }
        
        console.log('✅ Azure AD token acquired successfully');
        console.log(`   Token expires: ${new Date(tokenResponse.expiresOnTimestamp).toISOString()}\n`);

        // Step 2: Test database connection
        console.log('Step 2: Testing database connection...');
        const config = {
            user: userName,
            host: `${serverName}.postgres.database.azure.com`,
            database: databaseName,
            password: tokenResponse.token,
            port: 5432,
            ssl: {
                rejectUnauthorized: false,
                ca: undefined,
                checkServerIdentity: () => undefined
            },
            connectionTimeoutMillis: 10000,
        };

        const pool = new Pool(config);
        const client = await pool.connect();
        
        console.log('✅ Database connection established');

        // Step 3: Test basic query
        console.log('Step 3: Testing basic query...');
        const result = await client.query('SELECT version(), current_user, current_database()');
        console.log('✅ Query executed successfully');
        console.log(`   PostgreSQL Version: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`);
        console.log(`   Connected as user: ${result.rows[0].current_user}`);
        console.log(`   Connected to database: ${result.rows[0].current_database}\n`);

        // Step 4: Test table access (if tables exist)
        console.log('Step 4: Testing table access...');
        try {
            const tableResult = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE'
                ORDER BY table_name
            `);
            
            if (tableResult.rows.length > 0) {
                console.log('✅ Table access successful');
                console.log(`   Found ${tableResult.rows.length} tables:`, tableResult.rows.map(r => r.table_name).join(', '));
            } else {
                console.log('ℹ️  No tables found (this is normal for a new database)');
            }
        } catch (tableError) {
            console.log('⚠️  Table access test failed (check permissions):', tableError.message);
        }

        client.release();
        await pool.end();
        
        console.log('\n🎉 All tests passed! Managed identity authentication is working correctly.');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        
        if (error.message.includes('authentication')) {
            console.log('\n💡 Troubleshooting tips:');
            console.log('   1. Ensure Azure AD admin is set on PostgreSQL server');
            console.log('   2. Ensure database user was created for the managed identity');
            console.log('   3. Check that the App Service name matches the PostgreSQL username');
            console.log('   4. Verify that Azure AD authentication is enabled on PostgreSQL');
        }
        
        process.exit(1);
    }
}

// Run the test
testManagedIdentityConnection().catch(console.error);
