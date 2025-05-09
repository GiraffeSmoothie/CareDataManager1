-- Rename member_id to client_id in all tables
DO $$
BEGIN
  -- Rename member_id in documents table if it exists
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'member_id'
  ) THEN
    ALTER TABLE documents RENAME COLUMN member_id TO client_id;
  END IF;

  -- Only try to rename member_services if it exists and client_services doesn't
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'member_services'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'client_services'
  ) THEN
    ALTER TABLE member_services RENAME TO client_services;
    ALTER TABLE client_services RENAME COLUMN member_id TO client_id;
  END IF;

  -- Update foreign key constraints only if they don't exist
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_client_id_fkey'
  ) THEN
    ALTER TABLE documents 
      DROP CONSTRAINT IF EXISTS documents_member_id_fkey,
      ADD CONSTRAINT documents_client_id_fkey 
      FOREIGN KEY (client_id) 
      REFERENCES person_info(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'client_services_client_id_fkey'
  ) THEN
    ALTER TABLE client_services 
      DROP CONSTRAINT IF EXISTS member_services_member_id_fkey,
      ADD CONSTRAINT client_services_client_id_fkey 
      FOREIGN KEY (client_id) 
      REFERENCES person_info(id);
  END IF;
END $$;