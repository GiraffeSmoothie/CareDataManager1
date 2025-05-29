console.log('Test started');

const axios = require('axios');

async function simpleTest() {
  try {
    console.log('Making request to health endpoint...');
    const response = await axios.get('http://localhost:5001/health');
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
  } catch (error) {
    console.log('Error occurred:', error.message);
  }
  console.log('Test completed');
}

simpleTest();
