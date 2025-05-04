-- Add status column to person_info table
ALTER TABLE person_info ADD COLUMN IF NOT EXISTS status text DEFAULT 'New';