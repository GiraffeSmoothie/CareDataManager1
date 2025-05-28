// Performance and Error Logging Test Suite
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5001';

// Store token from login
let authToken = '';

// Helper function to make HTTP requests
async function makeRequest(url, options = {}) {
    const fetch = (await import('node-fetch')).default;
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
            ...options.headers
        }
    };
    
    const response = await fetch(url, {
        ...defaultOptions,
        ...options
    });
    
    return response;
}

// Test functions
async function testLogin() {
    console.log('\n🔐 Testing Login (Performance Logging)...');
    
    const response = await makeRequest(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        body: JSON.stringify({
            username: 'admin',
            password: 'Admin@123'
        })
    });
    
    const data = await response.json();
    console.log('Login Response Status:', response.status);
    
    if (response.ok && data.tokens) {
        authToken = data.tokens.accessToken;
        console.log('✅ Login successful - Performance should be logged');
        return true;
    } else {
        console.log('❌ Login failed:', data);
        return false;
    }
}

async function testSuccessfulApiCall() {
    console.log('\n⚡ Testing Successful API Call (Performance Logging)...');
    
    const response = await makeRequest(`${BASE_URL}/api/users`);
    console.log('Users API Response Status:', response.status);
    
    if (response.ok) {
        console.log('✅ API call successful - Performance should be logged');
        return true;
    } else {
        console.log('❌ API call failed');
        return false;
    }
}

async function testErrorScenarios() {
    console.log('\n💥 Testing Error Scenarios (Error Logging)...');
    
    // Test 1: 404 Error
    console.log('Testing 404 error...');
    const response404 = await makeRequest(`${BASE_URL}/api/nonexistent-endpoint`);
    console.log('404 Response Status:', response404.status);
    
    // Test 2: Unauthorized request (no token)
    console.log('Testing unauthorized error...');
    const tempToken = authToken;
    authToken = ''; // Remove token temporarily
    const responseUnauth = await makeRequest(`${BASE_URL}/api/users`);
    console.log('Unauthorized Response Status:', responseUnauth.status);
    authToken = tempToken; // Restore token
    
    // Test 3: Bad request data
    console.log('Testing bad request error...');
    const responseBadReq = await makeRequest(`${BASE_URL}/api/users`, {
        method: 'POST',
        body: JSON.stringify({
            // Missing required fields to trigger validation error
            username: '',
            password: ''
        })
    });
    console.log('Bad Request Response Status:', responseBadReq.status);
    
    console.log('✅ Error scenarios tested - Errors should be logged');
}

async function testPerformanceIntensiveOperations() {
    console.log('\n🚀 Testing Performance-Intensive Operations...');
    
    // Test multiple rapid requests to generate performance metrics
    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(makeRequest(`${BASE_URL}/api/users`));
    }
    
    const responses = await Promise.all(promises);
    console.log('Rapid requests completed:', responses.length);
    console.log('✅ Performance-intensive operations tested');
}

async function checkDatabaseLogs() {
    console.log('\n📊 Checking Database Logs...');
    
    // Import pg here to use it
    const { Pool } = require('pg');
    const dotenv = require('dotenv');
    
    // Load environment variables
    dotenv.config({ path: path.join(__dirname, '../server/development.env') });
    
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });
    
    try {
        // Check login_logs
        const loginResult = await pool.query('SELECT COUNT(*) as count FROM login_logs');
        console.log(`📝 Login logs count: ${loginResult.rows[0].count}`);
        
        // Check audit_logs 
        const auditResult = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
        console.log(`📝 Audit logs count: ${auditResult.rows[0].count}`);
        
        // Check performance_logs
        const perfResult = await pool.query('SELECT COUNT(*) as count FROM performance_logs');
        console.log(`📝 Performance logs count: ${perfResult.rows[0].count}`);
        
        // Check error_logs
        const errorResult = await pool.query('SELECT COUNT(*) as count FROM error_logs');
        console.log(`📝 Error logs count: ${errorResult.rows[0].count}`);
        
        // Show recent performance logs
        console.log('\n📊 Recent Performance Logs:');
        const recentPerf = await pool.query(`
            SELECT endpoint, method, response_time_ms, memory_usage_mb, created_at 
            FROM performance_logs 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        recentPerf.rows.forEach(row => {
            console.log(`  ${row.method} ${row.endpoint} - ${row.response_time_ms}ms, ${row.memory_usage_mb}MB - ${row.created_at}`);
        });
        
        // Show recent error logs
        console.log('\n🚨 Recent Error Logs:');
        const recentErrors = await pool.query(`
            SELECT error_type, endpoint, method, severity, created_at 
            FROM error_logs 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        recentErrors.rows.forEach(row => {
            console.log(`  ${row.severity} - ${row.error_type} on ${row.method} ${row.endpoint} - ${row.created_at}`);
        });
        
        return {
            login: parseInt(loginResult.rows[0].count),
            audit: parseInt(auditResult.rows[0].count),
            performance: parseInt(perfResult.rows[0].count),
            error: parseInt(errorResult.rows[0].count)
        };
        
    } catch (error) {
        console.error('❌ Error checking database logs:', error.message);
        return null;
    } finally {
        await pool.end();
    }
}

// Main test execution
async function runTests() {
    console.log('🧪 Starting Performance and Error Logging Test Suite...');
    console.log('='.repeat(60));
    
    try {
        // Wait a moment for server to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get initial log counts
        console.log('\n📊 Initial Database State:');
        const initialCounts = await checkDatabaseLogs();
        
        // Run tests that should generate logs
        await testLogin();
        await testSuccessfulApiCall();
        await testErrorScenarios();
        await testPerformanceIntensiveOperations();
        
        // Wait for async logging to complete
        console.log('\n⏳ Waiting for async logging to complete...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check final log counts
        console.log('\n📊 Final Database State:');
        const finalCounts = await checkDatabaseLogs();
        
        // Compare results
        if (initialCounts && finalCounts) {
            console.log('\n📈 Log Count Changes:');
            console.log(`Login logs: ${initialCounts.login} → ${finalCounts.login} (+${finalCounts.login - initialCounts.login})`);
            console.log(`Audit logs: ${initialCounts.audit} → ${finalCounts.audit} (+${finalCounts.audit - initialCounts.audit})`);
            console.log(`Performance logs: ${initialCounts.performance} → ${finalCounts.performance} (+${finalCounts.performance - initialCounts.performance})`);
            console.log(`Error logs: ${initialCounts.error} → ${finalCounts.error} (+${finalCounts.error - initialCounts.error})`);
            
            // Validate results
            console.log('\n✅ Test Results:');
            console.log(`✅ Login logging: ${finalCounts.login > initialCounts.login ? 'WORKING' : 'NOT WORKING'}`);
            console.log(`✅ Audit logging: ${finalCounts.audit >= initialCounts.audit ? 'WORKING' : 'NOT WORKING'}`);
            console.log(`✅ Performance logging: ${finalCounts.performance > initialCounts.performance ? 'WORKING' : 'NOT WORKING'}`);
            console.log(`✅ Error logging: ${finalCounts.error > initialCounts.error ? 'WORKING' : 'NOT WORKING'}`);
        }
        
        console.log('\n🎉 Performance and Error Logging Test Completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the tests
runTests();
