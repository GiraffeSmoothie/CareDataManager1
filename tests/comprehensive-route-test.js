/**
 * Comprehensive Route Testing for CareDataManager
 * 
 * This test suite validates all API routes with appropriate user credentials:
 * - Admin user (admin/password) for company and segment operations
 * - Normal user (btbt/password) for all other operations
 */

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// Configuration
const BASE_URL = 'http://localhost:5001';
const ADMIN_USERNAME = 'admin1';  // Using admin1 for admin operations
const ADMIN_PASSWORD = 'Admin@123';
const USER_USERNAME = 'btbt';
const USER_PASSWORD = 'password';

// Test Results Storage
let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: [],
  details: []
};

// Authentication tokens
let adminToken = null;
let userToken = null;

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
    status: status,
    details: details,
    timestamp: new Date().toISOString()
  });
  
  if (result) {
    testResults.passed++;
  } else {
    testResults.failed++;
    testResults.errors.push(`${testName}: ${details}`);
  }
}

/**
 * Make HTTP request with error handling
 */
async function makeRequest(endpoint, method = 'GET', data = null, token = null, isFormData = false) {
  try {
    const config = {
      method: method,
      url: `${BASE_URL}${endpoint}`,
      timeout: 10000,
      validateStatus: () => true // Don't throw on any status code
    };

    if (token) {
      config.headers = { Authorization: `Bearer ${token}` };
    }

    if (data) {
      if (isFormData) {
        config.data = data;
        config.headers = {
          ...config.headers,
          ...data.getHeaders()
        };
      } else {
        config.data = data;
        if (!config.headers) config.headers = {};
        config.headers['Content-Type'] = 'application/json';
      }
    }

    const response = await axios(config);
    return {
      status: response.status,
      data: response.data,
      headers: response.headers
    };
  } catch (error) {
    log(`Request failed: ${error.message}`, 'ERROR');
    return {
      status: error.response?.status || 500,
      data: error.response?.data || { message: error.message },
      error: error.message
    };
  }
}

/**
 * Authentication Tests
 */
async function testAuthentication() {
  log('=== Testing Authentication ===');
    // Test admin login
  try {
    const adminLogin = await makeRequest('/api/auth/login', 'POST', {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    });
    
    if (adminLogin.status === 200 && adminLogin.data.success && adminLogin.data.tokens?.accessToken) {
      adminToken = adminLogin.data.tokens.accessToken;
      logTest('Admin Login', true, 'Successfully logged in as admin');
    } else {
      logTest('Admin Login', false, `Status: ${adminLogin.status}, Data: ${JSON.stringify(adminLogin.data)}`);
      return false;
    }
  } catch (error) {
    logTest('Admin Login', false, `Error: ${error.message}`);
    return false;
  }

  // Test user login
  try {
    const userLogin = await makeRequest('/api/auth/login', 'POST', {
      username: USER_USERNAME,
      password: USER_PASSWORD
    });
    
    if (userLogin.status === 200 && userLogin.data.success && userLogin.data.tokens?.accessToken) {
      userToken = userLogin.data.tokens.accessToken;
      logTest('User Login', true, 'Successfully logged in as normal user');
    } else {
      logTest('User Login', false, `Status: ${userLogin.status}, Data: ${JSON.stringify(userLogin.data)}`);
      return false;
    }
  } catch (error) {
    logTest('User Login', false, `Error: ${error.message}`);
    return false;
  }

  return true;
}

/**
 * Company Management Tests (Admin only)
 */
async function testCompanyManagement() {
  log('=== Testing Company Management (Admin) ===');
  
  // Test get all companies
  const getCompanies = await makeRequest('/api/companies', 'GET', null, adminToken);
  logTest('Get Companies', getCompanies.status === 200, `Status: ${getCompanies.status}`);
  
  // Test create company
  const companyData = {
    company_name: `Test Company ${Date.now()}`,
    registered_address: '123 Test Street, Test City',
    postal_address: '123 Test Street, Test City',
    contact_person_name: 'John Doe',
    contact_person_phone: '1234567890',
    contact_person_email: 'john.doe@testcompany.com'
  };
  
  const createCompany = await makeRequest('/api/companies', 'POST', companyData, adminToken);
  if (createCompany.status === 201 && createCompany.data.company_id) {
    testCompanyId = createCompany.data.company_id;
    logTest('Create Company', true, `Created company ID: ${testCompanyId}`);
  } else {
    logTest('Create Company', false, `Status: ${createCompany.status}, Data: ${JSON.stringify(createCompany.data)}`);
  }
  
  // Test update company (if created successfully)
  if (testCompanyId) {
    const updateData = {
      ...companyData,
      company_name: `Updated ${companyData.company_name}`
    };
    
    const updateCompany = await makeRequest(`/api/companies/${testCompanyId}`, 'PUT', updateData, adminToken);
    logTest('Update Company', updateCompany.status === 200, `Status: ${updateCompany.status}`);
  }
}

/**
 * Segment Management Tests (Admin only)
 */
async function testSegmentManagement() {
  log('=== Testing Segment Management (Admin) ===');
  
  if (!testCompanyId) {
    logTest('Segment Tests', false, 'No company ID available for segment tests');
    return;
  }
  
  // Test get segments by company
  const getSegments = await makeRequest(`/api/segments/${testCompanyId}`, 'GET', null, adminToken);
  logTest('Get Segments by Company', getSegments.status === 200, `Status: ${getSegments.status}`);
  
  // Test create segment
  const segmentData = {
    segment_name: `Test Segment ${Date.now()}`,
    company_id: testCompanyId
  };
  
  const createSegment = await makeRequest('/api/segments', 'POST', segmentData, adminToken);
  if (createSegment.status === 201 && createSegment.data.id) {
    testSegmentId = createSegment.data.id;
    logTest('Create Segment', true, `Created segment ID: ${testSegmentId}`);
  } else {
    logTest('Create Segment', false, `Status: ${createSegment.status}, Data: ${JSON.stringify(createSegment.data)}`);
  }
  
  // Test update segment
  if (testSegmentId) {
    const updateSegmentData = {
      segment_name: `Updated ${segmentData.segment_name}`
    };
    
    const updateSegment = await makeRequest(`/api/segments/${testSegmentId}`, 'PUT', updateSegmentData, adminToken);
    logTest('Update Segment', updateSegment.status === 200, `Status: ${updateSegment.status}`);
  }
  
  // Test get user segments
  const getUserSegments = await makeRequest('/api/user/segments', 'GET', null, userToken);
  logTest('Get User Segments', getUserSegments.status === 200, `Status: ${getUserSegments.status}`);
}

/**
 * User Management Tests
 */
async function testUserManagement() {
  log('=== Testing User Management ===');
  
  // Test get all users (should work for authenticated users)
  const getUsers = await makeRequest('/api/users', 'GET', null, userToken);
  logTest('Get Users', getUsers.status === 200, `Status: ${getUsers.status}`);
  
  // Test change password
  const changePasswordData = {
    currentPassword: USER_PASSWORD,
    newPassword: 'newpassword123'
  };
  
  const changePassword = await makeRequest('/api/change-password', 'POST', changePasswordData, userToken);
  logTest('Change Password', changePassword.status === 200, `Status: ${changePassword.status}`);
  
  // Change password back
  if (changePassword.status === 200) {
    const revertPasswordData = {
      currentPassword: 'newpassword123',
      newPassword: USER_PASSWORD
    };
    
    const revertPassword = await makeRequest('/api/change-password', 'POST', revertPasswordData, userToken);
    logTest('Revert Password', revertPassword.status === 200, `Status: ${revertPassword.status}`);
  }
}

/**
 * Master Data Tests
 */
async function testMasterData() {
  log('=== Testing Master Data Management ===');
  
  // Test get all master data
  const getMasterData = await makeRequest('/api/master-data', 'GET', null, userToken);
  logTest('Get Master Data', getMasterData.status === 200, `Status: ${getMasterData.status}`);
  
  // Get user's accessible segment for master data tests
  let userSegmentId = testSegmentId;
  const getUserInfo = await makeRequest('/api/user/segments', 'GET', null, userToken);
  if (getUserInfo.status === 200 && getUserInfo.data.length > 0) {
    userSegmentId = getUserInfo.data[0].id;
  }
  
  if (userSegmentId) {
    // Test create master data
    const masterDataItem = {
      serviceCategory: 'Home Care',
      serviceType: 'Personal Care',
      serviceProvider: `Test Provider ${Date.now()}`,
      segmentId: userSegmentId
    };
    
    const createMasterData = await makeRequest('/api/master-data', 'POST', masterDataItem, userToken);
    if (createMasterData.status === 201 && createMasterData.data.id) {
      testMasterDataId = createMasterData.data.id;
      logTest('Create Master Data', true, `Created master data ID: ${testMasterDataId}`);
    } else {
      logTest('Create Master Data', false, `Status: ${createMasterData.status}, Data: ${JSON.stringify(createMasterData.data)}`);
    }
    
    // Test update master data
    if (testMasterDataId) {
      const updatedMasterDataItem = {
        ...masterDataItem,
        serviceProvider: `Updated ${masterDataItem.serviceProvider}`
      };
      const updateMasterData = await makeRequest(`/api/master-data/${testMasterDataId}`, 'PUT', updatedMasterDataItem, userToken);
      logTest('Update Master Data', updateMasterData.status === 200, `Status: ${updateMasterData.status}`);
      
      // Update the masterDataItem to reflect the changes for verification
      if (updateMasterData.status === 200) {
        masterDataItem.serviceProvider = updatedMasterDataItem.serviceProvider;
      }
    }
    
    // Test check master data exists using the existing verify endpoint
    const checkExistsUrl = `/api/master-data/verify?category=${encodeURIComponent(masterDataItem.serviceCategory)}&type=${encodeURIComponent(masterDataItem.serviceType)}&provider=${encodeURIComponent(masterDataItem.serviceProvider)}&segmentId=${userSegmentId}`;
    const checkExists = await makeRequest(checkExistsUrl, 'GET', null, userToken);
    logTest('Check Master Data Exists', checkExists.status === 200, `Status: ${checkExists.status}`);
  } else {
    logTest('Master Data Tests', false, 'No accessible segment found for master data tests');
  }
}

/**
 * Person Info Tests
 */
async function testPersonInfo() {
  log('=== Testing Person Info Management ===');
  
  // Test get all person info
  const getPersonInfo = await makeRequest('/api/person-info', 'GET', null, userToken);
  logTest('Get Person Info', getPersonInfo.status === 200, `Status: ${getPersonInfo.status}`);
  
  // Test create person info
  const personData = {
    title: 'Mr',
    firstName: 'Test',
    lastName: `User${Date.now()}`,
    dateOfBirth: '1990-01-01',
    email: `test${Date.now()}@example.com`,
    mobilePhone: '0400000000',
    addressLine1: '123 Test Street',
    postCode: '2000',
    segmentId: testSegmentId
  };
  
  const createPerson = await makeRequest('/api/person-info', 'POST', personData, userToken);
  if (createPerson.status === 201 && createPerson.data.id) {
    testPersonId = createPerson.data.id;
    logTest('Create Person Info', true, `Created person ID: ${testPersonId}`);
  } else {
    logTest('Create Person Info', false, `Status: ${createPerson.status}, Data: ${JSON.stringify(createPerson.data)}`);
  }
  
  // Test get person by ID
  if (testPersonId) {
    const getPersonById = await makeRequest(`/api/person-info/${testPersonId}`, 'GET', null, userToken);
    logTest('Get Person by ID', getPersonById.status === 200, `Status: ${getPersonById.status}`);
    
    // Test update person info
    const updatePerson = await makeRequest(`/api/person-info/${testPersonId}`, 'PUT', {
      ...personData,
      firstName: `Updated${personData.firstName}`
    }, userToken);
    logTest('Update Person Info', updatePerson.status === 200, `Status: ${updatePerson.status}`);
  }
}

/**
 * Client Services Tests
 */
async function testClientServices() {
  log('=== Testing Client Services Management ===');
  
  if (!testPersonId || !testMasterDataId) {
    logTest('Client Services Tests', false, 'Missing person ID or master data ID for client services tests');
    return;
  }
  
  // Test get all client services
  const getClientServices = await makeRequest('/api/client-services', 'GET', null, userToken);
  logTest('Get Client Services', getClientServices.status === 200, `Status: ${getClientServices.status}`);
  
  // Test create client service
  const serviceData = {
    clientId: testPersonId,
    serviceCategory: 'Home Care',
    serviceType: 'Personal Care',
    serviceProvider: 'Test Provider',
    serviceStartDate: '2024-01-01',
    serviceDays: ['Monday', 'Wednesday', 'Friday'],
    serviceHours: 2,
    segmentId: testSegmentId
  };
  
  const createService = await makeRequest('/api/client-services', 'POST', serviceData, userToken);
  if (createService.status === 201 && createService.data.id) {
    testClientServiceId = createService.data.id;
    logTest('Create Client Service', true, `Created service ID: ${testClientServiceId}`);
  } else {
    logTest('Create Client Service', false, `Status: ${createService.status}, Data: ${JSON.stringify(createService.data)}`);
  }
  
  // Test get services by client ID
  if (testPersonId) {
    const getServicesByClient = await makeRequest(`/api/client-services/client/${testPersonId}`, 'GET', null, userToken);
    logTest('Get Services by Client', getServicesByClient.status === 200, `Status: ${getServicesByClient.status}`);
  }
  
  // Test update service status
  if (testClientServiceId) {
    const updateStatus = await makeRequest(`/api/client-services/${testClientServiceId}`, 'PATCH', {
      status: 'In Progress'
    }, userToken);
    logTest('Update Service Status', updateStatus.status === 200, `Status: ${updateStatus.status}`);
  }
}

/**
 * Service Case Notes Tests
 */
async function testServiceCaseNotes() {
  log('=== Testing Service Case Notes Management ===');
  
  if (!testClientServiceId) {
    logTest('Service Case Notes Tests', false, 'Missing client service ID for case notes tests');
    return;
  }
  
  // Test create service case note
  const caseNoteData = {
    serviceId: testClientServiceId,
    notes: `Test case note created at ${new Date().toISOString()}`,
    followUpRequired: false
  };
  
  const createCaseNote = await makeRequest('/api/service-case-notes', 'POST', caseNoteData, userToken);
  logTest('Create Service Case Note', createCaseNote.status === 201, `Status: ${createCaseNote.status}`);
  
  // Test get case notes by service ID
  const getCaseNotes = await makeRequest(`/api/service-case-notes/service/${testClientServiceId}`, 'GET', null, userToken);
  logTest('Get Case Notes by Service', getCaseNotes.status === 200, `Status: ${getCaseNotes.status}`);
  
  // Test get case notes count
  const getNotesCount = await makeRequest('/api/service-case-notes/counts', 'POST', {
    serviceIds: [testClientServiceId]
  }, userToken);
  logTest('Get Case Notes Count', getNotesCount.status === 200, `Status: ${getNotesCount.status}`);
}

/**
 * Document Management Tests
 */
async function testDocumentManagement() {
  log('=== Testing Document Management ===');
  
  if (!testPersonId) {
    logTest('Document Management Tests', false, 'Missing person ID for document tests');
    return;
  }
  
  // Test get documents by client ID
  const getDocuments = await makeRequest(`/api/documents/client/${testPersonId}`, 'GET', null, userToken);
  logTest('Get Documents by Client', getDocuments.status === 200, `Status: ${getDocuments.status}`);
  
  // Test document upload (create a test file)
  try {
    const testFileContent = 'This is a test document content';
    const form = new FormData();
    form.append('file', Buffer.from(testFileContent), {
      filename: 'test-document.txt',
      contentType: 'text/plain'
    });
    
    const uploadDoc = await makeRequest(`/api/documents/upload/${testPersonId}`, 'POST', form, userToken, true);
    if (uploadDoc.status === 201) {
      logTest('Upload Document', true, `Status: ${uploadDoc.status}`);
      if (uploadDoc.data.filePath) {
        // Test document download
        const downloadDoc = await makeRequest(`/api/documents/download?filePath=${encodeURIComponent(uploadDoc.data.filePath)}`, 'GET', null, userToken);
        logTest('Download Document', downloadDoc.status === 200, `Status: ${downloadDoc.status}`);
      }
    } else {
      logTest('Upload Document', false, `Status: ${uploadDoc.status}, Data: ${JSON.stringify(uploadDoc.data)}`);
    }
  } catch (error) {
    logTest('Document Upload/Download', false, `Error: ${error.message}`);
  }
}

/**
 * Health and Status Tests
 */
async function testHealthAndStatus() {
  log('=== Testing Health and Status Endpoints ===');
  
  // Test health endpoint
  const healthCheck = await makeRequest('/api/health', 'GET');
  logTest('Health Check', healthCheck.status === 200, `Status: ${healthCheck.status}`);
  
  // Test API status
  const apiStatus = await makeRequest('/api/status', 'GET');
  logTest('API Status', apiStatus.status === 200, `Status: ${apiStatus.status}`);
}

/**
 * Generate test report
 */
function generateReport() {
  const timestamp = new Date().toISOString();
  const total = testResults.passed + testResults.failed + testResults.skipped;
  const successRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(2) : 0;
  
  const report = {
    timestamp: timestamp,
    summary: {
      total: total,
      passed: testResults.passed,
      failed: testResults.failed,
      skipped: testResults.skipped,
      successRate: `${successRate}%`
    },
    details: testResults.details,
    errors: testResults.errors
  };
  
  // Write report to file
  fs.writeFileSync('route-test-report.json', JSON.stringify(report, null, 2));
  
  // Console summary
  console.log('\n' + '='.repeat(60));
  console.log('🧪 COMPREHENSIVE ROUTE TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`📊 Total Tests: ${total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⏭️  Skipped: ${testResults.skipped}`);
  console.log(`📈 Success Rate: ${successRate}%`);
  console.log(`📄 Detailed report saved to: route-test-report.json`);
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.errors.forEach(error => console.log(`   - ${error}`));
  }
  
  console.log('='.repeat(60));
  
  return report;
}

/**
 * Main test execution
 */
async function runAllTests() {
  console.log('🚀 Starting Comprehensive Route Testing for CareDataManager');
  console.log(`🔗 Base URL: ${BASE_URL}`);
  console.log(`👤 Admin User: ${ADMIN_USERNAME}`);
  console.log(`👤 Normal User: ${USER_USERNAME}`);
  console.log('='.repeat(60));
  
  try {
    // Step 1: Authentication
    const authSuccess = await testAuthentication();
    if (!authSuccess) {
      log('Authentication failed - cannot proceed with other tests', 'ERROR');
      generateReport();
      return;
    }
    
    // Step 2: Admin-only tests
    await testCompanyManagement();
    await testSegmentManagement();
    
    // Step 3: User tests
    await testUserManagement();
    await testMasterData();
    await testPersonInfo();
    await testClientServices();
    await testServiceCaseNotes();
    await testDocumentManagement();
    
    // Step 4: Health tests
    await testHealthAndStatus();
    
    // Step 5: Generate report
    generateReport();
    
  } catch (error) {
    log(`Test execution failed: ${error.message}`, 'ERROR');
    console.error(error);
    generateReport();
  }
}

// Execute tests if run directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testResults
};
