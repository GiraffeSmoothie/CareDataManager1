DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'master_data_service_unique'
  ) THEN
    ALTER TABLE master_data ADD CONSTRAINT master_data_service_unique UNIQUE (service_category, service_type, service_provider);
  END IF;
END $$;

-- Create member_services table
CREATE TABLE IF NOT EXISTS member_services (
  id SERIAL PRIMARY KEY,
  member_id INTEGER REFERENCES person_info(id) NOT NULL,
  service_category TEXT NOT NULL,
  service_type TEXT NOT NULL,
  service_provider TEXT NOT NULL,
  service_start_date DATE NOT NULL,
  service_days TEXT[] NOT NULL,
  service_hours INTEGER NOT NULL CHECK (service_hours >= 1 AND service_hours <= 24),
  status TEXT DEFAULT 'Planned' CHECK (status IN ('Planned', 'In Progress', 'Closed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  FOREIGN KEY (service_category, service_type, service_provider) REFERENCES master_data(service_category, service_type, service_provider)
);