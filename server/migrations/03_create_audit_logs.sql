-- Create audit logging tables migration
-- This creates tables for tracking user activities and system errors

-- Create audit_logs table for user activity tracking
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  username TEXT, -- Store username for cases where user might be deleted
  action TEXT NOT NULL, -- Action performed (LOGIN, LOGOUT, CREATE, UPDATE, DELETE, VIEW, etc.)
  resource_type TEXT, -- Type of resource (USER, CLIENT, DOCUMENT, MASTER_DATA, etc.)
  resource_id INTEGER, -- ID of the resource being acted upon
  resource_name TEXT, -- Human-readable name/identifier of the resource
  method TEXT, -- HTTP method (GET, POST, PUT, DELETE, PATCH)
  endpoint TEXT, -- API endpoint accessed
  ip_address INET, -- User's IP address
  user_agent TEXT, -- Browser/client user agent
  company_id INTEGER REFERENCES companies(company_id), -- User's company for data filtering
  segment_id INTEGER REFERENCES segments(id), -- Segment context if applicable
  request_data JSONB, -- Request payload (sensitive data should be filtered)
  response_status INTEGER, -- HTTP response status code
  response_message TEXT, -- Response message or error description
  execution_time_ms INTEGER, -- Time taken to process the request
  session_id TEXT, -- Session or JWT token ID for correlation
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}' -- Additional contextual data
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_username ON audit_logs(username);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_segment_id ON audit_logs(segment_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_response_status ON audit_logs(response_status);

-- Create error_logs table for system error tracking
CREATE TABLE IF NOT EXISTS error_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  username TEXT, -- Store username for correlation
  error_type TEXT NOT NULL, -- Type of error (DATABASE, VALIDATION, AUTHENTICATION, AUTHORIZATION, etc.)
  error_code TEXT, -- Error code or identifier
  error_message TEXT NOT NULL, -- Error message
  stack_trace TEXT, -- Full stack trace for debugging
  method TEXT, -- HTTP method when error occurred
  endpoint TEXT, -- API endpoint where error occurred
  ip_address INET, -- User's IP address
  user_agent TEXT, -- Browser/client user agent
  company_id INTEGER REFERENCES companies(company_id), -- User's company context
  segment_id INTEGER REFERENCES segments(id), -- Segment context if applicable
  request_data JSONB, -- Request data that caused the error (filtered for security)
  request_headers JSONB, -- Request headers (filtered for security)
  session_id TEXT, -- Session or JWT token ID for correlation
  severity TEXT DEFAULT 'ERROR', -- Severity level (DEBUG, INFO, WARN, ERROR, FATAL)
  resolved BOOLEAN DEFAULT FALSE, -- Whether the error has been addressed
  resolved_at TIMESTAMP WITH TIME ZONE, -- When the error was resolved
  resolved_by INTEGER REFERENCES users(id), -- Who resolved the error
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}' -- Additional error context
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_username ON error_logs(username);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_ip_address ON error_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_error_logs_company_id ON error_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_segment_id ON error_logs(segment_id);

-- Create login_logs table for detailed authentication tracking
CREATE TABLE IF NOT EXISTS login_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  username TEXT NOT NULL, -- Always store username for historical tracking
  login_type TEXT NOT NULL, -- LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, TOKEN_REFRESH, etc.
  ip_address INET NOT NULL, -- User's IP address
  user_agent TEXT, -- Browser/client user agent
  company_id INTEGER REFERENCES companies(company_id), -- User's company
  session_id TEXT, -- Session or JWT token ID
  failure_reason TEXT, -- Reason for login failure (if applicable)
  geolocation JSONB, -- Optional: Geographic location data
  device_fingerprint TEXT, -- Optional: Device identification
  two_factor_used BOOLEAN DEFAULT FALSE, -- Whether 2FA was used
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  session_ended_at TIMESTAMP WITH TIME ZONE, -- When session ended
  metadata JSONB DEFAULT '{}' -- Additional login context
);

-- Create indexes for login logs
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_username ON login_logs(username);
CREATE INDEX IF NOT EXISTS idx_login_logs_login_type ON login_logs(login_type);
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_login_logs_ip_address ON login_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_logs_company_id ON login_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_session_id ON login_logs(session_id);

-- Create performance_logs table for monitoring system performance
CREATE TABLE IF NOT EXISTS performance_logs (
  id SERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL, -- API endpoint
  method TEXT NOT NULL, -- HTTP method
  user_id INTEGER REFERENCES users(id), -- User making the request
  company_id INTEGER REFERENCES companies(company_id), -- User's company
  response_time_ms INTEGER NOT NULL, -- Response time in milliseconds
  response_status INTEGER NOT NULL, -- HTTP status code
  memory_usage_mb FLOAT, -- Memory usage during request
  cpu_usage_percent FLOAT, -- CPU usage during request
  database_query_count INTEGER DEFAULT 0, -- Number of DB queries executed
  database_time_ms INTEGER DEFAULT 0, -- Total time spent on database operations
  cache_hits INTEGER DEFAULT 0, -- Number of cache hits
  cache_misses INTEGER DEFAULT 0, -- Number of cache misses
  request_size_bytes INTEGER, -- Size of request payload
  response_size_bytes INTEGER, -- Size of response payload
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}' -- Additional performance metrics
);

-- Create indexes for performance logs
CREATE INDEX IF NOT EXISTS idx_performance_logs_endpoint ON performance_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_performance_logs_method ON performance_logs(method);
CREATE INDEX IF NOT EXISTS idx_performance_logs_created_at ON performance_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_performance_logs_response_time ON performance_logs(response_time_ms);
CREATE INDEX IF NOT EXISTS idx_performance_logs_user_id ON performance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_logs_company_id ON performance_logs(company_id);

-- Add comments for documentation
COMMENT ON TABLE audit_logs IS 'Tracks all user activities and API interactions for audit and compliance purposes';
COMMENT ON TABLE error_logs IS 'Captures system errors, exceptions, and debugging information';
COMMENT ON TABLE login_logs IS 'Detailed authentication and session management tracking';
COMMENT ON TABLE performance_logs IS 'System performance monitoring and optimization metrics';
