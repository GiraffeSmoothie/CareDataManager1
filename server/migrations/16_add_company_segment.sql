-- Create company_segment table if it doesn't exist
CREATE TABLE IF NOT EXISTS company_segment (
    company_id SERIAL,
    segment_id SERIAL,
    company_name VARCHAR(255) NOT NULL,
    segment_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    PRIMARY KEY (company_id, segment_id)
);

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'unique_company_segment'
    ) THEN
        ALTER TABLE company_segment 
        ADD CONSTRAINT unique_company_segment 
        UNIQUE (company_name, segment_name);
    END IF;
END $$;