-- Add segment_id to documents table
ALTER TABLE documents ADD COLUMN segment_id INTEGER;
ALTER TABLE documents ADD CONSTRAINT fk_documents_segment FOREIGN KEY (segment_id) REFERENCES segments(id);

-- Add segment_id to service_case_notes table
ALTER TABLE service_case_notes ADD COLUMN segment_id INTEGER;
ALTER TABLE service_case_notes ADD CONSTRAINT fk_service_case_notes_segment FOREIGN KEY (segment_id) REFERENCES segments(id);

-- Add segment_id to client_services table if not already exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'client_services' AND column_name = 'segment_id'
    ) THEN
        ALTER TABLE client_services ADD COLUMN segment_id INTEGER;
        ALTER TABLE client_services ADD CONSTRAINT fk_client_services_segment FOREIGN KEY (segment_id) REFERENCES segments(id);
    END IF;
END $$;