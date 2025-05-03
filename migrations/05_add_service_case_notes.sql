CREATE TABLE IF NOT EXISTS service_case_notes (
    id SERIAL PRIMARY KEY,
    member_id INTEGER REFERENCES person_info(id) NOT NULL,
    service_id INTEGER REFERENCES member_services(id) NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);