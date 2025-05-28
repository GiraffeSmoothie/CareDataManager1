const axios = require('axios');

const BASE_URL = 'http://localhost:5001/api';

// Test credentials
const TEST_CREDENTIALS = {
    username: 'newadmin',
    password: 'Admin@123'
};

let authToken = '';

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
            return false;
        }
    } catch (error) {
        console.error('❌ Authentication error:', error.response?.data || error.message);
        return false;
    }
}

// Get companies
async function getCompanies() {
    try {
        console.log('🏢 Getting companies...');
        const response = await axios.get(`${BASE_URL}/companies`, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });
        
        console.log('✅ Found companies:', response.data.length);
        response.data.forEach((company, index) => {
            console.log(`   ${index + 1}. ${company.company_name} (ID: ${company.company_id})`);
        });
        return response.data;
    } catch (error) {
        console.error('❌ Error getting companies:', error.response?.data || error.message);
        return [];
    }
}

// Get users
async function getUsers() {
    try {
        console.log('👥 Getting users...');
        const response = await axios.get(`${BASE_URL}/users`, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });
        
        console.log('✅ Found users:', response.data.length);
        response.data.forEach((user, index) => {
            console.log(`   ${index + 1}. ${user.username} (${user.name}) - Company ID: ${user.company_id || 'None'}`);
        });
        return response.data;
    } catch (error) {
        console.error('❌ Error getting users:', error.response?.data || error.message);
        return [];
    }
}

// Create a company if none exist
async function createCompany() {
    try {
        console.log('🏗️  Creating test company...');
        const companyData = {
            company_name: "Test Healthcare Company",
            registered_address: "123 Test Street, Test City, Test State 12345",
            postal_address: "123 Test Street, Test City, Test State 12345",
            contact_person_name: "Test Manager",
            contact_person_phone: "1234567890",
            contact_person_email: "test@testcompany.com"
        };
        
        const response = await axios.post(`${BASE_URL}/companies`, companyData, {
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Company created:', response.data.company_name, 'ID:', response.data.company_id);
        return response.data;
    } catch (error) {
        console.error('❌ Error creating company:', error.response?.data || error.message);
        return null;
    }
}

// Update user to assign company
async function assignUserToCompany(userId, companyId) {
    try {
        console.log(`🔄 Assigning user ${userId} to company ${companyId}...`);
        const response = await axios.put(`${BASE_URL}/users/${userId}`, {
            company_id: companyId
        }, {
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ User updated successfully');
        return response.data;
    } catch (error) {
        console.error('❌ Error updating user:', error.response?.data || error.message);
        return null;
    }
}

async function main() {
    console.log('🧪 Checking and Setting Up Company Assignment');
    console.log('='.repeat(50));
    
    try {
        // Authenticate
        if (!await authenticate()) {
            return;
        }
        
        // Get existing data
        const users = await getUsers();
        let companies = await getCompanies();
        
        // Find the test user
        const testUser = users.find(u => u.username === 'newadmin');
        if (!testUser) {
            console.error('❌ Test user "newadmin" not found');
            return;
        }
        
        console.log(`📋 Current user status: ${testUser.username} - Company ID: ${testUser.company_id || 'None'}`);
        
        // If user already has a company, we're done
        if (testUser.company_id) {
            console.log('✅ User already assigned to a company');
            return;
        }
        
        // If no companies exist, create one
        if (companies.length === 0) {
            console.log('📝 No companies found, creating one...');
            const newCompany = await createCompany();
            if (!newCompany) {
                console.error('❌ Failed to create company');
                return;
            }
            companies = [newCompany];
        }
        
        // Assign user to the first company
        const targetCompany = companies[0];
        console.log(`🎯 Assigning user to: ${targetCompany.company_name}`);
        
        const result = await assignUserToCompany(testUser.id, targetCompany.company_id);
        if (result) {
            console.log('🎉 Setup complete! User can now access documents.');
        } else {
            console.error('❌ Failed to assign user to company');
        }
    } catch (error) {
        console.error('❌ Script error:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

main().catch(console.error);
