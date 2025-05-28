console.log('🧪 Testing Failed Login...');

fetch('http://localhost:5001/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'FailedLoginTest/1.0'
  },
  body: JSON.stringify({
    username: 'nonexistent',
    password: 'wrongpassword'
  })
})
.then(response => response.json())
.then(data => {
  console.log('Failed login response:', data);
  console.log('✅ Failed login test completed');
})
.catch(error => {
  console.error('Test error:', error);
});
