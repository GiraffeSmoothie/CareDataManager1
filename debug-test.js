const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:5001';

async function makeRequest(endpoint, method = 'GET', data = null, token = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const responseData = await response.text();
    let parsedData;
    try {
      parsedData = JSON.parse(responseData);
    } catch {
      parsedData = responseData;
    }
    return { status: response.status, data: parsedData };
  } catch (error) {
    return { status: 500, data: { error: error.message } };
  }
}

async function test() {
  // Login first
  const adminLogin = await makeRequest('/api/auth/login', 'POST', {
    username: 'admin1',
    password: 'admin123'
  });
  
  console.log('Admin login:', adminLogin.status, adminLogin.data.success);
  const adminToken = adminLogin.data.tokens.accessToken;
  
  // Get master data to see what exists
  const masterData = await makeRequest('/api/master-data', 'GET', null, adminToken);
  console.log('Master data count:', masterData.data.length);
  
  if (masterData.data.length > 0) {
    const item = masterData.data[0];
    console.log('First master data item:', {
      id: item.id,
      serviceCategory: item.serviceCategory,
      serviceType: item.serviceType,
      serviceProvider: item.serviceProvider,
      segmentId: item.segmentId
    });
    
    // Test the verify endpoint
    const verifyUrl = `/api/master-data/verify?category=${encodeURIComponent(item.serviceCategory)}&type=${encodeURIComponent(item.serviceType)}&provider=${encodeURIComponent(item.serviceProvider)}&segmentId=${item.segmentId}`;
    console.log('Verify URL:', verifyUrl);
    
    const verifyResult = await makeRequest(verifyUrl, 'GET', null, adminToken);
    console.log('Verify result:', verifyResult.status, verifyResult.data);
  }
}

test().catch(console.error);
