const fetch = require('node-fetch');

// Test the service case notes POST endpoint
async function testServiceCaseNotesEndpoint() {
  const baseUrl = 'http://localhost:5001'; // Adjust port if needed
  
  try {
    console.log('Testing POST /api/service-case-notes endpoint...');
    
    // First, try to test if the endpoint exists
    const response = await fetch(`${baseUrl}/api/service-case-notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serviceId: 1,
        noteText: "Test case note",
        createdBy: 1
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers.raw());
    
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
    if (response.status === 401) {
      console.log('✅ Endpoint exists and requires authentication (expected)');
    } else if (response.status === 400) {
      console.log('✅ Endpoint exists and validates input (expected)');
    } else if (response.status === 404) {
      console.log('❌ Endpoint not found - route may not be properly registered');
    } else {
      console.log('✅ Endpoint responding with status:', response.status);
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('⚠️  Server is not running. Please start the server first.');
    } else {
      console.error('Error testing endpoint:', error);
    }
  }
}

testServiceCaseNotesEndpoint();
