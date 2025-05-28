const axios = require('axios');

async function debugAuditLogging() {
  try {
    console.log('Starting direct audit logging test...');
    
    // First, login to get a token
    console.log('1. Logging in to get token...');
    const loginResponse = await axios.post('http://localhost:5001/api/auth/login', {
      username: 'admin',
      password: 'Admin@123'
    });
      console.log('Login response status:', loginResponse.status);
    console.log('Login response data keys:', Object.keys(loginResponse.data));
    console.log('Token structure:', loginResponse.data.tokens ? 'tokens object found' : 'NO TOKENS OBJECT');
    
    if (!loginResponse.data.tokens || !loginResponse.data.tokens.accessToken) {
      console.error('No access token received in login response!');
      console.log('Full response:', JSON.stringify(loginResponse.data, null, 2));
      return;
    }
    
    const token = loginResponse.data.tokens.accessToken;
    console.log('Token preview:', token.substring(0, 50) + '...');
    
    // Create a test user to trigger audit logging
    console.log('2. Creating a test user with token...');
    const userResponse = await axios.post('http://localhost:5001/api/users', {
      name: 'Test Audit User',
      username: 'testaudit_' + Date.now(),
      password: 'TestPass123',
      role: 'user',
      company_id: 1
    }, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('User creation successful:', userResponse.data);
    console.log('3. Audit logging test completed successfully!');
    
  } catch (error) {
    console.error('Error details:');
    console.error('Status:', error.response?.status);
    console.error('Headers:', error.response?.headers);
    console.error('Data:', error.response?.data);
    console.error('Config headers:', error.config?.headers);
  }
}

debugAuditLogging();
