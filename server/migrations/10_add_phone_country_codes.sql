-- Add country code columns to person_info table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'person_info' AND column_name = 'home_phone_country_code'
  ) THEN
    ALTER TABLE person_info ADD COLUMN home_phone_country_code TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'person_info' AND column_name = 'mobile_phone_country_code'
  ) THEN
    ALTER TABLE person_info ADD COLUMN mobile_phone_country_code TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'person_info' AND column_name = 'next_of_kin_phone_country_code'
  ) THEN
    ALTER TABLE person_info ADD COLUMN next_of_kin_phone_country_code TEXT DEFAULT '+61';
  END IF;
END $$;