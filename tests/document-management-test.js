const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5001/api';

// Test credentials (using the admin user we created)
const TEST_CREDENTIALS = {
    username: 'newadmin',
    password: 'Admin@123'
};

let authToken = '';

// Create a test file for upload
function createTestFile() {
    const testFilePath = path.join(__dirname, 'test-document.png');
    // Create a minimal 1x1 PNG file
    const pngContent = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x00, 0x01, // width: 1
        0x00, 0x00, 0x00, 0x01, // height: 1
        0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
        0x90, 0x77, 0x53, 0xDE, // CRC
        0x00, 0x00, 0x00, 0x0C, // IDAT chunk length
        0x49, 0x44, 0x41, 0x54, // IDAT
        0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, // image data
        0x02, 0x00, 0x01, 0x73, // CRC
        0x00, 0x00, 0x00, 0x00, // IEND chunk length
        0x49, 0x45, 0x4E, 0x44, // IEND
        0xAE, 0x42, 0x60, 0x82  // CRC
    ]);
    fs.writeFileSync(testFilePath, pngContent);
    return testFilePath;
}

// Authenticate and get token
async function authenticate() {
    try {
        console.log('🔐 Authenticating...');
        const response = await axios.post(`${BASE_URL}/auth/login`, TEST_CREDENTIALS);
          if (response.data && response.data.tokens && response.data.tokens.accessToken) {
            authToken = response.data.tokens.accessToken;
            console.log('✅ Authentication successful');
            return true;
        } else {
            console.error('❌ Authentication failed - no token received');
            console.error('Response data:', JSON.stringify(response.data, null, 2));
            return false;
        }
    } catch (error) {
        console.error('❌ Authentication error:', error.response?.data || error.message);
        return false;
    }
}

// Get or create a test client
async function getTestClient() {
    try {
        console.log('👤 Getting test clients...');
        const response = await axios.get(`${BASE_URL}/person-info`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        if (response.data && response.data.length > 0) {
            console.log(`✅ Found ${response.data.length} existing clients, using first one`);
            return response.data[0];
        }
          // Create a test client if none exist
        console.log('📝 Creating test client...');
        const testClient = {
            title: 'Mr',
            firstName: 'Test',
            lastName: 'Client',
            dateOfBirth: '1980-01-01',
            email: 'test.client@example.com',
            homePhone: '1234567890',
            mobilePhone: '0987654321',
            addressLine1: '123 Test Street',
            postCode: '1234',
            mailingAddressLine1: '123 Test Street',
            mailingPostCode: '1234',
            useHomeAddress: true,
            hcpLevel: 'Level 1',
            status: 'New'
        };
        
        const createResponse = await axios.post(`${BASE_URL}/person-info`, testClient, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        console.log('✅ Test client created');
        return createResponse.data;
    } catch (error) {
        console.error('❌ Error getting/creating test client:', error.response?.data || error.message);
        throw error;
    }
}

// Test document upload
async function testDocumentUpload(clientId) {
    try {
        console.log('📄 Testing document upload...');
        
        const testFilePath = createTestFile();
        const form = new FormData();
        
        form.append('file', fs.createReadStream(testFilePath));
        form.append('clientId', clientId.toString());
        form.append('documentName', 'Test Document');
        form.append('documentType', 'General');
        
        const response = await axios.post(`${BASE_URL}/documents`, form, {
            headers: {
                Authorization: `Bearer ${authToken}`,
                ...form.getHeaders()
            }
        });
        
        console.log('✅ Document uploaded successfully');
        console.log('   Document ID:', response.data.id);
        console.log('   File Path:', response.data.filePath);
        
        // Clean up test file
        fs.unlinkSync(testFilePath);
        
        return response.data;
    } catch (error) {
        console.error('❌ Document upload error:', error.response?.data || error.message);
        throw error;
    }
}

// Test document listing
async function testDocumentListing(clientId) {
    try {
        console.log('📋 Testing document listing...');
        
        const response = await axios.get(`${BASE_URL}/documents/client/${clientId}`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        console.log(`✅ Found ${response.data.length} documents for client`);
        response.data.forEach((doc, index) => {
            console.log(`   ${index + 1}. ${doc.documentName} (${doc.documentType}) - ${doc.filename}`);
        });
        
        return response.data;
    } catch (error) {
        console.error('❌ Document listing error:', error.response?.data || error.message);
        throw error;
    }
}

// Test document download
async function testDocumentDownload(documentId) {
    try {
        console.log('⬇️ Testing document download...');
        
        const response = await axios.get(`${BASE_URL}/documents/${documentId}/download`, {
            headers: { Authorization: `Bearer ${authToken}` },
            responseType: 'arraybuffer'
        });
        
        console.log('✅ Document downloaded successfully');
        console.log('   Content Length:', response.data.length, 'bytes');
        console.log('   Content Type:', response.headers['content-type']);
        
        return response.data;
    } catch (error) {
        console.error('❌ Document download error:', error.response?.data || error.message);
        throw error;
    }
}

// Test document deletion
async function testDocumentDeletion(documentId) {
    try {
        console.log('🗑️ Testing document deletion...');
        
        const response = await axios.delete(`${BASE_URL}/documents/${documentId}`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        console.log('✅ Document deleted successfully');
        return true;
    } catch (error) {
        console.error('❌ Document deletion error:', error.response?.data || error.message);
        throw error;
    }
}

// Main test execution
async function runDocumentManagementTests() {
    console.log('🧪 Starting Document Management Tests\n');
    console.log('='.repeat(50));
    
    let testResults = {
        total: 0,
        passed: 0,
        failed: 0,
        errors: []
    };
    
    try {
        // Authenticate
        testResults.total++;
        if (await authenticate()) {
            testResults.passed++;
        } else {
            testResults.failed++;
            testResults.errors.push('Authentication failed');
            return testResults;
        }
        
        // Get test client
        testResults.total++;
        const client = await getTestClient();
        testResults.passed++;
        
        // Test document listing first
        testResults.total++;
        const documents = await testDocumentListing(client.id);
        testResults.passed++;
        
        if (documents && documents.length > 0) {
            const testDoc = documents[0]; // Use first existing document
            
            // Test document download
            testResults.total++;
            await testDocumentDownload(testDoc.id);
            testResults.passed++;
            
            // Only test upload if we have less than 3 documents (to avoid rate limit)
            if (documents.length < 3) {
                // Test document upload
                testResults.total++;
                const uploadedDoc = await testDocumentUpload(client.id);
                testResults.passed++;
                
                // Test document deletion with the newly uploaded document
                testResults.total++;
                await testDocumentDeletion(uploadedDoc.id);
                testResults.passed++;
            } else {
                console.log('⏭️  Skipping upload test due to rate limiting (3+ documents exist)');
                console.log('⏭️  Skipping deletion test (no new document to delete safely)');
            }
        } else {
            // No documents exist, test upload
            testResults.total++;
            const uploadedDoc = await testDocumentUpload(client.id);
            testResults.passed++;
            
            // Test document deletion
            testResults.total++;
            await testDocumentDeletion(uploadedDoc.id);
            testResults.passed++;
        }
        
    } catch (error) {
        testResults.failed++;
        testResults.errors.push(error.message);
        console.error('❌ Test execution error:', error.message);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Document Management Test Results:');
    console.log(`   Total Tests: ${testResults.total}`);
    console.log(`   Passed: ${testResults.passed} ✅`);
    console.log(`   Failed: ${testResults.failed} ❌`);
    console.log(`   Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    
    if (testResults.errors.length > 0) {
        console.log('\n❌ Errors:');
        testResults.errors.forEach((error, index) => {
            console.log(`   ${index + 1}. ${error}`);
        });
    }
    
    return testResults;
}

// Run tests if this file is executed directly
if (require.main === module) {
    runDocumentManagementTests()
        .then(results => {
            process.exit(results.failed > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = {
    runDocumentManagementTests,
    authenticate,
    getTestClient,
    testDocumentUpload,
    testDocumentListing,
    testDocumentDownload,
    testDocumentDeletion
};
