-- Migration to rename member_id to client_id in the relevant table

-- Check if the column exists before renaming
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'your_table_name' AND column_name = 'member_id'
  ) THEN
    ALTER TABLE your_table_name RENAME COLUMN member_id TO client_id;
  END IF;
END $$;