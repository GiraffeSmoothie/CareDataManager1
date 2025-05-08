-- Rename hcp_end_date to hcp_start_date if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'person_info' AND column_name = 'hcp_end_date'
  ) THEN
    ALTER TABLE person_info RENAME COLUMN hcp_end_date TO hcp_start_date;
  END IF;

  -- Make sure hcp_start_date exists, create it if it doesn't
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'person_info' AND column_name = 'hcp_start_date'
  ) THEN
    ALTER TABLE person_info ADD COLUMN hcp_start_date TEXT DEFAULT '';
  END IF;
END $$;