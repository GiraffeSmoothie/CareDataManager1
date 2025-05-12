-- Add segment_id to documents table
ALTER TABLE documents 
ADD COLUMN segment_id INTEGER REFERENCES segments(id);

-- Add segment_id to client_services table
ALTER TABLE client_services 
ADD COLUMN segment_id INTEGER REFERENCES segments(id);

-- Update existing records to use the segment_id from their related person_info records
UPDATE documents d
SET segment_id = p.segment_id
FROM person_info p
WHERE d.client_id = p.id AND p.segment_id IS NOT NULL;

UPDATE client_services cs
SET segment_id = p.segment_id
FROM person_info p
WHERE cs.client_id = p.id AND p.segment_id IS NOT NULL;