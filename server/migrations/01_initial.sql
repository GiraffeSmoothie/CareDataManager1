-- 8. Create companies table first (moved up)
CREATE TABLE IF NOT EXISTS companies (
  company_id SERIAL PRIMARY KEY,
  company_name TEXT UNIQUE,
  registered_address TEXT,
  postal_address TEXT,
  contact_person_name TEXT,
  contact_person_phone TEXT,
  contact_person_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER
);

-- 1. Create users table (with reference to companies now that it exists)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  name TEXT DEFAULT '',
  company_id INTEGER REFERENCES companies(company_id)
);

-- Update the companies table to add the reference back to users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'companies_created_by_fkey'
  ) THEN
    ALTER TABLE companies
    ADD CONSTRAINT companies_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id);
  END IF;
END $$;

-- 2. Create session store table
DROP TABLE IF EXISTS "session";
CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- 3. Create person_info table
CREATE TABLE IF NOT EXISTS person_info (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT DEFAULT '',
  last_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  email TEXT NOT NULL,
  home_phone TEXT DEFAULT '',
  mobile_phone TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT DEFAULT '',
  address_line3 TEXT DEFAULT '',
  post_code TEXT NOT NULL,
  mailing_address_line1 TEXT DEFAULT '',
  mailing_address_line2 TEXT DEFAULT '',
  mailing_address_line3 TEXT DEFAULT '',
  mailing_post_code TEXT DEFAULT '',
  use_home_address BOOLEAN DEFAULT true,
  next_of_kin_name TEXT DEFAULT '',
  next_of_kin_address TEXT DEFAULT '',
  next_of_kin_email TEXT DEFAULT '',
  next_of_kin_phone TEXT DEFAULT '',
  hcp_level TEXT DEFAULT '',
  hcp_start_date TEXT DEFAULT '',
  status TEXT DEFAULT 'New',
  created_by INTEGER REFERENCES users(id),
  home_phone_country_code TEXT,
  mobile_phone_country_code TEXT,
  emergency_phone_country_code TEXT
);

-- 4. Create master_data table
CREATE TABLE IF NOT EXISTS master_data (
  id SERIAL PRIMARY KEY,
  service_category TEXT NOT NULL,
  service_type TEXT NOT NULL,
  service_provider TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,  
  created_by INTEGER REFERENCES users(id),
  UNIQUE(service_category, service_type, service_provider)
);

-- 5. Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES person_info(id) NOT NULL,
  document_name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)  
);

-- Wrap PL/pgSQL code in DO blocks
DO $$
BEGIN
  -- Update existing records to use the segment_id from their related person_info records
  -- (This should run after segments are created and segment_id is added to documents)

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
END $$;

-- 6. Create client_services table if it doesn't exist
CREATE TABLE IF NOT EXISTS client_services (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES person_info(id) NOT NULL,
  service_category TEXT NOT NULL,
  service_type TEXT NOT NULL,
  service_provider TEXT NOT NULL,
  service_start_date DATE NOT NULL,
  service_days TEXT[] NOT NULL,
  service_hours INTEGER NOT NULL CHECK (service_hours >= 1 AND service_hours <= 24),
  status TEXT DEFAULT 'Planned' CHECK (status IN ('Planned', 'In Progress', 'Closed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
  -- Foreign key constraint will be added after segment_id column is added
);

DO $$
BEGIN
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

-- 7. Create service_case_notes table if it doesn't exist
CREATE TABLE IF NOT EXISTS service_case_notes (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES client_services(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);

-- 9. Create segments table
CREATE TABLE IF NOT EXISTS segments (
    id SERIAL PRIMARY KEY,
    segment_name TEXT NOT NULL,
    company_id INTEGER REFERENCES companies(company_id) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    UNIQUE(segment_name, company_id)
);

-- Add segment_id columns to tables
ALTER TABLE person_info 
ADD COLUMN IF NOT EXISTS segment_id INTEGER REFERENCES segments(id);

ALTER TABLE client_services 
ADD COLUMN IF NOT EXISTS segment_id INTEGER REFERENCES segments(id);

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS segment_id INTEGER REFERENCES segments(id);

ALTER TABLE master_data 
ADD COLUMN IF NOT EXISTS segment_id INTEGER REFERENCES segments(id);

-- Add a unique constraint that includes segment_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'master_data_services_segment_unique'
  ) THEN
    ALTER TABLE master_data
    ADD CONSTRAINT master_data_services_segment_unique
    UNIQUE(service_category, service_type, service_provider, segment_id);
  END IF;
END $$;

-- Update segment IDs
DO $$
BEGIN
  UPDATE documents d
  SET segment_id = p.segment_id
  FROM person_info p
  WHERE d.client_id = p.id AND p.segment_id IS NOT NULL;

  UPDATE client_services cs
  SET segment_id = p.segment_id
  FROM person_info p
  WHERE cs.client_id = p.id AND p.segment_id IS NOT NULL;
END $$;

-- Add the foreign key constraint to client_services after segment_id is added
DO $$
BEGIN
  -- First, drop existing foreign key constraint if it exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'client_services_master_data_fkey'
  ) THEN
    ALTER TABLE client_services
    DROP CONSTRAINT client_services_master_data_fkey;
  END IF;

  -- Add a single foreign key constraint that covers both cases
  -- This constraint will match records with:
  -- 1. Same service fields and NULL segment_id in both tables
  -- 2. Same service fields and matching segment_id values
  ALTER TABLE client_services
  ADD CONSTRAINT client_services_master_data_fkey
  FOREIGN KEY (service_category, service_type, service_provider, segment_id) 
  REFERENCES master_data(service_category, service_type, service_provider, segment_id);
END $$;





