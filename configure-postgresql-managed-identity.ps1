# Azure PostgreSQL Managed Identity Configuration Script
# Run this script to configure Azure App Service to access PostgreSQL using managed identity

param(
    [Parameter(Mandatory=$true)]
    [string]$AppServiceName,
    
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroup,
    
    [Parameter(Mandatory=$true)]
    [string]$PostgreSQLServerName,
    
    [Parameter(Mandatory=$true)]
    [string]$DatabaseName,
    
    [Parameter(Mandatory=$false)]
    [string]$PostgreSQLUserName = $AppServiceName
)

Write-Host "Configuring Azure App Service '$AppServiceName' for PostgreSQL managed identity access..." -ForegroundColor Green

# Step 1: Enable system-assigned managed identity
Write-Host "Step 1: Enabling system-assigned managed identity..." -ForegroundColor Yellow
try {
    $identity = az webapp identity assign --name $AppServiceName --resource-group $ResourceGroup --output json | ConvertFrom-Json
    Write-Host "✅ Managed identity enabled. Object ID: $($identity.principalId)" -ForegroundColor Green
    $managedIdentityObjectId = $identity.principalId
} catch {
    Write-Error "❌ Failed to enable managed identity: $_"
    exit 1
}

# Step 2: Configure App Service environment variables
Write-Host "Step 2: Setting App Service environment variables..." -ForegroundColor Yellow
try {
    az webapp config appsettings set --name $AppServiceName --resource-group $ResourceGroup --settings `
        "AZURE_POSTGRESQL_SERVER_NAME=$PostgreSQLServerName" `
        "AZURE_POSTGRESQL_DATABASE_NAME=$DatabaseName" `
        "AZURE_POSTGRESQL_USER_NAME=$PostgreSQLUserName" `
        "NODE_ENV=production" --output none
    
    Write-Host "✅ Environment variables configured" -ForegroundColor Green
} catch {
    Write-Error "❌ Failed to set environment variables: $_"
    exit 1
}

# Step 3: Get PostgreSQL server details
Write-Host "Step 3: Getting PostgreSQL server information..." -ForegroundColor Yellow
try {
    $postgresServer = az postgres server show --name $PostgreSQLServerName --resource-group $ResourceGroup --output json | ConvertFrom-Json
    $postgresResourceId = $postgresServer.id
    Write-Host "✅ PostgreSQL server found: $($postgresServer.fullyQualifiedDomainName)" -ForegroundColor Green
} catch {
    Write-Error "❌ Failed to get PostgreSQL server info: $_"
    exit 1
}

Write-Host "`n🔧 Manual Steps Required:" -ForegroundColor Cyan
Write-Host "1. Enable Azure AD authentication on PostgreSQL server:" -ForegroundColor White
Write-Host "   az postgres server ad-admin create --resource-group $ResourceGroup --server-name $PostgreSQLServerName --display-name 'Your-AD-Admin-Name' --object-id <your-azure-ad-admin-object-id>" -ForegroundColor Gray

Write-Host "`n2. Connect to PostgreSQL as Azure AD admin and run these commands in sequence:" -ForegroundColor White
Write-Host "`n   IMPORTANT: First connect to the 'postgres' database:" -ForegroundColor Yellow
Write-Host "   psql 'host=$PostgreSQLServerName.postgres.database.azure.com port=5432 dbname=postgres user=<your-azure-ad-admin-email> sslmode=require'" -ForegroundColor Gray

Write-Host "`n   Step 2a: Run these commands while connected to 'postgres' database:" -ForegroundColor Cyan
Write-Host @"
   -- Check if database exists
   SELECT datname FROM pg_database WHERE datname = '$DatabaseName';
   
   -- Create database if it doesn't exist (only if the above query returns no rows)
   CREATE DATABASE $DatabaseName;
   
   -- Verify database creation
   \l
   
   -- Create user for managed identity (this must be done in postgres database)
   CREATE ROLE "$PostgreSQLUserName" WITH LOGIN PASSWORD NULL;
   
   -- Grant basic permissions
   GRANT CONNECT ON DATABASE $DatabaseName TO "$PostgreSQLUserName";
"@ -ForegroundColor Gray

Write-Host "`n   Step 2b: Now connect to your application database:" -ForegroundColor Cyan
Write-Host "   psql 'host=$PostgreSQLServerName.postgres.database.azure.com port=5432 dbname=$DatabaseName user=<your-azure-ad-admin-email> sslmode=require'" -ForegroundColor Gray

Write-Host "`n   Step 2c: Run these commands while connected to '$DatabaseName' database:" -ForegroundColor Cyan
Write-Host @"
   -- Check PostgreSQL version
   SELECT version();
   
   -- Grant schema permissions
   GRANT USAGE ON SCHEMA public TO "$PostgreSQLUserName";
   GRANT USAGE ON SCHEMA public TO "$PostgreSQLUserName";
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "$PostgreSQLUserName";
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "$PostgreSQLUserName";
   
   -- Grant permissions on future tables
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "$PostgreSQLUserName";
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "$PostgreSQLUserName";
   
   -- Verify user creation
   SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = '$PostgreSQLUserName';
"@ -ForegroundColor Gray

Write-Host "`n3. Test the connection by restarting your App Service:" -ForegroundColor White
Write-Host "   az webapp restart --name $AppServiceName --resource-group $ResourceGroup" -ForegroundColor Gray

Write-Host "`n✅ Configuration completed!" -ForegroundColor Green
Write-Host "Your App Service '$AppServiceName' is now configured to use managed identity with PostgreSQL." -ForegroundColor Green
Write-Host "Managed Identity Object ID: $managedIdentityObjectId" -ForegroundColor Green
