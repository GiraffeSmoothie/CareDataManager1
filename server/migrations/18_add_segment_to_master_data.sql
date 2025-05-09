DO $$
BEGIN
    -- Add segment_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'master_data' AND column_name = 'segment_id'
    ) THEN
        ALTER TABLE master_data ADD COLUMN segment_id INTEGER;
    END IF;

    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'master_data_segment_fkey'
    ) THEN
        ALTER TABLE master_data 
        ADD CONSTRAINT master_data_segment_fkey 
        FOREIGN KEY (segment_id) 
        REFERENCES segment(segment_id);
    END IF;
END $$;