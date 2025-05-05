-- Add country code columns to person_info table
ALTER TABLE person_info 
ADD COLUMN home_phone_country_code TEXT DEFAULT '+61',
ADD COLUMN mobile_phone_country_code TEXT DEFAULT '+61',
ADD COLUMN next_of_kin_phone_country_code TEXT DEFAULT '+61';