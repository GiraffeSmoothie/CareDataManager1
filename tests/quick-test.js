const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5001';
const ADMIN_USERNAME = 'admin1';
const ADMIN_PASSWORD = 'Admin@123';

async function quickTest() {
  console.log('Starting quick test...');
  
  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const health = await axios.get(`${BASE_URL}/health`);
    console.log(`   Health status: ${health.status}`);
    
    // Test 2: Admin login
    console.log('2. Testing admin login...');
    const adminLogin = await axios.post(`${BASE_URL}/login`, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    });
    console.log(`   Login status: ${adminLogin.status}`);
    console.log(`   Login response:`, JSON.stringify(adminLogin.data, null, 2));
    
    if (adminLogin.data.success && adminLogin.data.tokens?.accessToken) {
      const adminToken = adminLogin.data.tokens.accessToken;
      console.log('   Admin token obtained successfully');
      
      // Test 3: Get companies with admin token
      console.log('3. Testing get companies...');
      const companies = await axios.get(`${BASE_URL}/companies`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      console.log(`   Companies status: ${companies.status}`);
      console.log(`   Companies count: ${companies.data?.length || 0}`);
      
    } else {
      console.log('   Failed to get admin token');
    }
    
    console.log('Quick test completed successfully!');
    
  } catch (error) {
    console.error('Quick test failed:', error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data:`, error.response.data);
    }
  }
}

quickTest();
