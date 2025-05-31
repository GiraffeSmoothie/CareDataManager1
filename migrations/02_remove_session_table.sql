-- Remove session table migration
-- This removes the session table as authentication has been migrated to JWT

-- Drop session table
DROP TABLE IF EXISTS "session";
