/**
 * Performance Tests for CareDataManager API
 * 
 * Tests API response times, throughput, and resource usage under normal load.
 */

const axios = require('axios');
const fs = require('fs');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_USERNAME = process.env.TEST_USERNAME || 'admin';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password';

let authToken = null;
let performanceResults = [];

/**
 * Utility Functions
 */
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`);
}

async function authenticate() {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      username: TEST_USERNAME,
      password: TEST_PASSWORD
    });    authToken = response.data.tokens?.accessToken;
    return true;
  } catch (error) {
    log(`Authentication failed: ${error.message}`, 'ERROR');
    return false;
  }
}

async function makeTimedRequest(method, endpoint, data = null) {
  const startTime = process.hrtime.bigint();
  
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    return {
      success: true,
      status: response.status,
      responseTime,
      dataSize: JSON.stringify(response.data).length
    };
  } catch (error) {
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1000000;
    
    return {
      success: false,
      status: error.response?.status || 500,
      responseTime,
      error: error.message
    };
  }
}

/**
 * Test Response Times for Different Endpoints
 */
async function testResponseTimes() {
  log('=== Testing Response Times ===');
  
  const endpoints = [
    { method: 'GET', path: '/api/auth/status', name: 'Auth Status' },
    { method: 'GET', path: '/api/users', name: 'Get Users' },
    { method: 'GET', path: '/api/companies', name: 'Get Companies' },
    { method: 'GET', path: '/api/master-data', name: 'Get Master Data' },
    { method: 'GET', path: '/api/person-info', name: 'Get Person Info' },
    { method: 'GET', path: '/api/client-services', name: 'Get Client Services' }
  ];
  
  const results = {};
  
  for (const endpoint of endpoints) {
    const times = [];
    log(`Testing ${endpoint.name}...`);
    
    // Make 10 requests to get average response time
    for (let i = 0; i < 10; i++) {
      const result = await makeTimedRequest(endpoint.method, endpoint.path);
      if (result.success) {
        times.push(result.responseTime);
      }
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (times.length > 0) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      
      results[endpoint.name] = {
        average: avgTime.toFixed(2),
        min: minTime.toFixed(2),
        max: maxTime.toFixed(2),
        samples: times.length
      };
      
      log(`${endpoint.name}: Avg ${avgTime.toFixed(2)}ms, Min ${minTime.toFixed(2)}ms, Max ${maxTime.toFixed(2)}ms`);
    } else {
      log(`${endpoint.name}: Failed to get response times`);
    }
  }
  
  performanceResults.push({
    test: 'Response Times',
    timestamp: new Date().toISOString(),
    results
  });
  
  return results;
}

/**
 * Test Concurrent Request Handling
 */
async function testConcurrentRequests() {
  log('=== Testing Concurrent Request Handling ===');
  
  const concurrencyLevels = [5, 10, 20, 50];
  const results = {};
  
  for (const concurrency of concurrencyLevels) {
    log(`Testing with ${concurrency} concurrent requests...`);
    
    const startTime = process.hrtime.bigint();
    const promises = [];
    
    for (let i = 0; i < concurrency; i++) {
      promises.push(makeTimedRequest('GET', '/api/auth/status'));
    }
    
    const responses = await Promise.all(promises);
    const endTime = process.hrtime.bigint();
    const totalTime = Number(endTime - startTime) / 1000000;
    
    const successful = responses.filter(r => r.success).length;
    const failed = responses.length - successful;
    const avgResponseTime = responses
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.responseTime, 0) / successful;
    
    results[`${concurrency}_concurrent`] = {
      totalTime: totalTime.toFixed(2),
      successful,
      failed,
      successRate: ((successful / responses.length) * 100).toFixed(2),
      avgResponseTime: avgResponseTime.toFixed(2),
      throughput: (successful / (totalTime / 1000)).toFixed(2) // requests per second
    };
    
    log(`${concurrency} concurrent: ${successful}/${responses.length} successful, avg ${avgResponseTime.toFixed(2)}ms, ${results[`${concurrency}_concurrent`].throughput} req/s`);
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  performanceResults.push({
    test: 'Concurrent Requests',
    timestamp: new Date().toISOString(),
    results
  });
  
  return results;
}

/**
 * Test Database Operation Performance
 */
async function testDatabaseOperations() {
  log('=== Testing Database Operation Performance ===');
  
  const operations = [
    {
      name: 'Create User',
      method: 'POST',
      path: '/api/users',
      data: {
        name: 'Perf Test User',
        username: `perftest_${Date.now()}`,
        password: 'Password123!',
        role: 'user'
      }
    },
    {
      name: 'Create Company',
      method: 'POST',
      path: '/api/companies',
      data: {
        company_name: `Perf Test Company ${Date.now()}`,
        abn: '12345678901',
        registered_address: '123 Test Street',
        postal_address: '123 Test Street',
        contact_person_name: 'Test Contact',
        contact_person_phone: '1234567890',
        contact_person_email: 'test@example.com'
      }
    },
    {
      name: 'Create Master Data',
      method: 'POST',
      path: '/api/master-data',
      data: {
        category: 'Performance Test',
        type: 'Load Test',
        provider: 'Test Provider',
        active: true
      }
    }
  ];
  
  const results = {};
  
  for (const operation of operations) {
    log(`Testing ${operation.name}...`);
    
    const times = [];
    let successCount = 0;
    
    // Perform 5 operations of each type
    for (let i = 0; i < 5; i++) {
      const data = { ...operation.data };
      if (data.username) {
        data.username = `${data.username}_${i}`;
      }
      if (data.company_name) {
        data.company_name = `${data.company_name}_${i}`;
      }
      
      const result = await makeTimedRequest(operation.method, operation.path, data);
      
      if (result.success) {
        times.push(result.responseTime);
        successCount++;
      }
      
      // Small delay between operations
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    if (times.length > 0) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      results[operation.name] = {
        averageTime: avgTime.toFixed(2),
        successRate: ((successCount / 5) * 100).toFixed(2),
        samples: times.length
      };
      
      log(`${operation.name}: Avg ${avgTime.toFixed(2)}ms, Success rate ${results[operation.name].successRate}%`);
    }
  }
  
  performanceResults.push({
    test: 'Database Operations',
    timestamp: new Date().toISOString(),
    results
  });
  
  return results;
}

/**
 * Test Large Data Retrieval Performance
 */
async function testLargeDataRetrieval() {
  log('=== Testing Large Data Retrieval Performance ===');
  
  const endpoints = [
    { path: '/api/users', name: 'All Users' },
    { path: '/api/companies', name: 'All Companies' },
    { path: '/api/master-data', name: 'All Master Data' },
    { path: '/api/person-info', name: 'All Person Info' }
  ];
  
  const results = {};
  
  for (const endpoint of endpoints) {
    log(`Testing ${endpoint.name} retrieval...`);
    
    const result = await makeTimedRequest('GET', endpoint.path);
    
    if (result.success) {
      results[endpoint.name] = {
        responseTime: result.responseTime.toFixed(2),
        dataSize: (result.dataSize / 1024).toFixed(2), // KB
        transferRate: ((result.dataSize / 1024) / (result.responseTime / 1000)).toFixed(2) // KB/s
      };
      
      log(`${endpoint.name}: ${result.responseTime.toFixed(2)}ms, ${results[endpoint.name].dataSize}KB, ${results[endpoint.name].transferRate}KB/s`);
    } else {
      log(`${endpoint.name}: Failed - ${result.error}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  performanceResults.push({
    test: 'Large Data Retrieval',
    timestamp: new Date().toISOString(),
    results
  });
  
  return results;
}

/**
 * Memory Usage Simulation Test
 */
async function testMemoryUsage() {
  log('=== Testing Memory Usage Patterns ===');
  
  // Simulate various usage patterns that might cause memory issues
  const patterns = [
    {
      name: 'Rapid Sequential Requests',
      test: async () => {
        const promises = [];
        for (let i = 0; i < 100; i++) {
          promises.push(makeTimedRequest('GET', '/api/auth/status'));
        }
        return await Promise.all(promises);
      }
    },
    {
      name: 'Large Payload Handling',
      test: async () => {
        const largeData = {
          name: 'Large Data Test',
          username: `largedata_${Date.now()}`,
          password: 'Password123!',
          role: 'user',
          notes: 'A'.repeat(10000) // 10KB of data
        };
        
        const results = [];
        for (let i = 0; i < 10; i++) {
          results.push(await makeTimedRequest('POST', '/api/users', {
            ...largeData,
            username: `${largeData.username}_${i}`
          }));
        }
        return results;
      }
    }
  ];
  
  const results = {};
  
  for (const pattern of patterns) {
    log(`Testing ${pattern.name}...`);
    
    const startMemory = process.memoryUsage();
    const startTime = Date.now();
    
    const responses = await pattern.test();
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    
    const successful = responses.filter(r => r.success).length;
    const memoryDiff = {
      heapUsed: ((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024).toFixed(2), // MB
      heapTotal: ((endMemory.heapTotal - startMemory.heapTotal) / 1024 / 1024).toFixed(2), // MB
      external: ((endMemory.external - startMemory.external) / 1024 / 1024).toFixed(2) // MB
    };
    
    results[pattern.name] = {
      duration: endTime - startTime,
      successful: successful,
      total: responses.length,
      memoryDelta: memoryDiff
    };
    
    log(`${pattern.name}: ${successful}/${responses.length} successful, Duration: ${results[pattern.name].duration}ms`);
    log(`Memory delta - Heap Used: ${memoryDiff.heapUsed}MB, Heap Total: ${memoryDiff.heapTotal}MB`);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  performanceResults.push({
    test: 'Memory Usage',
    timestamp: new Date().toISOString(),
    results
  });
  
  return results;
}

/**
 * Generate Performance Report
 */
function generatePerformanceReport() {
  log('=== Generating Performance Report ===');
  
  const report = {
    summary: {
      testCount: performanceResults.length,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    results: performanceResults
  };
  
  // Save report to file
  const reportPath = './performance-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  log(`Performance report saved to: ${reportPath}`);
  
  // Generate summary
  log('\n=== PERFORMANCE SUMMARY ===');
  performanceResults.forEach(result => {
    log(`${result.test}: Completed at ${result.timestamp}`);
  });
  
  return report;
}

/**
 * Main performance test execution
 */
async function runPerformanceTests() {
  log('Starting CareDataManager Performance Tests');
  log(`Base URL: ${BASE_URL}`);
  
  try {
    // Authenticate first
    const authSuccess = await authenticate();
    if (!authSuccess) {
      log('Authentication failed - stopping performance tests');
      return;
    }
    
    // Run performance test suites
    await testResponseTimes();
    await testConcurrentRequests();
    await testDatabaseOperations();
    await testLargeDataRetrieval();
    await testMemoryUsage();
    
  } catch (error) {
    log(`Performance test error: ${error.message}`, 'ERROR');
  } finally {
    generatePerformanceReport();
  }
}

// Export for use as module or run directly
if (require.main === module) {
  runPerformanceTests();
}

module.exports = {
  runPerformanceTests,
  testResponseTimes,
  testConcurrentRequests,
  testDatabaseOperations,
  testLargeDataRetrieval,
  testMemoryUsage
};
