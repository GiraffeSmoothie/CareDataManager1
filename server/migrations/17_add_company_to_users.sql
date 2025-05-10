-- Add company_id to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(company_id);

-- Update existing records to handle NULL company_id
-- This ensures existing users won't break