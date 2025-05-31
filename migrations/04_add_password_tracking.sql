-- Migration: Add password change tracking and forced password change support
-- This migration adds security features to track password changes and force password changes for initial admin setup

-- Add password change tracking to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Update existing users to have proper timestamps
UPDATE users 
SET password_changed_at = CURRENT_TIMESTAMP 
WHERE password_changed_at IS NULL;

UPDATE users 
SET created_at = CURRENT_TIMESTAMP 
WHERE created_at IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_password_changed_at ON users(password_changed_at);
CREATE INDEX IF NOT EXISTS idx_users_force_password_change ON users(force_password_change);

-- Add comment for documentation
COMMENT ON COLUMN users.password_changed_at IS 'Timestamp when password was last changed';
COMMENT ON COLUMN users.force_password_change IS 'Whether user must change password on next login';
COMMENT ON COLUMN users.created_at IS 'Timestamp when user account was created';
