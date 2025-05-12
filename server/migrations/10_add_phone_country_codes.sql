-- Add phone country code columns to person_info table
ALTER TABLE person_info 
ADD COLUMN IF NOT EXISTS home_phone_country_code TEXT,
ADD COLUMN IF NOT EXISTS mobile_phone_country_code TEXT,
ADD COLUMN IF NOT EXISTS emergency_phone_country_code TEXT;