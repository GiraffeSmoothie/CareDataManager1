const http = require('http');

// First test - check if we can reach the server
const options = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/health',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`Health check - Status: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Health check response:', data);
    
    // Now try the problematic endpoint without auth
    testProblematicEndpoint();
  });
});

req.on('error', (error) => {
  console.error('Health check error:', error);
});

function testProblematicEndpoint() {
  const options2 = {
    hostname: 'localhost',
    port: 5001,
    path: '/api/client-services/client/1?segmentId=1',
    method: 'GET'
  };

  const req2 = http.request(options2, (res) => {
    console.log(`\nProblematic endpoint - Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Response:', data);
    });
  });

  req2.on('error', (error) => {
    console.error('Error:', error);
  });

  req2.end();
}

req.end();
