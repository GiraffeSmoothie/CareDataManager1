# Admin User Setup - Security Best Practices

This document outlines the secure methods for creating admin users in the Care Data Manager application.

## ⚠️ Security Warning

**NEVER use hardcoded admin credentials in production!** The application now includes several secure methods for admin user creation that should be used instead.

## Methods for Admin User Creation

### 1. CLI Script (Recommended for Production)

Use the interactive CLI script for secure admin creation:

```bash
cd server
node create-admin.js
```

**Features:**
- Interactive password input (hidden from terminal)
- Password strength validation
- No credentials stored in code
- Can be run independently of main application
- Validates username uniqueness

**Password Requirements:**
- At least 8 characters long
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### 2. Environment-Based Setup (Development Only)

For development environments only, you can use environment variables:

```env
# Set to 'true' to enable automatic admin creation (DEVELOPMENT ONLY)
AUTO_CREATE_ADMIN=true
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=your-secure-password-here
FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN=true
```

**⚠️ Important Notes:**
- This method should NEVER be used in production
- The password must be at least 8 characters long
- Weak passwords like "password" are automatically rejected
- Set `AUTO_CREATE_ADMIN=false` after initial setup

### 3. Production Environment Configuration

The production environment is configured to be secure by default:

```env
# Admin creation is disabled by default in production
AUTO_CREATE_ADMIN=false
INITIAL_ADMIN_USERNAME=
INITIAL_ADMIN_PASSWORD=
FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN=true
```

## Security Features

### Password Change Tracking
- `password_changed_at`: Tracks when password was last changed
- `force_password_change`: Forces user to change password on next login
- `created_at`: Tracks when user account was created

### Audit Logging
- Failed login attempts are logged
- Password change attempts are logged with IP addresses
- Admin user creation is logged

### Environment-Specific Behavior

#### Development Environment
- Allows environment-based admin creation if explicitly enabled
- Shows security warnings when auto-creation is enabled
- Provides guidance on using CLI script

#### Production Environment
- Auto-creation is disabled by default
- Requires use of CLI script for admin creation
- Enhanced security headers and settings

## Setup Instructions

### For Development

1. Set environment variables in `server/development.env`:
   ```env
   AUTO_CREATE_ADMIN=true
   INITIAL_ADMIN_USERNAME=admin
   INITIAL_ADMIN_PASSWORD=SecurePassword123!
   FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN=true
   ```

2. Start the application:
   ```bash
   npm run dev:server
   ```

3. **Important:** After first setup, set `AUTO_CREATE_ADMIN=false`

### For Production

1. Ensure production environment is secure:
   ```env
   AUTO_CREATE_ADMIN=false
   FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN=true
   ```

2. Deploy the application

3. Create admin user using CLI script:
   ```bash
   cd server
   node create-admin.js
   ```

4. Remove or secure the CLI script after use

## Migration Information

The application includes a migration (`04_add_password_tracking.sql`) that adds:
- Password change tracking columns
- Indexes for performance
- Proper documentation

This migration runs automatically when the application starts.

## Password Change Enforcement

When `FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN=true`:
- Users with `force_password_change=true` must change their password
- The login response includes `requiresPasswordChange: true`
- Frontend can redirect to password change page
- Password change clears the force flag

## Best Practices Summary

1. ✅ Use CLI script for production admin creation
2. ✅ Set strong passwords (8+ chars, mixed case, numbers, symbols)
3. ✅ Set `AUTO_CREATE_ADMIN=false` in production
4. ✅ Enable `FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN=true`
5. ✅ Remove CLI script from production servers after use
6. ✅ Regularly audit admin accounts
7. ❌ Never hardcode credentials in source code
8. ❌ Never use weak passwords like "password"
9. ❌ Never enable auto-creation in production

## Troubleshooting

### "Admin user already exists" error
The CLI script checks for existing users and prevents duplicates.

### "Weak password detected" error
The application rejects passwords that don't meet security requirements.

### Application startup warnings
The application shows clear warnings when auto-creation is enabled, reminding you to disable it in production.

### Database migration issues
If password tracking columns are missing, ensure the migration `04_add_password_tracking.sql` has run successfully.
