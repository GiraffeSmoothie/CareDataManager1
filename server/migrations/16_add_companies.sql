DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'companies'
  ) THEN
    CREATE TABLE companies (
    company_id SERIAL PRIMARY KEY,
    company_name TEXT UNIQUE,
    registered_address TEXT,
    postal_address TEXT,
    contact_person_name TEXT,
    contact_person_phone TEXT,
    contact_person_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
  );
END IF;
END $$;