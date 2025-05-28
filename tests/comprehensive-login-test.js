const http = require('http');

// Test configuration
const SERVER_BASE = 'http://localhost:5001';

// Helper function to make HTTP requests
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

async function testComprehensiveLoginLogging() {
  console.log('🧪 Comprehensive Login Logging Test');
  console.log('====================================');
  
  try {
    // Test 1: Failed login attempt
    console.log('\n🔴 Testing failed login attempt...');
    try {
      const failedLoginOptions = {
        hostname: 'localhost',
        port: 5001,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LoginTest/1.0',
          'X-Forwarded-For': '192.168.1.100'
        }
      };
      
      const failedLoginData = JSON.stringify({
        username: 'wronguser',
        password: 'wrongpassword'
      });
      
      const failedResponse = await makeRequest(failedLoginOptions, failedLoginData);
      console.log(`✅ Failed login test completed (Status: ${failedResponse.status})`);
    } catch (error) {
      console.log(`⚠️  Failed login test error: ${error.message}`);
    }
    
    // Test 2: Successful login
    console.log('\n🟢 Testing successful login...');
    const loginOptions = {
      hostname: 'localhost',
      port: 5001,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LoginTest/1.0',
        'X-Forwarded-For': '192.168.1.200'
      }
    };
    
    const loginData = JSON.stringify({
      username: 'admin',
      password: 'admin123'
    });
    
    const loginResponse = await makeRequest(loginOptions, loginData);
    console.log(`✅ Login test completed (Status: ${loginResponse.status})`);
    
    if (loginResponse.status === 200 && loginResponse.data.tokens) {
      const { accessToken, refreshToken } = loginResponse.data.tokens;
      
      // Test 3: Token refresh
      console.log('\n🔄 Testing token refresh...');
      const refreshOptions = {
        hostname: 'localhost',
        port: 5001,
        path: '/api/auth/refresh',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LoginTest/1.0',
          'X-Forwarded-For': '192.168.1.300'
        }
      };
      
      const refreshData = JSON.stringify({
        refreshToken: refreshToken
      });
      
      const refreshResponse = await makeRequest(refreshOptions, refreshData);
      console.log(`✅ Token refresh test completed (Status: ${refreshResponse.status})`);
      
      // Test 4: Logout
      console.log('\n🚪 Testing logout...');
      const logoutOptions = {
        hostname: 'localhost',
        port: 5001,
        path: '/api/auth/logout',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'LoginTest/1.0',
          'X-Forwarded-For': '192.168.1.400'
        }
      };
      
      const logoutResponse = await makeRequest(logoutOptions, '{}');
      console.log(`✅ Logout test completed (Status: ${logoutResponse.status})`);
    }
    
    console.log('\n✅ All authentication tests completed!');
    console.log('\n📊 Check the login logs to verify all events were recorded...');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

// Run the tests
testComprehensiveLoginLogging();
