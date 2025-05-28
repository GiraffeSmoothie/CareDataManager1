/**
 * Load Testing for CareDataManager API
 * 
 * Simulates high load scenarios to test system stability and performance under stress.
 */

const axios = require('axios');
const fs = require('fs');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_USERNAME = process.env.TEST_USERNAME || 'admin';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password';

// Load test parameters
const LOAD_TEST_DURATION = 60000; // 1 minute
const RAMP_UP_TIME = 10000; // 10 seconds
const MAX_USERS = 50;
const REQUEST_INTERVAL = 1000; // 1 second between requests per user

let authToken = null;
let loadTestResults = [];
let activeUsers = 0;
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
let responseTimes = [];

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
    });
    authToken = response.data.tokens?.accessToken;
    return true;
  } catch (error) {
    log(`Authentication failed: ${error.message}`, 'ERROR');
    return false;
  }
}

/**
 * Simulated User Class
 */
class VirtualUser {
  constructor(id) {
    this.id = id;
    this.isActive = false;
    this.requestCount = 0;
    this.errors = 0;
    this.totalResponseTime = 0;
  }
  
  async makeRequest(endpoint = '/api/auth/status') {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${BASE_URL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        },
        timeout: 10000 // 10 second timeout
      });
      
      const responseTime = Date.now() - startTime;
      this.requestCount++;
      this.totalResponseTime += responseTime;
      
      totalRequests++;
      successfulRequests++;
      responseTimes.push(responseTime);
      
      return { success: true, responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.errors++;
      this.totalResponseTime += responseTime;
      
      totalRequests++;
      failedRequests++;
      
      return { 
        success: false, 
        responseTime, 
        error: error.response?.status || error.message 
      };
    }
  }
  
  async start() {
    this.isActive = true;
    activeUsers++;
    
    log(`User ${this.id} started`);
    
    const endpoints = [
      '/api/auth/status',
      '/api/users',
      '/api/companies',
      '/api/master-data',
      '/api/person-info'
    ];
    
    while (this.isActive) {
      // Randomly select an endpoint to test
      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      await this.makeRequest(endpoint);
      
      // Wait before next request
      await new Promise(resolve => setTimeout(resolve, REQUEST_INTERVAL + Math.random() * 500));
    }
    
    activeUsers--;
    log(`User ${this.id} stopped - Requests: ${this.requestCount}, Errors: ${this.errors}, Avg Response: ${(this.totalResponseTime / this.requestCount).toFixed(2)}ms`);
  }
  
  stop() {
    this.isActive = false;
  }
}

/**
 * Load Test Scenarios
 */

// Scenario 1: Gradual Load Increase
async function gradualLoadTest() {
  log('=== Starting Gradual Load Test ===');
  
  const startTime = Date.now();
  const users = [];
  
  // Reset counters
  totalRequests = 0;
  successfulRequests = 0;
  failedRequests = 0;
  responseTimes = [];
  
  // Gradually add users
  const userAddInterval = RAMP_UP_TIME / MAX_USERS;
  
  for (let i = 0; i < MAX_USERS; i++) {
    const user = new VirtualUser(i + 1);
    users.push(user);
    
    // Start user in background
    user.start();
    
    log(`Added user ${i + 1}/${MAX_USERS} - Active users: ${activeUsers}`);
    
    if (i < MAX_USERS - 1) {
      await new Promise(resolve => setTimeout(resolve, userAddInterval));
    }
  }
  
  // Run for specified duration
  const remainingTime = LOAD_TEST_DURATION - (Date.now() - startTime);
  if (remainingTime > 0) {
    log(`Load test running for ${remainingTime / 1000} more seconds...`);
    await new Promise(resolve => setTimeout(resolve, remainingTime));
  }
  
  // Stop all users
  users.forEach(user => user.stop());
  
  // Wait for users to finish current requests
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  const results = {
    scenario: 'Gradual Load Test',
    duration: duration,
    maxUsers: MAX_USERS,
    totalRequests,
    successfulRequests,
    failedRequests,
    successRate: ((successfulRequests / totalRequests) * 100).toFixed(2),
    averageResponseTime: responseTimes.length > 0 ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2) : 0,
    minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
    maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
    throughput: (successfulRequests / (duration / 1000)).toFixed(2) // requests per second
  };
  
  log(`Gradual Load Test Results:`);
  log(`Duration: ${duration / 1000}s, Users: ${MAX_USERS}`);
  log(`Requests: ${totalRequests} (${successfulRequests} success, ${failedRequests} failed)`);
  log(`Success Rate: ${results.successRate}%`);
  log(`Throughput: ${results.throughput} req/s`);
  log(`Response Time: Avg ${results.averageResponseTime}ms, Min ${results.minResponseTime}ms, Max ${results.maxResponseTime}ms`);
  
  loadTestResults.push(results);
  return results;
}

// Scenario 2: Spike Load Test
async function spikeLoadTest() {
  log('=== Starting Spike Load Test ===');
  
  const spikeUsers = Math.floor(MAX_USERS * 1.5); // 50% more than normal load
  const spikeDuration = 30000; // 30 seconds
  
  // Reset counters
  totalRequests = 0;
  successfulRequests = 0;
  failedRequests = 0;
  responseTimes = [];
  
  const startTime = Date.now();
  const users = [];
  
  // Quickly add many users (spike)
  log(`Creating spike with ${spikeUsers} users...`);
  
  for (let i = 0; i < spikeUsers; i++) {
    const user = new VirtualUser(i + 1);
    users.push(user);
    user.start();
    
    // Very short delay between user creation
    if (i % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  log(`Spike active with ${activeUsers} users`);
  
  // Run spike for specified duration
  await new Promise(resolve => setTimeout(resolve, spikeDuration));
  
  // Stop all users
  users.forEach(user => user.stop());
  
  // Wait for users to finish
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  const results = {
    scenario: 'Spike Load Test',
    duration: duration,
    maxUsers: spikeUsers,
    totalRequests,
    successfulRequests,
    failedRequests,
    successRate: ((successfulRequests / totalRequests) * 100).toFixed(2),
    averageResponseTime: responseTimes.length > 0 ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2) : 0,
    minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
    maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
    throughput: (successfulRequests / (duration / 1000)).toFixed(2)
  };
  
  log(`Spike Load Test Results:`);
  log(`Duration: ${duration / 1000}s, Users: ${spikeUsers}`);
  log(`Requests: ${totalRequests} (${successfulRequests} success, ${failedRequests} failed)`);
  log(`Success Rate: ${results.successRate}%`);
  log(`Throughput: ${results.throughput} req/s`);
  log(`Response Time: Avg ${results.averageResponseTime}ms, Min ${results.minResponseTime}ms, Max ${results.maxResponseTime}ms`);
  
  loadTestResults.push(results);
  return results;
}

// Scenario 3: Sustained Load Test
async function sustainedLoadTest() {
  log('=== Starting Sustained Load Test ===');
  
  const sustainedUsers = Math.floor(MAX_USERS * 0.7); // 70% of max users
  const sustainedDuration = 120000; // 2 minutes
  
  // Reset counters
  totalRequests = 0;
  successfulRequests = 0;
  failedRequests = 0;
  responseTimes = [];
  
  const startTime = Date.now();
  const users = [];
  
  // Add users gradually but to a sustained level
  log(`Creating sustained load with ${sustainedUsers} users...`);
  
  for (let i = 0; i < sustainedUsers; i++) {
    const user = new VirtualUser(i + 1);
    users.push(user);
    user.start();
    
    if (i % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  log(`Sustained load active with ${activeUsers} users`);
  
  // Track metrics during the test
  const metricsInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const currentThroughput = totalRequests > 0 ? (successfulRequests / (elapsed / 1000)).toFixed(2) : 0;
    log(`[${(elapsed / 1000).toFixed(0)}s] Active Users: ${activeUsers}, Total Requests: ${totalRequests}, Throughput: ${currentThroughput} req/s`);
  }, 10000); // Every 10 seconds
  
  // Run sustained load for specified duration
  await new Promise(resolve => setTimeout(resolve, sustainedDuration));
  
  clearInterval(metricsInterval);
  
  // Stop all users
  users.forEach(user => user.stop());
  
  // Wait for users to finish
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  const results = {
    scenario: 'Sustained Load Test',
    duration: duration,
    maxUsers: sustainedUsers,
    totalRequests,
    successfulRequests,
    failedRequests,
    successRate: ((successfulRequests / totalRequests) * 100).toFixed(2),
    averageResponseTime: responseTimes.length > 0 ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2) : 0,
    minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
    maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
    throughput: (successfulRequests / (duration / 1000)).toFixed(2)
  };
  
  log(`Sustained Load Test Results:`);
  log(`Duration: ${duration / 1000}s, Users: ${sustainedUsers}`);
  log(`Requests: ${totalRequests} (${successfulRequests} success, ${failedRequests} failed)`);
  log(`Success Rate: ${results.successRate}%`);
  log(`Throughput: ${results.throughput} req/s`);
  log(`Response Time: Avg ${results.averageResponseTime}ms, Min ${results.minResponseTime}ms, Max ${results.maxResponseTime}ms`);
  
  loadTestResults.push(results);
  return results;
}

/**
 * Database-intensive Load Test
 */
async function databaseLoadTest() {
  log('=== Starting Database Load Test ===');
  
  const dbUsers = 20;
  const dbDuration = 60000; // 1 minute
  
  // Reset counters
  totalRequests = 0;
  successfulRequests = 0;
  failedRequests = 0;
  responseTimes = [];
  
  const startTime = Date.now();
  const users = [];
  
  // Create users that will perform database-intensive operations
  for (let i = 0; i < dbUsers; i++) {
    const user = new VirtualUser(i + 1);
    users.push(user);
    
    // Override the user's makeRequest method for database operations
    user.makeRequest = async function() {
      const operations = [
        () => axios.get(`${BASE_URL}/api/users`, { headers: { Authorization: `Bearer ${authToken}` }}),
        () => axios.get(`${BASE_URL}/api/companies`, { headers: { Authorization: `Bearer ${authToken}` }}),
        () => axios.get(`${BASE_URL}/api/master-data`, { headers: { Authorization: `Bearer ${authToken}` }}),
        () => axios.get(`${BASE_URL}/api/person-info`, { headers: { Authorization: `Bearer ${authToken}` }}),
        () => axios.get(`${BASE_URL}/api/client-services`, { headers: { Authorization: `Bearer ${authToken}` }})
      ];
      
      const operation = operations[Math.floor(Math.random() * operations.length)];
      const startTime = Date.now();
      
      try {
        await operation();
        const responseTime = Date.now() - startTime;
        
        this.requestCount++;
        this.totalResponseTime += responseTime;
        totalRequests++;
        successfulRequests++;
        responseTimes.push(responseTime);
        
        return { success: true, responseTime };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        this.errors++;
        this.totalResponseTime += responseTime;
        totalRequests++;
        failedRequests++;
        
        return { success: false, responseTime, error: error.response?.status || error.message };
      }
    };
    
    user.start();
    
    // Stagger user start times
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  log(`Database load test running with ${activeUsers} users...`);
  
  // Run for specified duration
  await new Promise(resolve => setTimeout(resolve, dbDuration));
  
  // Stop all users
  users.forEach(user => user.stop());
  
  // Wait for users to finish
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  const results = {
    scenario: 'Database Load Test',
    duration: duration,
    maxUsers: dbUsers,
    totalRequests,
    successfulRequests,
    failedRequests,
    successRate: ((successfulRequests / totalRequests) * 100).toFixed(2),
    averageResponseTime: responseTimes.length > 0 ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2) : 0,
    minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
    maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
    throughput: (successfulRequests / (duration / 1000)).toFixed(2)
  };
  
  log(`Database Load Test Results:`);
  log(`Duration: ${duration / 1000}s, Users: ${dbUsers}`);
  log(`Requests: ${totalRequests} (${successfulRequests} success, ${failedRequests} failed)`);
  log(`Success Rate: ${results.successRate}%`);
  log(`Throughput: ${results.throughput} req/s`);
  log(`Response Time: Avg ${results.averageResponseTime}ms, Min ${results.minResponseTime}ms, Max ${results.maxResponseTime}ms`);
  
  loadTestResults.push(results);
  return results;
}

/**
 * Generate Load Test Report
 */
function generateLoadTestReport() {
  log('=== Generating Load Test Report ===');
  
  const report = {
    summary: {
      testDate: new Date().toISOString(),
      configuration: {
        baseUrl: BASE_URL,
        maxUsers: MAX_USERS,
        loadTestDuration: LOAD_TEST_DURATION,
        rampUpTime: RAMP_UP_TIME,
        requestInterval: REQUEST_INTERVAL
      },
      scenarios: loadTestResults.length
    },
    results: loadTestResults,
    systemInfo: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: process.memoryUsage()
    }
  };
  
  // Calculate overall statistics
  if (loadTestResults.length > 0) {
    const totalRequests = loadTestResults.reduce((sum, r) => sum + r.totalRequests, 0);
    const totalSuccessful = loadTestResults.reduce((sum, r) => sum + r.successfulRequests, 0);
    const totalFailed = loadTestResults.reduce((sum, r) => sum + r.failedRequests, 0);
    const avgThroughput = (loadTestResults.reduce((sum, r) => sum + parseFloat(r.throughput), 0) / loadTestResults.length).toFixed(2);
    
    report.summary.overall = {
      totalRequests,
      totalSuccessful,
      totalFailed,
      overallSuccessRate: ((totalSuccessful / totalRequests) * 100).toFixed(2),
      averageThroughput: avgThroughput
    };
  }
  
  // Save report to file
  const reportPath = './load-test-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  log(`Load test report saved to: ${reportPath}`);
  
  // Generate summary
  log('\n=== LOAD TEST SUMMARY ===');
  if (report.summary.overall) {
    log(`Total Requests: ${report.summary.overall.totalRequests}`);
    log(`Successful: ${report.summary.overall.totalSuccessful}`);
    log(`Failed: ${report.summary.overall.totalFailed}`);
    log(`Overall Success Rate: ${report.summary.overall.overallSuccessRate}%`);
    log(`Average Throughput: ${report.summary.overall.averageThroughput} req/s`);
  }
  
  loadTestResults.forEach(result => {
    log(`${result.scenario}: ${result.successRate}% success, ${result.throughput} req/s`);
  });
  
  return report;
}

/**
 * Main load test execution
 */
async function runLoadTests() {
  log('Starting CareDataManager Load Tests');
  log(`Base URL: ${BASE_URL}`);
  log(`Max Users: ${MAX_USERS}, Duration: ${LOAD_TEST_DURATION / 1000}s`);
  
  try {
    // Authenticate first
    const authSuccess = await authenticate();
    if (!authSuccess) {
      log('Authentication failed - stopping load tests');
      return;
    }
    
    // Run load test scenarios
    await gradualLoadTest();
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait between tests
    
    await spikeLoadTest();
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait between tests
    
    await sustainedLoadTest();
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait between tests
    
    await databaseLoadTest();
    
  } catch (error) {
    log(`Load test error: ${error.message}`, 'ERROR');
  } finally {
    generateLoadTestReport();
  }
}

// Export for use as module or run directly
if (require.main === module) {
  runLoadTests();
}

module.exports = {
  runLoadTests,
  gradualLoadTest,
  spikeLoadTest,
  sustainedLoadTest,
  databaseLoadTest,
  VirtualUser
};
