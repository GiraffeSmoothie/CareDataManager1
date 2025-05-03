-- Create service_case_notes table
CREATE TABLE IF NOT EXISTS service_case_notes (
  id SERIAL PRIMARY KEY,
  service_id INTEGER REFERENCES member_services(id) NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP,
  updated_by INTEGER REFERENCES users(id)
);

