-- Create segments table and ensure company table exists
DO $$
BEGIN
    -- First ensure company table exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'company'
    ) THEN
        CREATE TABLE company (
            company_id SERIAL PRIMARY KEY,
            company_name TEXT NOT NULL UNIQUE,
            registered_address TEXT,
            postal_address TEXT,
            contact_person_name TEXT,
            contact_person_phone TEXT,
            contact_person_email TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER REFERENCES users(id)
        );
    END IF;

    -- Create segments table if it doesn't exist
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'segments'
    ) THEN
        CREATE TABLE segments (
            segment_id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
            segment_name TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER NOT NULL REFERENCES users(id),
            UNIQUE(company_id, segment_name)
        );
    END IF;
END $$;