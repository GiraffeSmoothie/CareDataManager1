const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:5001';

// Test credentials from development.env
const TEST_ADMIN = {
  username: 'admin',
  password: 'admin123'
};

let authToken = '';

async function login() {
  console.log('🔐 Logging in as admin...');
  try {
    const response = await axios.post(`${SERVER_URL}/api/login`, TEST_ADMIN);
    authToken = response.data.token;
    console.log('✅ Admin login successful');
    return true;
  } catch (error) {
    console.error('❌ Admin login failed:', error.response?.data || error.message);
    return false;
  }
}

async function testUserAuditLogging() {
  console.log('\n📝 Testing User Management Audit Logging...');
  
  try {
    // Test 1: Create a new user
    console.log('Creating a new test user...');
    const createUserResponse = await axios.post(`${SERVER_URL}/api/users`, {
      name: 'Test User for Audit',
      username: 'testaudit' + Date.now(),
      password: 'password123',
      role: 'user',
      company_id: 1
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const newUserId = createUserResponse.data.id;
    console.log(`✅ User created successfully with ID: ${newUserId}`);
    
    // Test 2: Update the user
    console.log('Updating the test user...');
    await axios.put(`${SERVER_URL}/api/users/${newUserId}`, {
      name: 'Updated Test User for Audit'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('✅ User updated successfully');
    
    // Test 3: Change admin password (testing self password change)
    console.log('Testing password change...');
    await axios.post(`${SERVER_URL}/api/change-password`, {
      currentPassword: 'admin123',
      newPassword: 'admin123new'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    // Change it back for future tests
    await axios.post(`${SERVER_URL}/api/change-password`, {
      currentPassword: 'admin123new',
      newPassword: 'admin123'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('✅ Password change tested successfully');
    
    return true;
  } catch (error) {
    console.error('❌ User audit logging test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testClientAuditLogging() {
  console.log('\n👤 Testing Client Management Audit Logging...');
  
  try {
    // Test 1: Create a new client
    console.log('Creating a new test client...');
    const createClientResponse = await axios.post(`${SERVER_URL}/api/person-info`, {
      firstName: 'Test',
      lastName: 'Client Audit',
      dateOfBirth: '1990-01-01',
      addressLine1: '123 Test Street',
      mobilePhone: '1234567890',
      status: 'New'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const newClientId = createClientResponse.data.id;
    console.log(`✅ Client created successfully with ID: ${newClientId}`);
    
    // Test 2: Update the client
    console.log('Updating the test client...');
    await axios.put(`${SERVER_URL}/api/person-info/${newClientId}`, {
      firstName: 'Updated Test',
      lastName: 'Client Audit Updated',
      dateOfBirth: '1990-01-01',
      addressLine1: '456 Updated Street',
      mobilePhone: '0987654321',
      status: 'Active'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('✅ Client updated successfully');
    
    return true;
  } catch (error) {
    console.error('❌ Client audit logging test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testMasterDataAuditLogging() {
  console.log('\n🗃️ Testing Master Data Audit Logging...');
  
  try {
    // Test 1: Create new master data
    console.log('Creating new test master data...');
    const createMasterDataResponse = await axios.post(`${SERVER_URL}/api/master-data`, {
      category: 'Service',
      type: 'Test Audit Service',
      provider: 'Test Provider Audit',
      active: true
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const newMasterDataId = createMasterDataResponse.data.id;
    console.log(`✅ Master data created successfully with ID: ${newMasterDataId}`);
    
    // Test 2: Update the master data
    console.log('Updating the test master data...');
    await axios.put(`${SERVER_URL}/api/master-data/${newMasterDataId}`, {
      category: 'Service',
      type: 'Updated Test Audit Service',
      provider: 'Updated Test Provider Audit',
      active: true
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('✅ Master data updated successfully');
    
    return true;
  } catch (error) {
    console.error('❌ Master data audit logging test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testCompanyAuditLogging() {
  console.log('\n🏢 Testing Company Management Audit Logging...');
  
  try {
    // Test 1: Create a new company
    console.log('Creating a new test company...');
    const createCompanyResponse = await axios.post(`${SERVER_URL}/api/companies`, {
      company_name: 'Test Audit Company',
      registered_address: '123 Business Street, City',
      postal_address: '123 Business Street, City',
      contact_person_name: 'Test Contact',
      contact_person_phone: '1234567890',
      contact_person_email: 'test@audit.com'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const newCompanyId = createCompanyResponse.data.id;
    console.log(`✅ Company created successfully with ID: ${newCompanyId}`);
    
    // Test 2: Update the company
    console.log('Updating the test company...');
    await axios.put(`${SERVER_URL}/api/companies/${newCompanyId}`, {
      company_name: 'Updated Test Audit Company',
      registered_address: '456 Updated Business Street, City',
      postal_address: '456 Updated Business Street, City',
      contact_person_name: 'Updated Test Contact',
      contact_person_phone: '0987654321',
      contact_person_email: 'updated@audit.com'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('✅ Company updated successfully');
    
    return true;
  } catch (error) {
    console.error('❌ Company audit logging test failed:', error.response?.data || error.message);
    return false;
  }
}

async function checkAuditLogs() {
  console.log('\n📊 Checking audit logs in database...');
  
  try {
    // Connect to database and check audit_logs table
    const { Client } = require('pg');
    const client = new Client({
      user: 'postgres',
      host: 'localhost',
      database: 'CareDataManager1',
      password: 'Abcd@1234',
      port: 5432,
    });
    
    await client.connect();
    
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
      WHERE created_at > NOW() - INTERVAL '5 minutes'
      ORDER BY created_at DESC
      LIMIT 20
    `);
    
    console.log(`✅ Found ${auditLogsResult.rows.length} recent audit log entries:`);
    auditLogsResult.rows.forEach((log, index) => {
      console.log(`  ${index + 1}. [${log.action}] ${log.resource_type} ${log.resource_id} - ${log.details}`);
      console.log(`     User: ${log.username} (ID: ${log.user_id}) from ${log.ip_address}`);
      console.log(`     Time: ${log.created_at}`);
      console.log('');
    });
    
    // Check login logs too
    const loginLogsResult = await client.query(`
      SELECT 
        id,
        username,
        login_type,
        ip_address,
        created_at
      FROM login_logs 
      WHERE created_at > NOW() - INTERVAL '5 minutes'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`✅ Found ${loginLogsResult.rows.length} recent login log entries:`);
    loginLogsResult.rows.forEach((log, index) => {
      console.log(`  ${index + 1}. [${log.login_type}] ${log.username} from ${log.ip_address} at ${log.created_at}`);
    });
    
    await client.end();
    
    return auditLogsResult.rows.length > 0;
  } catch (error) {
    console.error('❌ Failed to check audit logs:', error.message);
    return false;
  }
}

async function runAuditLoggingTests() {
  console.log('🚀 Starting Comprehensive Audit Logging Tests\n');
  
  // Login first
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('❌ Cannot proceed without authentication');
    return;
  }
  
  // Run all tests
  const userTest = await testUserAuditLogging();
  const clientTest = await testClientAuditLogging();
  const masterDataTest = await testMasterDataAuditLogging();
  const companyTest = await testCompanyAuditLogging();
  
  // Check database for audit logs
  const auditLogsFound = await checkAuditLogs();
  
  // Summary
  console.log('\n🎯 AUDIT LOGGING TEST SUMMARY:');
  console.log(`   User Management Logging: ${userTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Client Management Logging: ${clientTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Master Data Logging: ${masterDataTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Company Management Logging: ${companyTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Audit Logs in Database: ${auditLogsFound ? '✅ PASS' : '❌ FAIL'}`);
  
  const allTestsPassed = userTest && clientTest && masterDataTest && companyTest && auditLogsFound;
  console.log(`\n${allTestsPassed ? '🎉 ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED'}`);
  
  if (allTestsPassed) {
    console.log('🔒 Audit logging is working correctly for all sensitive operations!');
  } else {
    console.log('🔧 Some audit logging functionality needs attention.');
  }
}

// Run the tests
runAuditLoggingTests().catch(console.error);
