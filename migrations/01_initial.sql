
-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);


-- Create user_sessions table for session store
CREATE TABLE IF NOT EXISTS user_sessions (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

/*
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id varchar NOT NULL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    session_data json NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	expire timestamp(6) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE	
);
CREATE INDEX "IDX_user_sessions_expire" ON "user_sessions" ("expire");
*/

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
  created_by INTEGER REFERENCES users(id)
);

-- Create master_data table
CREATE TABLE IF NOT EXISTS master_data (
  id SERIAL PRIMARY KEY,
  service_category TEXT NOT NULL,
  service_type TEXT NOT NULL,
  service_provider TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  member_id INTEGER REFERENCES person_info(id),
  created_by INTEGER REFERENCES users(id)
);

-- Create case_notes table
CREATE TABLE IF NOT EXISTS case_notes (
  id SERIAL PRIMARY KEY,
  member_id INTEGER REFERENCES person_info(id) NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  member_id INTEGER REFERENCES person_info(id) NOT NULL,
  document_name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);
