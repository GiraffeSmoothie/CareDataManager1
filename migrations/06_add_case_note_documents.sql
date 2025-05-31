-- Migration: Add document attachment support to case notes
-- This migration creates a junction table to link documents to case notes

-- Create junction table for case note documents
CREATE TABLE IF NOT EXISTS case_note_documents (
  id SERIAL PRIMARY KEY,
  case_note_id INTEGER NOT NULL REFERENCES service_case_notes(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER NOT NULL REFERENCES users(id),
  UNIQUE(case_note_id, document_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_case_note_documents_case_note_id ON case_note_documents(case_note_id);
CREATE INDEX IF NOT EXISTS idx_case_note_documents_document_id ON case_note_documents(document_id);

-- Add comment for documentation
COMMENT ON TABLE case_note_documents IS 'Junction table linking documents to case notes - allows multiple documents per case note';
COMMENT ON COLUMN case_note_documents.case_note_id IS 'Reference to the service case note';
COMMENT ON COLUMN case_note_documents.document_id IS 'Reference to the uploaded document';
