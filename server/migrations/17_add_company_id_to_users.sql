DO $$
BEGIN
    -- Add company_id and segment_id columns if they don't exist
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'company_id'
    ) THEN
        ALTER TABLE users ADD COLUMN company_id INTEGER;
        
    END IF;

    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'users_company_fkey'
    ) THEN
        ALTER TABLE users 
        ADD CONSTRAINT users_company_fkey 
        FOREIGN KEY (company_id) 
        REFERENCES company(company_id);
    END IF;
END $$;