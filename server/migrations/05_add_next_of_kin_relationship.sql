-- Migration: Add relationship field to next of kin details
-- This migration adds a relationship field to better categorize the next of kin relationship

-- Add next_of_kin_relationship column to person_info table
ALTER TABLE person_info ADD COLUMN IF NOT EXISTS next_of_kin_relationship TEXT DEFAULT '';

-- Add comment for documentation
COMMENT ON COLUMN person_info.next_of_kin_relationship IS 'Relationship of the next of kin to the client (e.g., spouse, parent, child, etc.)';

-- Create index for potential filtering/searching
CREATE INDEX IF NOT EXISTS idx_person_info_next_of_kin_relationship ON person_info(next_of_kin_relationship);
