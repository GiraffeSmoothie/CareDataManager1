-- Create client_services table if it doesn't exist
CREATE TABLE IF NOT EXISTS client_services (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES person_info(id) NOT NULL,
  service_category TEXT NOT NULL,
  service_type TEXT NOT NULL,
  service_provider TEXT NOT NULL,
  service_start_date DATE NOT NULL,
  service_days TEXT[] NOT NULL,
  service_hours INTEGER NOT NULL CHECK (service_hours >= 1 AND service_hours <= 24),
  status TEXT DEFAULT 'Planned' CHECK (status IN ('Planned', 'In Progress', 'Closed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  FOREIGN KEY (service_category, service_type, service_provider) 
    REFERENCES master_data(service_category, service_type, service_provider)
);