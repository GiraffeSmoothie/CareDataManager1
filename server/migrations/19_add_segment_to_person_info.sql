DO $$
BEGIN
    -- Add segment_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'person_info' AND column_name = 'segment_id'
    ) THEN
        ALTER TABLE person_info ADD COLUMN segment_id INTEGER;
    END IF;

    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'person_info_segment_fkey'
    ) THEN
        ALTER TABLE person_info 
        ADD CONSTRAINT person_info_segment_fkey 
        FOREIGN KEY (segment_id) 
        REFERENCES segment(segment_id);
    END IF;
END $$;