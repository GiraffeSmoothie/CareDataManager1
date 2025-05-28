const axios = require('axios');

async function testAuditLogging() {
  try {
    console.log('Testing audit logging implementation...');
    
    // First, login to get a token
    console.log('1. Logging in...');
    const loginResponse = await axios.post('http://localhost:5001/api/auth/login', {
      username: 'admin',
      password: 'Admin@123'
    });
    
    const token = loginResponse.data.tokens.accessToken;
    console.log('Login successful, token received');
    
    // Create a test user to trigger audit logging
    console.log('2. Creating a test user...');
    const userResponse = await axios.post('http://localhost:5001/api/users', {
      name: 'Test Audit User',
      username: 'testaudit_' + Date.now(),
      password: 'TestPass123',
      role: 'user',
      company_id: 1
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('User created successfully:', userResponse.data);
    
    // Wait a moment for the audit log to be written
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('3. Test completed. Check audit_logs table in database for new entries.');
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testAuditLogging();
