/**
 * Comprehensive API Test Suite for CareDataManager
 * 
 * This test suite validates all API endpoints for functionality, security, and error handling.
 * It tests authentication, CRUD operations, middleware functionality, and security features.
 */

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001';
const ADMIN_USERNAME = 'admin1';
const ADMIN_PASSWORD = 'Admin@123';
const USER_USERNAME = 'btbt';
const USER_PASSWORD = 'password';

// Test Results Storage
let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  details: []
};

// Authentication token storage
let authToken = null;
let refreshToken = null;
let testUserId = null;

// Test data storage
let testCompanyId = null;
let testSegmentId = null;
let testPersonId = null;
let testMasterDataId = null;
let testClientServiceId = null;
let testDocumentId = null;

/**
 * Utility functions
 */
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`);
}

function logTest(testName, result, details = '') {
  const status = result ? 'PASS' : 'FAIL';
  log(`${testName}: ${status} ${details}`, status);
  
  testResults.details.push({
    test: testName,
    status,
    details,
    timestamp: new Date().toISOString()
  });
  
  if (result) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

function skipTest(testName, reason) {
  log(`${testName}: SKIP - ${reason}`, 'SKIP');
  testResults.skipped++;
  testResults.details.push({
    test: testName,
    status: 'SKIP',
    details: reason,
    timestamp: new Date().toISOString()
  });
}

/**
 * HTTP request wrapper with error handling
 */
async function makeRequest(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status, headers: response.headers };
  } catch (error) {
    return {
      success: false,
      error: error.response ? error.response.data : error.message,
      status: error.response ? error.response.status : 500,
      headers: error.response ? error.response.headers : {}
    };
  }
}

/**
 * Authentication Tests
 */
async function testAuthentication() {
  log('=== Starting Authentication Tests ===');
  
  // Test 1: Login with valid credentials
  const loginResult = await makeRequest('POST', '/api/auth/login', {
    username: TEST_USERNAME,
    password: TEST_PASSWORD
  });
    if (loginResult.success && loginResult.data.tokens?.accessToken) {
    authToken = loginResult.data.tokens.accessToken;
    refreshToken = loginResult.data.tokens.refreshToken;
    testUserId = loginResult.data.user?.id;
    logTest('Auth - Valid Login', true, `Token received: ${authToken.substring(0, 20)}...`);
  } else {
    logTest('Auth - Valid Login', false, `Login failed: ${JSON.stringify(loginResult.error)}`);
    return false; // Cannot continue without authentication
  }
  
  // Test 2: Login with invalid credentials
  const invalidLoginResult = await makeRequest('POST', '/api/auth/login', {
    username: 'invalid',
    password: 'invalid'
  });
  
  logTest('Auth - Invalid Login', 
    !invalidLoginResult.success && invalidLoginResult.status === 401,
    `Status: ${invalidLoginResult.status}`);
  
  // Test 3: Auth status check
  const statusResult = await makeRequest('GET', '/api/auth/status');
  logTest('Auth - Status Check', 
    statusResult.success && statusResult.data.user,
    `User: ${statusResult.data?.user?.username}`);
  
  // Test 4: Session validation
  const sessionResult = await makeRequest('GET', '/api/validate-session');
  logTest('Auth - Session Validation', 
    sessionResult.success,
    `Valid: ${sessionResult.success}`);
  
  // Test 5: Refresh token
  if (refreshToken) {
    const refreshResult = await makeRequest('POST', '/api/auth/refresh', {
      refreshToken: refreshToken
    });
    
    if (refreshResult.success && refreshResult.data.token) {
      authToken = refreshResult.data.token; // Update token
      logTest('Auth - Token Refresh', true, 'New token received');
    } else {
      logTest('Auth - Token Refresh', false, JSON.stringify(refreshResult.error));
    }
  }
  
  return true;
}

/**
 * User Management Tests
 */
async function testUserManagement() {
  log('=== Starting User Management Tests ===');
  
  // Test 1: Get all users (admin only)
  const usersResult = await makeRequest('GET', '/api/users');
  logTest('Users - Get All Users', 
    usersResult.success && Array.isArray(usersResult.data),
    `Found ${usersResult.data?.length} users`);
  
  // Test 2: Get user by ID
  if (testUserId) {
    const userResult = await makeRequest('GET', `/api/users/${testUserId}`);
    logTest('Users - Get User by ID', 
      userResult.success && userResult.data.id === testUserId,
      `User: ${userResult.data?.username}`);
  }
  
  // Test 3: Create new user
  const newUserData = {
    name: 'Test User',
    username: `testuser_${Date.now()}`,
    password: 'Password123!',
    role: 'user',
    company_id: null
  };
  
  const createUserResult = await makeRequest('POST', '/api/users', newUserData);
  let createdUserId = null;
  
  if (createUserResult.success) {
    createdUserId = createUserResult.data.id;
    logTest('Users - Create User', true, `Created user ID: ${createdUserId}`);
  } else {
    logTest('Users - Create User', false, JSON.stringify(createUserResult.error));
  }
  
  // Test 4: Update user
  if (createdUserId) {
    const updateResult = await makeRequest('PUT', `/api/users/${createdUserId}`, {
      name: 'Updated Test User'
    });
    logTest('Users - Update User', 
      updateResult.success,
      `Updated: ${updateResult.success}`);
  }
  
  // Test 5: Change password
  const changePasswordResult = await makeRequest('POST', '/api/change-password', {
    currentPassword: TEST_PASSWORD,
    newPassword: 'NewPassword123!'
  });
  
  if (changePasswordResult.success) {
    logTest('Users - Change Password', true, 'Password changed successfully');
    
    // Change it back for other tests
    await makeRequest('POST', '/api/change-password', {
      currentPassword: 'NewPassword123!',
      newPassword: TEST_PASSWORD
    });
  } else {
    logTest('Users - Change Password', false, JSON.stringify(changePasswordResult.error));
  }
  
  return true;
}

/**
 * Company Management Tests
 */
async function testCompanyManagement() {
  log('=== Starting Company Management Tests ===');
  
  // Test 1: Get all companies
  const companiesResult = await makeRequest('GET', '/api/companies');
  logTest('Companies - Get All Companies', 
    companiesResult.success && Array.isArray(companiesResult.data),
    `Found ${companiesResult.data?.length} companies`);
  
  // Test 2: Create new company
  const newCompanyData = {
    company_name: `Test Company ${Date.now()}`,
    abn: '12345678901',
    registered_address: '123 Test Street, Test City',
    postal_address: '123 Test Street, Test City',
    contact_person_name: 'Test Contact',
    contact_person_phone: '1234567890',
    contact_person_email: 'test@example.com'
  };
  
  const createCompanyResult = await makeRequest('POST', '/api/companies', newCompanyData);
  
  if (createCompanyResult.success) {
    testCompanyId = createCompanyResult.data.id;
    logTest('Companies - Create Company', true, `Created company ID: ${testCompanyId}`);
  } else {
    logTest('Companies - Create Company', false, JSON.stringify(createCompanyResult.error));
  }
  
  // Test 3: Update company
  if (testCompanyId) {
    const updateResult = await makeRequest('PUT', `/api/companies/${testCompanyId}`, {
      company_name: 'Updated Test Company',
      abn: '12345678901',
      registered_address: '123 Updated Street, Test City',
      postal_address: '123 Updated Street, Test City',
      contact_person_name: 'Updated Contact',
      contact_person_phone: '0987654321',
      contact_person_email: 'updated@example.com'
    });
    logTest('Companies - Update Company', 
      updateResult.success,
      `Updated: ${updateResult.success}`);
  }
  
  return true;
}

/**
 * Segment Management Tests
 */
async function testSegmentManagement() {
  log('=== Starting Segment Management Tests ===');
  
  if (!testCompanyId) {
    skipTest('Segments - All Tests', 'No test company available');
    return false;
  }
  
  // Test 1: Get segments by company
  const segmentsResult = await makeRequest('GET', `/api/segments/${testCompanyId}`);
  logTest('Segments - Get by Company', 
    segmentsResult.success && Array.isArray(segmentsResult.data),
    `Found ${segmentsResult.data?.length} segments`);
  
  // Test 2: Create new segment
  const newSegmentData = {
    segment_name: `Test Segment ${Date.now()}`,
    company_id: testCompanyId
  };
  
  const createSegmentResult = await makeRequest('POST', '/api/segments', newSegmentData);
  
  if (createSegmentResult.success) {
    testSegmentId = createSegmentResult.data.id;
    logTest('Segments - Create Segment', true, `Created segment ID: ${testSegmentId}`);
  } else {
    logTest('Segments - Create Segment', false, JSON.stringify(createSegmentResult.error));
  }
  
  // Test 3: Update segment
  if (testSegmentId) {
    const updateResult = await makeRequest('PUT', `/api/segments/${testSegmentId}`, {
      segment_name: 'Updated Test Segment'
    });
    logTest('Segments - Update Segment', 
      updateResult.success,
      `Updated: ${updateResult.success}`);
  }
  
  // Test 4: Get user segments
  const userSegmentsResult = await makeRequest('GET', '/api/user/segments');
  logTest('Segments - Get User Segments', 
    userSegmentsResult.success && Array.isArray(userSegmentsResult.data),
    `Found ${userSegmentsResult.data?.length} user segments`);
  
  return true;
}

/**
 * Master Data Tests
 */
async function testMasterData() {
  log('=== Starting Master Data Tests ===');
  
  // Test 1: Get all master data
  const masterDataResult = await makeRequest('GET', '/api/master-data');
  logTest('Master Data - Get All', 
    masterDataResult.success && Array.isArray(masterDataResult.data),
    `Found ${masterDataResult.data?.length} entries`);
  
  // Test 2: Create master data entry
  const newMasterData = {
    category: 'Test Category',
    type: 'Test Type',
    provider: 'Test Provider',
    active: true,
    segmentId: testSegmentId
  };
  
  const createMasterDataResult = await makeRequest('POST', '/api/master-data', newMasterData);
  
  if (createMasterDataResult.success) {
    testMasterDataId = createMasterDataResult.data.id;
    logTest('Master Data - Create Entry', true, `Created master data ID: ${testMasterDataId}`);
  } else {
    logTest('Master Data - Create Entry', false, JSON.stringify(createMasterDataResult.error));
  }
  
  // Test 3: Update master data entry
  if (testMasterDataId) {
    const updateResult = await makeRequest('PUT', `/api/master-data/${testMasterDataId}`, {
      category: 'Updated Category',
      type: 'Updated Type',
      provider: 'Updated Provider',
      active: true,
      segmentId: testSegmentId
    });
    logTest('Master Data - Update Entry', 
      updateResult.success,
      `Updated: ${updateResult.success}`);
  }
  
  // Test 4: Verify master data exists
  const verifyResult = await makeRequest('GET', '/api/master-data/verify', null, {
    params: {
      category: 'Updated Category',
      type: 'Updated Type',
      provider: 'Updated Provider',
      segmentId: testSegmentId
    }
  });
  logTest('Master Data - Verify Exists', 
    verifyResult.success,
    `Exists: ${verifyResult.data?.exists}`);
  
  return true;
}

/**
 * Person Info (Client) Tests
 */
async function testPersonInfo() {
  log('=== Starting Person Info Tests ===');
  
  // Test 1: Get all person info
  const personInfoResult = await makeRequest('GET', '/api/person-info');
  logTest('Person Info - Get All', 
    personInfoResult.success && Array.isArray(personInfoResult.data),
    `Found ${personInfoResult.data?.length} clients`);
  
  // Test 2: Create person info
  const newPersonData = {
    firstName: 'Test',
    lastName: 'Client',
    dateOfBirth: '1990-01-01',
    gender: 'Male',
    email: 'testclient@example.com',
    phone: '1234567890',
    homeAddress: '123 Client Street',
    homeCity: 'Test City',
    homeState: 'Test State',
    homePostCode: '12345',
    mailingAddressLine1: '123 Client Street',
    mailingCity: 'Test City',
    mailingState: 'Test State',
    mailingPostCode: '12345',
    nextOfKinName: 'Test Kin',
    nextOfKinPhone: '0987654321',
    hcpLevel: 'Level 1',
    status: 'New',
    segmentId: testSegmentId
  };
  
  const createPersonResult = await makeRequest('POST', '/api/person-info', newPersonData);
  
  if (createPersonResult.success) {
    testPersonId = createPersonResult.data.id;
    logTest('Person Info - Create Client', true, `Created client ID: ${testPersonId}`);
  } else {
    logTest('Person Info - Create Client', false, JSON.stringify(createPersonResult.error));
  }
  
  // Test 3: Get person by ID
  if (testPersonId) {
    const personResult = await makeRequest('GET', `/api/person-info/${testPersonId}`);
    logTest('Person Info - Get by ID', 
      personResult.success && personResult.data.id === testPersonId,
      `Client: ${personResult.data?.firstName} ${personResult.data?.lastName}`);
  }
  
  // Test 4: Update person info
  if (testPersonId) {
    const updateResult = await makeRequest('PUT', `/api/person-info/${testPersonId}`, {
      ...newPersonData,
      firstName: 'Updated Test',
      status: 'Active'
    });
    logTest('Person Info - Update Client', 
      updateResult.success,
      `Updated: ${updateResult.success}`);
  }
  
  return true;
}

/**
 * Client Services Tests
 */
async function testClientServices() {
  log('=== Starting Client Services Tests ===');
  
  if (!testPersonId) {
    skipTest('Client Services - All Tests', 'No test client available');
    return false;
  }
  
  // Test 1: Get all client services
  const servicesResult = await makeRequest('GET', '/api/client-services');
  logTest('Client Services - Get All', 
    servicesResult.success && Array.isArray(servicesResult.data),
    `Found ${servicesResult.data?.length} services`);
  
  // Test 2: Create client service
  const newServiceData = {
    clientId: testPersonId,
    serviceCategory: 'Test Service',
    serviceType: 'Test Type',
    provider: 'Test Provider',
    startDate: '2024-01-01',
    status: 'Active',
    notes: 'Test service notes',
    segmentId: testSegmentId
  };
  
  const createServiceResult = await makeRequest('POST', '/api/client-services', newServiceData);
  
  if (createServiceResult.success) {
    testClientServiceId = createServiceResult.data.id;
    logTest('Client Services - Create Service', true, `Created service ID: ${testClientServiceId}`);
  } else {
    logTest('Client Services - Create Service', false, JSON.stringify(createServiceResult.error));
  }
  
  // Test 3: Get services by client
  const clientServicesResult = await makeRequest('GET', `/api/client-services/client/${testPersonId}`);
  logTest('Client Services - Get by Client', 
    clientServicesResult.success && Array.isArray(clientServicesResult.data),
    `Found ${clientServicesResult.data?.length} services for client`);
  
  // Test 4: Update service status
  if (testClientServiceId) {
    const updateStatusResult = await makeRequest('PATCH', `/api/client-assignment/${testClientServiceId}`, {
      status: 'Completed'
    });
    logTest('Client Services - Update Status', 
      updateStatusResult.success,
      `Updated: ${updateStatusResult.success}`);
  }
  
  return true;
}

/**
 * Service Case Notes Tests
 */
async function testServiceCaseNotes() {
  log('=== Starting Service Case Notes Tests ===');
  
  if (!testClientServiceId) {
    skipTest('Service Case Notes - All Tests', 'No test service available');
    return false;
  }
  
  // Test 1: Create service case note
  const newNoteData = {
    serviceId: testClientServiceId,
    noteText: 'This is a test case note for the service.'
  };
  
  const createNoteResult = await makeRequest('POST', '/api/service-case-notes', newNoteData);
  logTest('Service Case Notes - Create Note', 
    createNoteResult.success,
    `Created: ${createNoteResult.success}`);
  
  // Test 2: Update service case note
  const updateNoteData = {
    noteText: 'This is an updated test case note for the service.'
  };
  
  const updateNoteResult = await makeRequest('PUT', `/api/service-case-notes/${testClientServiceId}`, updateNoteData);
  logTest('Service Case Notes - Update Note', 
    updateNoteResult.success,
    `Updated: ${updateNoteResult.success}`);
  
  return true;
}

/**
 * Document Management Tests
 */
async function testDocumentManagement() {
  log('=== Starting Document Management Tests ===');
  
  if (!testPersonId) {
    skipTest('Documents - All Tests', 'No test client available');
    return false;
  }
  
  // Test 1: Create a test file for upload
  const testFileContent = 'This is a test document for API testing.';
  const testFilePath = './test-document.txt';
  fs.writeFileSync(testFilePath, testFileContent);
  
  // Test 2: Upload document
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath));
    formData.append('clientId', testPersonId.toString());
    formData.append('documentName', 'Test Document');
    formData.append('documentType', 'Test Type');
    if (testSegmentId) {
      formData.append('segmentId', testSegmentId.toString());
    }
    
    const uploadConfig = {
      method: 'POST',
      url: `${BASE_URL}/api/documents`,
      data: formData,
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${authToken}`
      }
    };
    
    const uploadResult = await axios(uploadConfig);
    
    if (uploadResult.status === 201) {
      testDocumentId = uploadResult.data.id;
      logTest('Documents - Upload Document', true, `Uploaded document ID: ${testDocumentId}`);
    } else {
      logTest('Documents - Upload Document', false, `Status: ${uploadResult.status}`);
    }
  } catch (error) {
    logTest('Documents - Upload Document', false, error.message);
  }
  
  // Test 3: Get documents by client
  const clientDocsResult = await makeRequest('GET', `/api/documents/client/${testPersonId}`);
  logTest('Documents - Get by Client', 
    clientDocsResult.success && Array.isArray(clientDocsResult.data),
    `Found ${clientDocsResult.data?.length} documents`);
  
  // Clean up test file
  if (fs.existsSync(testFilePath)) {
    fs.unlinkSync(testFilePath);
  }
  
  return true;
}

/**
 * Security Tests
 */
async function testSecurity() {
  log('=== Starting Security Tests ===');
  
  // Test 1: Unauthorized access
  const tempToken = authToken;
  authToken = null; // Remove token
  
  const unauthorizedResult = await makeRequest('GET', '/api/users');
  logTest('Security - Unauthorized Access', 
    !unauthorizedResult.success && unauthorizedResult.status === 401,
    `Status: ${unauthorizedResult.status}`);
  
  authToken = tempToken; // Restore token
  
  // Test 2: Invalid token
  authToken = 'invalid-token';
  
  const invalidTokenResult = await makeRequest('GET', '/api/users');
  logTest('Security - Invalid Token', 
    !invalidTokenResult.success && (invalidTokenResult.status === 401 || invalidTokenResult.status === 403),
    `Status: ${invalidTokenResult.status}`);
  
  authToken = tempToken; // Restore token
  
  // Test 3: SQL Injection attempt
  const sqlInjectionResult = await makeRequest('GET', "/api/users/'; DROP TABLE users; --");
  logTest('Security - SQL Injection Protection', 
    !sqlInjectionResult.success && sqlInjectionResult.status === 400,
    `Status: ${sqlInjectionResult.status}`);
  
  // Test 4: XSS attempt in input
  const xssData = {
    name: '<script>alert("xss")</script>',
    username: 'xsstest',
    password: 'Password123!',
    role: 'user'
  };
  
  const xssResult = await makeRequest('POST', '/api/users', xssData);
  // Should either sanitize the input or reject it
  logTest('Security - XSS Protection', 
    !xssResult.success || !xssResult.data?.name?.includes('<script>'),
    `Input sanitized: ${!xssResult.data?.name?.includes('<script>')}`);
  
  // Test 5: Rate limiting (make multiple rapid requests)
  const rateLimitPromises = [];
  for (let i = 0; i < 20; i++) {
    rateLimitPromises.push(makeRequest('GET', '/api/users'));
  }
  
  const rateLimitResults = await Promise.all(rateLimitPromises);
  const tooManyRequests = rateLimitResults.some(result => result.status === 429);
  
  logTest('Security - Rate Limiting', 
    tooManyRequests,
    `Rate limit triggered: ${tooManyRequests}`);
  
  return true;
}

/**
 * Error Handling Tests
 */
async function testErrorHandling() {
  log('=== Starting Error Handling Tests ===');
  
  // Test 1: Non-existent endpoint
  const notFoundResult = await makeRequest('GET', '/api/nonexistent');
  logTest('Error Handling - 404 Not Found', 
    notFoundResult.status === 404,
    `Status: ${notFoundResult.status}`);
  
  // Test 2: Invalid ID format
  const invalidIdResult = await makeRequest('GET', '/api/users/invalid-id');
  logTest('Error Handling - Invalid ID Format', 
    !invalidIdResult.success && invalidIdResult.status === 400,
    `Status: ${invalidIdResult.status}`);
  
  // Test 3: Missing required fields
  const missingFieldsResult = await makeRequest('POST', '/api/users', {
    name: 'Test User'
    // Missing username, password, role
  });
  logTest('Error Handling - Missing Required Fields', 
    !missingFieldsResult.success && invalidIdResult.status === 400,
    `Status: ${missingFieldsResult.status}`);
  
  // Test 4: Invalid JSON
  try {
    const invalidJsonConfig = {
      method: 'POST',
      url: `${BASE_URL}/api/users`,
      data: 'invalid json string',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      }
    };
    
    const invalidJsonResult = await axios(invalidJsonConfig);
    logTest('Error Handling - Invalid JSON', false, 'Should have failed');
  } catch (error) {
    logTest('Error Handling - Invalid JSON', 
      error.response?.status === 400,
      `Status: ${error.response?.status}`);
  }
  
  return true;
}

/**
 * Logout Test
 */
async function testLogout() {
  log('=== Starting Logout Test ===');
  
  const logoutResult = await makeRequest('POST', '/api/auth/logout');
  logTest('Auth - Logout', 
    logoutResult.success,
    `Logged out: ${logoutResult.success}`);
  
  // Verify token is invalidated
  const afterLogoutResult = await makeRequest('GET', '/api/auth/status');
  logTest('Auth - Token Invalidated After Logout', 
    !afterLogoutResult.success,
    `Token invalid: ${!afterLogoutResult.success}`);
  
  return true;
}

/**
 * Generate Test Report
 */
function generateTestReport() {
  log('=== Generating Test Report ===');
  
  const report = {
    summary: {
      total: testResults.passed + testResults.failed + testResults.skipped,
      passed: testResults.passed,
      failed: testResults.failed,
      skipped: testResults.skipped,
      successRate: `${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(2)}%`
    },
    timestamp: new Date().toISOString(),
    details: testResults.details
  };
  
  // Save report to file
  const reportPath = './test-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  log(`\n=== TEST SUMMARY ===`);
  log(`Total Tests: ${report.summary.total}`);
  log(`Passed: ${report.summary.passed}`);
  log(`Failed: ${report.summary.failed}`);
  log(`Skipped: ${report.summary.skipped}`);
  log(`Success Rate: ${report.summary.successRate}`);
  log(`Report saved to: ${reportPath}`);
  
  return report;
}

/**
 * Main test execution
 */
async function runAllTests() {
  log('Starting CareDataManager API Test Suite');
  log(`Base URL: ${BASE_URL}`);
  log(`Test User: ${TEST_USERNAME}`);
  
  try {
    // Authentication must succeed for other tests to run
    const authSuccess = await testAuthentication();
    if (!authSuccess) {
      log('Authentication failed - stopping test execution');
      return;
    }
    
    // Run all test suites
    await testUserManagement();
    await testCompanyManagement();
    await testSegmentManagement();
    await testMasterData();
    await testPersonInfo();
    await testClientServices();
    await testServiceCaseNotes();
    await testDocumentManagement();
    await testSecurity();
    await testErrorHandling();
    await testLogout();
    
  } catch (error) {
    log(`Test execution error: ${error.message}`, 'ERROR');
  } finally {
    generateTestReport();
  }
}

// Export for use as module or run directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
  testAuthentication,
  testUserManagement,
  testCompanyManagement,
  testSegmentManagement,
  testMasterData,
  testPersonInfo,
  testClientServices,
  testServiceCaseNotes,
  testDocumentManagement,
  testSecurity,
  testErrorHandling
};
