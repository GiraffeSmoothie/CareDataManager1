# Azure Managed Identity Implementation Guide

## Overview

This document outlines the complete Azure Managed Identity implementation for the Care Data Manager application, including both Azure Blob Storage (already implemented) and Azure PostgreSQL Database (implemented in this update).

## Current Implementation Status

### ✅ Azure Blob Storage - IMPLEMENTED
- **Service Classes**: `BlobStorageService` and `AzureBlobStorageService`
- **Authentication**: Uses `DefaultAzureCredential` with fallback to connection strings
- **Configuration**: Controlled by `AZURE_STORAGE_ACCOUNT_NAME` environment variable
- **Location**: `server/services/blob-storage.service.ts` and `server/services/storage.service.ts`

### ✅ Azure PostgreSQL Database - NEWLY IMPLEMENTED
- **Service Class**: Enhanced `Storage` class in `storage.ts`
- **Authentication**: Uses `DefaultAzureCredential` with Azure PostgreSQL access tokens
- **Configuration**: Controlled by `AZURE_POSTGRESQL_SERVER_NAME` environment variable
- **Fallback**: Traditional `DATABASE_URL` connection string if managed identity unavailable

## Environment Variables Configuration

### Production Environment (`production.env`)

```env
# Azure PostgreSQL Managed Identity Configuration
AZURE_POSTGRESQL_SERVER_NAME=your-postgresql-server-name
AZURE_POSTGRESQL_DATABASE_NAME=your-database-name
AZURE_POSTGRESQL_USER_NAME=your-managed-identity-user

# Azure Blob Storage Managed Identity Configuration  
AZURE_STORAGE_ACCOUNT_NAME=your-storage-account-name
AZURE_STORAGE_CONTAINER_NAME=documentsroot

# Fallback Database Configuration (optional)
# DATABASE_URL=postgresql://user:password@host:port/database
```

### Azure App Service Application Settings

When deploying to Azure App Service, configure these settings in the Azure portal:

1. **Enable System-Assigned Managed Identity**:
   - Go to Azure App Service → Identity → System assigned → Status: On

2. **Set Application Settings**:
   ```
   AZURE_POSTGRESQL_SERVER_NAME = your-postgresql-server-name
   AZURE_POSTGRESQL_DATABASE_NAME = your-database-name  
   AZURE_POSTGRESQL_USER_NAME = your-managed-identity-user
   AZURE_STORAGE_ACCOUNT_NAME = your-storage-account-name
   AZURE_STORAGE_CONTAINER_NAME = documentsroot
   NODE_ENV = production
   ```

3. **Grant Managed Identity Permissions**:
   - **Azure PostgreSQL**: Add the App Service managed identity as a PostgreSQL user
   - **Azure Storage**: Grant "Storage Blob Data Contributor" role to the managed identity

## Azure PostgreSQL Setup for Managed Identity

### 1. Enable Azure AD Authentication on PostgreSQL Server

```sql
-- Connect to PostgreSQL as an admin and run:
-- Replace 'your-app-service-name' with your actual App Service name
-- Replace 'object-id' with the Object ID of your App Service's managed identity

SET aad_validate_oids_in_tenant = off;
CREATE ROLE "your-app-service-name" WITH LOGIN PASSWORD NULL;
GRANT CONNECT ON DATABASE "your-database-name" TO "your-app-service-name";
GRANT USAGE ON SCHEMA public TO "your-app-service-name";
GRANT CREATE ON SCHEMA public TO "your-app-service-name";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "your-app-service-name";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "your-app-service-name";
```

### 2. Configure PostgreSQL Server

1. **Enable Azure AD Authentication**:
   - Go to Azure PostgreSQL → Authentication → Azure AD authentication: Enabled

2. **Add Azure AD Admin**:
   - Set an Azure AD user/group as PostgreSQL admin

3. **Configure Firewall**:
   - Add your App Service's outbound IP addresses
   - Or enable "Allow access to Azure services"

## Implementation Details

### Enhanced Database Connection Logic

The `storage.ts` file now includes:

1. **Primary Authentication**: Uses `DefaultAzureCredential` to obtain Azure AD access tokens
2. **Automatic Token Refresh**: Handles token expiration and renewal
3. **Fallback Mechanism**: Uses traditional `DATABASE_URL` if managed identity fails
4. **SSL Configuration**: Proper SSL settings for Azure PostgreSQL
5. **Error Handling**: Comprehensive error handling and logging

### Code Architecture

```typescript
// Priority order for database authentication:
1. Azure Managed Identity (if AZURE_POSTGRESQL_SERVER_NAME is set)
   - Use DefaultAzureCredential
   - Obtain access tokens for Azure Database scope
   - Automatic token refresh

2. Traditional Connection String (fallback)
   - Use DATABASE_URL environment variable
   - Username/password authentication
```

## Security Benefits

### Managed Identity Advantages

1. **No Stored Credentials**: No passwords or connection strings in code/config
2. **Automatic Token Management**: Azure handles token lifecycle
3. **Principle of Least Privilege**: Fine-grained access control
4. **Audit Trail**: Azure AD logs all authentication attempts
5. **Simplified Key Management**: No manual credential rotation

### Security Best Practices Implemented

1. **Environment-Specific Configuration**: Different settings for dev/prod
2. **Secure Fallback**: Graceful degradation to secure alternatives
3. **Connection Pooling**: Efficient resource utilization
4. **SSL Enforcement**: Encrypted connections to Azure services
5. **Error Sanitization**: No sensitive information in logs

## Deployment Checklist

### Pre-Deployment

- [ ] Azure App Service created with system-assigned managed identity enabled
- [ ] Azure PostgreSQL server configured with Azure AD authentication
- [ ] Managed identity granted database permissions
- [ ] Azure Storage account accessible by managed identity
- [ ] Environment variables configured in Azure App Service

### Post-Deployment Verification

- [ ] Application starts without authentication errors
- [ ] Database connections use managed identity (check logs)
- [ ] Blob storage operations use managed identity (check logs)
- [ ] File uploads work correctly
- [ ] Database operations complete successfully

### Troubleshooting

#### Common Issues

1. **Database Connection Failures**:
   - Verify managed identity is enabled on App Service
   - Check PostgreSQL firewall rules
   - Confirm database user exists and has permissions

2. **Token Acquisition Failures**:
   - Ensure App Service has system-assigned identity
   - Verify Azure AD authentication is enabled on PostgreSQL
   - Check network connectivity to Azure AD

3. **Permission Errors**:
   - Verify database user permissions
   - Check storage account role assignments
   - Ensure least privilege access is properly configured

#### Debug Commands

```powershell
# Check App Service managed identity
az webapp identity show --resource-group <rg-name> --name <app-name>

# Check PostgreSQL AD admin
az postgres server ad-admin list --resource-group <rg-name> --server-name <server-name>

# Check storage account permissions
az role assignment list --assignee <managed-identity-object-id> --scope <storage-account-resource-id>
```

## Testing

### Local Development

For local testing, use Azure CLI authentication:

```powershell
# Login to Azure CLI
az login

# Set subscription
az account set --subscription "your-subscription-id"

# Test with DefaultAzureCredential (will use Azure CLI credentials)
npm run dev
```

### Production Testing

Monitor Azure App Service logs for managed identity authentication:

```powershell
# Stream App Service logs
az webapp log tail --resource-group <rg-name> --name <app-name>

# Look for these log messages:
# "Using Azure Managed Identity for PostgreSQL authentication"
# "Successfully connected to PostgreSQL using managed identity"
# "Initializing Azure Blob Storage with DefaultAzureCredential (managed identity)"
```

## Migration from Connection Strings

### Step-by-Step Migration

1. **Phase 1**: Deploy with both managed identity and connection string support
2. **Phase 2**: Verify managed identity works in production
3. **Phase 3**: Remove connection string environment variables
4. **Phase 4**: Update documentation and deployment scripts

### Rollback Plan

If managed identity fails:
1. Re-add `DATABASE_URL` environment variable
2. Application will automatically fall back to connection string authentication
3. No code changes required for rollback

## Monitoring and Maintenance

### Key Metrics to Monitor

1. **Authentication Success Rate**: Track managed identity vs fallback usage
2. **Token Refresh Frequency**: Monitor for excessive token refreshes
3. **Connection Pool Health**: Ensure efficient database connections
4. **Error Rates**: Watch for authentication-related errors

### Maintenance Tasks

1. **Regular Permission Audits**: Review and update access permissions
2. **Connection String Cleanup**: Remove unused environment variables
3. **Log Analysis**: Monitor authentication patterns and errors
4. **Security Updates**: Keep Azure SDK dependencies updated

## Conclusion

This implementation provides:
- **Enhanced Security**: No stored database credentials
- **Simplified Management**: Azure handles authentication automatically  
- **High Availability**: Fallback mechanisms ensure service continuity
- **Production Ready**: Comprehensive error handling and logging
- **Future Proof**: Modern Azure authentication patterns

The application now fully leverages Azure Managed Identity for both blob storage and database connections, providing a secure, maintainable, and scalable authentication solution.