-- Check and rename columns if they still have the old names
DO $$
BEGIN
  -- Check and rename member_id in documents table
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'member_id'
  ) THEN
    ALTER TABLE documents RENAME COLUMN member_id TO client_id;
  END IF;

  -- Skip migration if client_services already exists
  -- Only proceed if member_services still exists and client_services doesn't
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'member_services'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'client_services'
  ) THEN
    -- Only then attempt the renames
    ALTER TABLE member_services RENAME TO client_services;
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'client_services' AND column_name = 'member_id'
    ) THEN
      ALTER TABLE client_services RENAME COLUMN member_id TO client_id;
    END IF;
  END IF;
END $$;