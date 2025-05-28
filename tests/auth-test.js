const axios = require('axios');

const API_BASE = 'http://localhost:5001';

async function testAuthentication() {
  console.log('🔐 Testing Authentication...');
  
  // Test with environment credentials
  const credentials = {
    username: 'admin',
    password: 'Admin@123'
  };
  
  try {
    console.log('Attempting login with:', credentials.username);
    
    const response = await axios.post(`${API_BASE}/api/auth/login`, credentials, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Authentication successful!');
    console.log('Response:', response.data);
    return response.data;
    
  } catch (error) {
    console.log('❌ Authentication failed:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
    return null;
  }
}

async function testUserCreation() {
  console.log('\n👤 Testing User Creation (if auth fails)...');
  
  try {
    // Try to create admin user directly via API
    const userData = {
      name: "Initial Admin",
      username: "admin",
      password: "Admin@123",
      role: "admin"
    };
    
    const response = await axios.post(`${API_BASE}/api/users`, userData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ User created successfully!');
    console.log('Response:', response.data);
    return response.data;
    
  } catch (error) {
    console.log('❌ User creation failed:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
    return null;
  }
}

async function main() {
  console.log('🧪 Auth Test Suite');
  console.log('==================');
  
  // Test authentication first
  const authResult = await testAuthentication();
  
  if (!authResult) {
    // If auth fails, try creating user (this might fail if auth is required)
    await testUserCreation();
    
    // Try auth again
    console.log('\n🔄 Retrying authentication...');
    await testAuthentication();
  }
}

main().catch(console.error);
