-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

-- Create session store table with correct structure for connect-pg-simple
DROP TABLE IF EXISTS "session";
CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Create person_info table
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
  hcp_end_date TEXT DEFAULT '',
  status TEXT DEFAULT 'New',
  created_by INTEGER REFERENCES users(id)
);

-- Create master_data table
CREATE TABLE IF NOT EXISTS master_data (
  id SERIAL PRIMARY KEY,
  service_category TEXT NOT NULL,
  service_type TEXT NOT NULL,
  service_provider TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,  
  created_by INTEGER REFERENCES users(id)
);


-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  member_id INTEGER REFERENCES person_info(id) NOT NULL,
  document_name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);
