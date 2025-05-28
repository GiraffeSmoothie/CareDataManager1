@echo off
echo Testing audit logging with curl...

echo.
echo 1. Testing login (should trigger login logging)...
curl -X POST http://localhost:5001/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"Admin@123\"}" ^
  -o login_response.json

echo.
echo 2. Extracting token from response...
for /f "tokens=2 delims=:" %%a in ('findstr "token" login_response.json') do (
  set TOKEN=%%a
)

echo Token extracted (first 50 chars): %TOKEN:~1,50%...

echo.
echo 3. Creating test user (should trigger audit logging)...
curl -X POST http://localhost:5001/api/users ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %TOKEN:~2,-1%" ^
  -d "{\"name\":\"Test Audit User\",\"username\":\"testaudit_%random%\",\"password\":\"TestPass123\",\"role\":\"user\",\"company_id\":1}"

echo.
echo 4. Test completed. Check server logs for audit debug messages.

del login_response.json
pause
